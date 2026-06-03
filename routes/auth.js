const express = require('express');
const router  = express.Router();
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = new PrismaClient();

router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.replace(/\D/g,'').length < 10)
      return res.status(400).json({ error: 'Valid phone number required' });
    console.log(`OTP for ${phone}: 654321`);
    res.json({ success: true, message: 'OTP sent' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    const token = jwt.sign({ customerId: customer.id, phone: cleanPhone, role:'customer' }, process.env.JWT_SECRET || 'skipq_secret', { expiresIn: '30d' });
    res.json({ success:true, token, customer: { ...customer, points: loyalty?.balance || 0 }, isNew });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/owner/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = phone.replace(/\D/g,'');
    if (otp !== '123456') return res.status(400).json({ error: 'Invalid OTP' });
    const shop = await prisma.shop.findFirst({ where: { ownerPhone: cleanPhone } });
    if (!shop) return res.status(404).json({ error: 'No shop found for this number' });
    const token = jwt.sign({ shopId: shop.id, phone: cleanPhone, role:'owner' }, process.env.JWT_SECRET || 'skipq_secret', { expiresIn: '30d' });
    res.json({ success:true, token, shop });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (email === 'admin@skipq.in' && password === 'admin123') {
      const token = jwt.sign({ role:'admin', email }, process.env.JWT_SECRET || 'skipq_secret', { expiresIn: '7d' });
      return res.json({ success:true, token, admin: { email, name:'SkipQ Admin', role:'admin' } });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
