const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const enquiries = await prisma.enquiry.findMany({
      where: { shopId },
      orderBy: { createdAt:'desc' },
      take: 50
    });
    res.json(enquiries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { id: req.body.shopId } });
    const replyMins = shop?.enquiryReplyMins || 5;
    const expiresAt = new Date(Date.now() + replyMins * 60 * 1000);
    const enquiry = await prisma.enquiry.create({ data: { ...req.body, expiresAt } });
    res.json(enquiry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/reply', async (req, res) => {
  try {
    const { available, reply } = req.body;
    const enquiry = await prisma.enquiry.update({
      where: { id: req.params.id },
      data: { status: available ? 'REPLIED_YES' : 'REPLIED_NO', ownerReply: reply, repliedAt: new Date() }
    });
    res.json(enquiry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
