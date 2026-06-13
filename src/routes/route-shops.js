const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const shops = await prisma.shop.findMany({ orderBy: { createdAt:'desc' } });
    res.json(shops);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:subdomain', async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { subdomain: req.params.subdomain } });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    // Whitelist all allowed fields to prevent Prisma unknown field errors
    const data = {};
    const allowed = [
      'name','emoji','tagline','description','category','brandColor',
      'address','googleMapsUrl','ownerName','ownerPhone','ownerEmail',
      'openingTime','closingTime','isOpen','status','subscriptionPaid',
      'subscriptionExpiry','trialDays','ownerPassword',
      'preOrderEnabled','preOrderPayment','preOrderDaysAhead',
      'orderWindowStart','deliveryStart',
    ];
    allowed.forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
    // Handle password update
    if (b.newPassword && b.newPassword.length >= 6) {
      data.ownerPassword = b.newPassword;
    }
    const shop = await prisma.shop.update({ where: { id: req.params.id }, data });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const shop = await prisma.shop.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.shop.update({ where: { id: req.params.id }, data: { isOpen: !shop.isOpen } });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
