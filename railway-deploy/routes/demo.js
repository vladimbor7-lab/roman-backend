const express = require('express');
const router  = express.Router();

// ─── ЭЛИТНЫЙ СИСТЕМНЫЙ ПРОМПТ ─────────────────────────────────────────────
const DEMO_SYSTEM = `Ты — Виктор, независимый эксперт по туризму высшего уровня с 15-летним опытом.
Стиль: лаконичный бизнес-коуч. Никогда не говоришь «Я ИИ», «Как я могу помочь», «Удачного путешествия», «Конечно!», «Отлично!».

ЗНАНИЯ РФ-РЫНКА:
- ТО (туроператор): Coral Travel, Tez Tour, Anex Tour, Pegas Touristik, Fun&Sun, Biblio Globus
- ТА (турагент): продаёт туры ТО, комиссия 8-12%
- Питание: RO (без), BB (завтрак), HB (полупансион), FB (п/п+ужин), AI (всё включено), UAI/UI (ультра всё включено)
- Перелёт: чартер (дешевле), регулярка (стабильнее)
- Визы: Турция/Египет/ОАЭ — безвиз для РФ; Таиланд — 30 дней; Греция — Шенген

БЫСТРЫЕ ДЕЙСТВИЯ (пользователь нажал кнопку):
- ДОРОГО: 2-3 аргумента почему цена обоснована + 1 дешёвая альтернатива
- WHATSAPP: перепиши в 3 строки, цена жирным **цена**, 2-3 эмодзи
- НЕГАТИВ: честно — топ жалоб туристов на этот отель (еда/шум/пляж/персонал)
- ПОСТ: продающий пост Telegram 120-150 слов, цепляющий заголовок
- СКРЫТЫЙ: опиши тур без названия отеля, чтобы клиент не смог загуглить

Тарифы Travel AI (упоминай если спрашивают про подключение):
Basic 1900р | Hot Bot 2500р | Pro 5900р | Premium 12900р

Когда клиент хочет подключить Travel AI — добавь [ACTION:contact].
В остальных случаях — [ACTION:none].`;

// POST /api/demo/chat
router.post('/chat', async (req, res) => {
  const { messages, quickAction } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Нужен массив messages' });
  }

  let msgs = messages.slice(-20);

  // Inject quick action
  if (quickAction) {
    const map = {
      expensive: 'ДОРОГО — обоснуй цену и дай более дешёвую альтернативу',
      whatsapp:  'WHATSAPP — перепиши для WhatsApp: 3 строки, цена жирным **цена**, эмодзи',
      negative:  'НЕГАТИВ — честно: топ жалоб туристов на этот отель за последние 3 месяца',
      post:      'ПОСТ — продающий пост для Telegram/Instagram про этот тур, 120-150 слов',
      hidden:    'СКРЫТЫЙ РЕЖИМ — опиши тур без названия отеля, фишки без прямого упоминания',
    };
    if (map[quickAction]) {
      msgs = [...msgs, { role: 'user', content: map[quickAction] }];
    }
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 700, system: DEMO_SYSTEM, messages: msgs })
    });
    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const text  = d.content?.[0]?.text || '';
    const clean = text.replace(/\[ACTION:[^\]]*\]/g,'').trim();
    const act   = (text.match(/\[ACTION:([^\]]*)\]/)?.[1]||'none').trim();
    res.json({ reply: clean, action: act });
  } catch(e) {
    console.error('demo/chat:', e.message);
    res.status(500).json({ error: 'Сервис временно недоступен' });
  }
});

// POST /api/demo/otprovin — парсер подборок Отправкин.ру
router.post('/otprovin', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.includes('otprovin')) return res.status(400).json({ error: 'Нужна ссылка otprovin.ru' });
  try {
    const page = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await page.text();
    const title = (html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'Подборка';
    // Простая экстракция текста (убираем теги)
    const text = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').slice(0,3000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 800, system: DEMO_SYSTEM,
        messages: [{ role: 'user', content: `ОТПРАВКИН — сделай сравнительную таблицу отелей из этой подборки.\nURL: ${url}\nТекст страницы:\n${text}\n\nФормат: Отель | Главный плюс | Кому подходит | Цена/ночь` }]
      })
    });
    const d = await r.json();
    res.json({ reply: d.content?.[0]?.text?.replace(/\[ACTION:[^\]]*\]/g,'').trim()||'Не удалось разобрать', title });
  } catch(e) {
    res.status(500).json({ error: 'Не удалось загрузить страницу Отправкина' });
  }
});

// POST /api/demo/pdf — генерация текста для PDF
router.post('/pdf', async (req, res) => {
  const { context, agency_name, agent_phone } = req.body;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: DEMO_SYSTEM,
        messages: [{ role: 'user', content: `Создай красивое описание подборки туров для PDF-документа.\nАгентство: ${agency_name||'Travel AI'}\nКонтакт: ${agent_phone||''}\nТуры: ${context}\n\nСтруктура: заголовок, краткое вступление, список туров с описаниями, призыв к действию. Без служебных тегов.` }]
      })
    });
    const d = await r.json();
    res.json({ content: d.content?.[0]?.text||'', agency_name, agent_phone });
  } catch(e) {
    res.status(500).json({ error: 'Ошибка генерации PDF' });
  }
});

// POST /api/demo/lead
router.post('/lead', async (req, res) => {
  const { name, contact, phone, plan, site, team } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Нужны имя и телефон' });
  console.log(`[LEAD] ${name} | ${phone} | ${plan} | ${site||'-'} | ${team||'-'}`);
  try {
    const { landing_leads } = require('../db/database');
    landing_leads.create({ name, contact: contact||'', phone, plan: plan||'Pro', site: site||'', team: team||'' });
  } catch(e) { console.error('[lead]', e.message); }
  res.json({ success: true });
});

module.exports = router;
