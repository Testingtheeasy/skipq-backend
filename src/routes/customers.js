const express  = require('express');
const router   = express.Router();
const { db } = require('../db');
const crypto   = require('crypto');

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

    // Only include password if provided and column exists
    const data = { phone, name };
    if (password && password.length >= 4) {
      try { data.password = hashPassword(password); } catch {}
    }

    let customer;
    try {
      customer = await db(p => p.customer.create({ data }));
    } catch (e) {
      // Remove unknown fields and retry
      const safeData = { phone, name };
      customer = await db(p => p.customer.create({ data: safeData }));
    }

    // Create the loyalty row up front so balance tracking starts clean
    let loyaltyBalance = 0;
    try {
      const loyalty = await db(p => p.loyaltyPoints.create({ data: { customerId: customer.id } }));
      loyaltyBalance = loyalty.balance;
    } catch (e) { console.log('loyalty create on register:', e.message); }

    res.json({
      id: customer.id,
      shortId: customer.shortId || customer.id.slice(-6).toUpperCase(),
      name: customer.name,
      phone: customer.phone,
      points: loyaltyBalance
    });
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

    if (customer.password && password) {
      if (customer.password !== hashPassword(password)) {
        return res.status(401).json({ error: 'Wrong password. Try again.' });
      }
    }

    let loyaltyBalance = 0;
    try {
      const loyalty = await db(p => p.loyaltyPoints.findUnique({ where: { customerId: customer.id } }));
      loyaltyBalance = loyalty?.balance || 0;
    } catch (e) { console.log('loyalty fetch on login:', e.message); }

    res.json({
      id: customer.id,
      shortId: customer.shortId || customer.id.slice(-6).toUpperCase(),
      name: customer.name,
      phone: customer.phone,
      points: loyaltyBalance
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all (admin)
router.get('/', async (req, res) => {
  try {
    const customers = await db(p => p.customer.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id:true, shortId:true, name:true, phone:true, createdAt:true }
    }));
    res.json(customers.map(c => ({ ...c, shortId: c.shortId || c.id.slice(-6).toUpperCase(), points: 0 })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get by id
router.get('/:id', async (req, res) => {
  try {
    const customer = await db(p => p.customer.findUnique({
      where: { id: req.params.id },
      select: { id:true, shortId:true, name:true, phone:true, createdAt:true }
    }));
    if (!customer) return res.status(404).json({ error: 'Not found' });
    res.json({ ...customer, points: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Legacy create
router.post('/legacy', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const existing = await db(p => p.customer.findUnique({ where: { phone } }));
    if (existing) return res.json({ ...existing, points: 0 });
    const customer = await db(p => p.customer.create({ data: { phone, name: name||'Customer' } }));
    res.json({ ...customer, points: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
