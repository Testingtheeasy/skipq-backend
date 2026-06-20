const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');

let prisma = new PrismaClient();
async function db(fn) {
  try { return await fn(prisma); }
  catch (err) {
    if (err.message && err.message.includes('prepared statement')) {
      await prisma.$disconnect();
      prisma = new PrismaClient();
      return await fn(prisma);
    }
    throw err;
  }
}

// GET loyalty points by phone
router.get('/:phone', async (req, res) => {
  try {
    const customer = await db(p => p.customer.findUnique({
      where: { phone: req.params.phone }
    }));
    if (!customer) return res.json({ balance: 0, earned: 0, redeemed: 0 });
    const loyalty = await db(p => p.loyaltyPoints.findUnique({
      where: { customerId: customer.id }
    }));
    res.json(loyalty || { balance: 0, earned: 0, redeemed: 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST redeem points
router.post('/redeem', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    if (!phone || !amount) {
      return res.status(400).json({ error: 'phone and amount required' });
    }
    const customer = await db(p => p.customer.findUnique({ where: { phone } }));
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const loyalty = await db(p => p.loyaltyPoints.findUnique({
      where: { customerId: customer.id }
    }));
    if (!loyalty || loyalty.balance < amount) {
      return res.status(400).json({ error: 'Insufficient points' });
    }
    const updated = await db(p => p.loyaltyPoints.update({
      where: { customerId: customer.id },
      data: {
        balance:  { decrement: amount },
        redeemed: { increment: amount }
      }
    }));
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
