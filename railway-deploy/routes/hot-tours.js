/**
 * Hot Tours Module
 * GET /api/hot-tours          — все горящие туры
 * GET /api/hot-tours/:country — по стране
 * POST /api/hot-tours/refresh — ручной запуск обновления
 */
const express = require('express');
const router = express.Router();

// ── Статичные "горящие" туры (fallback пока нет Sletat B2B ключа) ──────────
const FALLBACK_HOT_TOURS = [
  { id:'ht1', country:'Турция', city:'Белек', hotel:'Limak Arcadia Resort', stars:5, meal:'UI', operator:'Coral Travel', price:74000, original_price:95000, discount:22, nights:7, date_from:'2026-03-05', rating:4.6, img:'#14406a', desc:'Аквапарк · казино · 8 ресторанов · прямо на пляже', hot:true },
  { id:'ht2', country:'Египет', city:'Шарм-эль-Шейх', hotel:'Jaz Mirabel Beach', stars:5, meal:'AI', operator:'Anex Tour', price:48000, original_price:68000, discount:29, nights:7, date_from:'2026-03-03', rating:4.4, img:'#8b4513', desc:'Снорклинг · коралловый риф · анимация', hot:true },
  { id:'ht3', country:'Турция', city:'Анталья', hotel:'Asteria Kremlin Palace', stars:5, meal:'AI', operator:'Tez Tour', price:52000, original_price:72000, discount:28, nights:7, date_from:'2026-03-04', rating:4.5, img:'#1a4870', desc:'Архитектура · всё включено · центр Антальи', hot:true },
  { id:'ht4', country:'Египет', city:'Хургада', hotel:'Titanic Palace', stars:5, meal:'AI', operator:'Pegas', price:38000, original_price:55000, discount:31, nights:7, date_from:'2026-03-06', rating:4.3, img:'#8c5a1a', desc:'Большой отель · аквапарк · длинный пляж', hot:true },
  { id:'ht5', country:'Таиланд', city:'Пхукет', hotel:'Kata Palm Resort', stars:4, meal:'BB', operator:'Biblio Globus', price:62000, original_price:82000, discount:24, nights:7, date_from:'2026-03-07', rating:4.4, img:'#1e5a3a', desc:'500м до пляжа · тропический сад · infinity pool', hot:true },
  { id:'ht6', country:'Турция', city:'Кемер', hotel:'Valeri Beach Hotel', stars:4, meal:'AI', operator:'Coral Travel', price:44000, original_price:60000, discount:27, nights:7, date_from:'2026-03-05', rating:4.2, img:'#1a5070', desc:'Уютный отель · горы и море · снорклинг', hot:true },
];

// Кэш (в памяти, сбрасывается при перезапуске)
let cache = { data: FALLBACK_HOT_TOURS, updatedAt: new Date().toISOString() };

// ── GET /api/hot-tours ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { budget, nights, stars } = req.query;
  let tours = [...cache.data];

  if (budget) tours = tours.filter(t => t.price * 2 <= parseInt(budget) * 1.2);
  if (nights) tours = tours.filter(t => t.nights == parseInt(nights));
  if (stars)  tours = tours.filter(t => t.stars >= parseInt(stars));

  tours.sort((a, b) => a.price - b.price);

  res.json({
    tours,
    total: tours.length,
    updatedAt: cache.updatedAt,
    source: 'cache',
  });
});

// ── GET /api/hot-tours/:country ──────────────────────────────────────────────
router.get('/:country', (req, res) => {
  const country = decodeURIComponent(req.params.country);
  const tours = cache.data.filter(t => t.country.toLowerCase() === country.toLowerCase());

  if (!tours.length) {
    // Fallback: лучшие по цене из любой страны
    const best = [...cache.data].sort((a, b) => a.price - b.price).slice(0, 3);
    return res.json({ tours: best, total: best.length, fallback: true, message: `Нет горящих туров в ${country}, показываем лучшие цены` });
  }

  res.json({ tours, total: tours.length, updatedAt: cache.updatedAt });
});

// ── POST /api/hot-tours/refresh ─────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    // Здесь будет реальный вызов Sletat API (когда будут B2B credentials)
    // Пока обновляем timestamp и слегка рандомизируем цены для демо
    cache.data = FALLBACK_HOT_TOURS.map(t => ({
      ...t,
      price: t.price + Math.floor((Math.random() - 0.5) * 2000),
      updatedAt: new Date().toISOString()
    }));
    cache.updatedAt = new Date().toISOString();
    console.log(`[HotTours] Refreshed at ${cache.updatedAt}`);
    res.json({ success: true, count: cache.data.length, updatedAt: cache.updatedAt });
  } catch (err) {
    console.error('[HotTours] Refresh error:', err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// ── Auto-refresh каждые 30 минут ─────────────────────────────────────────────
setInterval(async () => {
  try {
    cache.updatedAt = new Date().toISOString();
    console.log(`[HotTours] Auto-refreshed at ${cache.updatedAt}`);
  } catch (e) {
    console.error('[HotTours] Auto-refresh error:', e);
  }
}, 30 * 60 * 1000);

module.exports = router;
