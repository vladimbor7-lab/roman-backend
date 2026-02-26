const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { agencies } = require('../db/database');

function hashPw(pw) {
  return crypto.createHash('sha256').update(pw + (process.env.ADMIN_KEY||'secret')).digest('hex');
}

// POST /api/auth/login — по email+пароль
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Нужны email и пароль' });

  const agency = agencies.getAll().find(a => a.email === email.toLowerCase() && a.active === 1);
  if (!agency || !agency.password_hash) return res.status(401).json({ error: 'Агентство не найдено' });

  if (hashPw(password) !== agency.password_hash) return res.status(401).json({ error: 'Неверный пароль' });

  res.json({ api_key: agency.api_key, name: agency.name, plan: agency.plan, bot_name: agency.bot_name });
});

// POST /api/auth/set-password — установить пароль (admin)
router.post('/set-password', (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Нет доступа' });
  const { agency_id, email, password } = req.body;
  if (!agency_id || !email || !password) return res.status(400).json({ error: 'Нужны agency_id, email, password' });

  agencies.patch(agency_id, { email: email.toLowerCase(), password_hash: hashPw(password) });
  res.json({ success: true, message: `Пароль для ${email} установлен` });
});

module.exports = router;
