const express = require('express');
const router  = express.Router();
const { db } = require('../db');

router.get('/', async (req, res) => {
  try {
    const shops = await db(p => p.shop.findMany({ orderBy: { createdAt:'desc' } }));
    res.json(shops);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:subdomain', async (req, res) => {
  try {
    const shop = await db(p => p.shop.findUnique({ where: { subdomain: req.params.subdomain } }));
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    // Validate required fields
    if (!b.name || !b.subdomain || !b.ownerName || !b.ownerPhone || !b.ownerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const shop = await db(p => p.shop.create({
      data: {
        name:             b.name,
        emoji:            b.emoji || '🏪',
        subdomain:        b.subdomain.toLowerCase(),
        ownerName:        b.ownerName,
        ownerPhone:       b.ownerPhone,
        ownerEmail:       b.ownerEmail,
        ownerPassword:    b.ownerPassword || null,
        category:         b.category || 'South Indian',
        tagline:          b.tagline || null,
        description:      b.description || null,
        address:          b.address || null,
        brandColor:       b.brandColor || '#E11D48',
        openingTime:      b.openingTime || '08:00',
        closingTime:      b.closingTime || '21:00',
        isOpen:           false,
        isActive:         b.isActive !== undefined ? b.isActive : true,
        status:           b.status || 'TRIAL',
        trialEndsAt:      b.trialEndsAt ? new Date(b.trialEndsAt) : new Date(Date.now() + 30*86400000),
        subscriptionPaid: false,
        hasCustomHours:   b.hasCustomHours || false,
        hasMultipleShifts:b.hasMultipleShifts || false,
        shiftSchedule:    b.shiftSchedule || '[]',
        slotInterval:     b.slotInterval || 10,
        preOrderEnabled:  b.preOrderEnabled || false,
        preOrderPayment:  b.preOrderPayment || 'BOTH',
        orderWindowStart: b.orderWindowStart || '10:00',
        deliveryStart:    b.deliveryStart || '12:00',
      }
    }));
    res.status(201).json(shop);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Subdomain already exists. Please choose a different one.' });
    }
    res.status(500).json({ error: err.message });
  }
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
      'preOrderEnabled','preOrderPayment','preOrderDaysAhead','asapOnly','bannerImageUrl',
      'orderWindowStart','deliveryStart',
      'hasCustomHours','hasMultipleShifts','shiftSchedule','slotInterval',
    ];
    allowed.forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
    // Handle password update
    if (b.newPassword && b.newPassword.length >= 6) {
      data.ownerPassword = b.newPassword;
    }
    const shop = await db(p => p.shop.update({ where: { id: req.params.id }, data }));
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const shop = await db(p => p.shop.findUnique({ where: { id: req.params.id } }));
    const updated = await db(p => p.shop.update({ where: { id: req.params.id }, data: { isOpen: !shop.isOpen } }));
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
