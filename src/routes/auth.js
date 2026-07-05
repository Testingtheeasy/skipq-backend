const express = require('express');
const router  = express.Router();
const { prisma } = require('../db');
const jwt     = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'skipq_secret_2026';

// ── CUSTOMER: Send OTP ──
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g,'').length < 10)
      return res.status(400).json({ error: 'Valid phone number required' });
    // TODO: Integrate MSG91 for real OTP
    console.log(`[OTP] Customer ${phone}: 654321`);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CUSTOMER: Verify OTP ──
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name } = req.body;
    const cleanPhone = phone.replace(/\D/g,'');
    if (otp !== '654321') return res.status(400).json({ error: 'Invalid OTP' });
    let customer = await prisma.customer.findUnique({ where: { phone: cleanPhone } });
    let isNew = false;
    if (!customer) {
      if (!name) return res.status(400).json({ error: 'Name required', isNew: true });
      customer = await prisma.customer.create({ data: { phone: cleanPhone, name } });
      await prisma.loyaltyPoints.create({ data: { customerId: customer.id } });
      isNew = true;
    }
    const loyalty = await prisma.loyaltyPoints.findUnique({ where: { customerId: customer.id } });
    const token = jwt.sign(
      { customerId: customer.id, phone: cleanPhone, role: 'customer' },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ success: true, token, customer: { ...customer, points: loyalty?.balance || 0 }, isNew });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OWNER: Login with Phone + Password ──
router.post('/owner/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const cleanPhone = phone.replace(/\D/g,'');

    // Find shop by owner phone
    const shop = await prisma.shop.findFirst({ where: { ownerPhone: cleanPhone } });
    if (!shop) return res.status(404).json({ error: 'No shop found for this phone number. Contact SkipQ admin.' });

    // Check password (stored in shop record or use default)
    const shopPassword = shop.ownerPassword || 'owner123';
    if (password !== shopPassword) {
      return res.status(401).json({ error: 'Invalid password. Contact SkipQ admin if forgotten.' });
    }

    const token = jwt.sign(
      { shopId: shop.id, phone: cleanPhone, role: 'owner' },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ success: true, token, shop });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OWNER: Change Password ──
router.post('/owner/change-password', async (req, res) => {
  try {
    const { phone, oldPassword, newPassword } = req.body;
    const cleanPhone = phone.replace(/\D/g,'');
    const shop = await prisma.shop.findFirst({ where: { ownerPhone: cleanPhone } });
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const current = shop.ownerPassword || 'owner123';
    if (oldPassword !== current) return res.status(401).json({ error: 'Current password is wrong' });
    await prisma.shop.update({ where: { id: shop.id }, data: { ownerPassword: newPassword } });
    res.json({ success: true, message: 'Password updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADMIN: Login ──
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === 'admin@skipq.in' && password === 'admin123') {
      const token = jwt.sign({ role: 'admin', email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, token, admin: { email, name: 'SkipQ Admin', role: 'admin' } });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
