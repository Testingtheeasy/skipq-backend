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
    // Only pass fields that exist in schema
    const { name, emoji, subdomain, ownerName, ownerPhone, ownerEmail,
            ownerPassword, category, address, tagline, description,
            openingTime, closingTime, status, isActive, isOpen,
            trialEndsAt, subscriptionPaid, codAllowed, bulkThreshold } = req.body;

    const shop = await prisma.shop.create({
      data: {
        name, emoji: emoji||'🏪', subdomain,
        ownerName, ownerPhone, ownerEmail,
        ownerPassword: ownerPassword||'owner123',
        category, address: address||'', tagline: tagline||'',
        description: description||'',
        openingTime: openingTime||'08:00',
        closingTime: closingTime||'21:00',
        status: status||'TRIAL',
        isActive: isActive||true,
        isOpen: isOpen||false,
        trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : new Date(Date.now()+30*86400000),
        subscriptionPaid: subscriptionPaid||false,
        codAllowed: codAllowed!==false,
        bulkThreshold: bulkThreshold||10,
      }
    });
    res.json(shop);
  } catch (err) {
    console.error('Create shop error:', err.message);
    if (err.message.includes('Unique constraint')) {
      return res.status(400).json({ error: `Subdomain "${req.body.subdomain}" already exists. Choose a different one.` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const shop = await prisma.shop.update({ where: { id: req.params.id }, data: req.body });
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
