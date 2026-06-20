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

function hashPassword(pass) {
  return crypto.createHash('sha256').update(pass + 'skipq_salt').digest('hex');
}

// Check if phone exists
router.post('/check', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const customer = await db(p => p.customer.findUnique({ where: { phone } }));
    res.json({ exists: !!customer });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Register new customer
router.post('/register', async (req, res) => {
  try {
    const { phone, password, name } = req.body;
    if (!phone || !name) return res.status(400).json({ error: 'Phone and name required' });

    const existing = await db(p => p.customer.findUnique({ where: { phone } }));
    if (existing) return res.status(409).json({ error: 'Account already exists. Please login.' });

    // Build data object - only include password if field exists in schema
    const data = { phone, name, points: 0 };
    if (password && password.length >= 4) {
      data.password = hashPassword(password);
    }

    let customer;
    try {
      customer = await db(p => p.customer.create({ data }));
    } catch (e) {
      // If password column doesn't exist yet, try without it
      if (e.message && (e.message.includes('password') || e.message.includes('Unknown field'))) {
        const { password: _pw, ...dataWithoutPass } = data;
        customer = await db(p => p.customer.create({ data: dataWithoutPass }));
      } else {
        throw e;
      }
    }

    res.json({ id: customer.id, name: customer.name, phone: customer.phone, points: customer.points || 0 });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const customer = await db(p => p.customer.findUnique({ where: { phone } }));
    if (!customer) return res.status(404).json({ error: 'No account found. Please sign up.' });

    // If no password set or password column missing, allow login anyway
    if (customer.password && password) {
      if (customer.password !== hashPassword(password)) {
        return res.status(401).json({ error: 'Wrong password. Try again.' });
      }
    }

    res.json({ id: customer.id, name: customer.name, phone: customer.phone, points: customer.points || 0 });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Legacy create / upsert
router.post('/', async (req, res) => {
  try {
    const { phone, name, password } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const existing = await db(p => p.customer.findUnique({ where: { phone } }));
    if (existing) return res.json(existing);
    const data = { phone, name: name || 'Customer', points: 0 };
    if (password) {
      try { data.password = hashPassword(password); } catch {}
    }
    const customer = await db(p => p.customer.create({ data }));
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all (admin)
router.get('/', async (req, res) => {
  try {
    const customers = await db(p => p.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phone: true, points: true, createdAt: true }
    }));
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get by id
router.get('/:id', async (req, res) => {
  try {
    const customer = await db(p => p.customer.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, phone: true, points: true, createdAt: true }
    }));
    if (!customer) return res.status(404).json({ error: 'Not found' });
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
