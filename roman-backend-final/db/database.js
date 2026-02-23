const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'roman.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// ── SCHEMA ──
db.exec(`
  CREATE TABLE IF NOT EXISTS agencies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    api_key     TEXT UNIQUE NOT NULL,
    bot_name    TEXT DEFAULT 'Роман',
    bot_greeting TEXT,
    brand_color TEXT DEFAULT '#0a7ea4',
    tone        TEXT DEFAULT 'friendly',
    countries   TEXT,
    custom_instructions TEXT,
    logo_url    TEXT,
    plan        TEXT DEFAULT 'starter',
    dialogs_used INTEGER DEFAULT 0,
    dialogs_limit INTEGER DEFAULT 100,
    anthropic_key TEXT,
    sletat_login    TEXT,
    sletat_password TEXT,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    agency_id   TEXT NOT NULL,
    started_at  TEXT DEFAULT (datetime('now')),
    completed   INTEGER DEFAULT 0,       -- 1 = дошёл до менеджера
    rest_type   TEXT,
    country     TEXT,
    budget      INTEGER,
    stars       INTEGER,
    meal        TEXT,
    wishes      TEXT,
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL,           -- user | assistant
    content     TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS leads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,
    agency_id   TEXT NOT NULL,
    summary     TEXT,
    status      TEXT DEFAULT 'new',
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

// ── AGENCY METHODS ──
const agencyMethods = {
  create: db.prepare(`
    INSERT INTO agencies (id, name, api_key, bot_name, brand_color, plan, dialogs_limit, anthropic_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getByApiKey: db.prepare(`SELECT * FROM agencies WHERE api_key = ? AND active = 1`),
  getById:     db.prepare(`SELECT * FROM agencies WHERE id = ?`),
  getAll:      db.prepare(`SELECT id, name, api_key, bot_name, plan, dialogs_used, dialogs_limit, active, created_at FROM agencies`),

  incrementDialogs: db.prepare(`UPDATE agencies SET dialogs_used = dialogs_used + 1 WHERE id = ?`),

  update: db.prepare(`
    UPDATE agencies SET bot_name=?, brand_color=?, plan=?, dialogs_limit=?, active=?, anthropic_key=?
    WHERE id = ?
  `)
};

// ── SESSION METHODS ──
const sessionMethods = {
  create: db.prepare(`
    INSERT INTO sessions (id, agency_id) VALUES (?, ?)
  `),

  update: db.prepare(`
    UPDATE sessions SET rest_type=?, country=?, budget=?, stars=?, meal=?, wishes=?, completed=?
    WHERE id = ?
  `),

  getById: db.prepare(`SELECT * FROM sessions WHERE id = ?`),

  getByAgency: db.prepare(`
    SELECT * FROM sessions WHERE agency_id = ? ORDER BY started_at DESC LIMIT 50
  `)
};

// ── MESSAGE METHODS ──
const messageMethods = {
  add: db.prepare(`INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)`),
  getBySession: db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
};

// ── LEAD METHODS ──
const leadMethods = {
  create: db.prepare(`INSERT INTO leads (session_id, agency_id, summary) VALUES (?, ?, ?)`),
  getByAgency: db.prepare(`SELECT * FROM leads WHERE agency_id = ? ORDER BY created_at DESC`)
};

// ── STATS ──
const statMethods = {
  agencyStats: db.prepare(`
    SELECT 
      COUNT(*) as total_sessions,
      SUM(completed) as total_leads,
      COUNT(DISTINCT date(started_at)) as active_days
    FROM sessions WHERE agency_id = ?
  `)
};

module.exports = {
  db,
  agencies: agencyMethods,
  sessions: sessionMethods,
  messages: messageMethods,
  leads: leadMethods,
  stats: statMethods
};
