require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const chatRoutes   = require('./routes/chat');
const adminRoutes  = require('./routes/admin');
const agencyRoutes = require('./routes/agency');
const authRoutes   = require('./routes/auth');
const demoRoutes   = require('./routes/demo');
const hotToursRoutes = require('./routes/hot-tours');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());

// Rate limiting — защита от спама
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 30,             // максимум 30 запросов в минуту
  message: { error: 'Слишком много запросов, подождите минуту' }
});
app.use('/api/', limiter);

// ── ROUTES ──
app.use('/api/chat',   chatRoutes);
app.use('/api/agency', agencyRoutes);
app.use('/api/auth',   authRoutes);
app.use('/api/demo',   demoRoutes);
app.use('/api/hot-tours', hotToursRoutes);
app.use('/admin',      adminRoutes);

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║   🌴 Роман Backend v1.0           ║
║   Сервер запущен на порту ${PORT}    ║
╚════════════════════════════════════╝
  `);
});

module.exports = app;
