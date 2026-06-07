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

router.post('/', async (req, res) => {
  try {
    const { name, emoji, subdomain, ownerName, ownerPhone, ownerEmail,
            ownerPassword, category, address, tagline, description,
            openingTime, closingTime, status, isActive, isOpen,
            trialEndsAt, subscriptionPaid, codAllowed, bulkThreshold,
            googleMapsUrl } = req.body;

    const count  = await prisma.shop.count();
    const shopId = `shop-${subdomain.toLowerCase().replace(/[^a-z0-9]/g,'-')}-${String(count+1).padStart(3,'0')}`;

    const data = {
      id: shopId,
      name, emoji: emoji||'🏪', subdomain,
      ownerName, ownerPhone, ownerEmail,
      ownerPassword: ownerPassword || null,
      category, address: address||'', tagline: tagline||'',
      description: description||'',
      openingTime: openingTime||'08:00',
      closingTime: closingTime||'21:00',
      status: status||'TRIAL',
      isActive: isActive !== undefined ? isActive : true,
      isOpen: isOpen||false,
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : new Date(Date.now()+30*86400000),
      subscriptionPaid: subscriptionPaid||false,
      codAllowed: codAllowed!==false,
      bulkThreshold: bulkThreshold||10,
    };

    // Add googleMapsUrl only if column exists
    if (googleMapsUrl !== undefined) data.googleMapsUrl = googleMapsUrl;

    const shop = await prisma.shop.create({ data });
    res.json(shop);
  } catch (err) {
    console.error('Create shop error:', err.message);
    if (err.message.includes('Unique constraint'))
      return res.status(400).json({ error: `Subdomain "${req.body.subdomain}" already exists.` });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    // Only update allowed fields
    const allowed = ['name','emoji','tagline','description','address','category',
      'openingTime','closingTime','ownerName','ownerPhone','ownerEmail',
      'brandColor','googleMapsUrl','isOpen','isActive','status',
      'trialEndsAt','subscriptionPaid','codAllowed','bulkThreshold',
      'enquiryAlertsFrom','enquiryReplyMins','enquiryAlertSound'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    const shop = await prisma.shop.update({ where: { id: req.params.id }, data });
    res.json(shop);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const shop    = await prisma.shop.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.shop.update({ where: { id: req.params.id }, data: { isOpen: !shop.isOpen } });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
