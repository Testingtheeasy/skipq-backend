const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const dotenv    = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// ── CORS — Allow all origins ──
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false,
};

// Handle preflight OPTIONS requests
app.options('*', cors(corsOptions));

// Apply CORS before helmet
app.use(cors(corsOptions));

// Helmet with relaxed settings for API
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));

app.use(express.json());
app.use(rateLimit({ windowMs: 15*60*1000, max: 500 }));

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

// ── HEALTH CHECK ──
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
