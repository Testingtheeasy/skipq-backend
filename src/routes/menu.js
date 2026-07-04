const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { ensureFreshSoldTodayMany } = require('../utils/dailyReset');

let prisma = new PrismaClient();
async function db(fn) {
  try {
    return await fn(prisma);
  } catch (err) {
    if (err.message && err.message.includes('prepared statement')) {
      await prisma.$disconnect();
      prisma = new PrismaClient();
      return await fn(prisma);
    }
    throw err;
  }
}

// GET all items for a shop (exclude soft-deleted)
router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const items = await db(p => p.menuItem.findMany({
      where: { shopId, isAvailable: { not: false } },
      orderBy: { category: 'asc' }
    }));
    const fresh = await db(p => ensureFreshSoldTodayMany(p, items));
    res.json(fresh);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST - create new item (whitelist fields)
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    const data = {
      shopId:            b.shopId,
      category:          b.category || 'South Indian',
      name:              b.name,
      emoji:             b.emoji || '🍽️',
      description:       b.description || null,
      price:             parseInt(b.price) || 0,
      prepTimeMins:      parseInt(b.prepTimeMins) || 10,
      isVeg:             b.isVeg !== false,
      isAvailable:       true,
      availabilityState: b.availabilityState || 'AVAILABLE',
      availMode:         b.availMode || 'TOGGLE',
      dailyLimit:        parseInt(b.dailyLimit) || 0,
      soldToday:         0,
      defaultQty:        parseInt(b.defaultQty) || 0,
      foodType:          b.foodType || 'FRESH',
      codAllowed:        b.codAllowed !== false,
      enquiryAfterTime:  b.enquiryAfterTime || null,
      availFrom:         b.availFrom || null,
      availTo:           b.availTo || null,
    };
    const item = await db(p => p.menuItem.create({ data }));
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH - update item (whitelist fields)
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    const data = {};
    const allowed = [
      'category','name','emoji','description','price','prepTimeMins',
      'isVeg','isAvailable','availabilityState','availMode',
      'dailyLimit','soldToday','defaultQty','foodType',
      'codAllowed','enquiryAfterTime','availFrom','availTo',
    ];
    allowed.forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
    const item = await db(p => p.menuItem.update({ where: { id: req.params.id }, data }));
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE - soft delete (set isAvailable=false)
router.delete('/:id', async (req, res) => {
  try {
    await db(p => p.menuItem.update({
      where: { id: req.params.id },
      data: { isAvailable: false, availabilityState: 'SOLDOUT' }
    }));
    res.json({ success: true });
  } catch (err) {
    // Fallback: hard delete if no order references
    try {
      await db(p => p.menuItem.delete({ where: { id: req.params.id } }));
      res.json({ success: true });
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

module.exports = router;
