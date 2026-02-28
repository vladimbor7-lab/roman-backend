require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const chatRoutes     = require('./routes/chat');
const adminRoutes    = require('./routes/admin');
const agencyRoutes   = require('./routes/agency');
const authRoutes     = require('./routes/auth');
const demoRoutes     = require('./routes/demo');
const hotToursRoutes = require('./routes/hot-tours');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, max: 40,
  message: { error: 'Слишком много запросов, подождите минуту' }
});
app.use('/api/', limiter);

// ── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api/chat',      chatRoutes);
app.use('/api/agency',    agencyRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/demo',      demoRoutes);
app.use('/api/hot-tours', hotToursRoutes);
app.use('/admin',         adminRoutes);

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() });
});

// ── ERROR ────────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   Travel AI Backend v2.0             ║
║   Порт: ${PORT}                         ║
║   Новое: Elite Prompt, Otprovin,     ║
║          PDF export, Quick Actions   ║
╚══════════════════════════════════════╝
  `);
});

module.exports = app;
