const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { logAdminAction } = require('../helpers/auditLogger'); // Import centralized audit logger
const { generateId } = require('../helpers/utils');

const BCRYPT_ROUNDS = 12;

// Public registration - creates pending request (only bcrypt hash, no plaintext)
const submitRegistrationRequest = async (req, res) => {
  try {
    const { name, email, employeeId, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return sendError(res, 'All fields are required.', 400);
    }
    if (password.length < 6) {
      return sendError(res, 'Password must be at least 6 characters.', 400);
    }

    const validRoles = ['EMPLOYEE', 'MANAGER'];
    if (!validRoles.includes(role.toUpperCase())) {
      return sendError(res, 'Invalid role. Only Employee or Manager can register.', 400);
    }

    const pool = await getPool();

    // Check existing user
    const existingUser = await pool
      .request()
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .query('SELECT _id FROM dawlance_user WHERE LOWER(LTRIM(RTRIM(email))) = @email');

    if (existingUser.recordset.length) {
      return sendError(res, 'Email already registered. Please login.', 400);
    }

    // Check pending request
    const existingRequest = await pool
      .request()
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .query("SELECT id FROM pending_user_registrations WHERE LOWER(LTRIM(RTRIM(email))) = @email AND status = 'pending'");

    if (existingRequest.recordset.length) {
      return sendError(res, 'You already have a pending registration request. Please wait for admin approval.', 400);
    }

    // Check if Employee ID is already in use
    if (employeeId) {
      const existingEmp = await pool
        .request()
        .input('empId', sql.NVarChar, employeeId)
        .query('SELECT _id FROM dawlance_user WHERE employeeId = @empId');
      if (existingEmp.recordset.length) return sendError(res, 'Employee ID already registered.', 400);

      const existingEmpReq = await pool
        .request()
        .input('empId', sql.NVarChar, employeeId)
        .query("SELECT id FROM pending_user_registrations WHERE employee_id = @empId AND status = 'pending'");
      if (existingEmpReq.recordset.length) return sendError(res, 'A request with this Employee ID is already pending.', 400);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = generateId();

    await pool
      .request()
      .input('id', sql.NVarChar(64), id) // pending_user_registrations.id is nvarchar(64)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .input('employeeId', sql.NVarChar, (employeeId && employeeId.trim() !== '') ? employeeId.trim() : null)
      .input('passwordHash', sql.NVarChar, passwordHash)
      .input('role', sql.NVarChar, role.toUpperCase())
      .query(`
        INSERT INTO pending_user_registrations 
        (id, name, email, employee_id, password_hash, role, status, requested_at)
        VALUES 
        (@id, @name, @email, @employeeId, @passwordHash, @role, 'pending', GETDATE())
      `);

    return sendSuccess(res, { requestId: id }, 'Registration request submitted. Please wait for admin approval.', 201);
  } catch (err) {
    console.error('Registration request error:', err);
    return sendError(res, err.message);
  }
};

// Admin - Get all registration requests
const getRegistrationRequests = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('status', sql.NVarChar, status.toLowerCase())
      .query(`
        SELECT 
          id,
          name,
          email,
          employee_id AS employeeId,
          role,
          status,
          rejection_reason AS rejectionReason,
          requested_at AS requestedAt,
          resolved_at AS resolvedAt
        FROM pending_user_registrations
        WHERE UPPER(status) = UPPER(@status)
        ORDER BY requested_at DESC
      `);

    const stats = await getRegistrationStatsInternal(pool);

    return sendSuccess(res, {
      requests: result.recordset,
      counts: stats
    }, 'Registration requests retrieved');
  } catch (err) {
    console.error('Get registration requests error:', err);
    return sendError(res, err.message);
  }
};

