// skipq-backend/src/routes/enquiries.js
// Handles the live enquiry flow:
//   Customer → asks if item available
//   Owner    → replies yes/no within X minutes
//   System   → escalates to call if no reply
//
// Works for BOTH shop types:
//   Type A: IT canteen with dailyLimit  → enquiry rarely needed
//   Type B: Roadside shop, no limits   → enquiry primary mode

const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const { z }   = require('zod');
const { requireOwner, optionalCustomer } = require('../middleware/auth');
const prisma  = new PrismaClient();

// ─── HELPER: check if loud alerts should fire ───
function shouldAlertLoud(shop) {
  if (!shop.enquiryAlertsFrom) return false; // owner hasn't enabled loud alerts
  const now   = new Date();
  const [h, m] = shop.enquiryAlertsFrom.split(':').map(Number);
  const alertTime = new Date();
  alertTime.setHours(h, m, 0, 0);
  return now >= alertTime;
}

// ─── HELPER: get smart qty options for item ───
function getQtyOptions(menuItem) {
  if (menuItem.enquiryQtyOptions) {
    try { return JSON.parse(menuItem.enquiryQtyOptions); } catch {}
  }
  // Auto-decide based on price (paise)
  const priceRs = menuItem.price / 100;
  if (priceRs <= 30)  return [2, 5, 10, 15, 20]; // cheap items — parotta, dosa, chai
  if (priceRs <= 80)  return [1, 2, 3, 5, 10];    // medium — idli, vada
  if (priceRs <= 150) return [1, 2, 3, 5];         // expensive — meals, biryani
  return [1, 2, 3];                                 // premium
}

// ─── HELPER: compute item's current state ───
// This is the heart of the system — works for BOTH shop types
function computeItemState(item) {
  const now     = new Date();
  const nowTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

  // 1. dailyLimit shops (Type A — IT canteens):
  //    If soldToday >= dailyLimit → auto SOLDOUT
  if (item.dailyLimit > 0 && item.soldToday >= item.dailyLimit) {
    return 'SOLDOUT';
  }

  // 2. Time-window shops (Type B — Roadside):
  //    If outside availableFrom–availableTo → auto SOLDOUT
  if (item.availableFrom && item.availableTo) {
    const [fH, fM] = item.availableFrom.split(':').map(Number);
    const [tH, tM] = item.availableTo.split(':').map(Number);
    const from  = fH * 60 + fM;
    const to    = tH * 60 + tM;
    if (nowTime < from || nowTime > to) return 'SOLDOUT';
  }

  // 3. enquiryAfterTime — item switches to CHECK after this time
  if (item.enquiryAfterTime) {
    const [eH, eM] = item.enquiryAfterTime.split(':').map(Number);
    const enquiryMinutes = eH * 60 + eM;
    if (nowTime >= enquiryMinutes) return 'CHECK';
  }

  // 4. Use whatever the owner manually set
  return item.availabilityState;
}

// ─── GET MENU WITH COMPUTED STATES ───
// Called by customer app — returns live state for each item
router.get('/shop/:shopId/menu-state', async (req, res, next) => {
  try {
    const items = await prisma.menuItem.findMany({
      where: { shopId: req.params.shopId },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    });

    const withState = items.map(item => ({
      ...item,
      computedState:  computeItemState(item),
      qtyOptions:     getQtyOptions(item),
    }));

    res.json(withState);
  } catch (err) { next(err); }
});

