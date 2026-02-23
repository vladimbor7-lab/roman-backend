const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { sessions, messages, leads, agencies } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { searchTours, formatToursForClaude, decryptCredentials } = require('./sletat');

const MASTER_ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

const MEAL_LABELS = {
  ai: 'Всё включено (AI)', uai: 'Ультра всё включено (UAI)',
  hb: 'Полупансион (HB)', bb: 'Завтрак (BB)', ro: 'Без питания (RO)'
};
const REST_LABELS = {
  beach: '🏖️ Пляжный', excursion: '🏛️ Экскурсионный',
  ski: '🎿 Горнолыжный', wellness: '🧘 Оздоровительный', active: '🎉 Активный'
};

// ── POST /api/chat/start — начать новую сессию ──
router.post('/start', authMiddleware, (req, res) => {
  const sessionId = uuidv4();
  sessions.create.run(sessionId, req.agency.id);
  agencies.incrementDialogs.run(req.agency.id);

  res.json({
    session_id: sessionId,
    bot_name: req.agency.bot_name,
    brand_color: req.agency.brand_color,
    logo_url: req.agency.logo_url
  });
});

// ── POST /api/chat/message — отправить сообщение ──
router.post('/message', authMiddleware, async (req, res) => {
  const { session_id, message, client_data } = req.body;

  if (!session_id || !message) {
    return res.status(400).json({ error: 'Нужны session_id и message' });
  }

  const session = sessions.getById.get(session_id);
  if (!session || session.agency_id !== req.agency.id) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }

  // Update session with client data if provided
  if (client_data) {
    sessions.update.run(
      client_data.rest_type || session.rest_type,
      client_data.country   || session.country,
      client_data.budget    || session.budget,
      client_data.stars     || session.stars,
      client_data.meal      || session.meal,
      client_data.wishes    || session.wishes,
      session.completed,
      session_id
    );
  }

  // ── PLAN LOGIC ──
  const plan = req.agency.plan; // basic | pro | premium

  // BASIC — только собрать данные и передать менеджеру, без AI
  if (plan === 'basic') {
    const s = updatedSession;
    // Если все данные собраны — сразу передаём менеджеру
    if (s.rest_type && s.country && s.budget && s.stars && s.meal) {
      const summary = buildSummary(s);
      leads.create.run(session_id, req.agency.id, summary);
      sessions.update.run(s.rest_type, s.country, s.budget, s.stars, s.meal, s.wishes, 1, session_id);
      return res.json({
        reply: `Отлично! Все параметры записаны 📋\n\n${summary}\n\nМенеджер свяжется с вами в ближайшее время для подбора и бронирования тура! 🌴`,
        action: 'manager'
      });
    }
    // Иначе — простой ответ без Claude
    return res.json({
      reply: 'Спасибо! Пожалуйста, заполните все параметры в форме, и наш менеджер подберёт лучший тур для вас.',
      action: 'none'
    });
  }

  // PRO и PREMIUM — используем Claude AI
  // Для PREMIUM — ищем реальные туры через Sletat
  let realToursContext = '';
  if (plan === 'premium' && updatedSession.country && updatedSession.meal) {
    try {
      // Достаём credentials агентства (зашифрованные)
      let sletatLogin = null, sletatPassword = null;
      if (req.agency.sletat_login) {
        sletatLogin    = decryptCredentials(req.agency.sletat_login);
        sletatPassword = decryptCredentials(req.agency.sletat_password);
      }

      const tours = await searchTours({
        login:    sletatLogin,
        password: sletatPassword,
        country:  updatedSession.country,
        meal:     updatedSession.meal,
        stars:    updatedSession.stars,
        budget:   updatedSession.budget,
      });

      realToursContext = formatToursForClaude(tours, 'premium');
    } catch(e) {
      console.error('Sletat search failed:', e.message);
    }
  }

  // Save user message
  messages.add.run(session_id, 'user', message);

  // Get full history
  const history = messages.getBySession.all(session_id).map(m => ({
    role: m.role,
    content: m.content
  }));

  // Build system prompt
  const systemPrompt = buildSystemPrompt(req.agency, updatedSession, realToursContext);

  // Use agency's own key if they have one, otherwise master key
  const apiKey = req.agency.anthropic_key || MASTER_ANTHROPIC_KEY;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: history
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const fullText = data.content?.[0]?.text || '';
    const cleanText = fullText.replace(/\[ACTION:[^\]]*\]/g, '').trim();

    // Parse action
    const actionMatch = fullText.match(/\[ACTION:([^\]]*)\]/);
    const action = actionMatch ? actionMatch[1].trim() : 'none';

    // Save assistant message
    messages.add.run(session_id, 'assistant', cleanText);

    // If manager action — save lead
    if (action === 'manager') {
      const s = updatedSession;
      const summary = [
        s.rest_type ? REST_LABELS[s.rest_type] : '',
        s.country   ? `🌍 ${s.country}` : '',
        s.budget    ? `💰 ${Number(s.budget).toLocaleString('ru-RU')} ₽/чел` : '',
        s.stars     ? `⭐ ${s.stars}★` : '',
        s.meal      ? `🍽️ ${MEAL_LABELS[s.meal] || s.meal}` : '',
        s.wishes    ? `💬 ${s.wishes}` : ''
      ].filter(Boolean).join(' · ');

      leads.create.run(session_id, req.agency.id, summary);
      sessions.update.run(
        s.rest_type, s.country, s.budget, s.stars, s.meal, s.wishes,
        1, session_id
      );
    }

    res.json({ reply: cleanText, action });

  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Ошибка запроса к Claude API' });
  }
});

