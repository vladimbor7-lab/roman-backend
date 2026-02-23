const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'roman.db');

let db;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
    console.log('✅ БД загружена с диска');
  } else {
    db = new SQL.Database();
    console.log('✅ БД создана заново');
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS agencies (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, api_key TEXT UNIQUE NOT NULL,
      bot_name TEXT DEFAULT 'Роман', bot_greeting TEXT,
      brand_color TEXT DEFAULT '#0a7ea4', tone TEXT DEFAULT 'friendly',
      countries TEXT, custom_instructions TEXT, logo_url TEXT,
      plan TEXT DEFAULT 'starter', dialogs_used INTEGER DEFAULT 0,
      dialogs_limit INTEGER DEFAULT 100, anthropic_key TEXT,
      sletat_login TEXT, sletat_password TEXT,
      email TEXT, password_hash TEXT,
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, agency_id TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')), completed INTEGER DEFAULT 0,
      rest_type TEXT, country TEXT, budget INTEGER, stars INTEGER, meal TEXT, wishes TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
      agency_id TEXT NOT NULL, summary TEXT, status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS landing_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, contact TEXT,
      phone TEXT, plan TEXT, site TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  save();
  setInterval(save, 10000);
  return db;
}

function save() {
  if (!db) return;
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch(e) {}
}

function run(sql, params=[]) { db.run(sql, params); save(); }
function get(sql, params=[]) {
  const s = db.prepare(sql); s.bind(params);
  const r = s.step() ? s.getAsObject() : undefined;
  s.free(); return r;
}
function all(sql, params=[]) {
  const s = db.prepare(sql); s.bind(params);
  const rows = []; while(s.step()) rows.push(s.getAsObject());
  s.free(); return rows;
}
function prepare(sql) {
  return {
    run:  (...p) => { run(sql, p.flat()); return {changes:1}; },
    get:  (...p) => get(sql, p.flat()),
    all:  (...p) => all(sql, p.flat()),
  };
}

const agencies = {
  create:           prepare(`INSERT INTO agencies (id,name,api_key,bot_name,brand_color,plan,dialogs_limit,anthropic_key) VALUES (?,?,?,?,?,?,?,?)`),
  getByApiKey:      prepare(`SELECT * FROM agencies WHERE api_key=? AND active=1`),
  getById:          prepare(`SELECT * FROM agencies WHERE id=?`),
  getAll:           prepare(`SELECT id,name,api_key,bot_name,plan,dialogs_used,dialogs_limit,active,created_at FROM agencies`),
  incrementDialogs: prepare(`UPDATE agencies SET dialogs_used=dialogs_used+1 WHERE id=?`),
  update:           prepare(`UPDATE agencies SET bot_name=?,brand_color=?,plan=?,dialogs_limit=?,active=?,anthropic_key=? WHERE id=?`),
};
const sessions = {
  create:     prepare(`INSERT INTO sessions (id,agency_id) VALUES (?,?)`),
  update:     prepare(`UPDATE sessions SET rest_type=?,country=?,budget=?,stars=?,meal=?,wishes=?,completed=? WHERE id=?`),
  getById:    prepare(`SELECT * FROM sessions WHERE id=?`),
  getByAgency:prepare(`SELECT * FROM sessions WHERE agency_id=? ORDER BY started_at DESC LIMIT 50`),
};
const messages = {
  add:        prepare(`INSERT INTO messages (session_id,role,content) VALUES (?,?,?)`),
  getBySession:prepare(`SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC`),
};
const leads = {
  create:     prepare(`INSERT INTO leads (session_id,agency_id,summary) VALUES (?,?,?)`),
  getByAgency:prepare(`SELECT * FROM leads WHERE agency_id=? ORDER BY created_at DESC`),
};
const stats = {
  agencyStats: { get: (id) => get(`SELECT COUNT(*) as total_sessions, SUM(completed) as total_leads FROM sessions WHERE agency_id=?`, [id]) }
};

const dbProxy = { prepare, run, exec:(s)=>db.run(s), get, all };

module.exports = { db: dbProxy, agencies, sessions, messages, leads, stats, initDb };
