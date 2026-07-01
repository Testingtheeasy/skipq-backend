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

// GET feedbacks for a shop (optionally filter by type=RATING or type=REPORT)
router.get('/', async (req, res) => {
  try {
    const { shopId, type } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const where = { shopId };
    if (type) where.type = type;
    const feedbacks = await db(p => p.feedback.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }]
    }));
    res.json(feedbacks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create feedback or report
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.shopId) return res.status(400).json({ error: 'shopId required' });

    const isReport = b.type === 'REPORT';
    const data = {
      shopId:     b.shopId,
      customerId: b.customerId  || null,
      orderId:    b.orderId     || null,
      orderToken: b.orderToken  || null,
      rating:     isReport ? 0 : (parseInt(b.rating) || 0),
      issue:      b.issue       || null,
      comment:    b.comment     || null,
      type:       b.type        || 'RATING',
      status:     'OPEN',
    };
    const fb = await db(p => p.feedback.create({ data }));
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH reply
router.patch('/:id/reply', async (req, res) => {
  try {
    const fb = await db(p => p.feedback.update({
      where: { id: req.params.id },
      data: { shopReply: req.body.shopReply, status: 'RESOLVED', resolvedAt: new Date() }
    }));
    res.json(fb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH resolve
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