// ── GET /api/chat/history/:session_id ──
router.get('/history/:session_id', authMiddleware, (req, res) => {
  const session = sessions.getById.get(req.params.session_id);
  if (!session || session.agency_id !== req.agency.id) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  const history = messages.getBySession.all(req.params.session_id);
  res.json({ session, messages: history });
});

const TONE_PROMPTS = {
  friendly:      'Общайся тепло и дружелюбно, используй эмодзи, будь как хороший знакомый.',
  professional:  'Общайся профессионально и чётко. Факты, конкретика, уважительный тон. Без лишних эмодзи.',
  expert:        'Ты эксперт-советник. Говоришь уверенно, демонстрируешь глубокое знание туров и направлений.',
  luxury:        'Изысканный тон для премиум-клиентов. Без суеты, с вниманием к деталям и качеству.',
  energetic:     'Энергично и с энтузиазмом! Для активной аудитории. Динамично, мотивирующе.',
  consultative:  'Задавай уточняющие вопросы, вникай в детали. Ты персональный менеджер, не просто бот.'
};

function buildSystemPrompt(agency, session, realToursContext = '') {
  const MEAL_LABELS = { ai:'Всё включено (AI)', uai:'Ультра всё включено', hb:'Полупансион', bb:'Завтрак', ro:'Без питания' };
  const REST_LABELS = { beach:'🏖️ Пляжный', excursion:'🏛️ Экскурсионный', ski:'🎿 Горнолыжный', wellness:'🧘 Оздоровительный', active:'🎉 Активный' };
  const plan = agency.plan;

  const known = [
    session.rest_type ? `Вид отдыха: ${REST_LABELS[session.rest_type]||session.rest_type}` : null,
    session.country   ? `Страна: ${session.country}` : null,
    session.budget    ? `Бюджет: ${Number(session.budget).toLocaleString('ru-RU')} ₽/чел` : null,
    session.stars     ? `Отель: ${session.stars}★` : null,
    session.meal      ? `Питание: ${MEAL_LABELS[session.meal]||session.meal}` : null,
    session.wishes    ? `Пожелания: ${session.wishes}` : null,
  ].filter(Boolean).join(' | ');

  // Доступные страны агентства
  let countriesBlock = '';
  if (agency.countries) {
    try {
      const c = JSON.parse(agency.countries);
      const lines = Object.entries(c).map(([k, v]) => `${REST_LABELS[k]||k}: ${v.join(', ')}`);
      if (lines.length) countriesBlock = `\nДОСТУПНЫЕ НАПРАВЛЕНИЯ АГЕНТСТВА:\n${lines.join('\n')}`;
    } catch(e) {}
  }

  const tone = TONE_PROMPTS[agency.tone] || TONE_PROMPTS.friendly;
  const customInstructions = agency.custom_instructions ? `\nОСОБЫЕ ИНСТРУКЦИИ АГЕНТСТВА:\n${agency.custom_instructions}` : '';

  const toursBlock = realToursContext
    ? `\nРЕАЛЬНЫЕ ТУРЫ ИЗ БАЗЫ:\n${realToursContext}\n`
    : '';

  const priceInstruction = plan === 'premium'
    ? 'Называй точные цены из базы туров.'
    : 'НЕ называй точную цену — пиши "цена от ~X USD, точную стоимость уточнит менеджер".';

  const variantsCount = plan === 'premium' ? '3–5' : '2';

  const greeting = agency.bot_greeting || `Привет! Я ${agency.bot_name}, ваш тур-ассистент.`;

  return `Ты — ${agency.bot_name}, тур-ассистент агентства "${agency.name}". Отвечай ТОЛЬКО на русском.

СТИЛЬ: ${tone}
${customInstructions}
ДАННЫЕ КЛИЕНТА: ${known || 'пока не собраны'}
${countriesBlock}
${toursBlock}
ПРАВИЛА:
- Показывай ${variantsCount} варианта отелей
- ${priceInstruction}
- Отвечай максимум 5 предложений на вопрос
- Предлагай только направления из списка агентства (если список есть)
- Когда клиент готов бронировать → [ACTION:manager]

Формат отеля:
🏨 **Название** (X★) — описание
📍 Туроператор · ✈️ дата · 🍽️ питание
💰 цена

В конце каждого ответа: [ACTION:none] или [ACTION:manager]`;
}

module.exports = router;
