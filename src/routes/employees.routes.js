const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const requireManagerOrAdmin = require('../middleware/requireManagerOrAdmin');
const { updateUserByAdmin, deleteUserByAdmin } = require('../controllers/user.controller');

// GET /api/employees - fetch all employees with full details and skills (protected)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    // Fetch users with their details, departments, and employee skills joined
    const result = await pool.request().query(`
      SELECT 
        u._id        AS id,
        u.employeeId,
        u.name,
        u.email,
        u.role,
        u.title,
        u.departmentId,
        d.name       AS department,
        CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive,
        u.createdAt,
        u.updatedAt,
        COALESCE(u.employeeId, RIGHT(CAST(u._id AS VARCHAR(36)), 8)) AS displayId,
        d.name       AS departmentName,
        u.phone,
        u.gender,
        u.yearsExperience,
        u.hireDate,
        es.id        AS employeeSkillId,
        es.skill_id  AS skillId,
        es.level,
        s.name       AS skillName
      FROM dawlance_user u
      LEFT JOIN departments d    ON u.departmentId = d.id  AND d.is_deleted  = 0
      LEFT JOIN employee_skills es ON u._id = es.employee_id AND es.is_deleted = 0
      LEFT JOIN skills s           ON es.skill_id = s._id   AND s.is_deleted  = 0
      WHERE u.is_deleted = 0
    `);

    // Group skills per employee
    const map = {};
    for (const row of result.recordset) {
      if (!map[row.id]) {
        map[row.id] = {
          _id: row.id,
          id: row.id,
          employeeId: row.employeeId,
          name: row.name,
          email: row.email,
          role: row.role,
          title: row.title,
          departmentId: row.departmentId,
          department: row.department,
          isActive: row.isActive === 1,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          displayId: row.displayId,
          departmentName: row.departmentName,
          phone: row.phone,
          gender: row.gender,
          yearsExperience: row.yearsExperience,
          hireDate: row.hireDate,
          skills: {},
        };
      }
      if (row.skillName && row.level && row.level !== 'None') {
        const levelClean = row.level.trim().toUpperCase();
        // Normalize level (e.g. Advanced -> Expert)
        const normalized = levelClean === 'ADVANCED' ? 'Expert' : row.level.trim();
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

    // Sort employees by name alphabetically
    employees.sort((a, b) => a.name.localeCompare(b.name));

    return res.json({ success: true, data: employees });
  } catch (err) {
    console.error('Error fetching employees:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/employees - Create employee (Manager/Admin only)
router.post('/', requireManagerOrAdmin, async (req, res) => {
  try {
    const { name, displayId, gender, departmentId, skills } = req.body;

    if (!name || !displayId || !departmentId) {
      return res.status(400).json({ success: false, message: 'Name, displayId (card number), and departmentId are required' });
    }

    const pool = await getPool();

    // Check if employeeId (displayId) already exists
    const empCheck = await pool
      .request()
      .input('employeeId', sql.NVarChar, displayId.trim())
      .query('SELECT _id FROM dawlance_user WHERE employeeId = @employeeId OR _id = @employeeId');
    if (empCheck.recordset.length) {
      return res.status(400).json({ success: false, message: 'Employee ID (Card Number) already exists' });
    }

    const { generateId } = require('../helpers/utils');
    const newId = generateId();
    const finalId = newId.slice(0, 24); // Limit to 24 chars for Char(24) type check
    
    // Check if email already exists or use default
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@dawlance.com`;
    const emailCheck = await pool
      .request()
      .input('email', sql.NVarChar, email)
      .query('SELECT _id FROM dawlance_user WHERE email = @email');
    
    let finalEmail = email;
    if (emailCheck.recordset.length) {
      finalEmail = `${name.toLowerCase().replace(/\s+/g, '.')}.${displayId}@dawlance.com`;
    }

    // Hash default password 'Dawlance123'
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('Dawlance123', 12);
    const now = new Date();

    // Insert user into dawlance_user
    await pool
      .request()
      .input('id', sql.NVarChar(24), finalId)
      .input('employeeId', sql.NVarChar, displayId.trim())
      .input('name', sql.NVarChar, name.trim())
      .input('email', sql.NVarChar, finalEmail)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, 'EMPLOYEE')
      .input('departmentId', sql.NVarChar, departmentId.toString())
      .input('gender', sql.NVarChar, gender.toUpperCase())
      .input('now', sql.DateTime2, now)
      .query(`
        INSERT INTO dawlance_user (
          _id, employeeId, name, email, password, role,
          departmentId, phone, gender, title, yearsExperience, hireDate,
          is_deleted, __v, createdAt, updatedAt
        ) VALUES (
          @id, @employeeId, @name, @email, @password, @role,
          @departmentId, NULL, @gender, 'Production Worker', 0, @now,
          0, 0, @now, @now
        )
      `);

    // Insert skills if provided
    if (Array.isArray(skills) && skills.length > 0) {
      for (const skill of skills) {
        // Find skill ID by skill name
        const skillCheck = await pool
          .request()
          .input('name', sql.NVarChar, skill.name.trim())
          .query('SELECT _id FROM skills WHERE LOWER(name) = LOWER(@name) AND is_deleted = 0');
        
        let skillId;
        if (skillCheck.recordset.length) {
          skillId = skillCheck.recordset[0]._id;
        } else {
          // If skill doesn't exist, create it
          skillId = generateId();
          await pool
            .request()
            .input('_id', sql.NVarChar(24), skillId)
            .input('name', sql.NVarChar, skill.name.trim())
            .input('now', sql.DateTime2, now)
            .query(`
              INSERT INTO skills (
                _id, name, description, category, isMachineRelated,
                isCritical, femaleEligible, departmentId, is_deleted, __v, createdAt, updatedAt
              ) VALUES (
                @_id, @name, NULL, 'General', 0,
                0, 1, NULL, 0, 0, @now, @now
              )
            `);
        }

        const skillAssocId = generateId();
        await pool
          .request()
          .input('id', sql.NVarChar(24), skillAssocId)
          .input('employeeId', sql.NVarChar(24), finalId)
          .input('skillId', sql.NVarChar(24), skillId)
          .input('level', sql.NVarChar, skill.level)
          .input('now', sql.DateTime2, now)
          .query(`
            INSERT INTO employee_skills (
              id, employee_id, skill_id, level, acquired_date,
              last_assessed_date, notes, is_deleted, __v, created_at, updated_at
            ) VALUES (
              @id, @employeeId, @skillId, @level, @now,
              @now, NULL, 0, 0, @now, @now
            )
          `);
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        id: finalId,
        name,
        employeeId: displayId.trim(),
        gender: gender.toUpperCase(),
        departmentId,
        role: 'EMPLOYEE',
        isActive: true,
        hireDate: now.toISOString(),
      }
    });

  } catch (err) {
    console.error('Error creating employee:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/employees/:id - Update employee profile and skills (Manager/Admin only)
router.put('/:id', requireManagerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, displayId, gender, departmentId, skills } = req.body;

    if (!name || !displayId || !departmentId) {
      return res.status(400).json({ success: false, message: 'Name, displayId (card number), and departmentId are required' });
    }

    const pool = await getPool();

    // Check if target user exists and is not deleted
    const checkResult = await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .query('SELECT _id, role, is_deleted FROM dawlance_user WHERE _id = @id AND is_deleted = 0');
    if (!checkResult.recordset.length) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Check if employeeId (displayId) is in use by another user
    const empCheck = await pool
      .request()
      .input('employeeId', sql.NVarChar, displayId.trim())
      .input('id', sql.NVarChar(24), id)
      .query('SELECT _id FROM dawlance_user WHERE employeeId = @employeeId AND _id != @id');
    if (empCheck.recordset.length) {
      return res.status(400).json({ success: false, message: 'Employee ID (Card Number) is already in use by another account' });
    }

    // Update basic details in dawlance_user
    await pool
      .request()
      .input('id', sql.NVarChar(24), id)
      .input('name', sql.NVarChar, name.trim())
      .input('employeeId', sql.NVarChar, displayId.trim())
      .input('gender', sql.NVarChar, gender.toUpperCase())
      .input('departmentId', sql.NVarChar, departmentId.toString())
      .query(`
        UPDATE dawlance_user
        SET name = @name,
            employeeId = @employeeId,
            gender = @gender,
            departmentId = @departmentId,
            updatedAt = GETDATE()
        WHERE _id = @id
      `);

    // Soft delete all existing skills for this employee
    await pool
      .request()
      .input('employeeId', sql.NVarChar(24), id)
      .query('UPDATE employee_skills SET is_deleted = 1 WHERE employee_id = @employeeId');

    // Insert/update new skills
    if (Array.isArray(skills) && skills.length > 0) {
      const { generateId } = require('../helpers/utils');
      for (const skill of skills) {
        // Find skill ID by skill name
        const skillCheck = await pool
          .request()
          .input('name', sql.NVarChar, skill.name.trim())
          .query('SELECT _id FROM skills WHERE LOWER(name) = LOWER(@name) AND is_deleted = 0');
        
        let skillId;
        const now = new Date();
        if (skillCheck.recordset.length) {
          skillId = skillCheck.recordset[0]._id;
        } else {
          skillId = generateId();
          await pool
            .request()
            .input('_id', sql.NVarChar(24), skillId)
            .input('name', sql.NVarChar, skill.name.trim())
            .input('now', sql.DateTime2, now)
            .query(`
              INSERT INTO skills (
                _id, name, description, category, isMachineRelated,
                isCritical, femaleEligible, departmentId, is_deleted, __v, createdAt, updatedAt
              ) VALUES (
                @_id, @name, NULL, 'General', 0,
                0, 1, NULL, 0, 0, @now, @now
              )
            `);
        }

        // Check if there is an existing soft-deleted skill row we can reuse/restore, or insert new
        const existingSkillCheck = await pool
          .request()
          .input('employeeId', sql.NVarChar(24), id)
          .input('skillId', sql.NVarChar(24), skillId)
          .query('SELECT id FROM employee_skills WHERE employee_id = @employeeId AND skill_id = @skillId');

        if (existingSkillCheck.recordset.length) {
          const assocId = existingSkillCheck.recordset[0].id;
          await pool
            .request()
            .input('id', sql.NVarChar(24), assocId)
            .input('level', sql.NVarChar, skill.level)
            .query('UPDATE employee_skills SET level = @level, is_deleted = 0, updated_at = GETDATE() WHERE id = @id');
        } else {
          const skillAssocId = generateId();
          await pool
            .request()
            .input('id', sql.NVarChar(24), skillAssocId)
            .input('employeeId', sql.NVarChar(24), id)
            .input('skillId', sql.NVarChar(24), skillId)
            .input('level', sql.NVarChar, skill.level)
            .input('now', sql.DateTime2, now)
            .query(`
              INSERT INTO employee_skills (
                id, employee_id, skill_id, level, acquired_date,
                last_assessed_date, notes, is_deleted, __v, created_at, updated_at
              ) VALUES (
                @id, @employeeId, @skillId, @level, @now,
                @now, NULL, 0, 0, @now, @now
              )
            `);
        }
      }
    }

    return res.json({ success: true, message: 'Employee updated successfully' });

  } catch (err) {
    console.error('Error updating employee:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/employees/:id - Delete employee (Manager/Admin only)
router.delete('/:id', requireManagerOrAdmin, deleteUserByAdmin);

module.exports = router;