const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { logAdminAction } = require('../helpers/auditLogger');

const BCRYPT_ROUNDS = 12;

// Allowed roles (used for validation)
const ALLOWED_ROLES = ['admin', 'manager', 'employee', 'user'];

// ==================== LOGIN (with role validation) ====================
async function login(req, res) {
  try {
    const { email, password, role: selectedRole } = req.body;

    // Do not require or validate role from client; role must come from DB.
    // Keep existing error handling for invalid email/password via existing code paths.
    if (!email || !password) {
      return sendError(res, 'Email and password are required', 400);
    }


    const pool = await getPool();
    const result = await pool
      .request()
      .input('identifier', sql.NVarChar, email.trim())
      .query(`
        SELECT _id, name, email, employeeId, role, password, is_deleted
        FROM dawlance_user
        WHERE (LOWER(LTRIM(RTRIM(email))) = LOWER(@identifier) OR employeeId = @identifier) 
          AND is_deleted = 0
        ORDER BY updatedAt DESC
      `);

    if (!result.recordset.length) {
      console.log(`Login Failed: User [${email}] not found or is inactive (is_deleted = 1)`);
      return sendError(res, 'Invalid email or password', 401);
    }

    console.log(`Login attempt: Found user ${result.recordset[0].email} (ID: ${result.recordset[0].employeeId})`);

    const user = result.recordset[0];
    
    // Safety: check if hash exists and trim it to handle potential NCHAR padding in SSMS
    const dbHash = (user.password || '').trim();
    
    if (!dbHash || !dbHash.startsWith('$2') || dbHash.length < 50) {
      console.warn(`CRITICAL: User [${email}] has a non-bcrypt password in DB. Login will fail.`);
      return sendError(res, 'Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(password, dbHash);

    if (!isMatch) {
      console.log(`Login Failed: Password mismatch for [${email}]`);
      return sendError(res, 'Invalid email or password', 401);
    }

    // Role must come from DB only.
    const finalRole = (user.role || '').toLowerCase().trim();


    const token = jwt.sign(
      { id: user._id.toString().trim(), role: finalRole }, 
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return sendSuccess(res, {
      token,
      user: {
        id: user._id.toString().trim(),
        name: (user.name || '').trim(),
        email: (user.email || '').trim(),
        role: finalRole,
        employeeId: (user.employeeId || '').trim()
      }
    }, 'Login successful');
  } catch (err) {
    console.error('Login Error:', err); // Log the actual error to terminal
    return sendError(res, err.message, 500);
  }
}

// ==================== VALIDATE TOKEN ====================
async function validate(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No token provided', 401);
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), decoded.id) // dawlance_user._id is nvarchar(24)
      .query('SELECT _id AS id, name, email, role FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) {
      return sendError(res, 'User not found or inactive', 401);
    }

    const dbUser = result.recordset[0];
    const sanitizedUser = {
      id: dbUser.id.toString().trim(),
      name: (dbUser.name || '').trim(),
      email: (dbUser.email || '').trim(),
      role: (dbUser.role || '').trim()
    };
    return res.json({ 
      success: true, 
      user: sanitizedUser, 
      message: 'Token validated' 
    });
  } catch (err) {
    console.error('Validation Error:', err.message);
    return sendError(res, 'Invalid or expired token', 401);
  }
}

