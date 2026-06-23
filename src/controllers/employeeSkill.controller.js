const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId, checkEmployeeDepartment } = require('../helpers/utils');

const getAllEmployeeSkills = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT * FROM employee_skills WHERE is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Employee skills retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getEmployeeSkillsByEmployeeId = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const managerDeptId = req.managerDepartmentId; // set by requireManagerOrAdmin middleware

    // Department restriction for managers
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) {
        return sendError(res, 'You can only view employees in your department', 403);
      }
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('employee_id', sql.NVarChar(24), employeeId) // employee_skills.employee_id is nvarchar(24)
      .query('SELECT es.id, es.employee_id, es.skill_id, es.level, es.acquired_date, es.last_assessed_date, es.notes, s.name AS skillName, s.category AS skillCategory FROM employee_skills es JOIN skills s ON es.skill_id = s._id WHERE es.employee_id = @employee_id AND es.is_deleted = 0 AND s.is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Employee skills retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const assignSkillToEmployee = async (req, res) => {
  try {
    const { employee_id, skill_id, level, acquired_date, last_assessed_date, notes } = req.body;
    const managerDeptId = req.managerDepartmentId;

    // Department restriction for managers
    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employee_id, managerDeptId);
      if (!hasAccess) {
        return sendError(res, 'You can only assign skills to employees in your department', 403);
      }
    }

    const id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id) // employee_skills.id is char(24)
      .input('employee_id', sql.NVarChar(24), employee_id) // employee_skills.employee_id is nvarchar(24)
      .input('skill_id', sql.NVarChar(24), skill_id) // employee_skills.skill_id is nvarchar(24)
      .input('level', sql.NVarChar, level)
      .input('acquired_date', sql.DateTime2, acquired_date ? new Date(acquired_date) : now)
      .input('last_assessed_date', sql.DateTime2, last_assessed_date ? new Date(last_assessed_date) : now)
      .input('notes', sql.NVarChar, notes || null)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO employee_skills
          (id, employee_id, skill_id, level, acquired_date, last_assessed_date, notes, is_deleted, __v, created_at, updated_at)
        OUTPUT INSERTED.*
        VALUES (@id, @employee_id, @skill_id, @level, @acquired_date, @last_assessed_date, @notes, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Skill assigned to employee successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateEmployeeSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const { level, last_assessed_date, notes } = req.body;
    const managerDeptId = req.managerDepartmentId;

    const pool = await getPool();

    // First, fetch the employee_id for this skill record to check department access
    const checkResult = await pool
      .request()
      .input('id', sql.Char(24), id) // employee_skills.id is char(24)
      .query(`
        SELECT employee_id 
        FROM employee_skills 
        WHERE id = @id AND is_deleted = 0
      `);
    if (!checkResult.recordset.length) {
      return sendNotFound(res, 'Employee skill record not found');
    }
    const employeeId = checkResult.recordset[0].employee_id;

    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) {
        return sendError(res, 'You can only update skills of employees in your department', 403);
      }
    }

    const result = await pool
      .request()
      .input('id', sql.Char(24), id) // employee_skills.id is char(24)
      .input('level', sql.NVarChar, level)
      .input('last_assessed_date', sql.DateTime2, last_assessed_date ? new Date(last_assessed_date) : new Date())
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        UPDATE employee_skills
        SET level = @level, last_assessed_date = @last_assessed_date, notes = @notes, updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Employee skill record not found');
    return sendSuccess(res, result.recordset[0], 'Employee skill updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const removeEmployeeSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const managerDeptId = req.managerDepartmentId;

    const pool = await getPool();

    // Fetch the employee_id for this skill record
    const checkResult = await pool
      .request()
      .input('id', sql.Char(24), id) // employee_skills.id is char(24)
      .query(`
        SELECT employee_id 
        FROM employee_skills 
        WHERE id = @id AND is_deleted = 0
      `);
    if (!checkResult.recordset.length) {
      return sendNotFound(res, 'Employee skill record not found');
    }
    const employeeId = checkResult.recordset[0].employee_id;

    if (managerDeptId) {
      const hasAccess = await checkEmployeeDepartment(employeeId, managerDeptId);
      if (!hasAccess) {
        return sendError(res, 'You can only remove skills of employees in your department', 403);
      }
    }

    const result = await pool
      .request()
      .input('id', sql.Char(24), id) // employee_skills.id is char(24)
      .query(`
        UPDATE employee_skills
        SET is_deleted = 1, updated_at = GETDATE()
        OUTPUT INSERTED.id
        WHERE id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Employee skill record not found');
    return sendSuccess(res, null, 'Employee skill removed successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAllEmployeeSkills,
  getEmployeeSkillsByEmployeeId,
  assignSkillToEmployee,
  updateEmployeeSkill,
  removeEmployeeSkill,
};