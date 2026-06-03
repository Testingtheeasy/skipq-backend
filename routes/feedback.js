const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const feedbacks = await prisma.feedback.findMany({
      where: { shopId },
      orderBy: [{ status:'asc' }, { rating:'asc' }, { createdAt:'desc' }]
    });
    res.json(feedbacks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const fb = await prisma.feedback.create({ data: req.body });
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reply', async (req, res) => {
  try {
    const fb = await prisma.feedback.update({
      where: { id: req.params.id },
      data: { shopReply: req.body.shopReply, status:'RESOLVED', resolvedAt: new Date() }
    });
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/resolve', async (req, res) => {
  try {
    const fb = await prisma.feedback.update({
      where: { id: req.params.id },
      data: { status:'RESOLVED', resolvedAt: new Date() }
    });
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
