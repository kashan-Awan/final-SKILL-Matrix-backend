/**
 * Admin Controller — Skills Matrix Portal (Dawlance)
 *
 * Covers:
 *   1. User management  (getAllUsersAdmin, adminDeleteUser)
 *   2. Password reveal  (revealPassword)
 *   3. Direct password edit  (adminSetPassword)
 *   4. Password-change requests  (getPasswordRequests, approvePasswordRequest, rejectPasswordRequest)
 *   5. Audit log  (getAuditLog)
 *
 * Security contract:
 *   • All functions are only reachable behind requireAdmin middleware.
 *   • plain_password is AES-256-GCM encrypted in DB; decrypted only here.
 *   • Every sensitive action appends to admin_audit_log.
 *   • Parameterised queries only — no raw SQL string concatenation.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { encrypt, decrypt } = require('../helpers/cryptoHelper');

const BCRYPT_ROUNDS = 12;
const generateId = () => crypto.randomBytes(16).toString('hex');

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a row to admin_audit_log.
 * Non-throwing: errors are swallowed so they never disrupt the main response.
 */
const writeAuditLog = async (pool, { actorId, action, targetId = null, metadata = null }) => {
  try {
    await pool
      .request()
      .input('id',          sql.NVarChar, generateId())
      .input('actorId',     sql.NVarChar, actorId)
      .input('action',      sql.NVarChar, action)
      .input('targetId',    sql.NVarChar, targetId)
      .input('metadata',    sql.NVarChar, metadata ? JSON.stringify(metadata) : null)
      .query(`
        INSERT INTO admin_audit_log (id, actor_id, action, target_id, metadata, performed_at)
        VALUES (@id, @actorId, @action, @targetId, @metadata, GETDATE())
      `);
  } catch (_) {
    // Audit failures must not break main operations
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Returns all non-deleted, non-admin users.
 * Password field returned as masked placeholder — use /reveal-password for real value.
 *
 * Query params (all optional):
 *   role   — 'user' | 'manager'
 *   search — substring match on name or email
 *   sort   — 'name' | 'role' | 'created' (default: 'created' DESC)
 */
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
        u.updatedAt,
        -- plain_password deliberately NOT returned here; use /reveal-password
        CASE WHEN u.plain_password IS NULL THEN 0 ELSE 1 END AS hasPlainPassword
      FROM dawlance_user u
      ${whereClause}
      ORDER BY ${orderBy}
    `);

    // Stats counters
    const statsResult = await pool.request().query(`
      SELECT
        SUM(CASE WHEN UPPER(role) NOT IN ('ADMIN') AND is_deleted = 0 THEN 1 ELSE 0 END) AS total,
        SUM(CASE WHEN UPPER(role) = 'EMPLOYEE'                         AND is_deleted = 0 THEN 1 ELSE 0 END) AS totalUsers,
        SUM(CASE WHEN UPPER(role) = 'MANAGER'                          AND is_deleted = 0 THEN 1 ELSE 0 END) AS totalManagers,
        SUM(CASE WHEN UPPER(role) NOT IN ('ADMIN') AND is_deleted = 0 AND is_deleted = 0 THEN 1 ELSE 0 END) AS active
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

/**
 * GET /api/admin/users/:id/reveal-password
 * Decrypts and returns the stored plain_password for a single user.
 * Logs a 'password_viewed' audit entry.
 */
const revealPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.adminUser.id;

    // Prevent admin revealing their own (admin manages own password separately)
    if (id === adminId) {
      return sendError(res, 'Admin password is self-managed only.', 400);
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT _id AS id, name, email, plain_password
        FROM dawlance_user
        WHERE _id = @id AND UPPER(role) != 'ADMIN' AND is_deleted = 0
      `);

    if (!result.recordset.length) {
      return sendNotFound(res, 'User not found');
    }

    const user = result.recordset[0];
    const plainPassword = user.plain_password ? decrypt(user.plain_password) : null;

    await writeAuditLog(pool, {
      actorId:  adminId,
      action:   'password_viewed',
      targetId: id,
      metadata: { targetEmail: user.email },
    });

    return sendSuccess(res, { userId: id, plainPassword }, 'Password revealed');
  } catch (err) {
    return sendError(res, err.message);
  }
};

/**
 * DELETE /api/admin/users/:id
 * Hard-deletes the target user and cascades removal of related records.
 * Guards: cannot delete self (admin), cannot delete another admin.
 */
const adminDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.adminUser.id;

    if (id === adminId) {
      return sendError(res, 'Admin cannot delete their own account.', 400);
    }

    const pool = await getPool();

    // Verify target exists, is not admin
    const check = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT _id AS id, name, email, role
        FROM dawlance_user
        WHERE _id = @id AND is_deleted = 0
      `);

    if (!check.recordset.length) return sendNotFound(res, 'User not found');

    const target = check.recordset[0];
    if (target.role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Cannot delete the admin account.', 400);
    }

    // Cascade hard-deletes in child tables, then the user row
    const req2 = pool.request().input('userId', sql.NVarChar, id);
    await req2.query(`
      DELETE FROM pending_password_requests WHERE user_id = @userId;
      DELETE FROM employee_skills            WHERE employee_id = @userId;
      DELETE FROM work_history               WHERE employee_id = @userId;
      DELETE FROM dawlance_user              WHERE _id = @userId;
    `);

    await writeAuditLog(pool, {
      actorId:  adminId,
      action:   'account_deleted',
      targetId: id,
      metadata: { deletedEmail: target.email, deletedRole: target.role },
    });

    return sendSuccess(res, null, 'User account permanently deleted');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DIRECT PASSWORD MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/admin/users/:id/set-password
 * Admin directly overwrites a user's password.
 * Body: { newPassword: string }
 */
const adminSetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const adminId = req.adminUser.id;

    if (!newPassword || newPassword.length < 6) {
      return sendError(res, 'newPassword must be at least 6 characters.', 400);
    }
    if (id === adminId) {
      return sendError(res, 'Use the self-management endpoint to change your own password.', 400);
    }

    const pool = await getPool();

    // Verify target exists and is not admin
    const check = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query(`SELECT _id AS id, email, role FROM dawlance_user WHERE _id = @id AND is_deleted = 0`);

    if (!check.recordset.length) return sendNotFound(res, 'User not found');
    if (check.recordset[0].role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Cannot modify the admin password via this endpoint.', 400);
    }

    const passwordHash   = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const encryptedPlain = encrypt(newPassword);

    await pool
      .request()
      .input('id',            sql.NVarChar, id)
      .input('passwordHash',  sql.NVarChar, passwordHash)
      .input('encryptedPlain',sql.NVarChar, encryptedPlain)
      .query(`
        UPDATE dawlance_user
        SET password       = @passwordHash,
            plain_password = @encryptedPlain,
            updatedAt      = GETDATE()
        WHERE _id = @id AND is_deleted = 0
      `);

    await writeAuditLog(pool, {
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
// 3. PASSWORD CHANGE REQUEST WORKFLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/password-requests
 * List pending/all password change requests.
 * Query: status — 'pending' | 'approved' | 'rejected' (default: all)
 */
const getPasswordRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let whereClause = '';
    if (status) {
      request.input('status', sql.NVarChar, status.toLowerCase());
      whereClause = `AND pr.status = @status`;
    }

    const result = await request.query(`
      SELECT
        pr.id,
        pr.user_id          AS userId,
        u.name,
        u.email,
        pr.status,
        pr.rejection_reason AS rejectionReason,
        pr.requested_at     AS requestedAt,
        pr.resolved_at      AS resolvedAt
        -- desired_plain_password NOT returned here; use /reveal-request-password
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

/**
 * GET /api/admin/password-requests/:requestId/reveal-password
 * Decrypts the desired_plain_password for a specific request so the admin
 * can see what the user wants their new password to be.
 */
const revealRequestPassword = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.adminUser.id;

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, requestId)
      .query(`
        SELECT pr.id, pr.user_id AS userId, pr.desired_plain_password, u.email
        FROM pending_password_requests pr
        JOIN dawlance_user u ON u._id = pr.user_id
        WHERE pr.id = @id
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Request not found');

    const row = result.recordset[0];
    const plainPassword = row.desired_plain_password ? decrypt(row.desired_plain_password) : null;

    await writeAuditLog(pool, {
      actorId:  adminId,
      action:   'password_viewed',
      targetId: row.userId,
      metadata: { context: 'password_request', requestId },
    });

    return sendSuccess(res, { requestId, userId: row.userId, desiredPassword: plainPassword }, 'Desired password revealed');
  } catch (err) {
    return sendError(res, err.message);
  }
};

/**
 * POST /api/admin/password-requests/:requestId/approve
 * Copies desired hash + plain into users table; marks request approved.
 */
const approvePasswordRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.adminUser.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.NVarChar, requestId)
      .query(`
        SELECT pr.id, pr.user_id AS userId, pr.desired_password_hash,
               pr.desired_plain_password, pr.status, u.email
        FROM pending_password_requests pr
        JOIN dawlance_user u ON u._id = pr.user_id AND u.is_deleted = 0
        WHERE pr.id = @id
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Password request not found');

    const req_row = result.recordset[0];
    if (req_row.status !== 'pending') {
      return sendError(res, `Request is already ${req_row.status}.`, 400);
    }

    // Apply to user row
    await pool
      .request()
      .input('userId',       sql.NVarChar, req_row.userId)
      .input('passwordHash', sql.NVarChar, req_row.desired_password_hash)
      .input('plainPw',      sql.NVarChar, req_row.desired_plain_password)
      .query(`
        UPDATE dawlance_user
        SET password       = @passwordHash,
            plain_password = @plainPw,
            updatedAt      = GETDATE()
        WHERE _id = @userId AND is_deleted = 0
      `);

    // Mark request resolved
    await pool
      .request()
      .input('id', sql.NVarChar, requestId)
      .query(`
        UPDATE pending_password_requests
        SET status = 'approved', resolved_at = GETDATE()
        WHERE id = @id
      `);

    await writeAuditLog(pool, {
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

/**
 * POST /api/admin/password-requests/:requestId/reject
 * Body: { rejectionReason?: string }
 */
const rejectPasswordRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.adminUser.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.NVarChar, requestId)
      .query(`
        SELECT pr.id, pr.user_id AS userId, pr.status, u.email
        FROM pending_password_requests pr
        JOIN dawlance_user u ON u._id = pr.user_id AND u.is_deleted = 0
        WHERE pr.id = @id
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Password request not found');

    const req_row = result.recordset[0];
    if (req_row.status !== 'pending') {
      return sendError(res, `Request is already ${req_row.status}.`, 400);
    }

    await pool
      .request()
      .input('id',     sql.NVarChar, requestId)
      .input('reason', sql.NVarChar, rejectionReason || null)
      .query(`
        UPDATE pending_password_requests
        SET status           = 'rejected',
            rejection_reason = @reason,
            resolved_at      = GETDATE()
        WHERE id = @id
      `);

    await writeAuditLog(pool, {
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

/**
 * GET /api/admin/audit-log
 * Read-only; append-only enforced at DB level.
 * Query: page (1-based, default 1), limit (default 50, max 200)
 */
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
// USER-FACING: Submit a password change request
// POST /api/admin/password-requests  (called by the user, not the admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Any authenticated user submits a request to change their own password.
 * Does NOT require admin — protected only by x-user-id header matching the body userId.
 * Body: { userId, desiredPassword }
 */
const submitPasswordRequest = async (req, res) => {
  try {
    const { userId, desiredPassword } = req.body;

    if (!userId || !desiredPassword) {
      return sendError(res, 'userId and desiredPassword are required.', 400);
    }
    if (desiredPassword.length < 6) {
      return sendError(res, 'Desired password must be at least 6 characters.', 400);
    }

    const pool = await getPool();

    // Verify user exists and is not admin
    const userCheck = await pool
      .request()
      .input('userId', sql.NVarChar, userId)
      .query(`SELECT _id AS id, role FROM dawlance_user WHERE _id = @userId AND is_deleted = 0`);

    if (!userCheck.recordset.length) return sendNotFound(res, 'User not found');
    if (userCheck.recordset[0].role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Admin manages their own password directly.', 400);
    }

    // Cancel any existing pending request for this user
    await pool
      .request()
      .input('userId', sql.NVarChar, userId)
      .query(`
        UPDATE pending_password_requests
        SET status = 'rejected', rejection_reason = 'Superseded by newer request', resolved_at = GETDATE()
        WHERE user_id = @userId AND status = 'pending'
      `);

    const desiredHash       = await bcrypt.hash(desiredPassword, BCRYPT_ROUNDS);
    const encryptedPlain    = encrypt(desiredPassword);
    const id                = generateId();

    await pool
      .request()
      .input('id',           sql.NVarChar, id)
      .input('userId',       sql.NVarChar, userId)
      .input('desiredHash',  sql.NVarChar, desiredHash)
      .input('encryptedPlain', sql.NVarChar, encryptedPlain)
      .query(`
        INSERT INTO pending_password_requests
          (id, user_id, desired_password_hash, desired_plain_password, status, requested_at)
        VALUES (@id, @userId, @desiredHash, @encryptedPlain, 'pending', GETDATE())
      `);

    return sendSuccess(res, { requestId: id }, 'Password change request submitted', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAllUsersAdmin,
  revealPassword,
  adminDeleteUser,
  adminSetPassword,
  getPasswordRequests,
  revealRequestPassword,
  approvePasswordRequest,
  rejectPasswordRequest,
  getAuditLog,
  submitPasswordRequest,
};
