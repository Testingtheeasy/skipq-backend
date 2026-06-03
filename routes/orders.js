const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { shopId, status } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const orders = await prisma.order.findMany({
      where: { shopId, ...(status ? { status } : {}) },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { shopId, customerId, customerName, customerPhone, altPhone, pickupSlot, totalAmount, paymentMethod, isBulk, bulkNote, items } = req.body;
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    const count = await prisma.order.count({ where: { shopId } });
    const token = `${shop.subdomain.toUpperCase().slice(0,2)}-${String(count+1).padStart(3,'0')}`;
    const order = await prisma.order.create({
      data: {
        shopId, customerId, customerName, customerPhone, altPhone,
        pickupSlot, totalAmount, paymentMethod, isBulk: isBulk||false,
        bulkNote, token, status: 'CONFIRMED',
        orderItems: {
          create: items.map(item => ({
            itemName: item.itemName || item.name,
            quantity: item.quantity || item.qty,
            unitPrice: item.unitPrice || item.price,
            prepTimeMins: item.prepTimeMins || 10,
            foodType: item.foodType || 'FRESH',
            menuItemId: item.menuItemId || null,
            isSpecial: item.isSpecial || false,
          }))
        }
      },
      include: { orderItems: true }
    });
    if (customerId && paymentMethod === 'UPI') {
      const ptsEarned = Math.round(totalAmount / 10000);
      await prisma.loyaltyPoints.upsert({
        where: { customerId },
        create: { customerId, balance: ptsEarned, earned: ptsEarned },
        update: { balance: { increment: ptsEarned }, earned: { increment: ptsEarned } }
      });
    }
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const data = { status };
    if (status === 'READY') data.readySince = new Date();
    if (status === 'DELIVERED') data.deliveredAt = new Date();
    const order = await prisma.order.update({ where: { id: req.params.id }, data, include: { orderItems: true } });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/token/:token', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { token: req.params.token }, include: { orderItems: true } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/customer/:phone', async (req, res) => {
  try {
    const { shopId } = req.query;
    const customer = await prisma.customer.findUnique({ where: { phone: req.params.phone } });
    if (!customer) return res.json([]);
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id, ...(shopId ? { shopId } : {}) },
      include: { orderItems: true },
      orderBy: { createdAt:'desc' },
      take: 20
    });
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
