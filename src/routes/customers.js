const express  = require('express');
const router   = express.Router();
const { PrismaClient } = require('@prisma/client');
const crypto   = require('crypto');

let prisma = new PrismaClient();
async function db(fn) {
  try {
    return await fn(prisma);
  } catch (err) {
    if (err.message && err.message.includes('prepared statement')) {
      await prisma.$disconnect();
      prisma = new PrismaClient();
      return await fn(prisma);
    }
    throw err;
  }
}

// Simple hash — no bcrypt needed for this use case
function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + 'skipq_salt').digest('hex');
}

// POST /customers/check — check if phone exists
router.post('/check', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const customer = await db(p => p.customer.findUnique({ where: { phone } }));
    res.json({ exists: !!customer });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /customers/register — create new customer
router.post('/register', async (req, res) => {
  try {
    const { phone, password, name } = req.body;
    if (!phone || !password || !name) return res.status(400).json({ error: 'Phone, password and name required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password too short' });

    // Check if already exists
    const existing = await db(p => p.customer.findUnique({ where: { phone } }));
    if (existing) return res.status(409).json({ error: 'Account already exists. Please login.' });

    const customer = await db(p => p.customer.create({
      data: { phone, name, password: hashPassword(password), points: 0 }
    }));
    res.json({ id: customer.id, name: customer.name, phone: customer.phone, points: customer.points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /customers/login — login existing customer
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password required' });

    const customer = await db(p => p.customer.findUnique({ where: { phone } }));
    if (!customer) return res.status(404).json({ error: 'No account found. Please sign up.' });

    if (customer.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Wrong password. Try again.' });
    }
    res.json({ id: customer.id, name: customer.name, phone: customer.phone, points: customer.points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /customers — create customer (legacy, keep for compatibility)
router.post('/', async (req, res) => {
  try {
    const { phone, name, password } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const existing = await db(p => p.customer.findUnique({ where: { phone } }));
    if (existing) return res.json(existing);
    const customer = await db(p => p.customer.create({
      data: { phone, name: name||'Customer', password: password ? hashPassword(password) : null, points: 0 }
    }));
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /customers — list all (admin use)
router.get('/', async (req, res) => {
  try {
    const customers = await db(p => p.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id:true, name:true, phone:true, points:true, createdAt:true }
    }));
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /customers/:id
router.get('/:id', async (req, res) => {
  try {
    const customer = await db(p => p.customer.findUnique({
      where: { id: req.params.id },
      select: { id:true, name:true, phone:true, points:true, createdAt:true }
    }));
    if (!customer) return res.status(404).json({ error: 'Not found' });
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
