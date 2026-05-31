const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError } = require('../helpers/responseHelper');

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
      return sendError(res, 'Email, password and role are required.', 400);
    }
    const validRoles = ['admin', 'manager', 'employee', 'user'];
    if (!validRoles.includes(role)) {
      return sendError(res, 'Invalid role.', 400);
    }
    const dbRole = role === 'user' ? 'employee' : role;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('email', sql.NVarChar, email.toLowerCase())
      .input('role', sql.NVarChar, dbRole.toUpperCase())
      .query(`
        SELECT
          u._id        AS id,
          u.employeeId,
          u.role,
          u.name,
          u.email,
          u.password,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          u.departmentId,
          d.name AS departmentName
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u.email = @email AND UPPER(u.role) = @role AND u.is_deleted = 0
      `);
    if (!result.recordset.length) {
      return sendError(res, 'Invalid email, password or role.', 401);
    }
    const user = result.recordset[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 'Invalid email, password or role.', 401);
    }
    return sendSuccess(res, {
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        employeeId:   user.employeeId,
        role:         user.role,
        department:   user.departmentName,
        departmentId: user.departmentId,
        loginTime:    new Date().toISOString(),
      },
    }, 'Login successful');
    } catch (err) {
      console.error('Login error:', err);
      return sendError(res, err.message || 'Internal server error', 500, err.stack);
    }
};

