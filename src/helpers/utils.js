const crypto = require('crypto');
const { getPool, sql } = require('../config/db');

/**
 * Generates a 24-character hex string compatible with MongoDB-style IDs.
 */
const generateId = () => crypto.randomBytes(12).toString('hex');

/**
 * Verification helper to ensure a manager only accesses employees within their own department.
 */
const checkEmployeeDepartment = async (employeeId, managerDeptId) => {
  if (!managerDeptId) return true;
  const pool = await getPool();
  const result = await pool
    .request()
    .input('empId', sql.NVarChar, employeeId)
    .input('deptId', sql.NVarChar, managerDeptId)
    .query('SELECT _id FROM dawlance_user WHERE _id = @empId AND departmentId = @deptId AND is_deleted = 0');
  return result.recordset.length > 0;
};

/**
 * Verification helper to ensure a manager only accesses machines within their own department.
 */
const checkMachineDepartment = async (machineId, managerDeptId) => {
  if (!managerDeptId) return true;
  const pool = await getPool();
  const result = await pool
    .request()
    .input('machId', sql.Char(24), machineId)
    .input('deptId', sql.NVarChar, managerDeptId)
    .query('SELECT _id FROM machine WHERE _id = @machId AND departmentId = @deptId AND is_deleted = 0');
  return result.recordset.length > 0;
};

module.exports = { generateId, checkEmployeeDepartment, checkMachineDepartment };