const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const { sendError } = require('../helpers/responseHelper');

/**
 * Middleware to enforce ADMIN role.
 * First verifies JWT and attaches user, then checks role === 'ADMIN'.
 */
const requireAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'Authentication required', 401);
    }

    const token = authHeader.split(' ')[1];

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not defined');
      return sendError(res, 'Server configuration error', 500);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return sendError(res, 'Invalid or expired token', 401);
    }

    const userId = decoded.id;
    if (!userId) {
      return sendError(res, 'Invalid token structure', 401);
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .query(`
        SELECT _id, employeeId, role, is_deleted
        FROM dawlance_user
        WHERE _id = @id
      `);

    if (!result.recordset.length || result.recordset[0].is_deleted === 1) {
      return sendError(res, 'User not found or inactive', 401);
    }

    const user = result.recordset[0];

    // ENFORCE ADMIN ROLE
    const role = (user.role || '').trim().toUpperCase();
    if (role !== 'ADMIN') {
      return sendError(res, 'Admin access required', 403);
    }

    // Attach user to request
    req.user = {
      id: user._id,
      employeeId: user.employeeId,
      role: user.role,
    };

    next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    return sendError(res, 'Authentication failed', 500);
  }
};

module.exports = requireAdmin;