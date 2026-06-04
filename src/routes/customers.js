const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all customers with loyalty points
router.get('/', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: { loyaltyPoints: true },
      take: 500,
    });
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single customer
router.get('/:phone', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { phone: req.params.phone },
      include: { loyaltyPoints: true },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
