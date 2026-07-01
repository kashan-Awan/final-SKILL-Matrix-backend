const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError, sendNotFound } = require('../helpers/responseHelper');
const { logAdminAction } = require('../helpers/auditLogger'); // Import centralized audit logger
const { generateId } = require('../helpers/utils');

const BCRYPT_ROUNDS = 12;

// ==================== PUBLIC / SELF-SERVICE ====================

const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let query = `
      SELECT
        u._id AS id, u.employeeId, u.role, u.name, u.email, u.phone,
        u.departmentId, d.name AS department,
        u.gender, u.title, u.yearsExperience, u.hireDate,
        u.is_deleted, 
        CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive,
        u.__v, u.createdAt, u.updatedAt,
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
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .query('SELECT _id AS id, employeeId, role, name, email, phone, departmentId, gender, title, yearsExperience, hireDate, is_deleted, __v, createdAt, updatedAt FROM dawlance_user WHERE _id = @id');
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
    const hashedPassword = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;

    const pool = await getPool();

    // Check for existing user to prevent primary key/unique constraint violations
    const emailClean = email.trim().toLowerCase();
    const empIdClean = employeeId.trim();
    const check = await pool.request()
      .input('email', sql.NVarChar, emailClean)
      .input('empId', sql.NVarChar, empIdClean)
      .query(`
        SELECT 
          (SELECT COUNT(*) FROM dawlance_user WHERE LOWER(LTRIM(RTRIM(email))) = @email) AS emailExists,
          (SELECT COUNT(*) FROM dawlance_user WHERE employeeId = @empId) AS empIdExists
      `);

    const { emailExists, empIdExists } = check.recordset[0];
    if (emailExists > 0) return sendError(res, 'Email already registered', 400);
    if (empIdExists > 0) return sendError(res, 'Employee ID already exists', 400);

    const result = await pool
      .request()
      .input('_id', sql.NVarChar(24), _id) // dawlance_user._id is nvarchar(24)
      .input('employeeId', sql.NVarChar, empIdClean)
      .input('role', sql.NVarChar, role)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, emailClean)
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
        OUTPUT INSERTED._id AS id, INSERTED.employeeId, INSERTED.role, INSERTED.name, INSERTED.email, INSERTED.phone, INSERTED.departmentId, INSERTED.gender, INSERTED.title, INSERTED.yearsExperience, INSERTED.hireDate, INSERTED.is_deleted, INSERTED.__v, INSERTED.createdAt, INSERTED.updatedAt
        VALUES (@_id, @employeeId, @role, @name, @email, @password, @phone, @departmentId, @gender, @title, @yearsExperience, @hireDate, 0, 0, @now, @now)
      `);
    return sendSuccess(res, result.recordset[0], 'User created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .query(`
        UPDATE dawlance_user
        SET is_deleted = 1, updatedAt = GETDATE()
        WHERE _id = @id AND is_deleted = 0
      `);
    return sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// ==================== USERS WITH DETAILS (aggregated metrics) ====================
const getUsersWithDetails = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
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
        AVG(CASE UPPER(LTRIM(RTRIM(es.level)))
          WHEN 'LOW'      THEN 1.0
          WHEN 'MEDIUM'   THEN 2.0
          WHEN 'HIGH'     THEN 3.0
          WHEN 'EXPERT'   THEN 4.0
          WHEN 'ADVANCED' THEN 4.0
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

// ==================== USERS FULL (with nested skills object) ====================
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
      LEFT JOIN departments d    ON u.departmentId = d.id  AND d.is_deleted  = 0
      LEFT JOIN employee_skills es ON u._id = es.employee_id AND es.is_deleted = 0
      LEFT JOIN skills s           ON es.skill_id = s._id   AND s.is_deleted  = 0
      WHERE u.is_deleted = 0
    `;
    if (id) {
      query += ' AND u._id = @id';
      request.input('id', sql.Char(24), id);
    }

    const result = await request.query(query);

    // Group skills per employee
    const map = {};
    for (const row of result.recordset) {
      if (!map[row.id]) {
        map[row.id] = {
          id: row.id,
          employeeId: row.employeeId,
          name: row.name,
          email: row.email,
          role: row.role,
          phone: row.phone,
          gender: row.gender,
          title: row.title,
          yearsExperience: row.yearsExperience,
          hireDate: row.hireDate,
          departmentId: row.departmentId,
          department: row.department,
          skills: {},
        };
      }
      if (row.skillName && row.level && row.level !== 'None') {
        // Normalize level to match frontend expectations (Case-insensitive)
        const levelClean = row.level.trim().toUpperCase();
        const normalized = levelClean === 'ADVANCED' ? 'Expert' : row.level;
        map[row.id].skills[row.skillName] = normalized;
      }
    }

    // Compute skillLevel and totalSkills
    const employees = Object.values(map).map((emp) => {
      const scores = Object.values(emp.skills).map((l) => {
        const levelUpper = l.trim().toUpperCase();
        if (levelUpper === 'EXPERT' || levelUpper === 'ADVANCED') return 4;
        if (levelUpper === 'HIGH') return 3;
        if (levelUpper === 'MEDIUM') return 2;
        if (levelUpper === 'LOW') return 1;
        return 0;
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

// ==================== ADMIN USER MANAGEMENT ====================

const getCurrentUsers = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query(`
        SELECT 
          u._id AS id,
          u.employeeId,
          u.name,
          u.email,
          u.role,
          u.departmentId,
          d.name AS department,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          u.createdAt,
          u.is_deleted AS is_deleted,
          CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS is_active
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        ORDER BY u.is_deleted ASC, u.createdAt DESC
      `);
    return sendSuccess(res, result.recordset, 'All users retrieved');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const getUserForEdit = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(24), id) // dawlance_user._id is nvarchar(24)
      .query(`
        SELECT 
          u._id AS id,
          u.employeeId,
          u.name,
          u.email,
          u.role,
          u.departmentId,
          d.name AS department,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u._id = @id
      `);
    if (!result.recordset.length) return sendNotFound(res, 'User not found');
    return sendSuccess(res, result.recordset[0], 'User retrieved');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const updateUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, departmentId, phone, gender, title, yearsExperience, hireDate, isActive } = req.body;
    const adminId = req.user?.id;
    const pool = await getPool();

    const checkResult = await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .query('SELECT _id, email, is_deleted FROM dawlance_user WHERE _id = @id');
    if (!checkResult.recordset.length) return sendNotFound(res, 'User not found');

    // If isActive is not provided in body, keep current database status
    const isDeletedValue = (isActive === undefined) ? checkResult.recordset[0].is_deleted : (isActive ? 0 : 1);

    if (email) {
      const emailCheck = await pool
        .request()
        .input('email', sql.NVarChar, email.trim().toLowerCase())
        .input('id', sql.NVarChar(24), id)
        .query('SELECT _id FROM dawlance_user WHERE LOWER(LTRIM(RTRIM(email))) = @email AND _id != @id');
      if (emailCheck.recordset.length) {
        return sendError(res, 'Email already in use by another user', 400);
      }
    }

    await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email ? email.trim().toLowerCase() : null)
      .input('role', sql.NVarChar, role ? role.toUpperCase() : null)
      .input('departmentId', sql.NVarChar, departmentId || null)
      .input('phone', sql.NVarChar, phone || null)
      .input('gender', sql.NVarChar, gender || null)
      .input('title', sql.NVarChar, title || null)
      .input('yearsExperience', sql.Int, yearsExperience || null)
      .input('hireDate', sql.DateTime2, hireDate ? new Date(hireDate) : null)
      .input('isDeleted', sql.Bit, isDeletedValue)
      .query(`
        UPDATE dawlance_user
        SET name = @name,
            email = @email,
            role = @role,
            departmentId = @departmentId,
            phone = @phone,
            gender = @gender,
            title = @title,
            yearsExperience = @yearsExperience,
            hireDate = @hireDate,
            is_deleted = @isDeleted,
            updatedAt = GETDATE()
        WHERE _id = @id
      `);

    if (adminId) {
      const changes = Object.keys(req.body).filter(key => req.body[key] !== undefined);
      await logAdminAction({
        actorId: adminId,
        action: 'user_updated',
        targetId: id,
        metadata: { 
          updatedFields: changes, 
          newStatus: isActive ? 'active' : 'inactive',
          targetEmail: email || checkResult.recordset[0].email 
        }
      });
    }

    return sendSuccess(res, null, 'User updated successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user?.id;
    if (id === adminId) {
      return sendError(res, 'Admin cannot delete their own account', 400);
    }

    const pool = await getPool();
    const checkResult = await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .query('SELECT _id, role, email FROM dawlance_user WHERE _id = @id');
    if (!checkResult.recordset.length) return sendNotFound(res, 'User not found');

    const user = checkResult.recordset[0];
    if (user.role === 'ADMIN') {
      return sendError(res, 'Cannot delete admin account', 400);
    }

    await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .query(`
        UPDATE dawlance_user
        SET is_deleted = 1, updatedAt = GETDATE()
        WHERE _id = @id
      `);

    if (adminId) {
      await logAdminAction({
        actorId: adminId,
        action: 'user_deleted',
        targetId: id,
        metadata: { deletedEmail: user.email, deletedRole: user.role }
      });
    }

    return sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

const createUserByAdmin = async (req, res) => {
  try {
    const { employeeId, name, email, password, role, departmentId, phone, gender, title, yearsExperience, hireDate } = req.body;
    const adminId = req.user?.id;

    if (!name || !email || !password || !role) {
      return sendError(res, 'Name, email, password, and role are required', 400);
    }
    if (password.length < 6) {
      return sendError(res, 'Password must be at least 6 characters', 400);
    }

    const pool = await getPool();
    const emailCheck = await pool
      .request()
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .query('SELECT _id FROM dawlance_user WHERE LOWER(LTRIM(RTRIM(email))) = @email');
    if (emailCheck.recordset.length) {
      return sendError(res, 'Email already exists', 400);
    }

    if (employeeId) {
      const empCheck = await pool
        .request()
        .input('employeeId', sql.NVarChar, employeeId)
        .query('SELECT _id FROM dawlance_user WHERE employeeId = @employeeId');
      if (empCheck.recordset.length) {
        return sendError(res, 'Employee ID already exists', 400);
      }
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newId = generateId();

    await pool
      .request()
      .input('id', sql.Char(24), newId)
      .input('employeeId', sql.NVarChar, employeeId || newId.slice(0, 10))
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email.trim().toLowerCase())
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, role.toUpperCase())
      .input('departmentId', sql.NVarChar, departmentId || null)
      .input('phone', sql.NVarChar, phone || null)
      .input('gender', sql.NVarChar, gender || null)
      .input('title', sql.NVarChar, title || null)
      .input('yearsExperience', sql.Int, yearsExperience || null)
      .input('hireDate', sql.DateTime2, hireDate ? new Date(hireDate) : null)
      .query(`
        INSERT INTO dawlance_user (
          _id, employeeId, name, email, password, role,
          departmentId, phone, gender, title, yearsExperience, hireDate,
          is_deleted, __v, createdAt, updatedAt
        ) VALUES (
          @id, @employeeId, @name, @email, @password, @role,
          @departmentId, @phone, @gender, @title, @yearsExperience, @hireDate,
          0, 0, GETDATE(), GETDATE()
        )
      `);

    if (adminId) {
      await logAdminAction({
        actorId: adminId,
        action: 'user_created',
        targetId: newId,
        metadata: { createdEmail: email, createdRole: role }
      });
    }

    return sendSuccess(res, { id: newId }, 'User created successfully', 201);
  } catch (err) {
    return sendError(res, err.message);
  }
};

module.exports = { 
  getAllUsers, 
  getUserById, 
  createUser, 
  deleteUser, 
  getUsersWithDetails, 
  getUsersFull,
  getCurrentUsers,
  getUserForEdit,
  updateUserByAdmin,
  deleteUserByAdmin,
  createUserByAdmin
};
