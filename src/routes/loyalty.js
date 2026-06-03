const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/:phone', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { phone: req.params.phone } });
    if (!customer) return res.json({ balance:0, earned:0, redeemed:0 });
    const loyalty = await prisma.loyaltyPoints.findUnique({ where: { customerId: customer.id } });
    res.json(loyalty || { balance:0, earned:0, redeemed:0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/redeem', async (req, res) => {
  try {
    const { phone, amount } = req.body;
    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const loyalty = await prisma.loyaltyPoints.findUnique({ where: { customerId: customer.id } });
    if (!loyalty || loyalty.balance < amount) return res.status(400).json({ error: 'Insufficient points' });
    const updated = await prisma.loyaltyPoints.update({
      where: { customerId: customer.id },
      data: { balance: { decrement: amount }, redeemed: { increment: amount } }
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
