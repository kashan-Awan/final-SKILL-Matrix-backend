const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { checkEmployeeDepartment } = require('../helpers/utils');

// GET /active/:employeeId
const getActiveShift = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const managerDeptId = req.managerDepartmentId;
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) return sendError(res, 'You can only view employees in your department', 403);
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar(24), employeeId) // employee_shifts.employee_id is nvarchar(24)
      .query(`
        SELECT TOP 1 id, shift_type, start_time, end_time, working_days, supervisor_name, hours_worked, productivity, is_active
        FROM employee_shifts
        WHERE employee_id = @employeeId AND is_active = 1
        ORDER BY created_at DESC
      `);
    if (!result.recordset.length) return sendNotFound(res, 'No active shift found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /history/:employeeId
const getShiftHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const managerDeptId = req.managerDepartmentId;
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) return sendError(res, 'You can only view employees in your department', 403);
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar(24), employeeId) // employee_shifts.employee_id is nvarchar(24)
      .query(`
        SELECT id, shift_type, start_time, end_time, working_days, supervisor_name, hours_worked, productivity, is_active, created_at
        FROM employee_shifts
        WHERE employee_id = @employeeId
        ORDER BY created_at DESC
      `);
    return sendSuccess(res, result.recordset);
  } catch (err) {
    return sendError(res, err.message);
  }
};

// POST /
const createShift = async (req, res) => {
  try {
    const { employee_id, shift_type, start_time, end_time, working_days, supervisor_name, hours_worked, productivity } = req.body;
    const managerDeptId = req.managerDepartmentId;
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employee_id, managerDeptId);
      if (!hasAccess) return sendError(res, 'Employee not in your department', 403);
    }
    const pool = await getPool();
    // Deactivate previous active shift
    await pool
      .request()
      .input('employeeId', sql.NVarChar(24), employee_id) // employee_shifts.employee_id is nvarchar(24)
      .query(`UPDATE employee_shifts SET is_active = 0 WHERE employee_id = @employeeId AND is_active = 1`);
    // Insert new shift
    await pool
      .request()
      .input('employee_id', sql.NVarChar(24), employee_id) // employee_shifts.employee_id is nvarchar(24)
      .input('shift_type', sql.NVarChar, shift_type)
      .input('start_time', sql.NVarChar, start_time)
      .input('end_time', sql.NVarChar, end_time)
      .input('working_days', sql.NVarChar, working_days)
      .input('supervisor_name', sql.NVarChar, supervisor_name)
      .input('hours_worked', sql.Decimal(5,2), hours_worked || 8)
      .input('productivity', sql.Int, productivity || 85)
      .query(`
        INSERT INTO employee_shifts (employee_id, shift_type, start_time, end_time, working_days, supervisor_name, hours_worked, productivity, is_active, created_at, updated_at)
        VALUES (@employee_id, @shift_type, @start_time, @end_time, @working_days, @supervisor_name, @hours_worked, @productivity, 1, GETDATE(), GETDATE())
      `);
    return sendSuccess(res, null, 'Shift created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

// PUT /:id
const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift_type, start_time, end_time, working_days, supervisor_name, hours_worked, productivity, is_active } = req.body;
    const managerDeptId = req.managerDepartmentId;
    const pool = await getPool();
    const check = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_shifts.id is int
      .query(`SELECT employee_id FROM employee_shifts WHERE id = @id`);
    if (!check.recordset.length) return sendNotFound(res, 'Shift not found');
    const employeeId = check.recordset[0].employee_id;
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) return sendError(res, 'Employee not in your department', 403);
    }
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_shifts.id is int
      .input('shift_type', sql.NVarChar, shift_type)
      .input('start_time', sql.NVarChar, start_time)
      .input('end_time', sql.NVarChar, end_time)
      .input('working_days', sql.NVarChar, working_days)
      .input('supervisor_name', sql.NVarChar, supervisor_name)
      .input('hours_worked', sql.Decimal(5,2), hours_worked)
      .input('productivity', sql.Int, productivity)
      .input('is_active', sql.Bit, is_active)
      .query(`
        UPDATE employee_shifts
        SET shift_type = @shift_type, start_time = @start_time, end_time = @end_time,
            working_days = @working_days, supervisor_name = @supervisor_name,
            hours_worked = @hours_worked, productivity = @productivity, is_active = @is_active,
            updated_at = GETDATE()
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return sendNotFound(res, 'Shift not found');
    return sendSuccess(res, null, 'Shift updated');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// DELETE /:id (deactivate)
const deactivateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const managerDeptId = req.managerDepartmentId;
    const pool = await getPool();
    const check = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_shifts.id is int
      .query(`SELECT employee_id FROM employee_shifts WHERE id = @id`);
    if (!check.recordset.length) return sendNotFound(res, 'Shift not found');
    const employeeId = check.recordset[0].employee_id;
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) return sendError(res, 'Employee not in your department', 403);
    }
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_shifts.id is int
      .query(`UPDATE employee_shifts SET is_active = 0, updated_at = GETDATE() WHERE id = @id`);
    if (result.rowsAffected[0] === 0) return sendNotFound(res, 'Shift not found');
    return sendSuccess(res, null, 'Shift deactivated');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getActiveShift,
  getShiftHistory,
  createShift,
  updateShift,
  deactivateShift
};