const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { agencies, sessions, messages, leads } = require('../db/database');
const { searchTours, formatToursForClaude, decryptCredentials } = require('./sletat');
const { v4: uuidv4 } = require('uuid');

// ─── ЭЛИТНЫЙ СИСТЕМНЫЙ ПРОМПТ ─────────────────────────────────────────────
function buildSystem(agency) {
  const planLabels = { basic:'Basic', hot:'Горящие туры', pro:'Pro', premium:'Premium' };
  const plan       = agency.plan || 'basic';
  const isHot      = plan === 'hot';
  const isPro      = ['pro','premium'].includes(plan);
  const isPremium  = plan === 'premium';

  return `Ты — ${agency.bot_name || 'Виктор'}, независимый эксперт по туризму агентства "${agency.name}".
Стиль: ${agency.tone || 'лаконичный, деловой'}. Отвечай на русском, кратко — максимум 4 предложения.
Никогда не говоришь «Я ИИ», «Как я могу помочь», «Удачного путешествия», «Конечно!», «Отлично!».
${agency.custom_instructions ? `\nИнструкции агентства: ${agency.custom_instructions}` : ''}
${agency.countries ? `\nОсновные направления: ${agency.countries}` : ''}

ЗНАНИЯ РФ-РЫНКА:
- ТО: Coral Travel, Tez Tour, Anex Tour, Pegas, Fun&Sun, Biblio Globus
- Питание: RO, BB, HB, FB, AI, UAI/UI
- Перелёт: чартер (дешевле), регулярка (надёжнее)
- Визы: Турция/Египет/ОАЭ — безвиз РФ; Таиланд 30 дней; Греция — Шенген

Тариф агентства: ${planLabels[plan] || plan}.
${isHot ? 'Горящие туры — обновляются каждые 30 минут.' : ''}
${isPremium ? 'Используй реальные цены из Sletat API.' : 'Цены ориентировочные.'}

Когда клиент определился — добавь [LEAD] и резюмируй запрос одним предложением.
В остальных случаях — [ACTION:none].`;
}

// POST /api/chat/:session_id
router.post('/:session_id', authMiddleware, async (req, res) => {
  const { message, quickAction } = req.body;
  const agency = req.agency;

  if (!message) return res.status(400).json({ error: 'Нужен message' });

  if (agency.dialogs_used >= agency.dialogs_limit) {
    return res.status(429).json({ error: `Лимит диалогов ${agency.dialogs_limit}. Обновите тариф.` });
  }

  let sessionId = req.params.session_id;
  if (sessionId === 'new') {
    sessionId = uuidv4();
    sessions.create(sessionId, agency.id);
  } else {
    const ex = sessions.getById(sessionId);
    if (!ex) sessions.create(sessionId, agency.id);
  }

  messages.add(sessionId, 'user', message);
  agencies.incrementDialogs(agency.id);

  let hist = messages.getBySession(sessionId)
    .slice(-20)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  // Inject quick action
  if (quickAction) {
    const map = {
      expensive: 'ДОРОГО — обоснуй цену и предложи дешёвую альтернативу',
      whatsapp:  'WHATSAPP — перепиши в 3 строки, цена жирным **цена**, 2 эмодзи',
      negative:  'НЕГАТИВ — честно: топ жалоб туристов на этот отель',
      post:      'ПОСТ — продающий Telegram-пост про этот тур, 120 слов',
      hidden:    'СКРЫТЫЙ — опиши тур без названия отеля',
    };
    if (map[quickAction]) hist = [...hist, { role:'user', content: map[quickAction] }];
  }

  let anthropicKey = process.env.ANTHROPIC_KEY;
  if (agency.anthropic_key) {
    try { anthropicKey = decryptCredentials(agency.anthropic_key); } catch(e){}
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': anthropicKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:700, system:buildSystem(agency), messages:hist })
    });

    const data  = await aiRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text   = data.content?.[0]?.text || '';
    const isLead = text.includes('[LEAD]');
    const clean  = text.replace(/\[LEAD\]/g,'').replace(/\[ACTION:[^\]]*\]/g,'').trim();

    messages.add(sessionId, 'assistant', clean);

    if (isLead) {
      leads.create(sessionId, agency.id, clean.slice(0,300));
      sessions.update({ id: sessionId, completed: 1 });
    }

    res.json({ reply: clean, session_id: sessionId, is_lead: isLead });
  } catch(err) {
    console.error('[chat]', err.message);
    res.status(500).json({ error: 'ИИ временно недоступен' });
  }
});

// GET /api/chat/:session_id/messages
router.get('/:session_id/messages', authMiddleware, (req, res) => {
  res.json(messages.getBySession(req.params.session_id));
});

module.exports = router;
