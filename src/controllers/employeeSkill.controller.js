const crypto = require('crypto');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');

const generateId = () => crypto.randomBytes(12).toString('hex');

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
    const pool = await getPool();
    const result = await pool
      .request()
      .input('employee_id', sql.NVarChar, employeeId)
      .query('SELECT * FROM employee_skills WHERE employee_id = @employee_id AND is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Employee skills retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const assignSkillToEmployee = async (req, res) => {
  try {
    const { employee_id, skill_id, level, acquired_date, last_assessed_date, notes } = req.body;
    const id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .input('employee_id', sql.NVarChar, employee_id)
      .input('skill_id', sql.NVarChar, skill_id)
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
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
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
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
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
