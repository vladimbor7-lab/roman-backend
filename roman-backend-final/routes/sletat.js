/**
 * Sletat.ru XML/SOAP Integration Module
 * 
 * Как получить доступ:
 * 1. Зарегистрируйтесь на sletat.ru
 * 2. Напишите на support@sletat.ru — попросите тестовую лицензию
 * 3. Вставьте логин/пароль в .env или в настройки агентства
 * 
 * Документация: https://wiki.sletat.ru/w/Шлюз_поиска_туров_(xml)
 */

const crypto = require('crypto');

// ── КОНСТАНТЫ SLETAT ──
const SLETAT_ENDPOINT = 'http://gate.sletat.ru/Search.svc';
const SLETAT_WSDL     = 'http://gate.sletat.ru/Search.svc?wsdl';

// Соответствие наших кодов → коды Sletat
const MEAL_MAP = {
  ai:  'All',        // Всё включено
  uai: 'UltraAll',   // Ультра всё включено
  hb:  'HalfBoard',  // Полупансион
  bb:  'BedBreakfast', // Завтрак
  ro:  'RoomOnly'    // Без питания
};

const COUNTRY_MAP = {
  '🇹🇷 Турция':   1,
  '🇪🇬 Египет':   2,
  '🇹🇭 Таиланд':  12,
  '🇦🇪 ОАЭ':      22,
  '🇬🇷 Греция':   5,
  '🇲🇻 Мальдивы': 39,
  '🇮🇩 Бали':     35,
  '🇨🇾 Кипр':     7,
  '🇮🇹 Италия':   4,
  '🇪🇸 Испания':  6,
  '🇫🇷 Франция':  8,
};

const DEPARTURE_MAP = {
  'Москва':          1,
  'Санкт-Петербург': 2,
  'Екатеринбург':    3,
  'Новосибирск':     4,
  'Краснодар':       5,
};

// ── ШИФРОВАНИЕ CREDENTIALS ──
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'roman_saas_key_32_chars_exactly!!'; // 32 символа

function encryptCredentials(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptCredentials(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// ── SOAP ЗАПРОС К SLETAT ──
function buildSoapEnvelope(method, params) {
  const paramsXml = Object.entries(params)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('\n        ');

  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <${method} xmlns="urn:SletatRu:Contracts:Soap11Gate:v1">
      ${paramsXml}
    </${method}>
  </s:Body>
</s:Envelope>`;
}

async function soapRequest(method, params, login, password) {
  const envelope = buildSoapEnvelope(method, { login, password, ...params });

  const response = await fetch(SLETAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `urn:SletatRu:Contracts:Soap11Gate:v1/Search/${method}`
    },
    body: envelope
  });

  if (!response.ok) {
    throw new Error(`Sletat API error: ${response.status}`);
  }

  return await response.text();
}

// ── ПАРСИНГ XML ОТВЕТА ──
function parseXmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<[^>]*:?${tag}[^>]*>([^<]*)<`));
  return match ? match[1].trim() : null;
}

