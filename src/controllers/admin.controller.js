const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { logAdminAction } = require('../helpers/auditLogger'); // Import centralized audit logger
const { generateId } = require('../helpers/utils');

const BCRYPT_ROUNDS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// 1. USER MANAGEMENT (Admin only)
// ─────────────────────────────────────────────────────────────────────────────

const getAllUsersAdmin = async (req, res) => {
  try {
    const { role, search, sort } = req.query;
    const pool = await getPool();
    const request = pool.request();

    const sortMap = {
      name:    'u.name ASC',
      role:    'u.role ASC',
      created: 'u.createdAt DESC',
    };
    const orderBy = sortMap[sort] || 'u.createdAt DESC';

    let whereClause = `WHERE u.is_deleted = 0`;

    if (role) {
      const dbRole = role.toUpperCase() === 'USER' ? 'EMPLOYEE' : role.toUpperCase();
      request.input('role', sql.NVarChar, dbRole);
      whereClause += ` AND UPPER(u.role) = @role`;
    }

    if (search) {
      request.input('search', sql.NVarChar, `%${search}%`);
      whereClause += ` AND (u.name LIKE @search OR u.email LIKE @search)`;
    }

    const result = await request.query(`
      SELECT
        u._id           AS id,
        u.employeeId,
        u.name,
        u.email,
        u.role,
        u.is_deleted    AS isDeleted,
        u.createdAt,
        u.updatedAt
      FROM dawlance_user u
      ${whereClause}
      ORDER BY ${orderBy}
    `);

    const statsResult = await pool.request().query(`
      SELECT
        SUM(CASE WHEN UPPER(role) NOT IN ('ADMIN') AND is_deleted = 0 THEN 1 ELSE 0 END) AS total,
        SUM(CASE WHEN UPPER(role) = 'EMPLOYEE'                         AND is_deleted = 0 THEN 1 ELSE 0 END) AS totalUsers,
        SUM(CASE WHEN UPPER(role) = 'MANAGER'                          AND is_deleted = 0 THEN 1 ELSE 0 END) AS totalManagers
      FROM dawlance_user
    `);

    return sendSuccess(res, {
      users: result.recordset,
      stats: statsResult.recordset[0],
    }, 'Users retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const adminDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    if (id === adminId) {
      return sendError(res, 'Admin cannot delete their own account.', 400);
    }

    const pool = await getPool();

    const check = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .query(`SELECT _id AS id, name, email, role FROM dawlance_user WHERE _id = @id AND is_deleted = 0`);

    if (!check.recordset.length) return sendNotFound(res, 'User not found');

    const target = check.recordset[0];
    if (target.role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Cannot delete the admin account.', 400);
    }

    await pool.request().input('userId', sql.Char(24), id).query(`
      UPDATE dawlance_user
      SET is_deleted = 1, updatedAt = GETDATE() 
      WHERE _id = @userId
    `);

    await logAdminAction({
      actorId:  adminId,
      action:   'user_deleted',
      targetId: id,
      metadata: { deletedEmail: target.email, deletedRole: target.role },
    });

    return sendSuccess(res, null, 'User account deactivated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const adminSetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const adminId = req.user.id;

    if (!newPassword || newPassword.length < 6) {
      return sendError(res, 'newPassword must be at least 6 characters.', 400);
    }
    if (id === adminId) {
      return sendError(res, 'Use the self-management endpoint to change your own password.', 400);
    }

    const pool = await getPool();

    const check = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .query(`SELECT _id AS id, email, role FROM dawlance_user WHERE _id = @id AND is_deleted = 0`);

    if (!check.recordset.length) return sendNotFound(res, 'User not found');
    if (check.recordset[0].role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Cannot modify the admin password via this endpoint.', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await pool
      .request()
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .query(`
        UPDATE dawlance_user
        SET password = @passwordHash,
            updatedAt = GETDATE()
        WHERE _id = @id AND is_deleted = 0
      `);

    await logAdminAction({
      actorId:  adminId,
      action:   'password_reset',
      targetId: id,
      metadata: { targetEmail: check.recordset[0].email },
    });

    return sendSuccess(res, null, 'Password updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PASSWORD CHANGE REQUEST WORKFLOW (only bcrypt hashes)
// ─────────────────────────────────────────────────────────────────────────────

const getPasswordRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let whereClause = '';
    if (status) {
      request.input('status', sql.NVarChar, status.toLowerCase());
      whereClause = `AND UPPER(pr.status) = UPPER(@status)`;
    }

    const result = await request.query(`
      SELECT
        pr.id,
        pr.user_id          AS userId,
        u.name, -- Ensure u.name is selected for audit log
        u.email,
        pr.status,
        pr.rejection_reason AS rejectionReason,
        pr.requested_at     AS requestedAt,
        pr.resolved_at      AS resolvedAt
      FROM pending_password_requests pr
      JOIN dawlance_user u ON u._id = pr.user_id AND u.is_deleted = 0
      WHERE 1 = 1 ${whereClause}
      ORDER BY pr.requested_at DESC
    `);

    return sendSuccess(res, result.recordset, 'Password requests retrieved');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const approvePasswordRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_password_requests.id is nvarchar(64)
      .query(`
        SELECT pr.id, pr.user_id AS userId, pr.desired_password_hash,
               pr.status, u.email
        FROM pending_password_requests pr
        JOIN dawlance_user u ON u._id = pr.user_id AND u.is_deleted = 0
        WHERE pr.id = @id
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Password request not found');

    const req_row = result.recordset[0];
    if (req_row.status.toLowerCase() !== 'pending') {
      return sendError(res, `Request is already ${req_row.status}.`, 400);
    }

    await pool
      .request()
      .input('userId', sql.NVarChar(24), req_row.userId) // dawlance_user._id is nvarchar(24)
      .input('passwordHash', sql.NVarChar, req_row.desired_password_hash)
      .query(`
        UPDATE dawlance_user
        SET password = @passwordHash,
            updatedAt = GETDATE()
        WHERE _id = @userId AND is_deleted = 0
      `);

    await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_password_requests.id is nvarchar(64)
      .query(`
        UPDATE pending_password_requests
        SET status = 'approved', resolved_at = GETDATE()
        WHERE id = @id
      `);

    await logAdminAction({
      actorId:  adminId,
      action:   'pw_approved',
      targetId: req_row.userId,
      metadata: { requestId, targetEmail: req_row.email },
    });

    return sendSuccess(res, null, 'Password request approved and applied');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const rejectPasswordRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_password_requests.id is nvarchar(64)
      .query(`
        SELECT pr.id, pr.user_id AS userId, pr.status, u.email
        FROM pending_password_requests pr
        JOIN dawlance_user u ON u._id = pr.user_id AND u.is_deleted = 0
        WHERE pr.id = @id
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Password request not found');

    const req_row = result.recordset[0];
    if (req_row.status.toLowerCase() !== 'pending') {
      return sendError(res, `Request is already ${req_row.status}.`, 400);
    }

    await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_password_requests.id is nvarchar(64)
      .input('reason', sql.NVarChar, rejectionReason || null)
      .query(`
        UPDATE pending_password_requests
        SET status = 'rejected',
            rejection_reason = @reason,
            resolved_at = GETDATE()
        WHERE id = @id
      `);

    await logAdminAction({
      actorId:  adminId,
      action:   'pw_rejected',
      targetId: req_row.userId,
      metadata: { requestId, targetEmail: req_row.email, reason: rejectionReason || null },
    });

    return sendSuccess(res, null, 'Password request rejected');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

const getAuditLog = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const pool = await getPool();

    const result = await pool
      .request()
      .input('limit',  sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(`
        SELECT
          al.id,
          al.action,
          al.performed_at  AS performedAt,
          al.metadata,
          actor.name       AS actorName,
          actor.email      AS actorEmail,
          target.name      AS targetName,
          target.email     AS targetEmail
        FROM admin_audit_log al
        LEFT JOIN dawlance_user actor  ON actor._id  = al.actor_id
        LEFT JOIN dawlance_user target ON target._id = al.target_id
        ORDER BY al.performed_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const countResult = await pool
      .request()
      .query(`SELECT COUNT(*) AS total FROM admin_audit_log`);

    return sendSuccess(res, {
      logs:  result.recordset,
      total: countResult.recordset[0].total,
      page,
      limit,
    }, 'Audit log retrieved');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getAllUsersAdmin,
  adminDeleteUser,
  adminSetPassword,
  getPasswordRequests,
  approvePasswordRequest,
  rejectPasswordRequest,
  getAuditLog,
};