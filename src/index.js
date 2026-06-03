const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const dotenv     = require('dotenv');
const rateLimit  = require('express-rate-limit');

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 4000;

// ── MIDDLEWARE ──
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }));

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

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status:'ok', platform:'SkipQ API', version:'1.0.0', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ message:'SkipQ API is running 🌶️', docs:'/health' });
});

// ── START ──
app.listen(PORT, () => {
  console.log(`🌶️  SkipQ API running on port ${PORT}`);
});
