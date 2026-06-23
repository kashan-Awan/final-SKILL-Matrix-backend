const { getPool, sql } = require('../config/db');

module.exports = async (req, res, next) => {
  try {
    const user = req.user; // Assumes verifyToken sets req.user with id, role, departmentId
    if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const role = (user.role || '').trim().toUpperCase();

    if (role === 'ADMIN') {
      req.isAdmin = true;
      return next();
    }

    if (role === 'MANAGER') {
      req.isManager = true;
      req.managerDepartmentId = user.departmentId;
      return next();
    }

    return res.status(403).json({ success: false, message: 'Forbidden: Only managers and admins can access' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};