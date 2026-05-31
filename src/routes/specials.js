// skipq-backend/src/routes/specials.js
// Owner sets "Today's Special" — discount, time limit, item
const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { z }   = require('zod');
const { requireOwner } = require('../middleware/auth');
const prisma  = new PrismaClient();

// GET specials for a shop (public — customer app)
router.get('/shop/:shopId', async (req, res, next) => {
  try {
    // Specials are menu items with a special price + expiry set today
    // Stored as a JSON field on Shop or a separate Specials table
    // For V1 we store as shop announcement with type=SPECIAL
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    const specials = await prisma.announcement.findMany({
      where: {
        shopId: req.params.shopId,
        channel: 'SPECIAL',
        createdAt: { gte: today, lt: tomorrow },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Parse each announcement's message as JSON (contains special item data)
    const parsed = specials.map(s => {
      try { return JSON.parse(s.message); }
      catch { return null; }
    }).filter(Boolean);

    res.json(parsed);
  } catch (err) { next(err); }
});

// SET Today's Special (owner only)
router.post('/shop/:shopId', requireOwner, async (req, res, next) => {
  try {
    const schema = z.object({
      menuItemId:    z.string(),
      specialPrice:  z.number().int().min(1),      // in paise
      originalPrice: z.number().int().min(1),      // in paise
      discount:      z.number().int().min(1).max(90),
      description:   z.string().optional(),
      expiresAt:     z.string().optional(),        // ISO string
      soldOut:       z.boolean().default(false),
    });
    const data = schema.parse(req.body);

    // Fetch menu item details
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: data.menuItemId },
      select: { name: true, emoji: true },
    });
    if (!menuItem) return res.status(404).json({ error: 'Menu item not found' });

    // Store as announcement with channel=SPECIAL
    const special = await prisma.announcement.create({
      data: {
        shopId: req.params.shopId,
        channel: 'SPECIAL',
        message: JSON.stringify({
          id:            `sp-${data.menuItemId}-${Date.now()}`,
          menuItemId:    data.menuItemId,
          name:          menuItem.name,
          emoji:         menuItem.emoji,
          desc:          data.description || menuItem.name,
          price:         data.specialPrice,
          originalPrice: data.originalPrice,
          discount:      data.discount,
          soldOut:       data.soldOut,
          expiresAt:     data.expiresAt || null,
        }),
      },
    });

    res.status(201).json({ success: true, special });
  } catch (err) { next(err); }
});

// MARK special as sold out (owner)
router.put('/:id/soldout', requireOwner, async (req, res, next) => {
  try {
    const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
    if (!announcement) return res.status(404).json({ error: 'Not found' });

    const data = JSON.parse(announcement.message);
    data.soldOut = true;

    await prisma.announcement.update({
      where: { id: req.params.id },
      data: { message: JSON.stringify(data) },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE / clear all specials for today (owner)
router.delete('/shop/:shopId/today', requireOwner, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    await prisma.announcement.deleteMany({
      where: {
        shopId: req.params.shopId,
        channel: 'SPECIAL',
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    res.json({ success: true, message: "Today's specials cleared" });
  } catch (err) { next(err); }
});

module.exports = router;
