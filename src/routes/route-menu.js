const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const items = await prisma.menuItem.findMany({ where: { shopId }, orderBy: { category:'asc' } });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const item = await prisma.menuItem.create({ data: req.body });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const item = await prisma.menuItem.update({ where: { id: req.params.id }, data: req.body });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    // Soft delete - set isAvailable=false instead of hard delete
    // Hard delete fails when OrderItem records reference this MenuItem
    await prisma.menuItem.update({
      where: { id: req.params.id },
      data: { isAvailable: false, availabilityState: 'SOLDOUT' }
    });
    res.json({ success: true });
  } catch (err) {
    // If update fails too, try hard delete as fallback
    try {
      await prisma.menuItem.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

module.exports = router;
