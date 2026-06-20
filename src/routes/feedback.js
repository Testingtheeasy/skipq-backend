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

// GET feedbacks for a shop
router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const feedbacks = await db(p => p.feedback.findMany({
      where: { shopId },
      orderBy: [{ status: 'asc' }, { rating: 'asc' }, { createdAt: 'desc' }]
    }));
    res.json(feedbacks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create feedback (whitelist fields)
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.shopId || !b.rating) {
      return res.status(400).json({ error: 'shopId and rating required' });
    }
    const data = {
      shopId:     b.shopId,
      customerId: b.customerId  || null,
      orderId:    b.orderId     || null,
      orderToken: b.orderToken  || null,
      rating:     parseInt(b.rating) || 5,
      issue:      b.issue       || null,
      comment:    b.comment     || null,
      status:     'OPEN',
    };
    const fb = await db(p => p.feedback.create({ data }));
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /:id/reply — owner replies
router.patch('/:id/reply', async (req, res) => {
  try {
    const fb = await db(p => p.feedback.update({
      where: { id: req.params.id },
      data: {
        shopReply:   req.body.shopReply,
        status:      'RESOLVED',
        resolvedAt:  new Date()
      }
    }));
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    const fb = await db(p => p.feedback.update({
      where: { id: req.params.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() }
    }));
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
