const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sessions, leads, stats, db } = require('../db/database');
const { encryptCredentials } = require('./sletat');

// ── GET /api/agency/config — полный конфиг агентства ──
router.get('/config', authMiddleware, (req, res) => {
  const a = req.agency;
  res.json({
    bot_name:      a.bot_name,
    bot_greeting:  a.bot_greeting,
    brand_color:   a.brand_color,
    tone:          a.tone,
    countries:     a.countries ? JSON.parse(a.countries) : null,
    custom_instructions: a.custom_instructions,
    plan:          a.plan,
    dialogs_used:  a.dialogs_used,
    dialogs_limit: a.dialogs_limit,
    dialogs_left:  a.dialogs_limit - a.dialogs_used,
    has_sletat:    !!(a.sletat_login),
    has_anthropic: !!(a.anthropic_key),
  });
});

// ── POST /api/agency/bot — сохранить личность бота ──
router.post('/bot', authMiddleware, (req, res) => {
  const { bot_name, bot_greeting, brand_color } = req.body;
  if (!bot_name) return res.status(400).json({ error: 'Нужно имя бота' });

  db.prepare(`UPDATE agencies SET bot_name=?, bot_greeting=?, brand_color=? WHERE id=?`)
    .run(
      bot_name.trim(),
      bot_greeting?.trim() || null,
      brand_color || '#0a7ea4',
      req.agency.id
    );

  res.json({ success: true });
});

// ── POST /api/agency/tone — сохранить стиль общения ──
router.post('/tone', authMiddleware, (req, res) => {
  const { tone, custom_instructions } = req.body;
  const allowed = ['friendly','professional','expert','luxury','energetic','consultative'];
  if (!allowed.includes(tone)) return res.status(400).json({ error: 'Неверный тон' });

  db.prepare(`UPDATE agencies SET tone=?, custom_instructions=? WHERE id=?`)
    .run(tone, custom_instructions?.trim() || null, req.agency.id);

  res.json({ success: true });
});

// ── POST /api/agency/countries — сохранить направления ──
router.post('/countries', authMiddleware, (req, res) => {
  const { countries } = req.body; // { beach:['🇹🇷 Турция',...], excursion:[...], ... }
  if (!countries || typeof countries !== 'object') {
    return res.status(400).json({ error: 'Нужен объект с направлениями' });
  }

  db.prepare(`UPDATE agencies SET countries=? WHERE id=?`)
    .run(JSON.stringify(countries), req.agency.id);

  res.json({ success: true });
});

// ── POST /api/agency/anthropic — сохранить ключ Anthropic ──
router.post('/anthropic', authMiddleware, (req, res) => {
  const { api_key } = req.body;
  if (!api_key?.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'Неверный формат ключа Anthropic (должен начинаться с sk-ant-)' });
  }

  const encrypted = encryptCredentials(api_key);
  db.prepare(`UPDATE agencies SET anthropic_key=? WHERE id=?`).run(encrypted, req.agency.id);
  res.json({ success: true, message: 'Ключ Anthropic сохранён и зашифрован' });
});

// ── POST /api/agency/sletat — сохранить credentials Sletat ──
router.post('/sletat', authMiddleware, (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Нужны login и password от sletat.ru' });
  }

  db.prepare(`UPDATE agencies SET sletat_login=?, sletat_password=? WHERE id=?`)
    .run(encryptCredentials(login), encryptCredentials(password), req.agency.id);

  res.json({ success: true, message: 'Sletat.ru подключён' });
});

// ── PATCH /api/agency/leads/:id — обновить статус лида ──
router.patch('/leads/:id', authMiddleware, (req, res) => {
  const { status } = req.body; // 'done' | 'new'
  db.prepare(`UPDATE leads SET status=? WHERE id=? AND agency_id=?`)
    .run(status, req.params.id, req.agency.id);
  res.json({ success: true });
});

// ── GET /api/agency/stats ──
router.get('/stats', authMiddleware, (req, res) => {
  const s = stats.agencyStats.get(req.agency.id);
  const recentLeads = leads.getByAgency.all(req.agency.id);
  res.json({
    ...s,
    dialogs_used:  req.agency.dialogs_used,
    dialogs_limit: req.agency.dialogs_limit,
    recent_leads:  recentLeads.slice(0, 20)
  });
});

// ── GET /api/agency/leads ──
router.get('/leads', authMiddleware, (req, res) => {
  res.json(leads.getByAgency.all(req.agency.id));
});

module.exports = router;
