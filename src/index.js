const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: [/\.skipq\.in$/, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'], credentials: true }));
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 200 }));

app.get('/health', (req,res) => res.json({ status:'ok', platform:'SkipQ API', version:'1.0.0', time:new Date().toISOString() }));

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/shops',         require('./routes/shops'));
app.use('/api/menu',          require('./routes/menu'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/tokens',        require('./routes/tokens'));
app.use('/api/loyalty',       require('./routes/loyalty'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settlements',   require('./routes/settlements'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/disputes',      require('./routes/disputes'));
app.use('/api/specials',      require('./routes/specials'));
app.use('/api/enquiries',     require('./routes/enquiries'));  // NEW

app.use((req,res) => res.status(404).json({ error:'Route not found' }));
app.use((err,req,res,next) => {
  console.error('❌', err.message);
  res.status(err.status||500).json({ error: err.message||'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SkipQ API running on port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log('🟡 Enquiry system: enabled\n');
});
module.exports = app;
