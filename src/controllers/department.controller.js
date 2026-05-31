const crypto = require('crypto');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');

const generateId = () => crypto.randomBytes(12).toString('hex');

const validateDepartmentInput = (name) => {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return 'Department name is required and cannot be empty';
  }
  if (name.trim().length > 255) {
    return 'Department name cannot exceed 255 characters';
  }
  return null;
};

const getAllDepartments = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT * FROM departments WHERE is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Departments retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id.length !== 24) {
      return sendNotFound(res, 'Department not found');
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .query('SELECT * FROM departments WHERE id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Department not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;
    const validationError = validateDepartmentInput(name);
    if (validationError) return sendError(res, validationError, 400);
    const id = generateId();
    const now = new Date();
    const safeDescription = (description !== undefined && description !== '') ? description : null;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id',          sql.Char(24),         id)
      .input('name',        sql.NVarChar(255),     name.trim())
      .input('description', sql.NVarChar(sql.MAX), safeDescription)
      .input('now',         sql.DateTime2(7),      now)
      .query(`
        INSERT INTO departments
          (id, name, description, is_deleted, __v, created_at, updated_at)
        OUTPUT INSERTED.*
        VALUES (@id, @name, @description, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Department created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!id || id.length !== 24) {
      return sendNotFound(res, 'Department not found');
    }
    const validationError = validateDepartmentInput(name);
    if (validationError) return sendError(res, validationError, 400);
    const safeDescription = (description !== undefined && description !== '') ? description : null;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id',          sql.Char(24),         id)
      .input('name',        sql.NVarChar(255),     name.trim())
      .input('description', sql.NVarChar(sql.MAX), safeDescription)
      .query(`
        UPDATE departments
        SET name = @name, description = @description, updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Department not found');
    return sendSuccess(res, result.recordset[0], 'Department updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id.length !== 24) {
      return sendNotFound(res, 'Department not found');
    }
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .query(`
        UPDATE departments
        SET is_deleted = 1, updated_at = GETDATE()
        OUTPUT INSERTED.id
        WHERE id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Department not found');
    return sendSuccess(res, null, 'Department deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/departments/metrics
// Matches frontend DatabaseService.getDepartmentMetrics()
// Returns departments with employeeCount, averageProductivity, averageQualityScore, totalHoursWorked
const getDepartmentMetrics = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(`
        SELECT
          d.id,
          d.name,
          d.description,
          d.created_at,
          d.updated_at,
          COUNT(DISTINCT u._id)           AS employeeCount,
          AVG(CAST(wh.productivity   AS FLOAT)) AS averageProductivity,
          AVG(CAST(wh.qualityScore   AS FLOAT)) AS averageQualityScore,
          SUM(wh.hoursWorked)              AS totalHoursWorked
        FROM departments d
        LEFT JOIN dawlance_user u
          ON d.id = u.departmentId AND u.is_deleted = 0
        LEFT JOIN emploee_work_history wh
          ON d.id = wh.departmentId AND wh.is_deleted = 0
        WHERE d.is_deleted = 0
        GROUP BY d.id, d.name, d.description, d.created_at, d.updated_at
      `);
    return sendSuccess(res, result.recordset, 'Department metrics retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getDepartmentMetrics,
};