// Admin - Approve registration request (no plain_password)
const approveRegistrationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user?.id;
    const pool = await getPool();

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const requestResult = await new sql.Request(transaction)
        .input('id', sql.NVarChar(64), requestId) // pending_user_registrations.id is nvarchar(64)
        .query(`
          SELECT id, name, email, employee_id, password_hash, role 
          FROM pending_user_registrations 
          WHERE id = @id AND status = 'pending'`);

      if (!requestResult.recordset.length) {
        await transaction.rollback();
        return sendNotFound(res, 'Registration request not found or already processed');
      }

      const request = requestResult.recordset[0];
      const emailLower = request.email.trim().toLowerCase();
      const employeeIdValue = request.employee_id && request.employee_id.trim() !== '' 
        ? request.employee_id.trim() 
        : requestId.slice(0, 10);

      const check = await new sql.Request(transaction)
        .input('email', sql.NVarChar, emailLower)
        .input('empId', sql.NVarChar, employeeIdValue)
        .query(`
          SELECT 
            (SELECT COUNT(*) FROM dawlance_user WHERE LOWER(LTRIM(RTRIM(email))) = @email) AS emailExists,
            (SELECT COUNT(*) FROM dawlance_user WHERE employeeId = @empId) AS empIdExists
        `);

      const { emailExists, empIdExists } = check.recordset[0];
      if (emailExists > 0) {
        await transaction.rollback();
        return sendError(res, `Email ${emailLower} is already registered.`, 400);
      }
      if (empIdExists > 0) {
        await transaction.rollback();
        return sendError(res, `Employee ID ${employeeIdValue} is already assigned.`, 400);
      }

      const newUserId = generateId();
      const now = new Date();

      await new sql.Request(transaction)
        .input('_id', sql.NVarChar(24), newUserId) // dawlance_user._id is nvarchar(24)
        .input('employeeId', sql.NVarChar, employeeIdValue)
        .input('name', sql.NVarChar, request.name)
        .input('email', sql.NVarChar, emailLower)
        .input('password', sql.NVarChar, request.password_hash)
        .input('role', sql.NVarChar, request.role)
        .input('now', sql.DateTime2, now)
        .query(`
          INSERT INTO dawlance_user 
          (_id, employeeId, name, email, password, role, is_deleted, __v, createdAt, updatedAt)
          VALUES 
          (@_id, @employeeId, @name, @email, @password, @role, 0, 0, @now, @now)
        `);

      await new sql.Request(transaction)
        .input('id', sql.NVarChar(64), requestId) // pending_user_registrations.id is nvarchar(64)
        .query("UPDATE pending_user_registrations SET status = 'approved', resolved_at = GETDATE() WHERE id = @id");

      await transaction.commit();

      await logAdminAction({
        actorId: adminId,
        action: 'registration_approved',
        targetId: newUserId,
        metadata: { email: request.email, name: request.name, employeeId: employeeIdValue }
      });

      return sendSuccess(res, { userId: newUserId }, 'Registration approved successfully');
    } catch (innerErr) {
      if (transaction) await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('Approve registration error:', err);
    return sendError(res, err.message);
  }
};

// Admin - Reject registration request
const rejectRegistrationRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const rejectionReason = req.body.rejectionReason || req.body.reason; // Allow flexibility for frontend
    const adminId = req.user?.id; 
    const pool = await getPool();

    const requestResult = await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_user_registrations.id is nvarchar(64)
      .query("SELECT * FROM pending_user_registrations WHERE id = @id AND status = 'pending'");

    if (!requestResult.recordset.length) {
      return sendNotFound(res, 'Registration request not found');
    }

    const request = requestResult.recordset[0];

    await pool
      .request()
      .input('id', sql.NVarChar(64), requestId) // pending_user_registrations.id is nvarchar(64)
      .input('reason', sql.NVarChar, rejectionReason || null)
      .query("UPDATE pending_user_registrations SET status = 'rejected', rejection_reason = @reason, resolved_at = GETDATE() WHERE id = @id");

    await logAdminAction({
      actorId: adminId,
      action: 'registration_rejected',
      targetId: null,
      metadata: { email: request.email, name: request.name, reason: rejectionReason }
    });

    return sendSuccess(res, null, 'Registration request rejected');
  } catch (err) {
    console.error('Reject registration error:', err);
    return sendError(res, err.message);
  }
};

// Admin - Get registration stats
const getRegistrationStatsInternal = async (pool) => {
  const result = await pool.request().query(`
    SELECT 
      COUNT(CASE WHEN UPPER(status) = 'PENDING' THEN 1 END) AS pending,
      COUNT(CASE WHEN UPPER(status) = 'APPROVED' THEN 1 END) AS approved,
      COUNT(CASE WHEN UPPER(status) = 'REJECTED' THEN 1 END) AS rejected
    FROM pending_user_registrations
  `);
  return result.recordset[0] || { pending: 0, approved: 0, rejected: 0 };
};

const getRegistrationStats = async (req, res) => {
  try {
    const pool = await getPool();
    const stats = await getRegistrationStatsInternal(pool);
    return sendSuccess(res, stats, 'Registration stats retrieved');
  } catch (err) {
    console.error('Get registration stats error:', err);
    return sendError(res, err.message);
  }
};

module.exports = {
  submitRegistrationRequest,
  getRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  getRegistrationStats
};