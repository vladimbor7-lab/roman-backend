const express = require('express');
const router  = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { agencies, sessions, messages, leads } = require('../db/database');
const { searchTours, formatToursForClaude, decryptCredentials } = require('./sletat');
const { v4: uuidv4 } = require('uuid');

// Системный промпт для агентства
function buildSystem(agency) {
  const planLabels = { basic:'Basic', hot:'Горящие туры', pro:'Pro', premium:'Premium' };
  const plan = agency.plan || 'basic';
  const isHot     = plan === 'hot';
  const isPro     = ['pro','premium'].includes(plan);
  const isPremium = plan === 'premium';

  return `Ты — ${agency.bot_name || 'Роман'}, тур-ассистент агентства "${agency.name}".
Тон общения: ${agency.tone || 'friendly'}. Отвечай на русском, кратко — максимум 4 предложения.
${agency.custom_instructions ? `\nИнструкции агентства: ${agency.custom_instructions}` : ''}
${agency.countries ? `\nНаправления: ${agency.countries}` : ''}

Тариф: ${planLabels[plan] || plan}.
${isHot ? 'У тебя есть доступ к горящим турам — обновляются каждые 30 минут.' : ''}
${isPremium ? 'Используй реальные цены из Sletat API.' : 'Цены ориентировочные — реальные доступны на Premium.'}

Когда клиент определился с туром — скажи: [LEAD] и кратко резюмируй запрос.
В остальных случаях добавь: [ACTION:none].`;
}

// POST /api/chat/:session_id
router.post('/:session_id', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const agency = req.agency;

  if (!message) return res.status(400).json({ error: 'Нужен message' });

  // Лимит диалогов
  if (agency.dialogs_used >= agency.dialogs_limit) {
    return res.status(429).json({ error: `Лимит диалогов исчерпан (${agency.dialogs_limit}). Обновите тариф.` });
  }

  // Сессия
  let sessionId = req.params.session_id;
  if (sessionId === 'new') {
    sessionId = uuidv4();
    sessions.create(sessionId, agency.id);
  } else {
    const existing = sessions.getById(sessionId);
    if (!existing) { sessions.create(sessionId, agency.id); }
  }

  // Сохранить сообщение пользователя
  messages.add(sessionId, 'user', message);
  agencies.incrementDialogs(agency.id);

  // История диалога
  const history = messages.getBySession(sessionId)
    .slice(-20)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  // Ключ Anthropic (агентства или платформы)
  let anthropicKey = process.env.ANTHROPIC_KEY;
  if (agency.anthropic_key) {
    try { anthropicKey = decryptCredentials(agency.anthropic_key); } catch(e) {}
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key': anthropicKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: buildSystem(agency),
        messages: history
      })
    });

    const data = await aiRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text     = data.content?.[0]?.text || '';
    const isLead   = text.includes('[LEAD]');
    const clean    = text.replace(/\[LEAD\]/g,'').replace(/\[ACTION:[^\]]*\]/g,'').trim();

    // Сохранить ответ ассистента
    messages.add(sessionId, 'assistant', clean);

    // Создать лид
    if (isLead) {
      const summary = clean.slice(0, 300);
      leads.create(sessionId, agency.id, summary);
      sessions.update({ id: sessionId, completed: 1 });
    }

    res.json({ reply: clean, session_id: sessionId, is_lead: isLead });

  } catch(err) {
    console.error('[chat] error:', err.message);
    res.status(500).json({ error: 'ИИ временно недоступен' });
  }
});

// GET /api/chat/:session_id/messages
router.get('/:session_id/messages', authMiddleware, (req, res) => {
  res.json(messages.getBySession(req.params.session_id));
});

module.exports = router;
