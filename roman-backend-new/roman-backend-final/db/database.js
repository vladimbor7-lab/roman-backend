/**
 * Pure JS JSON store — NO native deps, works on Railway/Render/Heroku
 * Replaces better-sqlite3 (requires Python/node-gyp — fails on Railway)
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

let store = {
  agencies:      [],
  sessions:      [],
  messages:      [],
  leads:         [],
  landing_leads: [],
};

// ── Persist ──────────────────────────────────────────────────────────────────
function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      Object.assign(store, JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
      console.log('[DB] loaded', DB_PATH);
    } else {
      save();
    }
  } catch(e) { console.error('[DB] load error:', e.message); }
}

function save() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2)); }
  catch(e) { console.error('[DB] save error:', e.message); }
}

setInterval(save, 15000);
process.on('SIGINT',  () => { save(); process.exit(0); });
process.on('SIGTERM', () => { save(); process.exit(0); });
load();

function ts() { return new Date().toISOString().replace('T',' ').split('.')[0]; }
function nid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ── Stub db object (for routes that call db.exec / db.prepare directly) ──────
const db = {
  exec() {},   // ignore CREATE TABLE etc
  prepare(sql) {
    const s = sql.toLowerCase().trim();
    return {
      run(...a) {
        // landing_leads INSERT (demo.js)
        if (s.includes('insert into landing_leads')) {
          const [name, contact, phone, plan, site, team] = a;
          store.landing_leads.push({
            id: store.landing_leads.length + 1,
            name, contact: contact||'', phone,
            plan: plan||'Pro', site: site||'', team: team||'',
            created_at: ts()
          });
          save();
        }
        // agencies UPDATE (agency.js inline calls)
        if (s.includes('update agencies set')) {
          // parse field=? pairs and map positional args
          const sets = [];
          const setRx = /set\s+([\w\s,=?]+)\s+where/i.exec(sql);
          if (setRx) {
            setRx[1].split(',').forEach((pair,i) => {
              const col = pair.trim().split(/\s*=\s*/)[0].trim();
              sets.push([col, a[i]]);
            });
            const id = a[sets.length];
            const agency = store.agencies.find(x => x.id === id);
            if (agency) {
              sets.forEach(([col, val]) => { agency[col] = val; });
              save();
            }
          }
        }
        // leads UPDATE status
        if (s.includes('update leads set status')) {
          const [status, id, agency_id] = a;
          const lead = store.leads.find(l => l.id == id && l.agency_id === agency_id);
          if (lead) { lead.status = status; save(); }
        }
        return { changes: 1, lastInsertRowid: Date.now() };
      },
      get(...a) {
        // agencies SELECT by email
        if (s.includes('from agencies where email')) {
          return store.agencies.find(x => x.email === a[0] && x.active === 1) || null;
        }
        // agencies UPDATE email/password
        if (s.includes('update agencies set email')) {
          const [email, hash, id] = a;
          const ag = store.agencies.find(x => x.id === id);
          if (ag) { ag.email = email; ag.password_hash = hash; save(); }
          return null;
        }
        return null;
      },
      all(...a) {
        // leads with agency join (admin.js)
        if (s.includes('from leads')) {
          return store.leads.slice(-100).reverse().map(l => ({
            ...l,
            agency_name: (store.agencies.find(a => a.id === l.agency_id)||{}).name || '—'
          }));
        }
        return [];
      }
    };
  }
};

// ── agencies ─────────────────────────────────────────────────────────────────
const agencies = {
  create(data) {
    // called as agencies.create({ id, name, api_key, ... })
    // also called as agencies.create.run(...args) in admin.js — handled below
    if (typeof data === 'object' && !Array.isArray(data)) {
      store.agencies.push({
        id: data.id, name: data.name, api_key: data.api_key,
        bot_name: data.bot_name || 'Роман',
        bot_greeting: null,
        brand_color: data.brand_color || '#1d4ed8',
        tone: 'friendly', countries: '', custom_instructions: '',
        logo_url: null, plan: data.plan || 'basic',
        dialogs_used: 0, dialogs_limit: data.dialogs_limit || 100,
        anthropic_key: data.anthropic_key || null,
        sletat_login: null, sletat_password: null,
        email: null, password_hash: null,
        active: 1, created_at: ts()
      });
      save();
      return { changes: 1 };
    }
    return { changes: 0 };
  },

  getByApiKey(k) { return store.agencies.find(a => a.api_key === k && a.active === 1) || null; },
  getById(id)     { return store.agencies.find(a => a.id === id) || null; },
  getAll()        {
    return store.agencies.map(({ id,name,api_key,bot_name,plan,dialogs_used,dialogs_limit,active,created_at }) =>
      ({ id,name,api_key,bot_name,plan,dialogs_used,dialogs_limit,active,created_at }));
  },
  incrementDialogs(id) {
    const a = store.agencies.find(a => a.id === id);
    if (a) { a.dialogs_used = (a.dialogs_used||0) + 1; save(); }
    return { changes: 1 };
  },
  update(fields) {
    const a = store.agencies.find(x => x.id === fields.id);
    if (!a) return { changes: 0 };
    Object.keys(fields).forEach(k => { if (fields[k] !== undefined) a[k] = fields[k]; });
    save();
    return { changes: 1 };
  },
  patch(id, fields) {
    const a = store.agencies.find(x => x.id === id);
    if (!a) return { changes: 0 };
    Object.assign(a, fields); save();
    return { changes: 1 };
  }
};

