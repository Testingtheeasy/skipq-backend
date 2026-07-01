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

// GET all specials for a shop (filters expired by time)
router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });

    const nowDate = new Date();
    const nowTime = nowDate.getHours().toString().padStart(2,'0') + ':' + nowDate.getMinutes().toString().padStart(2,'0');

    const allSpecials = await db(p => p.special.findMany({
      where: { shopId, soldOut: false },
      orderBy: { createdAt: 'desc' }
    }));

    // Only return specials that haven't expired yet
    const specials = allSpecials.filter(s => !s.expiresAt || s.expiresAt >= nowTime);
    res.json(specials);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create special
router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.shopId || !b.name || !b.price) {
      return res.status(400).json({ error: 'shopId, name, price required' });
    }
    const data = {
      shopId:        b.shopId,
      menuItemId:    b.menuItemId    || null,
      name:          b.name,
      emoji:         b.emoji         || '🔥',
      description:   b.description   || null,
      price:         parseInt(b.price) || 0,
      originalPrice: parseInt(b.originalPrice) || parseInt(b.price) || 0,
      discount:      parseInt(b.discount) || 0,
      soldOut:       false,
      expiresAt:     b.expiresAt     || '23:59',
    };
    const special = await db(p => p.special.create({ data }));
    res.json(special);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH update special
router.patch('/:id', async (req, res) => {
  try {
    const b = req.body;
    const data = {};
    ['name','emoji','description','price','originalPrice','discount','soldOut','expiresAt','menuItemId']
      .forEach(k => { if (b[k] !== undefined) data[k] = b[k]; });
    const special = await db(p => p.special.update({ where: { id: req.params.id }, data }));
    res.json(special);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE special
router.delete('/:id', async (req, res) => {
  try {
    await db(p => p.special.delete({ where: { id: req.params.id } }));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
