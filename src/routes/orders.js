const express = require('express');
const router  = express.Router();
const { db } = require('../db');
const { ensureFreshSoldToday } = require('../utils/dailyReset');

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
          // Reset soldToday first if it's carried over from a previous day,
          // so today's order increments onto a clean baseline.
          var existing = await db(function(p) {
            return p.menuItem.findUnique({ where: { id: mid } });
          });
          if (existing) {
            await db(function(p) { return ensureFreshSoldToday(p, existing); });
          }
          // Increment soldToday
          var updated = await db(function(p) {
            return p.menuItem.update({
              where: { id: mid },
              data: { soldToday: { increment: item.quantity || item.qty || 1 } }
            });
          });
          // Auto-flip to SOLDOUT if QTY mode and today's live stock is used up.
          // currentStock (not dailyLimit) is the running number Quick Menu
          // edits and daily auto-refill both write to.
          if (
            updated &&
            updated.availMode === 'QTY' &&
            updated.currentStock > 0 &&
            updated.soldToday >= updated.currentStock &&
            updated.availabilityState !== 'SOLDOUT'
          ) {
            await db(function(p) {
              return p.menuItem.update({
                where: { id: updated.id },
                data: { availabilityState: 'SOLDOUT' }
              });
            });
            console.log('[SkipQ] Auto-SOLDOUT:', updated.name, 'sold:', updated.soldToday, '/', updated.currentStock);
          }
        } catch(e) { console.log('soldToday update error:', e.message); }
      }
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

    // Award loyalty points only once the order is actually delivered -
    // not at placement time, so a cancelled-after-ordering order never
    // earns points in the first place.
    if (status === 'DELIVERED' && order.customerId && !order.pointsAwarded) {
      const ptsEarned = Math.max(1, Math.round(order.totalAmount / 10000));
      try {
        const existing = await db(p => p.loyaltyPoints.findUnique({ where: { customerId: order.customerId } }));
        if (existing) {
          await db(p => p.loyaltyPoints.update({ where: { customerId: order.customerId }, data: { balance: { increment: ptsEarned }, earned: { increment: ptsEarned } } }));
        } else {
          await db(p => p.loyaltyPoints.create({ data: { customerId: order.customerId, shopId: order.shopId, balance: ptsEarned, earned: ptsEarned } }));
        }
        await db(p => p.order.update({ where: { id: order.id }, data: { pointsAwarded: true } }));
      } catch(e) { console.log('loyalty on delivery:', e.message); }
    }

    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CANCEL ORDER: restocks any qty-tracked items and records a reason ──
const CANCEL_REASONS = [
  'No payment done',
  'Wrong item ordered',
  "Can't deliver",
  'Customer requested',
  'Out of stock',
  'Other',
];

router.patch('/:id/cancel', async (req, res) => {
  try {
    const { cancelReason } = req.body;
    const existingOrder = await db(p => p.order.findUnique({
      where: { id: req.params.id },
      include: { orderItems: true },
    }));
    if (!existingOrder) return res.status(404).json({ error: 'Order not found' });
    if (existingOrder.status === 'CANCELLED') {
      return res.json(existingOrder); // already cancelled, no-op
    }

    // Restock each qty-tracked menu item
    for (const oi of existingOrder.orderItems) {
      if (!oi.menuItemId) continue;
      try {
        const menuItem = await db(p => p.menuItem.findUnique({ where: { id: oi.menuItemId } }));
        if (!menuItem) continue;
        // Bring soldToday's "day" baseline up to date first
        const fresh = await db(p => ensureFreshSoldToday(p, menuItem));
        const restoredSold = Math.max(0, (fresh.soldToday || 0) - (oi.quantity || 1));
        const updateData = { soldToday: restoredSold };
        // If it was auto-marked SOLDOUT and now has room again, reopen it
        if (
          fresh.availMode === 'QTY' &&
          fresh.availabilityState === 'SOLDOUT' &&
          fresh.currentStock > 0 &&
          restoredSold < fresh.currentStock
        ) {
          updateData.availabilityState = 'AVAILABLE';
        }
        await db(p => p.menuItem.update({ where: { id: oi.menuItemId }, data: updateData }));
      } catch (e) { console.log('restock error:', e.message); }
    }

    const order = await db(p => p.order.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelReason: cancelReason || 'Other' },
      include: { orderItems: true },
    }));
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cancel-reasons', (req, res) => res.json(CANCEL_REASONS));

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