// Admin.js calls agencies.create.run(...) — add .run() stub
agencies.create.run = function(id, name, api_key, bot_name, brand_color, plan, dialogs_limit, anthropic_key) {
  return agencies.create({ id, name, api_key, bot_name, brand_color, plan, dialogs_limit, anthropic_key });
};
agencies.getAll.all  = () => agencies.getAll();
agencies.getById.get = (id) => agencies.getById(id);
agencies.update.run  = (bot_name, brand_color, plan, dialogs_limit, active, anthropic_key, id) =>
  agencies.update({ id, bot_name, brand_color, plan, dialogs_limit, active, anthropic_key });

// ── sessions ──────────────────────────────────────────────────────────────────
const sessions = {
  create(id, agency_id) {
    store.sessions.push({ id, agency_id, started_at: ts(), completed: 0,
      rest_type:null, country:null, budget:null, stars:null, meal:null, wishes:null });
    save(); return { changes: 1 };
  },
  update(fields) {
    const s = store.sessions.find(x => x.id === fields.id);
    if (!s) return { changes: 0 };
    Object.assign(s, fields); save(); return { changes: 1 };
  },
  getById(id)       { return store.sessions.find(s => s.id === id) || null; },
  getByAgency(aid)  {
    return store.sessions.filter(s => s.agency_id === aid)
      .sort((a,b) => b.started_at.localeCompare(a.started_at)).slice(0,50);
  }
};

// Stubs for admin.js
sessions.create.run = (id, agency_id) => sessions.create(id, agency_id);
sessions.update.run = (rest_type,country,budget,stars,meal,wishes,completed,id) =>
  sessions.update({id,rest_type,country,budget,stars,meal,wishes,completed});
sessions.getById.get      = (id)  => sessions.getById(id);
sessions.getByAgency.all  = (aid) => sessions.getByAgency(aid);

// ── messages ──────────────────────────────────────────────────────────────────
const messages = {
  add(session_id, role, content) {
    store.messages.push({ id: store.messages.length+1, session_id, role, content, created_at: ts() });
    save(); return { changes: 1 };
  },
  getBySession(sid) {
    return store.messages.filter(m => m.session_id === sid)
      .sort((a,b) => a.created_at.localeCompare(b.created_at));
  }
};
messages.add.run         = (sid,role,content) => messages.add(sid,role,content);
messages.getBySession.all = (sid) => messages.getBySession(sid);

// ── leads ─────────────────────────────────────────────────────────────────────
const leads = {
  create(session_id, agency_id, summary) {
    store.leads.push({ id: store.leads.length+1, session_id, agency_id,
      summary: summary||'', status:'new', created_at: ts() });
    save(); return { changes: 1 };
  },
  getByAgency(aid) {
    return store.leads.filter(l => l.agency_id === aid)
      .sort((a,b) => b.created_at.localeCompare(a.created_at));
  }
};
leads.create.run      = (sid, aid, sum) => leads.create(sid, aid, sum);
leads.getByAgency.all = (aid) => leads.getByAgency(aid);

// ── stats ─────────────────────────────────────────────────────────────────────
const stats = {
  agencyStats(aid) {
    const s = store.sessions.filter(x => x.agency_id === aid);
    return {
      total_sessions: s.length,
      total_leads: s.filter(x => x.completed).length,
      active_days: new Set(s.map(x => x.started_at.split(' ')[0])).size
    };
  }
};
stats.agencyStats.get = (aid) => stats.agencyStats(aid);

module.exports = { db, agencies, sessions, messages, leads, stats, store };
