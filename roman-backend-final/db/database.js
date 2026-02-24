// Простая БД в памяти — никаких зависимостей, никаких ошибок компиляции
const data = {
  agencies: [],
  sessions: [],
  messages: [],
  leads: [],
  landing_leads: []
};

let idCounter = 1;

function initDb() {
  console.log('✅ БД инициализирована (in-memory)');
  return Promise.resolve();
}

// Простые CRUD методы
const agencies = {
  create: { run: (id, name, api_key, bot_name, brand_color, plan, dialogs_limit, anthropic_key) => {
    data.agencies.push({ id, name, api_key, bot_name, brand_color, plan, dialogs_limit, anthropic_key,
      tone: 'friendly', countries: null, custom_instructions: null,
      dialogs_used: 0, active: 1, created_at: new Date().toISOString() });
  }},
  getByApiKey: { get: (api_key) => data.agencies.find(a => a.api_key === api_key && a.active === 1) },
  getById:     { get: (id) => data.agencies.find(a => a.id === id) },
  getAll:      { all: () => data.agencies },
  incrementDialogs: { run: (id) => {
    const a = data.agencies.find(a => a.id === id);
    if (a) a.dialogs_used++;
  }},
  update: { run: (bot_name, brand_color, plan, dialogs_limit, active, anthropic_key, id) => {
    const a = data.agencies.find(a => a.id === id);
    if (a) Object.assign(a, { bot_name, brand_color, plan, dialogs_limit, active, anthropic_key });
  }}
};

const sessions = {
  create: { run: (id, agency_id) => {
    data.sessions.push({ id, agency_id, started_at: new Date().toISOString(), completed: 0 });
  }},
  update: { run: (rest_type, country, budget, stars, meal, wishes, completed, id) => {
    const s = data.sessions.find(s => s.id === id);
    if (s) Object.assign(s, { rest_type, country, budget, stars, meal, wishes, completed });
  }},
  getById:     { get: (id) => data.sessions.find(s => s.id === id) },
  getByAgency: { all: (agency_id) => data.sessions.filter(s => s.agency_id === agency_id).slice(0, 50) }
};

const messages = {
  add: { run: (session_id, role, content) => {
    data.messages.push({ id: idCounter++, session_id, role, content, created_at: new Date().toISOString() });
  }},
  getBySession: { all: (session_id) => data.messages.filter(m => m.session_id === session_id) }
};

const leads = {
  create: { run: (session_id, agency_id, summary) => {
    data.leads.push({ id: idCounter++, session_id, agency_id, summary, status: 'new', created_at: new Date().toISOString() });
  }},
  getByAgency: { all: (agency_id) => data.leads.filter(l => l.agency_id === agency_id) }
};

const stats = {
  agencyStats: { get: (agency_id) => {
    const s = data.sessions.filter(s => s.agency_id === agency_id);
    return { total_sessions: s.length, total_leads: s.filter(s => s.completed).length };
  }}
};

// db объект для прямых запросов
const db = {
  prepare: (sql) => ({
    run: (...params) => {},
    get:  (...params) => undefined,
    all:  (...params) => []
  }),
  exec: (sql) => {}
};

module.exports = { db, agencies, sessions, messages, leads, stats, initDb };
