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

router.get('/', async (req, res) => {
  try {
    const { shopId, status } = req.query;
    if (!shopId) return res.status(400).json({ error: 'shopId required' });
    const orders = await db(p => p.order.findMany({
      where: { shopId, ...(status ? { status } : {}) },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }));
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { shopId, customerId, customerName, customerPhone, altPhone, pickupSlot, totalAmount, paymentMethod, isBulk, bulkNote, items } = req.body;
    if (!shopId || !items || !items.length) return res.status(400).json({ error: 'shopId and items required' });
    const shop  = await db(p => p.shop.findUnique({ where: { id: shopId } }));
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const count = await db(p => p.order.count({ where: { shopId } }));
    const prefix = (shop.subdomain || 'SK').toUpperCase().slice(0, 2);
    const token  = prefix + '-' + String(count + 1).padStart(3, '0');
    const order = await db(p => p.order.create({
      data: {
        shopId, customerId: customerId || null, customerName, customerPhone,
        altPhone: altPhone || null, pickupSlot, totalAmount,
        paymentMethod: paymentMethod || 'UPI', isBulk: isBulk || false,
        bulkNote: bulkNote || null, token, status: 'CONFIRMED',
        orderItems: {
          create: items.map(function(item) {
            return {
              itemName: item.itemName || item.name || 'Item',
              quantity: item.quantity || item.qty || 1,
              unitPrice: item.unitPrice || item.price || 0,
              prepTimeMins: item.prepTimeMins || 10,
              foodType: item.foodType || 'FRESH',
              menuItemId: item.menuItemId || null,
              isSpecial: item.isSpecial || false,
            };
          })
        }
      },
      include: { orderItems: true }
    }));

    // Increment soldToday and auto-flip to SOLDOUT if dailyLimit reached
    for (var i = 0; i < (items || []).length; i++) {
      var item = items[i];
      var mid = item.menuItemId || item.id;
      if (mid) {
        try {
          // Increment soldToday
          var updated = await db(function(p) {
            return p.menuItem.update({
              where: { id: mid },
              data: { soldToday: { increment: item.quantity || item.qty || 1 } }
            });
          });
          // Auto-flip to SOLDOUT if QTY mode and limit reached
          if (
            updated &&
            updated.availMode === 'QTY' &&
            updated.dailyLimit > 0 &&
            updated.soldToday >= updated.dailyLimit &&
            updated.availabilityState !== 'SOLDOUT'
          ) {
            await db(function(p) {
              return p.menuItem.update({
                where: { id: updated.id },
                data: { availabilityState: 'SOLDOUT' }
              });
            });
            console.log('[SkipQ] Auto-SOLDOUT:', updated.name, 'sold:', updated.soldToday, '/', updated.dailyLimit);
          }
        } catch(e) { console.log('soldToday update error:', e.message); }
      }
    }

    // Loyalty points
    if (customerId) {
      var ptsEarned = (paymentMethod === 'UPI') ? Math.max(1, Math.round(totalAmount / 10000)) : 0;
      try {
        var existing = await db(function(p) { return p.loyaltyPoints.findUnique({ where: { customerId: customerId } }); });
        if (existing) {
          if (ptsEarned > 0) {
            await db(function(p) { return p.loyaltyPoints.update({ where: { customerId: customerId }, data: { balance: { increment: ptsEarned }, earned: { increment: ptsEarned } } }); });
          }
        } else {
          await db(function(p) { return p.loyaltyPoints.create({ data: { customerId: customerId, shopId: shopId, balance: ptsEarned, earned: ptsEarned } }); });
        }
      } catch(e) { console.log('loyalty:', e.message); }
    }

    res.json(order);
  } catch (err) {
    console.error('Order create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const data = { status };
    if (status === 'READY') data.readySince = new Date();
    if (status === 'DELIVERED') data.deliveredAt = new Date();
    const order = await db(p => p.order.update({ where: { id: req.params.id }, data, include: { orderItems: true } }));
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    const data = {};
    if (status) data.status = status;
    if (cancelReason) data.cancelReason = cancelReason;
    const order = await db(p => p.order.update({ where: { id: req.params.id }, data }));
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/token/:token', async (req, res) => {
  try {
    const order = await db(p => p.order.findUnique({ where: { token: req.params.token }, include: { orderItems: true } }));
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/customer/:phone', async (req, res) => {
  try {
    const { shopId } = req.query;
    const customer = await db(p => p.customer.findUnique({ where: { phone: req.params.phone } }));
    if (!customer) return res.json([]);
    const orders = await db(p => p.order.findMany({
      where: { customerId: customer.id, ...(shopId ? { shopId } : {}) },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    }));
    res.json(orders);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
