const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Platform stats
router.get('/stats', async (req, res) => {
  try {
    const [totalShops, totalCustomers, totalOrders, openComplaints, activeShops, trialShops] = await Promise.all([
      prisma.shop.count(),
      prisma.customer.count(),
      prisma.order.count(),
      prisma.feedback.count({ where: { status:'OPEN', type:'REPORT' } }),
      prisma.shop.count({ where: { status:'ACTIVE' } }),
      prisma.shop.count({ where: { status:'TRIAL' } }),
    ]);
    const revenue = activeShops * 499;
    res.json({ totalShops, totalCustomers, totalOrders, openComplaints, activeShops, trialShops, revenue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// All complaints (REPORT type only - not star RATINGs) sorted by urgency
router.get('/complaints', async (req, res) => {
  try {
    const complaints = await prisma.feedback.findMany({
      where: { type: 'REPORT' },
      orderBy: [{ status:'asc' }, { rating:'asc' }, { createdAt:'desc' }],
      take: 200,
    });
    res.json(complaints);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resolve complaint
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

// Update shop (approve/pause/extend)
router.patch('/shops/:id', async (req, res) => {
  try {
    const shop = await prisma.shop.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
