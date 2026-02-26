const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { agencies, sessions, leads, stats } = require('../db/database');
const { encryptCredentials } = require('./sletat');

// GET /api/agency/config
router.get('/config', authMiddleware, (req, res) => {
  const a = req.agency;
  res.json({
    name:           a.name,
    bot_name:       a.bot_name,
    bot_greeting:   a.bot_greeting,
    brand_color:    a.brand_color,
    tone:           a.tone,
    countries:      a.countries ? tryParse(a.countries) : null,
    custom_instructions: a.custom_instructions,
    plan:           a.plan,
    dialogs_used:   a.dialogs_used,
    dialogs_limit:  a.dialogs_limit,
    dialogs_left:   a.dialogs_limit - a.dialogs_used,
    has_sletat:     !!(a.sletat_login),
    has_anthropic:  !!(a.anthropic_key),
  });
});

// POST /api/agency/bot
router.post('/bot', authMiddleware, (req, res) => {
  const { bot_name, bot_greeting, brand_color } = req.body;
  if (!bot_name) return res.status(400).json({ error: 'Нужно имя бота' });
  agencies.patch(req.agency.id, {
    bot_name:     bot_name.trim(),
    bot_greeting: bot_greeting?.trim() || null,
    brand_color:  brand_color || '#1d4ed8'
  });
  res.json({ success: true });
});

// POST /api/agency/settings  (unified save from panel)
router.post('/settings', authMiddleware, (req, res) => {
  const { bot_name, bot_greeting, brand_color, tone, custom_instructions, countries } = req.body;
  agencies.patch(req.agency.id, {
    ...(bot_name     !== undefined && { bot_name:     bot_name.trim() }),
    ...(bot_greeting !== undefined && { bot_greeting: bot_greeting?.trim() || null }),
    ...(brand_color  !== undefined && { brand_color }),
    ...(tone         !== undefined && { tone }),
    ...(custom_instructions !== undefined && { custom_instructions: custom_instructions?.trim() || null }),
    ...(countries    !== undefined && { countries: typeof countries === 'string' ? countries : JSON.stringify(countries) }),
  });
  res.json({ success: true });
});

// POST /api/agency/tone
router.post('/tone', authMiddleware, (req, res) => {
  const { tone, custom_instructions } = req.body;
  const allowed = ['friendly','professional','expert','luxury','energetic','consultative'];
  if (tone && !allowed.includes(tone)) return res.status(400).json({ error: 'Неверный тон' });
  agencies.patch(req.agency.id, {
    tone,
    custom_instructions: custom_instructions?.trim() || null
  });
  res.json({ success: true });
});

// POST /api/agency/countries
router.post('/countries', authMiddleware, (req, res) => {
  const { countries } = req.body;
  if (!countries || typeof countries !== 'object') return res.status(400).json({ error: 'Нужен объект с направлениями' });
  agencies.patch(req.agency.id, { countries: JSON.stringify(countries) });
  res.json({ success: true });
});

// POST /api/agency/anthropic
router.post('/anthropic', authMiddleware, (req, res) => {
  const { api_key } = req.body;
  if (!api_key?.startsWith('sk-ant-')) return res.status(400).json({ error: 'Неверный формат ключа (sk-ant-...)' });
  agencies.patch(req.agency.id, { anthropic_key: encryptCredentials(api_key) });
  res.json({ success: true, message: 'Ключ Anthropic сохранён' });
});

// POST /api/agency/sletat
router.post('/sletat', authMiddleware, (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Нужны login и password от sletat.ru' });
  agencies.patch(req.agency.id, {
    sletat_login:    encryptCredentials(login),
    sletat_password: encryptCredentials(password)
  });
  res.json({ success: true, message: 'Sletat.ru подключён' });
});

// PATCH /api/agency/leads/:id
router.patch('/leads/:id', authMiddleware, (req, res) => {
  const { status } = req.body;
  const { store } = require('../db/database');
  const lead = store.leads.find(l => l.id == req.params.id && l.agency_id === req.agency.id);
  if (lead) { lead.status = status; require('../db/database').store; }
  res.json({ success: true });
});

// GET /api/agency/stats
router.get('/stats', authMiddleware, (req, res) => {
  const s = stats.agencyStats(req.agency.id);
  const recentLeads = leads.getByAgency(req.agency.id);
  res.json({
    ...s,
    dialogs_used:  req.agency.dialogs_used,
    dialogs_limit: req.agency.dialogs_limit,
    recent_leads:  recentLeads.slice(0, 20)
  });
});

// GET /api/agency/leads
router.get('/leads', authMiddleware, (req, res) => {
  res.json(leads.getByAgency(req.agency.id));
});

function tryParse(v) { try { return JSON.parse(v); } catch { return v; } }

module.exports = router;
