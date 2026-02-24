require('dotenv').config();
const express  = require('express');
const rateLimit = require('express-rate-limit');
const app  = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-agency-key,x-admin-key,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 60 }));
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/',       (_, res) => res.json({ service: 'Travel AI', status: 'running' }));

app.listen(PORT, '0.0.0.0', () => console.log('Travel AI: port ' + PORT));

const { initDb } = require('./db/database');
initDb().then(() => {
  app.use('/api/chat',   require('./routes/chat'));
  app.use('/api/agency', require('./routes/agency'));
  app.use('/api/auth',   require('./routes/auth'));
  app.use('/api/demo',   require('./routes/demo'));
  app.use('/admin',      require('./routes/admin'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  console.log('Routes ready');
}).catch(err => console.error('DB error:', err.message));
