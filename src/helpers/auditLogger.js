const crypto = require('crypto');
const { getPool, sql } = require('../config/db');

const generateId = () => crypto.randomBytes(16).toString('hex');

const logAdminAction = async ({ actorId, action, targetId = null, metadata = null }) => {
  try {
    const pool = await getPool();
    const id = generateId();
    await pool
      .request()
      .input('id', sql.Char(32), id)
      .input('actorId', sql.Char(24), actorId)
      .input('action', sql.NVarChar, action)
      .input('targetId', sql.Char(24), targetId)
      .input('metadata', sql.NVarChar, metadata ? JSON.stringify(metadata) : null)
      .query(`
        INSERT INTO admin_audit_log (id, actor_id, action, target_id, metadata, performed_at)
        VALUES (@id, @actorId, @action, @targetId, @metadata, GETDATE())
      `);
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
    // Audit failures must not break main operations
  }
};

module.exports = { logAdminAction };