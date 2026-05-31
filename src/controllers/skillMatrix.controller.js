const crypto = require('crypto');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');

const generateId = () => crypto.randomBytes(12).toString('hex');

const getAllSkillMatrices = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT * FROM skill_matrix WHERE is_deleted = 0 ORDER BY createdAt DESC');
    return sendSuccess(res, result.recordset, 'Skill matrices retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getSkillMatrixById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM skill_matrix WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Skill matrix not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getSkillMatrixByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar, employeeId)
      .query('SELECT * FROM skill_matrix WHERE employeeId = @employeeId AND is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Skill matrix retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getSkillMatrixByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('departmentId', sql.NVarChar, departmentId)
      .query('SELECT * FROM skill_matrix WHERE departmentId = @departmentId AND is_deleted = 0');
    return sendSuccess(res, result.recordset, 'Skill matrix retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createSkillMatrix = async (req, res) => {
  try {
    const { departmentId, name, employeeId, description, matrixData, version, createdBy } = req.body;
    const _id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.NVarChar, _id)
      .input('departmentId', sql.NVarChar, departmentId)
      .input('name', sql.NVarChar, name)
      .input('employeeId', sql.NVarChar, employeeId)
      .input('description', sql.NVarChar, description || null)
      .input('matrixData', sql.NVarChar, matrixData ? JSON.stringify(matrixData) : null)
      .input('version', sql.NVarChar, version || '1.0')
      .input('createdBy', sql.NVarChar, createdBy)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO skill_matrix
          (_id, departmentId, name, employeeId, description, matrixData, version, isActive, createdBy, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @departmentId, @name, @employeeId, @description, @matrixData, @version, 1, @createdBy, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Skill matrix created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateSkillMatrix = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, matrixData, version, isActive } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('matrixData', sql.NVarChar, matrixData ? JSON.stringify(matrixData) : null)
      .input('version', sql.NVarChar, version)
      .input('isActive', sql.Bit, isActive != null ? isActive : 1)
      .query(`
        UPDATE skill_matrix
        SET name = @name, description = @description, matrixData = @matrixData,
            version = @version, isActive = @isActive, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Skill matrix not found');
    return sendSuccess(res, result.recordset[0], 'Skill matrix updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteSkillMatrix = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query(`
        UPDATE skill_matrix
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Skill matrix not found');
    return sendSuccess(res, null, 'Skill matrix deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAllSkillMatrices,
  getSkillMatrixById,
  getSkillMatrixByEmployee,
  getSkillMatrixByDepartment,
  createSkillMatrix,
  updateSkillMatrix,
  deleteSkillMatrix,
};
