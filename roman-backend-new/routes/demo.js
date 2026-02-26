const express = require('express');
const router = express.Router();

const DEMO_SYSTEM = `Ты — Роман, ИИ-ассистент Travel AI. Отвечай на русском. Максимум 4 предложения.

Помогаешь подбирать туры для клиентов турагентств. Отвечай кратко и по делу.

Тарифы Travel AI:
- Basic 1 900₽/мес: форма подбора, карточка клиента, панель, до 200 лидов
- Горящие туры 2 500₽/мес: всё из Basic + бот горящих туров, обновление каждые 30 мин, уведомления менеджеру
- Pro 5 900₽/мес: ИИ-диалог, подбор 2-3 отелей, аналитика, до 500 диалогов
- Premium 12 900₽/мес: реальные цены из Sletat API, B2B-ключ, безлимит, приоритетная поддержка

Когда предлагаешь туры — давай 2-3 варианта кратко: название, цена в рублях ориентировочно, 1 строка описания.
После туров всегда добавляй: "Реальные цены из Sletat доступны на тарифе Premium."
В конце добавь: [ACTION:none] или [ACTION:contact] если клиент хочет подключиться.`;

// POST /api/demo/chat
router.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Нужен массив messages' });
  }

  const limited = messages.slice(-20);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        system: DEMO_SYSTEM,
        messages: limited
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/\[ACTION:[^\]]*\]/g, '').trim();
    const action = (text.match(/\[ACTION:([^\]]*)\]/)?.[1] || 'none').trim();

    res.json({ reply: clean, action });
  } catch (err) {
    console.error('Demo chat error:', err);
    res.status(500).json({ error: 'Сервис временно недоступен' });
  }
});

// POST /api/demo/lead
router.post('/lead', async (req, res) => {
  const { name, contact, phone, plan, site, team } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Нужны имя и телефон' });
  }

  console.log(`НОВАЯ ЗАЯВКА: ${name} | ${phone} | ${plan} | ${site || '-'} | ${team || '-'}`);

  try {
    const { db } = require('../db/database');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS landing_leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, contact TEXT, phone TEXT, plan TEXT,
        site TEXT, team TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
    } catch(e){}
    db.prepare(`INSERT INTO landing_leads (name, contact, phone, plan, site, team) VALUES (?,?,?,?,?,?)`)
      .run(name, contact || '', phone, plan || 'Pro', site || '', team || '');
  } catch(e) { console.error('Lead save error:', e); }

  res.json({ success: true });
});

module.exports = router;
