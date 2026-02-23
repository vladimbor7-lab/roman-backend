const express = require('express');
const router = express.Router();

const DEMO_SYSTEM = `Ты — Роман, тур-ассистент демо-версии Travel AI. Отвечай на русском. Кратко — максимум 5 предложений.

Это демо для турагентств которые хотят подключить такого бота на свой сайт.

Когда клиент выбрал тур — дай РОВНО 2 отеля:
🏨 **Название** (X★) — 1 предложение описания
📍 Туроператор · 🍽️ Всё включено
💰 от ~XXX USD за 7 ночей

После: "Это демо — реальные цены из Sletat.ru доступны на Premium плане 😊"

Когда спрашивают о сервисе: тарифы Basic 1 900₽/мес, Pro 5 900₽/мес, Premium 12 900₽/мес.
В конце каждого ответа добавь: [ACTION:none] или [ACTION:contact] если хочет подключиться.`;

// POST /api/demo/chat
router.post('/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Нужен массив messages' });
  }

  // Ограничение — не более 20 сообщений в демо
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
        max_tokens: 800,
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

// POST /api/demo/lead — сохранить заявку с лендинга
router.post('/lead', async (req, res) => {
  const { name, contact, phone, plan, site } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Нужны имя и телефон' });
  }

  // Логируем заявку (можно добавить email-уведомление)
  console.log(`🔥 НОВАЯ ЗАЯВКА: ${name} | ${phone} | ${plan} | ${site || '—'}`);

  // Сохраняем в БД
  try {
    const { db } = require('../db/database');
    try { db.exec(`CREATE TABLE IF NOT EXISTS landing_leads (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, contact TEXT, phone TEXT, plan TEXT, site TEXT, created_at TEXT DEFAULT (datetime('now')))`); } catch(e){}
    db.prepare(`INSERT INTO landing_leads (name, contact, phone, plan, site) VALUES (?,?,?,?,?)`)
      .run(name, contact || '', phone, plan || 'Pro', site || '');
  } catch(e) { console.error('Lead save error:', e); }

  res.json({ success: true });
});

module.exports = router;
