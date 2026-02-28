const { agencies } = require('../db/database');

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-agency-key'];
  if (!apiKey) return res.status(401).json({ error: 'Требуется API-ключ (x-agency-key)' });

  const agency = agencies.getByApiKey(apiKey);
  if (!agency) return res.status(401).json({ error: 'Неверный API-ключ' });

  req.agency = agency;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
