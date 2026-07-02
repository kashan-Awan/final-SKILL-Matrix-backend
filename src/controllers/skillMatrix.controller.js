const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId } = require('../helpers/utils');

const getAllSkillMatrices = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(`
        SELECT sm.*, sm._id AS id, d.name AS departmentName, u.name AS employeeName
        FROM skill_matrix sm
        LEFT JOIN departments d ON sm.departmentId = d.id AND d.is_deleted = 0
        LEFT JOIN dawlance_user u ON sm.employeeId = u._id AND u.is_deleted = 0
        WHERE sm.is_deleted = 0 
        ORDER BY sm.createdAt DESC
      `);
    
    const parsedData = result.recordset.map(row => ({
      ...row,
      matrixData: (() => {
        if (!row.matrixData) return null;
        try {
          return JSON.parse(row.matrixData);
        } catch (e) {
          console.error("JSON Parse Error in getAll:", e);
          return null;
        }
      })()
    }));

    return sendSuccess(res, parsedData, 'Skill matrices retrieved successfully');
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
      .input('id', sql.NVarChar(24), id) // skill_matrix._id is nvarchar(24)
      .query(`
        SELECT sm.*, sm._id AS id, d.name AS departmentName, u.name AS employeeName
        FROM skill_matrix sm
        LEFT JOIN departments d ON sm.departmentId = d.id AND d.is_deleted = 0
        LEFT JOIN dawlance_user u ON sm.employeeId = u._id AND u.is_deleted = 0
        WHERE sm._id = @id AND sm.is_deleted = 0
      `);
    
    if (!result.recordset.length) return sendNotFound(res, 'Skill matrix not found');
    
    const matrix = result.recordset[0];
    if (matrix.matrixData) {
      try {
        matrix.matrixData = JSON.parse(matrix.matrixData);
      } catch (e) { console.error("JSON Parse Error:", e); }
    }

    return sendSuccess(res, matrix);
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
      .input('employeeId', sql.NVarChar(24), employeeId) // skill_matrix.employeeId is nvarchar(24)
      .query(`
        SELECT sm.*, sm._id AS id, d.name AS departmentName, u.name AS employeeName
        FROM skill_matrix sm
        LEFT JOIN departments d ON sm.departmentId = d.id AND d.is_deleted = 0
        LEFT JOIN dawlance_user u ON sm.employeeId = u._id AND u.is_deleted = 0
        WHERE sm.employeeId = @employeeId AND sm.is_deleted = 0
      `);
    
    const parsedData = result.recordset.map(row => ({
      ...row,
      matrixData: (() => {
        if (!row.matrixData) return null;
        try {
          return JSON.parse(row.matrixData);
        } catch (e) {
          console.error("JSON Parse Error in getByEmployee:", e);
          return null;
        }
      })()
    }));
    return sendSuccess(res, parsedData, 'Skill matrix retrieved successfully');
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
      .input('departmentId', sql.NVarChar(24), departmentId) // skill_matrix.departmentId is nvarchar(24)
      .query(`
        SELECT sm.*, sm._id AS id, d.name AS departmentName, u.name AS employeeName
        FROM skill_matrix sm
        LEFT JOIN departments d ON sm.departmentId = d.id AND d.is_deleted = 0
        LEFT JOIN dawlance_user u ON sm.employeeId = u._id AND u.is_deleted = 0
        WHERE sm.departmentId = @departmentId AND sm.is_deleted = 0
      `);
    
    const parsedData = result.recordset.map(row => ({
      ...row,
      matrixData: (() => {
        if (!row.matrixData) return null;
        try {
          return JSON.parse(row.matrixData);
        } catch (e) {
          console.error("JSON Parse Error in getByDepartment:", e);
          return null;
        }
      })()
    }));
    return sendSuccess(res, parsedData, 'Skill matrix retrieved successfully');
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
      .input('_id', sql.NVarChar(24), _id) // skill_matrix._id is nvarchar(24)
      .input('departmentId', sql.NVarChar(24), departmentId) // skill_matrix.departmentId is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('employeeId', sql.NVarChar(24), employeeId) // skill_matrix.employeeId is nvarchar(24)
      .input('description', sql.NVarChar, description || null)
      .input('matrixData', sql.NVarChar, matrixData ? JSON.stringify(matrixData) : null)
      .input('version', sql.NVarChar, version || '1.0')
      .input('createdBy', sql.NVarChar(24), createdBy) // skill_matrix.createdBy is nvarchar(24)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO skill_matrix
          (_id, departmentId, name, employeeId, description, matrixData, version, isActive, createdBy, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @departmentId, @name, @employeeId, @description, @matrixData, @version, 1, @createdBy, 0, 0, @now, @now)
      `);
    
    const created = result.recordset[0];
    if (created.matrixData) {
      created.matrixData = JSON.parse(created.matrixData);
    }
    created.id = created._id;

    return sendSuccess(res, created, 'Skill matrix created successfully', 201);
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
      .input('id', sql.NVarChar(24), id) // skill_matrix._id is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('matrixData', sql.NVarChar, matrixData ? JSON.stringify(matrixData) : null)
      .input('version', sql.NVarChar, version || null)
      .input('isActive', sql.Bit, isActive != null ? isActive : 1)
      .query(`
        UPDATE skill_matrix
        SET name = @name, description = @description, matrixData = @matrixData,
            version = COALESCE(@version, version), isActive = @isActive, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);

    if (!result.recordset.length) return sendNotFound(res, 'Skill matrix not found');
    
    const updated = result.recordset[0];
    if (updated.matrixData) {
      updated.matrixData = JSON.parse(updated.matrixData);
    }
    updated.id = updated._id;

    return sendSuccess(res, updated, 'Skill matrix updated successfully');
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
      .input('id', sql.NVarChar(24), id) // skill_matrix._id is nvarchar(24)
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
