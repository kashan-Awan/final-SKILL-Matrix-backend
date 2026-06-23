const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId } = require('../helpers/utils');

const getAllWorkHistory = async (req, res) => {
  try {
    const { employeeId, department, days, limit } = req.query;
    const topN = Math.min(parseInt(limit) || 500, 1000);
    const pool = await getPool();
    const request = pool.request();

    let where = 'WHERE wh.is_deleted = 0';
    if (employeeId) {
      where += ' AND wh.employeeId = @employeeId';
      request.input('employeeId', sql.NVarChar(24), employeeId); // emploee_work_history.employeeId is nvarchar(24)
    }
    if (department) {
      where += ' AND d.name = @department';
      request.input('department', sql.NVarChar, department);
    }
    if (days) {
      where += ' AND wh.workDate >= DATEADD(DAY, -@days, GETDATE())';
      request.input('days', sql.Int, parseInt(days));
    }

    const query = `
      SELECT TOP ${topN}
        wh._id,
        wh.employeeId,
        u.name AS employeeName,
        u.title AS employeeTitle,
        d.name AS departmentName,
        m.name AS machineName,
        m.type AS machineType,
        s.name AS skillName,
        s.category AS skillCategory,
        wh.workDate,
        wh.hoursWorked,
        wh.productivity,
        wh.qualityScore,
        wh.notes,
        wh.shift,
        wh.createdAt
      FROM emploee_work_history wh
      LEFT JOIN dawlance_user u ON wh.employeeId = u._id AND u.is_deleted =0
      LEFT JOIN departments d ON wh.departmentId = d.id AND d.is_deleted = 0
      LEFT JOIN machine m ON wh.machineId = m._id AND m.is_deleted = 0
      LEFT JOIN skills s ON wh.skillId = s._id AND s.is_deleted = 0
      ${where}
      ORDER BY wh.workDate DESC
    `;

    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Work history retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getWorkHistoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // emploee_work_history._id is nvarchar(24)
      .query('SELECT * FROM emploee_work_history WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Work history record not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getWorkHistoryByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar(24), employeeId) // emploee_work_history.employeeId is nvarchar(24)
      .query('SELECT * FROM emploee_work_history WHERE employeeId = @employeeId AND is_deleted = 0 ORDER BY workDate DESC');
    return sendSuccess(res, result.recordset, 'Work history retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createWorkHistory = async (req, res) => {
  try {
    const { employeeId, departmentId, machineId, skillId, workDate, hoursWorked, productivity, qualityScore, notes, shift } = req.body;
    const _id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.NVarChar(24), _id) // emploee_work_history._id is nvarchar(24)
      .input('employeeId', sql.NVarChar(24), employeeId) // emploee_work_history.employeeId is nvarchar(24)
      .input('departmentId', sql.NVarChar(24), departmentId) // emploee_work_history.departmentId is nvarchar(24)
      .input('machineId', sql.NVarChar(24), machineId) // emploee_work_history.machineId is nvarchar(24)
      .input('skillId', sql.NVarChar(24), skillId) // emploee_work_history.skillId is nvarchar(24)
      .input('workDate', sql.DateTime2, new Date(workDate))
      .input('hoursWorked', sql.Int, hoursWorked)
      .input('productivity', sql.Int, productivity)
      .input('qualityScore', sql.Int, qualityScore)
      .input('notes', sql.NVarChar, notes || null)
      .input('shift', sql.NVarChar, shift)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO emploee_work_history
          (_id, employeeId, departmentId, machineId, skillId, workDate, hoursWorked, productivity, qualityScore, notes, shift, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @employeeId, @departmentId, @machineId, @skillId, @workDate, @hoursWorked, @productivity, @qualityScore, @notes, @shift, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Work history record created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateWorkHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { machineId, skillId, workDate, hoursWorked, productivity, qualityScore, notes, shift } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // emploee_work_history._id is nvarchar(24)
      .input('machineId', sql.NVarChar(24), machineId) // emploee_work_history.machineId is nvarchar(24)
      .input('skillId', sql.NVarChar(24), skillId) // emploee_work_history.skillId is nvarchar(24)
      .input('workDate', sql.DateTime2, new Date(workDate))
      .input('hoursWorked', sql.Int, hoursWorked)
      .input('productivity', sql.Int, productivity)
      .input('qualityScore', sql.Int, qualityScore)
      .input('notes', sql.NVarChar, notes || null)
      .input('shift', sql.NVarChar, shift)
      .query(`
        UPDATE emploee_work_history
        SET machineId = @machineId, skillId = @skillId, workDate = @workDate,
            hoursWorked = @hoursWorked, productivity = @productivity, qualityScore = @qualityScore,
            notes = @notes, shift = @shift, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Work history record not found');
    return sendSuccess(res, result.recordset[0], 'Work history updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteWorkHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // emploee_work_history._id is nvarchar(24)
      .query(`
        UPDATE emploee_work_history
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Work history record not found');
    return sendSuccess(res, null, 'Work history deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = {
  getAllWorkHistory,
  getWorkHistoryById,
  getWorkHistoryByEmployee,
  createWorkHistory,
  updateWorkHistory,
  deleteWorkHistory,
};
