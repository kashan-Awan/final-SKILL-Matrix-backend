const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');

const generateId = () => crypto.randomBytes(12).toString('hex');

// GET /api/users?role=admin|manager|employee
const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT
        u._id, u.employeeId, u.role, u.name, u.email, u.phone,
        u.departmentId, d.name AS department,
        u.gender, u.title, u.yearsExperience, u.hireDate,
        u.is_deleted, u.__v, u.createdAt, u.updatedAt,
        (SELECT COUNT(*) FROM employee_skills es WHERE es.employee_id = u._id AND es.is_deleted = 0) AS skillCount
      FROM dawlance_user u
      LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
      WHERE u.is_deleted = 0`;
    if (role) {
      query += ' AND UPPER(u.role) = UPPER(@role)';
      request.input('role', sql.NVarChar, role);
    }
    const result = await request.query(query);
    return sendSuccess(res, result.recordset, 'Users retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query('SELECT _id, employeeId, role, name, email, phone, departmentId, gender, title, yearsExperience, hireDate, is_deleted, __v, createdAt, updatedAt FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!result.recordset.length) return sendNotFound(res, 'User not found');
    return sendSuccess(res, result.recordset[0]);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createUser = async (req, res) => {
  try {
    const { employeeId, role, name, email, password, phone, departmentId, gender, title, yearsExperience, hireDate } = req.body;
    const _id = generateId();
    const now = new Date();
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('_id', sql.NVarChar, _id)
      .input('employeeId', sql.NVarChar, employeeId)
      .input('role', sql.NVarChar, role)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, hashedPassword)
      .input('phone', sql.NVarChar, phone || null)
      .input('departmentId', sql.NVarChar, departmentId || null)
      .input('gender', sql.NVarChar, gender || null)
      .input('title', sql.NVarChar, title || null)
      .input('yearsExperience', sql.Int, yearsExperience != null ? yearsExperience : null)
      .input('hireDate', sql.DateTime2, hireDate ? new Date(hireDate) : null)
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO dawlance_user
          (_id, employeeId, role, name, email, password, phone, departmentId, gender, title, yearsExperience, hireDate, is_deleted, __v, createdAt, updatedAt)
        OUTPUT INSERTED._id, INSERTED.employeeId, INSERTED.role, INSERTED.name, INSERTED.email, INSERTED.phone, INSERTED.departmentId, INSERTED.gender, INSERTED.title, INSERTED.yearsExperience, INSERTED.hireDate, INSERTED.is_deleted, INSERTED.__v, INSERTED.createdAt, INSERTED.updatedAt
        VALUES (@_id, @employeeId, @role, @name, @email, @password, @phone, @departmentId, @gender, @title, @yearsExperience, @hireDate, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'User created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, departmentId, gender, title, yearsExperience, hireDate, role } = req.body;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('phone', sql.NVarChar, phone || null)
      .input('departmentId', sql.NVarChar, departmentId || null)
      .input('gender', sql.NVarChar, gender || null)
      .input('title', sql.NVarChar, title || null)
      .input('yearsExperience', sql.Int, yearsExperience != null ? yearsExperience : null)
      .input('hireDate', sql.DateTime2, hireDate ? new Date(hireDate) : null)
      .input('role', sql.NVarChar, role)
      .query(`
        UPDATE dawlance_user
        SET name = @name, email = @email, phone = @phone, departmentId = @departmentId,
            gender = @gender, title = @title, yearsExperience = @yearsExperience,
            hireDate = @hireDate, role = @role, updatedAt = GETDATE()
        OUTPUT INSERTED._id, INSERTED.employeeId, INSERTED.role, INSERTED.name, INSERTED.email, INSERTED.phone, INSERTED.departmentId, INSERTED.gender, INSERTED.title, INSERTED.yearsExperience, INSERTED.hireDate, INSERTED.is_deleted, INSERTED.__v, INSERTED.createdAt, INSERTED.updatedAt
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'User not found');
    return sendSuccess(res, result.recordset[0], 'User updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar, id)
      .query(`
        UPDATE dawlance_user
        SET is_deleted = 1, updatedAt = GETDATE()
        OUTPUT INSERTED._id
        WHERE _id = @id AND is_deleted = 0
      `);
    if (!result.recordset.length) return sendNotFound(res, 'User not found');
    return sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/users/with-details
// Matches frontend DatabaseService.getEmployeesWithDetails()
// Returns each employee with departmentName, skillCount, averageSkillLevel (1-5 scale)
const getUsersWithDetails = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(`
        SELECT
          u._id            AS id,
          u.employeeId,
          u.name,
          u.email,
          u.role,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          u.departmentId,
          d.name           AS department,
          COUNT(es.id)     AS skillCount,
          AVG(CASE LOWER(es.level)
            WHEN 'low'      THEN 1.0
            WHEN 'medium'   THEN 2.0
            WHEN 'high'     THEN 3.0
            WHEN 'expert'   THEN 4.0
            WHEN 'advanced' THEN 5.0
            ELSE 0.0
          END)             AS averageSkillLevel
        FROM dawlance_user u
        LEFT JOIN departments d    ON u.departmentId = d.id AND d.is_deleted = 0
        LEFT JOIN employee_skills es ON u._id = es.employee_id AND es.is_deleted = 0
        WHERE u.is_deleted = 0
        GROUP BY
          u._id, u.employeeId, u.name, u.email, u.role,
          u.phone, u.gender, u.title, u.yearsExperience,
          u.hireDate, u.departmentId, d.name
      `);
    return sendSuccess(res, result.recordset, 'Users with details retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/users/full?id=xxx  (omit ?id for all employees)
// Returns employees with skills as { skillName: level } map — matches frontend employees route shape
const getUsersFull = async (req, res) => {
  try {
    const { id } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT
        u._id        AS id,
        u.employeeId,
        u.name,
        u.email,
        u.role,
        u.phone,
        u.gender,
        u.title,
        u.yearsExperience,
        u.hireDate,
        u.departmentId,
        d.name       AS department,
        es.id        AS employeeSkillId,
        es.skill_id  AS skillId,
        es.level,
        s.name       AS skillName
      FROM dawlance_user u
      LEFT JOIN departments d    ON u.departmentId = d.id   AND d.is_deleted  = 0
      LEFT JOIN employee_skills es ON u._id = es.employee_id AND es.is_deleted = 0
      LEFT JOIN skills s           ON es.skill_id = s._id   AND s.is_deleted  = 0
      WHERE u.is_deleted = 0
    `;
    if (id) {
      query += ' AND u._id = @id';
      request.input('id', sql.NVarChar, id);
    }

    const result = await request.query(query);

    const map = {};
    for (const row of result.recordset) {
      if (!map[row.id]) {
        map[row.id] = {
          id: row.id, employeeId: row.employeeId, name: row.name,
          email: row.email, role: row.role, phone: row.phone,
          gender: row.gender, title: row.title,
          yearsExperience: row.yearsExperience, hireDate: row.hireDate,
          departmentId: row.departmentId, department: row.department,
          skills: {},
        };
      }
      if (row.skillName && row.level && row.level !== 'None') {
        const normalized = row.level === 'Advanced' ? 'Expert' : row.level;
        map[row.id].skills[row.skillName] = normalized;
      }
    }

    const employees = Object.values(map).map((emp) => {
      const scores = Object.values(emp.skills).map((l) => {
        switch (l.toLowerCase()) {
          case 'expert': case 'advanced': return 4;
          case 'high': return 3;
          case 'medium': return 2;
          default: return 1;
        }
      });
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      let skillLevel = 'Low';
      if (avg >= 3.5) skillLevel = 'Expert';
      else if (avg >= 2.5) skillLevel = 'High';
      else if (avg >= 1.5) skillLevel = 'Medium';
      return { ...emp, skillLevel, totalSkills: scores.length };
    });

    if (id) {
      if (!employees.length) return sendNotFound(res, 'Employee not found');
      return sendSuccess(res, [employees[0]]);
    }
    return sendSuccess(res, employees, 'Employees retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, getUsersWithDetails, getUsersFull };
