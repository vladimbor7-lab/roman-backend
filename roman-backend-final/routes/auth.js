const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db/database');

// Добавляем колонки email/password в agencies если их нет
try {
  db.exec(`ALTER TABLE agencies ADD COLUMN email TEXT`);
  db.exec(`ALTER TABLE agencies ADD COLUMN password_hash TEXT`);
} catch(e) { /* колонки уже есть */ }

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + process.env.ADMIN_KEY).digest('hex');
}

// ── POST /api/auth/login — войти по email+пароль ──
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Нужны email и пароль' });
  }

  const agency = db.prepare(`SELECT * FROM agencies WHERE email=? AND active=1`).get(email.toLowerCase());

  if (!agency || !agency.password_hash) {
    return res.status(401).json({ error: 'Агентство не найдено' });
  }

  const hash = hashPassword(password);
  if (hash !== agency.password_hash) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  res.json({
    api_key:  agency.api_key,
    name:     agency.name,
    plan:     agency.plan,
    bot_name: agency.bot_name
  });
});

// ── POST /api/auth/set-password — установить пароль агентству (admin) ──
// Вызывается администратором после создания агентства
router.post('/set-password', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const { agency_id, email, password } = req.body;
  if (!agency_id || !email || !password) {
    return res.status(400).json({ error: 'Нужны agency_id, email и password' });
  }

  const hash = hashPassword(password);
  db.prepare(`UPDATE agencies SET email=?, password_hash=? WHERE id=?`)
    .run(email.toLowerCase(), hash, agency_id);

  res.json({ success: true, message: `Пароль для ${email} установлен` });
});

module.exports = router;