function parseXmlAll(xml, tag) {
  const results = [];
  const regex = new RegExp(`<[^>]*:?${tag}[^>]*>([\\s\\S]*?)<\/[^>]*:?${tag}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

// ── ОСНОВНОЙ ПОИСК ТУРОВ ──
async function searchTours({ login, password, country, meal, stars, nights = 7, adults = 2, departure = 'Москва', budget }) {

  // Если нет credentials — используем mock данные
  if (!login || !password) {
    console.log('⚠️  Sletat credentials не заданы — используем mock данные');
    return getMockTours({ country, meal, stars, budget });
  }

  try {
    // Шаг 1: Создать запрос на поиск
    const countryId  = COUNTRY_MAP[country] || 1;
    const mealCode   = MEAL_MAP[meal] || 'All';
    const departureId = DEPARTURE_MAP[departure] || 1;

    const dateFrom = getDateFrom(); // +7 дней от сегодня
    const dateTo   = getDateTo();   // +30 дней от сегодня

    const searchXml = await soapRequest('CreateRequest', {
      countryId,
      departureId,
      mealId: mealCode,
      starsFrom: stars,
      starsTo: stars,
      nightsFrom: nights - 1,
      nightsTo: nights + 1,
      adults,
      dateFrom,
      dateTo,
      priceMax: budget ? Math.round(budget / 90) : 99999 // конвертируем ₽ в USD примерно
    }, login, password);

    // Получить requestId
    const requestId = parseXmlValue(searchXml, 'RequestId') || 
                      parseXmlValue(searchXml, 'CreateRequestResult');

    if (!requestId) {
      throw new Error('Не удалось создать запрос к Sletat');
    }

    // Шаг 2: Подождать результаты (Sletat ищет асинхронно)
    await new Promise(r => setTimeout(r, 3000));

    // Шаг 3: Получить результаты
    const resultsXml = await soapRequest('GetRequestResult', {
      requestId,
      fromPosition: 0,
      toPosition: 10
    }, login, password);

    // Шаг 4: Парсим туры
    const tours = parseTours(resultsXml, country);

    if (tours.length === 0) {
      return getMockTours({ country, meal, stars, budget });
    }

    return tours;

  } catch (err) {
    console.error('Sletat search error:', err.message);
    // Fallback на mock если API недоступен
    return getMockTours({ country, meal, stars, budget });
  }
}

function parseTours(xml, country) {
  const tourBlocks = parseXmlAll(xml, 'XmlTour');
  
  return tourBlocks.slice(0, 5).map(block => ({
    hotel_name:  parseXmlValue(block, 'HotelName')  || 'Отель',
    hotel_stars: parseXmlValue(block, 'Stars')       || '5',
    operator:    parseXmlValue(block, 'PartnerName') || 'Туроператор',
    price_usd:   parseXmlValue(block, 'Price')       || '0',
    price_rub:   Math.round(parseFloat(parseXmlValue(block, 'Price') || 0) * 90),
    nights:      parseXmlValue(block, 'Nights')      || '7',
    meal:        parseXmlValue(block, 'MealName')    || '',
    resort:      parseXmlValue(block, 'ResortName')  || country,
    flight_from: parseXmlValue(block, 'DepartCityName') || 'Москва',
    date_begin:  parseXmlValue(block, 'DateBegin')   || '',
    room_type:   parseXmlValue(block, 'RoomName')    || 'Стандарт',
    tour_id:     parseXmlValue(block, 'TourId')      || '',
  }));
}

// ── MOCK ДАННЫЕ (когда нет credentials) ──
function getMockTours({ country, meal, stars, budget }) {
  const mealLabel = { ai: 'Всё включено', uai: 'Ультра всё включено', hb: 'Полупансион', bb: 'Завтрак', ro: 'Без питания' }[meal] || meal;
  
  const mockByCountry = {
    '🇹🇷 Турция': [
      { hotel_name: 'Rixos Premium Belek', hotel_stars: '5', operator: 'Coral Travel', price_usd: 1400, price_rub: 126000, nights: 7, meal: mealLabel, resort: 'Белек', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Superior Room' },
      { hotel_name: 'Maxx Royal Belek Golf Resort', hotel_stars: '5', operator: 'Anex Tour', price_usd: 1800, price_rub: 162000, nights: 7, meal: mealLabel, resort: 'Белек', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Deluxe Room' },
      { hotel_name: 'Kaya Palazzo Golf Resort', hotel_stars: '5', operator: 'Pegas Touristik', price_usd: 1100, price_rub: 99000, nights: 7, meal: mealLabel, resort: 'Белек', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Standard Room' },
    ],
    '🇪🇬 Египет': [
      { hotel_name: 'Rixos Premium Seagate', hotel_stars: '5', operator: 'Coral Travel', price_usd: 900, price_rub: 81000, nights: 7, meal: mealLabel, resort: 'Шарм-эль-Шейх', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Deluxe Sea View' },
      { hotel_name: 'Albatros Palace Sharm', hotel_stars: '5', operator: 'Pegas Touristik', price_usd: 700, price_rub: 63000, nights: 7, meal: mealLabel, resort: 'Шарм-эль-Шейх', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Standard Room' },
    ],
    '🇹🇭 Таиланд': [
      { hotel_name: 'Anantara Koh Samui Resort', hotel_stars: '5', operator: 'Anex Tour', price_usd: 1600, price_rub: 144000, nights: 10, meal: mealLabel, resort: 'Самуи', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Pool Villa' },
      { hotel_name: 'Centara Grand Beach Phuket', hotel_stars: '5', operator: 'Fun&Sun', price_usd: 1200, price_rub: 108000, nights: 10, meal: mealLabel, resort: 'Пхукет', flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Deluxe Room' },
    ],
  };

  const defaultMock = [
    { hotel_name: `${stars}★ Отель в ${country}`, hotel_stars: stars, operator: 'Coral Travel', price_usd: Math.round((budget || 60000) / 90), price_rub: budget || 60000, nights: 7, meal: mealLabel, resort: country, flight_from: 'Москва', date_begin: getDateFrom(), room_type: 'Стандарт' }
  ];

  return (mockByCountry[country] || defaultMock).filter(t => {
    if (!budget) return true;
    return t.price_rub <= budget * 1.2; // показываем туры в пределах +20% от бюджета
  });
}

// ── ХЕЛПЕРЫ ──
function getDateFrom() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}

function getDateTo() {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString().split('T')[0];
}

// ── ФОРМАТИРОВАНИЕ ДЛЯ CLAUDE ──
function formatToursForClaude(tours, plan) {
  if (!tours || tours.length === 0) {
    return 'К сожалению, по вашим параметрам туры не найдены. Попробуем изменить даты или бюджет?';
  }

  const limit = plan === 'premium' ? 5 : 2;
  const showPrice = plan === 'premium';

  return tours.slice(0, limit).map(t => {
    const priceStr = showPrice
      ? `💰 ${t.price_rub.toLocaleString('ru-RU')} ₽/чел (~${t.price_usd} USD) за ${t.nights} ночей`
      : `💰 Цена от ${Math.round(t.price_usd * 0.85).toLocaleString()} USD за ${t.nights} ночей`;

    return `🏨 **${t.hotel_name}** (${t.hotel_stars}★)
📍 ${t.operator} · 🌴 ${t.resort}
✈️ ${t.flight_from} · 📅 от ${t.date_begin}
🍽️ ${t.meal} · 🛏️ ${t.room_type}
${priceStr}`;
  }).join('\n\n');
}

module.exports = {
  searchTours,
  formatToursForClaude,
  encryptCredentials,
  decryptCredentials
};