// ==================== CHANGE PASSWORD (logged‑in user) ====================
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return sendError(res, 'Current password and new password (min 6 chars) required', 400);
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), userId) // dawlance_user._id is nvarchar(24)
      .query('SELECT password FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'User not found');

    const dbHash = (result.recordset[0].password || '').trim();
    const isMatch = await bcrypt.compare(currentPassword, dbHash);
    if (!isMatch) return sendError(res, 'Current password is incorrect', 401);

    const hashedNew = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.request()
      .input('id', sql.NVarChar(24), userId) // dawlance_user._id is nvarchar(24)
      .input('newHash', sql.NVarChar, hashedNew)
      .query('UPDATE dawlance_user SET password = @newHash, updatedAt = GETDATE() WHERE _id = @id');

    return sendSuccess(res, null, 'Password changed successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
}

// ==================== ADMIN RESET PASSWORD (uses token from request) ====================
async function resetPasswordDirect(req, res) {
  try {
    // The admin's identity is taken from the verified token (set by auth middleware)
    const adminId = req.user?.id;
    const adminRole = req.user?.role;
    if (!adminId || adminRole?.toLowerCase() !== 'admin') {
      return sendError(res, 'Admin access required', 403);
    }

    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) {
      return sendError(res, 'User ID and new password (min 6 chars) required', 400);
    }

    const pool = await getPool();
    const userCheck = await pool
      .request()
      .input('id', sql.NVarChar(24), userId) // dawlance_user._id is nvarchar(24)
      .query('SELECT _id, role, email FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!userCheck.recordset.length) return sendNotFound(res, 'User not found');
    
    if ((userCheck.recordset[0].role || '').trim().toLowerCase() === 'admin' && userId !== adminId) {
      return sendError(res, 'Cannot reset password of another admin', 403);
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.request()
      .input('id', sql.NVarChar(24), userId) // dawlance_user._id is nvarchar(24)
      .input('password', sql.NVarChar, hashed)
      .query('UPDATE dawlance_user SET password = @password, updatedAt = GETDATE() WHERE _id = @id');

    await logAdminAction({
      actorId: adminId,
      action: 'password_reset_direct',
      targetId: userId,
      metadata: { targetEmail: userCheck.recordset[0].email, method: 'admin_direct' }
    });

    return sendSuccess(res, null, 'Password reset successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER-FACING: SUBMIT PASSWORD CHANGE REQUEST (public)
//    Simplified to accept only email, role, newPassword (matches forgot‑password page)
// ─────────────────────────────────────────────────────────────────────────────

const submitPasswordRequest = async (req, res) => {
  try {
    const { email, role, newPassword } = req.body;

    if (!email || !role || !newPassword) {
      return sendError(res, 'Email, role and new password are required', 400);
    }
    if (newPassword.length < 6) {
      return sendError(res, 'Password must be at least 6 characters', 400);
    }

    const pool = await getPool();

    // Find user by email first to check for existence and role mismatch
    const userResult = await pool.request()
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .query(`
        SELECT _id, name, email, role, is_deleted
        FROM dawlance_user
        WHERE LOWER(LTRIM(RTRIM(email))) = @email
      `);

    if (userResult.recordset.length === 0) {
      console.log(`Password Request Failed: User [${email}] not found in DB.`);
      return sendNotFound(res, 'User not found with the provided email');
    }

    const user = userResult.recordset[0];

    // Validate role and active status
    if (user.is_deleted || (user.role || '').trim().toLowerCase() !== role.trim().toLowerCase()) {
      console.log(`Password Request Failed: Role Mismatch or Inactive for [${email}]. Input: [${role}], DB: [${user.role}], Active: [${!user.is_deleted}]`);
      return sendNotFound(res, 'User not found with the provided email and role');
    }

    // Admin accounts cannot request password change this way
    if (user.role.toUpperCase() === 'ADMIN') {
      return sendError(res, 'Admin manages their own password directly.', 400);
    }

    // Cancel any existing pending request for this user
    await pool.request()
      .input('userId', sql.NVarChar(24), user._id) // pending_password_requests.user_id is nvarchar(24)
      .query(`
        UPDATE pending_password_requests
        SET status = 'rejected', 
            rejection_reason = 'Superseded by newer request', 
            resolved_at = GETDATE()
        WHERE user_id = @userId AND status = 'pending'
      `);

    const desiredHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const requestId = crypto.randomBytes(12).toString('hex'); 

    await pool.request()
      .input('id', sql.NVarChar(64), requestId) // pending_password_requests.id is nvarchar(64)
      .input('userId', sql.NVarChar(24), user._id) // pending_password_requests.user_id is nvarchar(24)
      .input('desiredHash', sql.NVarChar, desiredHash)
      .query(`
        INSERT INTO pending_password_requests
          (id, user_id, desired_password_hash, status, requested_at)
        VALUES (@id, @userId, @desiredHash, 'pending', GETDATE())
      `);
      

    return sendSuccess(res, { requestId }, 'Password change request submitted. Please wait for admin approval.', 201);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

module.exports = {
  login,
  validate,
  changePassword, // Self-service password change
  resetPasswordDirect, // Admin-initiated password reset
  submitPasswordRequest // Public password request submission
};