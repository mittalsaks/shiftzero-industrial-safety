// backend/middleware/authMiddleware.js
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;

    // 🔽 NEW — fallback to ?token= query param (needed for direct <a href> downloads,
    // e.g. PDF report, where the browser can't send a custom Authorization header)
    let token = null;
    if (header && header.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token)
      return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).lean();
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Company-scoped admin (admin within their own company)
function requireAdmin(req, res, next) {
  if (!req.user || !['admin', 'super_admin'].includes(req.user.role))
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

// Super admin only (can see all companies)
function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin')
    return res.status(403).json({ message: 'Super admin access required' });
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };