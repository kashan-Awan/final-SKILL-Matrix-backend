const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { generateId } = require('../helpers/utils');

const getAllMachines = async (req, res) => {
  try {
    const { departmentId } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = 'SELECT m.*, d.name AS departmentName FROM machine m LEFT JOIN departments d ON m.departmentId = d.id AND d.is_deleted = 0 WHERE m.is_deleted = 0';
    if (departmentId && departmentId !== 'all') {
      query += ' AND m.departmentId = @departmentId';
      request.input('departmentId', sql.NVarChar(24), departmentId); // machine.departmentId is nvarchar(24)
    }
    query += ' ORDER BY m.name ASC';
    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Machines retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getMachineById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // machine._id is nvarchar(24)
      .query('SELECT * FROM machine WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'Machine not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createMachine = async (req, res) => {
  try {
    const { name, machineId, departmentId, type, manufacturer, model, status, specifications } = req.body;
    const _id = generateId();
    const now = new Date();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.NVarChar(24), _id) // machine._id is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('machineId', sql.NVarChar, machineId)
      .input('departmentId', sql.NVarChar(24), departmentId) // machine.departmentId is nvarchar(24)
      .input('type', sql.NVarChar, type)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('model', sql.NVarChar, model)
      .input('status', sql.NVarChar, status)
      .input('specifications', sql.NVarChar, specifications || null)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO machine
          (_id, name, machineId, departmentId, type, manufacturer, model, status, specifications, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@_id, @name, @machineId, @departmentId, @type, @manufacturer, @model, @status, @specifications, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'Machine created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, departmentId, type, manufacturer, model, status, specifications } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // machine._id is nvarchar(24)
      .input('name', sql.NVarChar, name)
      .input('departmentId', sql.NVarChar(24), departmentId) // machine.departmentId is nvarchar(24)
      .input('type', sql.NVarChar, type)
      .input('manufacturer', sql.NVarChar, manufacturer)
      .input('model', sql.NVarChar, model)
      .input('status', sql.NVarChar, status)
      .input('specifications', sql.NVarChar, specifications || null)
      .query(`
        UPDATE machine
        SET name = @name, departmentId = @departmentId, type = @type,
            manufacturer = @manufacturer, model = @model, status = @status,
            specifications = @specifications, updatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Machine not found');
    return sendSuccess(res, result.recordset[0], 'Machine updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteMachine = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // machine._id is nvarchar(24)
      .query(`
        UPDATE machine
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'Machine not found');
    return sendSuccess(res, null, 'Machine deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = { getAllMachines, getMachineById, createMachine, updateMachine, deleteMachine };
