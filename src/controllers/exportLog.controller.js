const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId } = require('../helpers/utils');

const getAllExportLogs = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT * FROM export_log WHERE is_deleted = 0 ORDER BY createdAt DESC');
    return sendSuccess(res, result.recordset, 'Export logs retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getExportLogById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .query('SELECT * FROM export_log WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Export log not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createExportLog = async (req, res) => {
  try {
    const { managerId, departmentId, exportType, fileName, filePath, status, recordCount, errorMessage } = req.body;
    const _id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.Char(24), _id)
      .input('managerId', sql.NVarChar, managerId)
      .input('departmentId', sql.NVarChar, departmentId)
      .input('exportType', sql.NVarChar, exportType)
      .input('fileName', sql.NVarChar, fileName)
      .input('filePath', sql.NVarChar, filePath)
      .input('status', sql.NVarChar, status || 'pending')
      .input('recordCount', sql.Int, recordCount || 0)
      .input('errorMessage', sql.NVarChar, errorMessage || null)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO export_log
          (_id, managerId, departmentId, exportType, fileName, filePath, status, recordCount, errorMessage, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @managerId, @departmentId, @exportType, @fileName, @filePath, @status, @recordCount, @errorMessage, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Export log created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateExportLogStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, recordCount, errorMessage } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .input('status', sql.NVarChar, status)
      .input('recordCount', sql.Int, recordCount != null ? recordCount : 0)
      .input('errorMessage', sql.NVarChar, errorMessage || null)
      .query(`
        UPDATE export_log
        SET status = @status, recordCount = @recordCount, errorMessage = @errorMessage, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Export log not found');
    return sendSuccess(res, result.recordset[0], 'Export log updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteExportLog = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Char(24), id)
      .query(`
        UPDATE export_log
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Export log not found');
    return sendSuccess(res, null, 'Export log deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = { getAllExportLogs, getExportLogById, createExportLog, updateExportLogStatus, deleteExportLog };
