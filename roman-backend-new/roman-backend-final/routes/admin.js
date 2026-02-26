const express = require('express');
const router  = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const { agencies, sessions, leads, stats, store } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

function generateApiKey() {
  return 'ragency_' + crypto.randomBytes(24).toString('hex');
}

const PLANS = {
  basic:     { dialogs_limit: 200 },
  hot:       { dialogs_limit: 200 },
  pro:       { dialogs_limit: 500 },
  premium:   { dialogs_limit: 99999 },
  // legacy
  starter:   { dialogs_limit: 100 },
  enterprise:{ dialogs_limit: 99999 },
};

// GET /admin/agencies
router.get('/agencies', adminMiddleware, (req, res) => {
  res.json(agencies.getAll());
});

// POST /admin/agencies
router.post('/agencies', adminMiddleware, (req, res) => {
  const { name, bot_name, brand_color, plan, anthropic_key } = req.body;
  if (!name) return res.status(400).json({ error: 'Нужно название агентства' });

  const selectedPlan = plan || 'basic';
  const id     = uuidv4();
  const apiKey = generateApiKey();
  const limit  = PLANS[selectedPlan]?.dialogs_limit || 200;

  agencies.create({ id, name, api_key: apiKey, bot_name: bot_name||'Роман',
    brand_color: brand_color||'#1d4ed8', plan: selectedPlan,
    dialogs_limit: limit, anthropic_key: anthropic_key||null });

  res.status(201).json({ id, name, api_key: apiKey, plan: selectedPlan,
    dialogs_limit: limit, message: `Агентство "${name}" создано. API-ключ: ${apiKey}` });
});

// PUT /admin/agencies/:id
router.put('/agencies/:id', adminMiddleware, (req, res) => {
  const agency = agencies.getById(req.params.id);
  if (!agency) return res.status(404).json({ error: 'Агентство не найдено' });
  const { bot_name, brand_color, plan, dialogs_limit, active, anthropic_key } = req.body;
  agencies.update({ id: req.params.id, bot_name, brand_color, plan, dialogs_limit, active, anthropic_key });
  res.json({ success: true });
});

// GET /admin/agencies/:id/stats
router.get('/agencies/:id/stats', adminMiddleware, (req, res) => {
  const agency = agencies.getById(req.params.id);
  if (!agency) return res.status(404).json({ error: 'Агентство не найдено' });
  res.json({
    agency: { id: agency.id, name: agency.name, plan: agency.plan,
      dialogs_used: agency.dialogs_used, dialogs_limit: agency.dialogs_limit },
    stats: stats.agencyStats(req.params.id),
    recent_leads:    leads.getByAgency(req.params.id).slice(0,10),
    recent_sessions: sessions.getByAgency(req.params.id).slice(0,10)
  });
});

// GET /admin/leads
router.get('/leads', adminMiddleware, (req, res) => {
  const all = store.leads.slice(-100).reverse().map(l => ({
    ...l,
    agency_name: (agencies.getById(l.agency_id)||{}).name || '—'
  }));
  res.json(all);
});

// GET /admin/landing-leads
router.get('/landing-leads', adminMiddleware, (req, res) => {
  res.json(store.landing_leads.slice(-100).reverse());
});

module.exports = router;
