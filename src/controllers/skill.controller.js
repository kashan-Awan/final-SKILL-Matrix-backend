const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId } = require('../helpers/utils');

const getAllSkills = async (req, res) => {
  try {
    const { departmentId } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = 'SELECT s.*, d.name AS departmentName FROM skills s LEFT JOIN departments d ON s.departmentId = d.id AND d.is_deleted = 0 WHERE s.is_deleted = 0';
    if (departmentId && departmentId !== 'all') {
      query += ' AND s.departmentId = @departmentId';
      request.input('departmentId', sql.NVarChar(24), departmentId); // skills.departmentId is nvarchar(24)
    }
    query += ' ORDER BY s.name ASC';
    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Skills retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getSkillById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // skills._id is nvarchar(24)
      .query('SELECT * FROM skills WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Skill not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createSkill = async (req, res) => {
  try {
    const { name, description, category, isMachineRelated, isCritical, femaleEligible, departmentId } = req.body;
    const _id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.NVarChar(24), _id) // skills._id is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('category', sql.NVarChar, category)
      .input('isMachineRelated', sql.Bit, isMachineRelated ? 1 : 0)
      .input('isCritical', sql.Bit, isCritical ? 1 : 0)
      .input('femaleEligible', sql.Bit, femaleEligible ? 1 : 0)
      .input('departmentId', sql.NVarChar(24), departmentId) // skills.departmentId is nvarchar(24)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO skills
          (_id, name, description, category, isMachineRelated, isCritical, femaleEligible, departmentId, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @name, @description, @category, @isMachineRelated, @isCritical, @femaleEligible, @departmentId, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Skill created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, isMachineRelated, isCritical, femaleEligible, departmentId } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // skills._id is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('category', sql.NVarChar, category)
      .input('isMachineRelated', sql.Bit, isMachineRelated ? 1 : 0)
      .input('isCritical', sql.Bit, isCritical ? 1 : 0)
      .input('femaleEligible', sql.Bit, femaleEligible ? 1 : 0)
      .input('departmentId', sql.NVarChar(24), departmentId) // skills.departmentId is nvarchar(24)
      .query(`
        UPDATE skills
        SET name = @name, description = @description, category = @category,
            isMachineRelated = @isMachineRelated, isCritical = @isCritical,
            femaleEligible = @femaleEligible, departmentId = @departmentId, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Skill not found');
    return sendSuccess(res, result.recordset[0], 'Skill updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteSkill = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // skills._id is nvarchar(24)
      .query(`
        UPDATE skills
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Skill not found');
    return sendSuccess(res, null, 'Skill deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = { getAllSkills, getSkillById, createSkill, updateSkill, deleteSkill };
