const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const { agencies, sessions, leads, stats } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Generate a secure agency API key
function generateApiKey() {
  return 'ragency_' + crypto.randomBytes(24).toString('hex');
}

const PLANS = {
  starter:    { dialogs_limit: 100 },
  pro:        { dialogs_limit: 1000 },
  enterprise: { dialogs_limit: 99999 }
};

// ── GET /admin/agencies — список всех агентств ──
router.get('/agencies', adminMiddleware, (req, res) => {
  const all = agencies.getAll.all();
  res.json(all);
});

// ── POST /admin/agencies — создать агентство ──
router.post('/agencies', adminMiddleware, (req, res) => {
  const { name, bot_name, brand_color, plan, anthropic_key } = req.body;

  if (!name) return res.status(400).json({ error: 'Нужно название агентства' });

  const selectedPlan = plan || 'starter';
  const id = uuidv4();
  const apiKey = generateApiKey();
  const limit = PLANS[selectedPlan]?.dialogs_limit || 100;

  agencies.create.run(
    id, name, apiKey,
    bot_name || 'Роман',
    brand_color || '#0a7ea4',
    selectedPlan,
    limit,
    anthropic_key || null
  );

  res.status(201).json({
    id,
    name,
    api_key: apiKey,
    bot_name: bot_name || 'Роман',
    plan: selectedPlan,
    dialogs_limit: limit,
    message: `Агентство "${name}" создано! Сохраните API-ключ: ${apiKey}`
  });
});

// ── PUT /admin/agencies/:id — обновить агентство ──
router.put('/agencies/:id', adminMiddleware, (req, res) => {
  const { bot_name, brand_color, plan, dialogs_limit, active, anthropic_key } = req.body;
  const agency = agencies.getById.get(req.params.id);
  if (!agency) return res.status(404).json({ error: 'Агентство не найдено' });

  agencies.update.run(
    bot_name      ?? agency.bot_name,
    brand_color   ?? agency.brand_color,
    plan          ?? agency.plan,
    dialogs_limit ?? agency.dialogs_limit,
    active        ?? agency.active,
    anthropic_key ?? agency.anthropic_key,
    req.params.id
  );

  res.json({ success: true, message: 'Агентство обновлено' });
});

// ── GET /admin/agencies/:id/stats ──
router.get('/agencies/:id/stats', adminMiddleware, (req, res) => {
  const agency = agencies.getById.get(req.params.id);
  if (!agency) return res.status(404).json({ error: 'Агентство не найдено' });

  const s = stats.agencyStats.get(req.params.id);
  const recentLeads = leads.getByAgency.all(req.params.id);
  const recentSessions = sessions.getByAgency.all(req.params.id);

  res.json({
    agency: {
      id: agency.id,
      name: agency.name,
      plan: agency.plan,
      dialogs_used: agency.dialogs_used,
      dialogs_limit: agency.dialogs_limit
    },
    stats: s,
    recent_leads: recentLeads.slice(0, 10),
    recent_sessions: recentSessions.slice(0, 10)
  });
});

// ── GET /admin/leads — все лиды по всем агентствам ──
router.get('/leads', adminMiddleware, (req, res) => {
  const { db } = require('../db/database');
  const allLeads = db.prepare(`
    SELECT l.*, a.name as agency_name 
    FROM leads l JOIN agencies a ON l.agency_id = a.id
    ORDER BY l.created_at DESC LIMIT 100
  `).all();
  res.json(allLeads);
});

module.exports = router;
