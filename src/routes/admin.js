const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Platform stats
router.get('/stats', async (req, res) => {
  try {
    const [totalShops, totalCustomers, totalOrders, openComplaints] = await Promise.all([
      prisma.shop.count(),
      prisma.customer.count(),
      prisma.order.count(),
      prisma.feedback.count({ where: { status:'OPEN' } }),
    ]);
    res.json({ totalShops, totalCustomers, totalOrders, openComplaints });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All complaints (negative first)
router.get('/complaints', async (req, res) => {
  try {
    const complaints = await prisma.feedback.findMany({
      orderBy: [{ status:'asc' }, { rating:'asc' }, { createdAt:'desc' }]
    });
    res.json(complaints);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin reply to complaint
router.patch('/complaints/:id', async (req, res) => {
  try {
    const { adminNote, status } = req.body;
    const complaint = await prisma.feedback.update({
      where: { id: req.params.id },
      data: { adminNote, status: status||'RESOLVED', resolvedAt: new Date() }
    });
    res.json(complaint);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve/pause shop
router.patch('/shops/:id', async (req, res) => {
  try {
    const shop = await prisma.shop.update({ where: { id: req.params.id }, data: req.body });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
