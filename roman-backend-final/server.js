require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS вручную — самый надёжный способ ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-agency-key,x-admin-key,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 60 }));

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/',       (_, res) => res.json({ service: 'Travel AI', status: 'running' }));

const { initDb } = require('./db/database');

initDb().then(() => {
  const chatRoutes   = require('./routes/chat');
  const adminRoutes  = require('./routes/admin');
  const agencyRoutes = require('./routes/agency');
  const authRoutes   = require('./routes/auth');
  const demoRoutes   = require('./routes/demo');

  app.use('/api/chat',   chatRoutes);
  app.use('/api/agency', agencyRoutes);
  app.use('/api/auth',   authRoutes);
  app.use('/api/demo',   demoRoutes);
  app.use('/admin',      adminRoutes);

  app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Travel AI запущен на порту ${PORT}`);
  });

}).catch(err => {
  console.error('❌ Ошибка запуска БД:', err);
  process.exit(1);
});
