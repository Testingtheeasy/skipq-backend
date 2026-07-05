const express = require('express');
const router  = express.Router();
const { db } = require('../db');

// GET enquiries — supports ?shopId= and ?customerId=
router.get('/', async (req, res) => {
  try {
    const { shopId, customerId } = req.query;
    if (!shopId && !customerId) {
      return res.status(400).json({ error: 'shopId or customerId required' });
    }
    const where = {};
    if (shopId)     where.shopId     = shopId;
    if (customerId) where.customerId = customerId;
    const enquiries = await db(p => p.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50
    }));
    res.json(enquiries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create enquiry (whitelist fields)
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.shopId || !b.menuItemName) {
      return res.status(400).json({ error: 'shopId and menuItemName required' });
    }
    const shop = await db(p => p.shop.findUnique({ where: { id: b.shopId } }));
    const replyMins = shop?.enquiryReplyMins || 5;
    const expiresAt = new Date(Date.now() + replyMins * 60 * 1000);

    const data = {
      shopId:         b.shopId,
      customerId:     b.customerId     || null,
      menuItemName:   b.menuItemName,
      menuItemEmoji:  b.menuItemEmoji  || '🍽️',
      quantity:       b.quantity       || null,
      message:        b.message        || null,
      status:         'PENDING',
      expiresAt,
    };

    const enquiry = await db(p => p.enquiry.create({ data }));
    res.json(enquiry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /:id/reply — owner replies
router.patch('/:id/reply', async (req, res) => {
  try {
    const { available, reply } = req.body;
    const enquiry = await db(p => p.enquiry.update({
      where: { id: req.params.id },
      data: {
        status:     available ? 'REPLIED_YES' : 'REPLIED_NO',
        ownerReply: reply || null,
        repliedAt:  new Date()
      }
    }));
    res.json(enquiry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
