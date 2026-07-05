const express   = require('express');
const cors      = require('cors');
const dotenv    = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// Render sits behind a reverse proxy - without this, express-rate-limit
// can't see individual client IPs and ends up rate-limiting your ENTIRE
// user base as if they were one single visitor.
app.set('trust proxy', 1);

// ── CORS — Must be FIRST before everything ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// General limit: generous enough for normal polling (menu/orders/shop
// refreshes every 8-15s across owner + customer apps) per real client IP.
app.use(rateLimit({
  windowMs: 15*60*1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));

// Stricter limit specifically on auth/OTP-style endpoints, where abuse
// actually matters (brute-forcing passwords, OTP spam, fake signups).
const authLimiter = rateLimit({
  windowMs: 15*60*1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});
app.use('/api/auth', authLimiter);
app.use('/api/customers/login', authLimiter);
app.use('/api/customers/register', authLimiter);

// ── ROUTES ──
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/shops',     require('./routes/shops'));
app.use('/api/menu',      require('./routes/menu'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/enquiries', require('./routes/enquiries'));
app.use('/api/loyalty',   require('./routes/loyalty'));
app.use('/api/feedback',  require('./routes/feedback'));
app.use('/api/specials',  require('./routes/specials'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/tokens',    require('./routes/tokens'));

// ── HEALTH ──
app.get('/health', (req, res) => {
  res.json({ status:'ok', platform:'SkipQ API', version:'1.0.0', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message:'SkipQ API is running 🌶️' });
});

// ── KEEP ALIVE ──
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try {
      await fetch('https://skipq-api.onrender.com/health');
      console.log('[KeepAlive] Ping sent');
    } catch {}
  }, 14 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`🌶️  SkipQ API running on port ${PORT}`);
});
