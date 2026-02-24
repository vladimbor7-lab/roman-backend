const express = require('express');
const router = express.Router();

const DEMO_SYSTEM = `Ты — Роман, тур-ассистент демо-версии Travel AI. Отвечай на русском. Кратко — максимум 5 предложений.

Когда клиент выбрал тур — дай РОВНО 2 отеля:
🏨 **Название** (X★) — 1 предложение описания
📍 Туроператор · 🍽️ Всё включено
💰 от ~XXX USD за 7 ночей

После: "Это демо — реальные цены из Sletat.ru доступны на Premium плане 😊"

Тарифы: Basic 1 900₽/мес, Pro 5 900₽/мес, Premium 12 900₽/мес.
В конце каждого ответа: [ACTION:none] или [ACTION:contact] если хочет подключиться.`;

router.post('/chat', async (req, res) => {
  console.log('📩 Demo chat request received');
  console.log('ANTHROPIC_KEY exists:', !!process.env.ANTHROPIC_KEY);
  console.log('ANTHROPIC_KEY prefix:', process.env.ANTHROPIC_KEY?.substring(0, 10));

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Нужен массив messages' });
  }

  try {
    console.log('📤 Calling Anthropic API...');
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
        messages: messages.slice(-20)
      })
    });

    console.log('📥 Anthropic response status:', response.status);
    const data = await response.json();
    console.log('📥 Anthropic response:', JSON.stringify(data).substring(0, 200));

    if (data.error) {
      console.error('❌ Anthropic error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/\[ACTION:[^\]]*\]/g, '').trim();
    const action = (text.match(/\[ACTION:([^\]]*)\]/)?.[1] || 'none').trim();

    res.json({ reply: clean, action });
  } catch (err) {
    console.error('❌ Demo chat error:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});

router.post('/lead', async (req, res) => {
  const { name, contact, phone, plan, site } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Нужны имя и телефон' });
  }
  console.log(`🔥 НОВАЯ ЗАЯВКА: ${name} | ${phone} | ${plan}`);
  res.json({ success: true });
});

module.exports = router;
