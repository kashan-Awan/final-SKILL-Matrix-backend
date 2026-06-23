 const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { checkEmployeeDepartment, checkMachineDepartment } = require('../helpers/utils');

const getAssignmentsByEmployee = async (req, res) => {
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
      .input('employeeId', sql.NVarChar(24), employeeId) // employee_machines.employee_id is nvarchar(24)
      .query(`
        SELECT em.id, em.employee_id, em.machine_id, em.assigned_date, em.is_active,
               m.name AS machine_name, m.machineId, m.type, m.status, m.departmentId
        FROM employee_machines em
        INNER JOIN machine m ON em.machine_id = m._id AND m.is_deleted = 0
        WHERE em.employee_id = @employeeId
        ORDER BY em.assigned_date DESC
      `);
    return sendSuccess(res, result.recordset, 'Assignments retrieved');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const assignMachine = async (req, res) => {
  try {
    const { employee_id, machine_id, assigned_date, is_active } = req.body;
    const managerDeptId = req.managerDepartmentId;
    if (!employee_id || !machine_id) return sendError(res, 'employee_id and machine_id are required', 400);
    if (managerDeptId) {
      const empOk = await checkEmployeeDepartment(employee_id, managerDeptId);
      if (!empOk) return sendError(res, 'Employee not in your department', 403);
      const machOk = await checkMachineDepartment(machine_id, managerDeptId);
      if (!machOk) return sendError(res, 'Machine not in your department', 403);
    }
    const pool = await getPool();
    const existing = await pool
      .request()
      .input('employee_id', sql.NVarChar(24), employee_id) // employee_machines.employee_id is nvarchar(24)
      .input('machine_id', sql.NVarChar(24), machine_id) // employee_machines.machine_id is nvarchar(24)
      .query(`SELECT id FROM employee_machines WHERE employee_id = @employee_id AND machine_id = @machine_id AND is_active = 1`);
    if (existing.recordset.length > 0) return sendError(res, 'Machine already assigned to this employee', 400);
    await pool
      .request()
      .input('employee_id', sql.NVarChar(24), employee_id) // employee_machines.employee_id is nvarchar(24)
      .input('machine_id', sql.NVarChar(24), machine_id) // employee_machines.machine_id is nvarchar(24)
      .input('assigned_date', sql.Date, assigned_date || new Date())
      .input('is_active', sql.Bit, is_active !== undefined ? is_active : 1)
      .query(`
        INSERT INTO employee_machines (employee_id, machine_id, assigned_date, is_active, created_at, updated_at)
        VALUES (@employee_id, @machine_id, @assigned_date, @is_active, GETDATE(), GETDATE())
      `);
    return sendSuccess(res, null, 'Machine assigned successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, assigned_date } = req.body;
    const managerDeptId = req.managerDepartmentId;
    const pool = await getPool();
    const check = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_machines.id is int
      .query(`SELECT employee_id, machine_id FROM employee_machines WHERE id = @id`);
    if (!check.recordset.length) return sendNotFound(res, 'Assignment not found');
    const { employee_id, machine_id } = check.recordset[0];
    if (managerDeptId) {
      const empOk = await checkEmployeeDepartment(employee_id, managerDeptId);
      if (!empOk) return sendError(res, 'Employee not in your department', 403);
      const machOk = await checkMachineDepartment(machine_id, managerDeptId);
      if (!machOk) return sendError(res, 'Machine not in your department', 403);
    }
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_machines.id is int
      .input('is_active', sql.Bit, is_active)
      .input('assigned_date', sql.Date, assigned_date)
      .query(`
        UPDATE employee_machines
        SET is_active = @is_active, assigned_date = ISNULL(@assigned_date, assigned_date), updated_at = GETDATE()
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return sendNotFound(res, 'Assignment not found');
    return sendSuccess(res, null, 'Assignment updated');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const managerDeptId = req.managerDepartmentId;
    const pool = await getPool();
    const check = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_machines.id is int
      .query(`SELECT employee_id, machine_id FROM employee_machines WHERE id = @id`);
    if (!check.recordset.length) return sendNotFound(res, 'Assignment not found');
    const { employee_id, machine_id } = check.recordset[0];
    if (managerDeptId) {
      const empOk = await checkEmployeeDepartment(employee_id, managerDeptId);
      if (!empOk) return sendError(res, 'Employee not in your department', 403);
      const machOk = await checkMachineDepartment(machine_id, managerDeptId);
      if (!machOk) return sendError(res, 'Machine not in your department', 403);
    }
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(id)) // employee_machines.id is int
      .query(`
        UPDATE employee_machines 
        SET is_active = 0, updated_at = GETDATE() 
        WHERE id = @id
      `);
    if (result.rowsAffected[0] === 0) return sendNotFound(res, 'Assignment not found');
    return sendSuccess(res, null, 'Assignment deactivated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAssignmentsByEmployee,
  assignMachine,
  updateAssignment,
  deleteAssignment
};