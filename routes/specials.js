const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const specials = await prisma.special.findMany({ where: { shopId }, orderBy: { createdAt:'desc' } });
    res.json(specials);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const special = await prisma.special.create({ data: req.body });
    res.json(special);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const special = await prisma.special.update({ where: { id: req.params.id }, data: req.body });
    res.json(special);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.special.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
