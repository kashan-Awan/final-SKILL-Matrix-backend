// Middleware to block admin users from accessing non-admin endpoints
module.exports = function blockAdmin(req, res, next) {
  // req.user should be set by authentication middleware
  // If not set, allow through (or you can enforce authentication first)
  if (req.user && req.user.role && req.user.role.toUpperCase() === 'ADMIN') {
    return res.status(403).json({ error: 'Admins cannot access this endpoint.' });
  }
  next();
};