// ─── CUSTOMER SENDS ENQUIRY ───
router.post('/', optionalCustomer, async (req, res, next) => {
  try {
    const schema = z.object({
      shopId:        z.string(),
      menuItemId:    z.string(),
      customerName:  z.string().min(1),
      customerPhone: z.string().min(10),
      quantity:      z.number().int().min(1).optional(),
      message:       z.string().max(300).optional(),
      voiceUrl:      z.string().optional(),
    });
    const data = schema.parse(req.body);

    // Fetch shop + item
    const [shop, menuItem] = await Promise.all([
      prisma.shop.findUnique({ where: { id: data.shopId } }),
      prisma.menuItem.findUnique({ where: { id: data.menuItemId } }),
    ]);
    if (!shop)     return res.status(404).json({ error: 'Shop not found' });
    if (!menuItem) return res.status(404).json({ error: 'Item not found' });

    const replyMins = shop.enquiryReplyMins || 5;
    const expiresAt = new Date(Date.now() + replyMins * 60 * 1000);
    const isLoudAlert = shouldAlertLoud(shop);

    // Create enquiry
    const enquiry = await prisma.enquiry.create({
      data: {
        shopId:        data.shopId,
        menuItemId:    data.menuItemId,
        customerId:    req.user?.customerId || null,
        customerName:  data.customerName,
        customerPhone: data.customerPhone,
        quantity:      data.quantity || null,
        message:       data.message || null,
        voiceUrl:      data.voiceUrl || null,
        expiresAt,
        alertSentAt:   new Date(),
      },
    });

    // Notify owner
    const qtyText  = data.quantity ? `${data.quantity}× ` : '';
    const msgExtra = data.message  ? ` · "${data.message}"` : '';
    const voiceTxt = data.voiceUrl ? ' 🎙️ Voice message attached' : '';

    await prisma.notification.create({
      data: {
        shopId:        data.shopId,
        recipientType: 'OWNER',
        recipientId:   data.shopId,
        type:          'ENQUIRY_RECEIVED',
        channel:       'INAPP',
        title:         isLoudAlert ? '🚨 ENQUIRY — Reply fast!' : '🟡 New Enquiry',
        message:       `${menuItem.emoji} ${qtyText}${menuItem.name} — ${data.customerName}${msgExtra}${voiceTxt}`,
        status:        'PENDING',
      },
    });

    res.status(201).json({
      enquiryId:    enquiry.id,
      expiresAt,
      replyMins,
      isLoudAlert,
      message:      `Enquiry sent — owner has ${replyMins} minutes to reply`,
    });
  } catch (err) { next(err); }
});

// ─── GET ENQUIRY STATUS (customer polls this) ───
router.get('/:id/status', async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findUnique({
      where: { id: req.params.id },
      include: {
        menuItem: { select: { name: true, emoji: true, price: true } },
        shop:     { select: { name: true, ownerPhone: true, enquiryReplyMins: true } },
      },
    });
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    const now       = new Date();
    const isExpired = now > enquiry.expiresAt && enquiry.status === 'PENDING';
    const secsLeft  = Math.max(0, Math.floor((enquiry.expiresAt - now) / 1000));

    // Auto-expire if past deadline
    if (isExpired) {
      await prisma.enquiry.update({ where: { id: req.params.id }, data: { status: 'EXPIRED' } });
      return res.json({ ...enquiry, status: 'EXPIRED', secsLeft: 0, canCall: true, ownerPhone: enquiry.shop.ownerPhone });
    }

    res.json({
      ...enquiry,
      secsLeft,
      canCall:    secsLeft === 0,
      ownerPhone: enquiry.shop.ownerPhone,
    });
  } catch (err) { next(err); }
});

// ─── OWNER REPLIES TO ENQUIRY ───
router.post('/:id/reply', requireOwner, async (req, res, next) => {
  try {
    const { available, message } = z.object({
      available: z.boolean(),
      message:   z.string().optional(),
    }).parse(req.body);

    const enquiry = await prisma.enquiry.findUnique({
      where: { id: req.params.id },
      include: { menuItem: { select: { name: true, emoji: true } } },
    });
    if (!enquiry)           return res.status(404).json({ error: 'Not found' });
    if (enquiry.status !== 'PENDING') return res.status(400).json({ error: 'Already replied' });

    const replyText = message || (available ? 'Yes, available!' : 'Sorry, not available tonight');

    await prisma.enquiry.update({
      where: { id: req.params.id },
      data: {
        status:      available ? 'REPLIED_YES' : 'REPLIED_NO',
        ownerReply:  replyText,
        repliedAt:   new Date(),
      },
    });

    // Notify customer
    await prisma.notification.create({
      data: {
        shopId:        enquiry.shopId,
        recipientType: 'CUSTOMER',
        recipientId:   enquiry.customerPhone,
        type:          'ENQUIRY_RECEIVED',
        channel:       'INAPP',
        title:         available ? `✅ ${enquiry.menuItem.emoji} Available!` : `❌ ${enquiry.menuItem.emoji} Not available`,
        message:       replyText,
        status:        'PENDING',
      },
    });

    // If owner says NO → auto-mark item as SOLDOUT (optional — owner can undo)
    if (!available) {
      await prisma.menuItem.update({
        where: { id: enquiry.menuItemId },
        data:  { availabilityState: 'SOLDOUT' },
      });
    }

    res.json({ success: true, available, reply: replyText });
  } catch (err) { next(err); }
});

// ─── GET PENDING ENQUIRIES FOR OWNER ───
router.get('/shop/:shopId/pending', requireOwner, async (req, res, next) => {
  try {
    const enquiries = await prisma.enquiry.findMany({
      where:   { shopId: req.params.shopId, status: 'PENDING' },
      include: { menuItem: { select: { name: true, emoji: true, price: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const shop = await prisma.shop.findUnique({
      where:  { id: req.params.shopId },
      select: { enquiryAlertsFrom: true, enquiryReplyMins: true },
    });

    const now = new Date();
    const withMeta = enquiries.map(e => ({
      ...e,
      secsLeft:   Math.max(0, Math.floor((e.expiresAt - now) / 1000)),
      isUrgent:   (e.expiresAt - now) < 60 * 1000, // less than 1 min left
      isLoudAlert: shouldAlertLoud(shop),
    }));

    res.json(withMeta);
  } catch (err) { next(err); }
});

// ─── OWNER UPDATES ITEM AVAILABILITY STATE ───
// Works for both shop types — quick toggle from dashboard
router.put('/shop/:shopId/item/:itemId/state', requireOwner, async (req, res, next) => {
  try {
    const { state } = z.object({
      state: z.enum(['AVAILABLE', 'CHECK', 'SOLDOUT']),
    }).parse(req.body);

    const item = await prisma.menuItem.update({
      where: { id: req.params.itemId },
      data:  { availabilityState: state },
    });

    // Notify via inapp
    const emoji = state === 'AVAILABLE' ? '🟢' : state === 'CHECK' ? '🟡' : '🔴';
    await prisma.notification.create({
      data: {
        shopId:        req.params.shopId,
        recipientType: 'OWNER',
        recipientId:   req.params.shopId,
        type:          'ANNOUNCEMENT',
        channel:       'INAPP',
        title:         `${emoji} ${item.name} → ${state}`,
        message:       `Item state updated to ${state}`,
        status:        'DELIVERED',
      },
    });

    res.json({ success: true, item });
  } catch (err) { next(err); }
});

// ─── OWNER UPDATES ENQUIRY ALERT SETTINGS ───
router.put('/shop/:shopId/alert-settings', requireOwner, async (req, res, next) => {
  try {
    const schema = z.object({
      enquiryAlertsFrom: z.string().nullable(), // "22:00" or null to disable
      enquiryReplyMins:  z.number().int().min(1).max(30).default(5),
      enquiryAlertSound: z.enum(['loud', 'normal', 'vibrate']).default('loud'),
    });
    const data = schema.parse(req.body);

    const shop = await prisma.shop.update({
      where: { id: req.params.shopId },
      data,
    });

    res.json({ success: true, shop });
  } catch (err) { next(err); }
});

module.exports = router;
