const { agencies } = require('../db/database');

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-agency-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Требуется API-ключ агентства (x-agency-key)' });
  }

  const agency = agencies.getByApiKey.get(apiKey);

  if (!agency) {
    return res.status(401).json({ error: 'Неверный или неактивный API-ключ' });
  }

  // Check dialog limit
  if (agency.dialogs_used >= agency.dialogs_limit) {
    return res.status(429).json({ 
      error: 'Лимит диалогов исчерпан',
      used: agency.dialogs_used,
      limit: agency.dialogs_limit,
      plan: agency.plan
    });
  }

  req.agency = agency;
  next();
}

// Admin middleware - simple secret key for now
function adminMiddleware(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