// POST /api/auth/validate
const validate = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!userId || !role) {
      return sendError(res, 'userId and role are required.', 400);
    }
    const dbRole = role === 'user' ? 'employee' : role;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .input('role', sql.NVarChar, dbRole.toUpperCase())
      .query(`
        SELECT
          u._id        AS id,
          u.employeeId,
          u.role,
          u.name,
          u.email,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          u.departmentId,
          d.name AS departmentName
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u._id = @id AND UPPER(u.role) = @role AND u.is_deleted = 0
      `);
    if (!result.recordset.length) {
      return sendError(res, 'User not found or session invalid.', 401);
    }
    const user = result.recordset[0];
    return sendSuccess(res, {
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        employeeId:   user.employeeId,
        role:         user.role,
        department:   user.departmentName,
        departmentId: user.departmentId,
        isValid:      true,
      },
    }, 'Session valid');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return sendError(res, 'Email and role are required.', 400);
    }
    const dbRole = role === 'user' ? 'employee' : role;
    const pool = await getPool();
    const userResult = await pool
      .request()
      .input('email', sql.NVarChar, email.toLowerCase())
      .input('role', sql.NVarChar, dbRole.toUpperCase())
      .query(`
        SELECT _id AS id, name, email
        FROM dawlance_user
        WHERE email = @email AND UPPER(role) = @role AND is_deleted = 0
      `);
    // Always return success to prevent email enumeration
    if (!userResult.recordset.length) {
      return sendSuccess(res, null, 'If this email exists, a reset link has been sent.');
    }
    const user = userResult.recordset[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    // Delete any existing tokens for this user
    await pool
      .request()
      .input('userId', sql.NVarChar, user.id)
      .query(`DELETE FROM PasswordResetTokens WHERE userId = @userId`);
    // Save new token
    await pool
      .request()
      .input('userId', sql.NVarChar, user.id)
      .input('email', sql.NVarChar, email.toLowerCase())
      .input('role', sql.NVarChar, dbRole)
      .input('token', sql.NVarChar, token)
      .input('expiresAt', sql.DateTime, expiresAt)
      .query(`
        INSERT INTO PasswordResetTokens (userId, email, role, token, expiresAt, createdAt)
        VALUES (@userId, @email, @role, @token, @expiresAt, GETDATE())
      `);
    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const resetUrl = `${frontendBase}/reset-password?token=${token}&role=${role}`;
    await sendResetEmail(user.email, user.name, resetUrl);
    return sendSuccess(res, null, 'If this email exists, a reset link has been sent.');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// PATCH /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { userId, email, newPassword, role, token } = req.body;
    if (!newPassword) return sendError(res, 'newPassword is required.', 400);
    if (newPassword.length < 6) return sendError(res, 'Password must be at least 6 characters.', 400);
    const pool = await getPool();

    // Token-based reset (from forgot password email link)
    if (token) {
      const tokenResult = await pool
        .request()
        .input('token', sql.NVarChar, token)
        .query(`
          SELECT userId, email, expiresAt
          FROM PasswordResetTokens
          WHERE token = @token
        `);
      if (!tokenResult.recordset.length) {
        return sendError(res, 'Invalid or expired reset link. Please request a new one.', 400);
      }
      const resetToken = tokenResult.recordset[0];
      if (new Date(resetToken.expiresAt) < new Date()) {
        await pool.request()
          .input('token', sql.NVarChar, token)
          .query(`DELETE FROM PasswordResetTokens WHERE token = @token`);
        return sendError(res, 'Reset link has expired. Please request a new one.', 400);
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool
        .request()
        .input('id', sql.NVarChar, resetToken.userId)
        .input('password', sql.NVarChar, hashed)
        .query(`
          UPDATE dawlance_user
          SET password = @password, updatedAt = GETDATE()
          WHERE _id = @id AND is_deleted = 0
        `);
      await pool.request()
        .input('token', sql.NVarChar, token)
        .query(`DELETE FROM PasswordResetTokens WHERE token = @token`);
      return sendSuccess(res, null, 'Password reset successfully');
    }

    // Direct reset by userId or email (admin use)
    let targetId = userId;
    if (!targetId && email) {
      const dbRole = role === 'user' ? 'employee' : (role || null);
      const request = pool.request().input('email', sql.NVarChar, email.toLowerCase());
      let q = 'SELECT _id FROM dawlance_user WHERE email = @email AND is_deleted = 0';
      if (dbRole) { q += ' AND role = @role'; request.input('role', sql.NVarChar, dbRole); }
      const found = await request.query(q);
      if (!found.recordset.length) return sendError(res, 'User not found.', 404);
      targetId = found.recordset[0]._id;
    }
    if (!targetId) return sendError(res, 'userId or email is required.', 400);
    const hashed = await bcrypt.hash(newPassword, 10);
    const result = await pool
      .request()
      .input('id', sql.NVarChar, targetId)
      .input('password', sql.NVarChar, hashed)
      .query(`
        UPDATE dawlance_user
        SET password = @password, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendError(res, 'User not found.', 404);
    return sendSuccess(res, null, 'Password reset successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// PATCH /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) {
      return sendError(res, 'userId, currentPassword and newPassword are required.', 400);
    }
    if (newPassword.length < 6) {
      return sendError(res, 'New password must be at least 6 characters.', 400);
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .query('SELECT password FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendError(res, 'User not found.', 404);
    const isMatch = await bcrypt.compare(currentPassword, result.recordset[0].password);
    if (!isMatch) return sendError(res, 'Current password is incorrect.', 401);
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .input('password', sql.NVarChar, hashed)
      .query('UPDATE dawlance_user SET password = @password, updatedAt = GETDATE() WHERE _id = @id');
    return sendSuccess(res, null, 'Password changed successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// HELPER: Send reset email
const sendResetEmail = async (toEmail, userName, resetUrl) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: `"Skills Matrix Portal" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Reset Your Password — Dawlance Skills Matrix',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #1d4ed8;">Password Reset Request</h2>
        <p>Hi ${userName},</p>
        <p>We received a request to reset your password for the Skills Matrix Portal.</p>
        <p>Click the button below. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
          style="display: inline-block; margin: 20px 0; padding: 12px 24px;
                 background-color: #1d4ed8; color: white; text-decoration: none;
                 border-radius: 8px; font-weight: bold;">
          Reset Password
        </a>
        <p>If you did not request this, ignore this email.</p>
        <p style="color: #6b7280; font-size: 12px;">Or copy: ${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #6b7280; font-size: 12px;">Dawlance Skills Matrix Portal</p>
      </div>
    `,
  });
};

module.exports = { login, validate, forgotPassword, resetPassword, changePassword };