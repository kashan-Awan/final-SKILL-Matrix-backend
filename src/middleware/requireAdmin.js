/**
 * requireAdmin middleware
 *
 * Reads x-user-id from the request header, fetches the user from DB,
 * and verifies role === 'ADMIN'. Attaches the user record to req.adminUser.
 *
 * Frontend must send the header on every admin API call:
 *   headers: { 'x-user-id': '<admin _id>' }
 */

const { getPool, sql } = require('../config/db');
const { sendError } = require('../helpers/responseHelper');

const requireAdmin = async (req, res, next) => {
  try {
    const adminId = req.headers['x-user-id'];
    if (!adminId) {
      return sendError(res, 'Authentication required.', 401);
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, adminId)
      .query(`
        SELECT _id AS id, name, email, role
        FROM dawlance_user
        WHERE _id = @id AND UPPER(role) = 'ADMIN' AND is_deleted = 0
      `);

    if (!result.recordset.length) {
      return sendError(res, 'Forbidden: admin access only.', 403);
    }

    req.adminUser = result.recordset[0];
    next();
  } catch (err) {
    return sendError(res, 'Authentication check failed.', 500);
  }
};

module.exports = requireAdmin;
