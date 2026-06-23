const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
 
const blockAdmin = require('../middleware/blockAdmin');
const requireManagerOrAdmin = require('../middleware/requireManagerOrAdmin');

const {
  getAllUsers,
  getUserById,
  createUser,
  deleteUser,
  getUsersWithDetails,
  getUsersFull,
} = require('../controllers/user.controller');

const employeeSkillController = require('../controllers/employeeSkill.controller');
const machineAssignmentController = require('../controllers/machineAssignment.controller');
const employeeShiftController = require('../controllers/employeeShift.controller');

// ==================== EMPLOYEE SELF-SERVICE ENDPOINTS ====================

router.get('/profile', async (req, res) => {
  try {
    const pool = await getPool();
    const userId = (req.user.id || req.user._id || '').toString().trim();

    // 1. Fetch basic user info
    const userResult = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .query(`
        SELECT 
          u._id,
          u.name,
          u.email,
          u.role,
          u.employeeId,
          u.phone,
          u.gender,
          u.title,
          u.yearsExperience,
          u.hireDate,
          u.departmentId,
          d.name AS department,
          CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive -- Ensure isActive is a boolean-like value
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u._id = @id AND u.is_deleted = 0
      `);

    if (!userResult.recordset.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const employeeRaw = userResult.recordset[0];

    // 2. Fetch skills
    let skillsMap = {};
    let totalSkills = 0;
    let totalScore = 0;
    let advancedCount = 0;
    let skillsList = [];
    let avgLevel = 0;   // ✅ declared outside the try block

    try {
      const skillsResult = await pool
        .request()
        .input('employeeId', sql.NVarChar, userId)
        .query(`
          SELECT s.name AS skillName, es.level
          FROM employee_skills es
          INNER JOIN skills s ON es.skill_id = s._id
          WHERE es.employee_id = @employeeId AND es.is_deleted = 0 AND s.is_deleted = 0
        `);

      const levelToNumeric = (level) => {
        const l = (level || '').toLowerCase();
        if (l === 'expert' || l === 'advanced') return 4;
        if (l === 'high') return 3;
        if (l === 'medium') return 2;
        return 1;
      };

      for (const row of skillsResult.recordset) {
        skillsMap[row.skillName] = row.level;
        const numeric = levelToNumeric(row.level);
        totalScore += numeric;
        if (numeric === 4) advancedCount++;
      }
      totalSkills = skillsResult.recordset.length;
      avgLevel = totalSkills > 0 ? (totalScore / totalSkills).toFixed(1) : 0;
      skillsList = skillsResult.recordset.map(s => ({ name: s.skillName, level: s.level }));
    } catch (skillsErr) {
      console.error('Skills fetch error (non‑critical):', skillsErr.message);
      // fallback to empty values
    }

    // 3. Build the response object matching frontend expectations
    const employee = {
      _id: employeeRaw._id,
      id: employeeRaw._id,
      name: employeeRaw.name,
      email: employeeRaw.email,
      role: employeeRaw.role,
      employeeId: employeeRaw.employeeId,
      phone: employeeRaw.phone || '',
      gender: employeeRaw.gender || '',
      title: employeeRaw.title || '',
      yearsExperience: employeeRaw.yearsExperience || 0,
      hireDate: employeeRaw.hireDate,
      departmentId: employeeRaw.departmentId,
      department: employeeRaw.department || 'N/A',
      isActive: employeeRaw.isActive === 1,
      skills: skillsMap,
      totalSkills: totalSkills,
      totalScore: totalScore,
      avgLevel: parseFloat(avgLevel) || 0,
      advancedSkills: advancedCount,
      skillsList: skillsList,
      displayId: employeeRaw.employeeId || employeeRaw._id?.slice(-8) || ''
    };

    return res.json({ success: true, user: employee, data: employee });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const { phone, gender, hireDate, title, yearsExperience, departmentId } = req.body;
    const userId = (req.user.id || req.user._id || '').toString().trim();
    const pool = await getPool();

    await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .input('phone', sql.NVarChar, phone || null)
      .input('gender', sql.NVarChar, gender || null)
      .input('hireDate', sql.DateTime2, hireDate ? new Date(hireDate) : null)
      .input('title', sql.NVarChar, title || null)
      .input('departmentId', sql.NVarChar, departmentId || null)
      .input('yearsExperience', sql.Int, yearsExperience != null ? parseInt(yearsExperience) : null)
      .query(`
        UPDATE dawlance_user
        SET phone = @phone, gender = @gender, hireDate = @hireDate,
            title = @title, yearsExperience = @yearsExperience, departmentId = @departmentId, updatedAt = GETDATE()
        WHERE _id = @id AND is_deleted = 0
      `);

    const result = await pool
      .request()
      .input('id', sql.NVarChar, userId)
      .query(`
        SELECT u._id, u._id as id, u.name, u.email, u.role, u.employeeId, u.phone,
               u.gender, u.title, u.yearsExperience, u.hireDate,
               u.departmentId, d.name as department,
               CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND (d.is_deleted = 0 OR d.is_deleted IS NULL)
        WHERE u._id = @id
      `);

    if (!result.recordset || result.recordset.length === 0)
      return res.status(404).json({ success: false, message: 'User not found' });

    const updatedUser = result.recordset[0];
    return res.json({ 
      success: true, 
      user: updatedUser, 
      data: updatedUser, 
      message: 'Profile updated successfully' 
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/machines', async (req, res) => {
  try {
    const pool = await getPool();
    const userId = (req.user.id || req.user._id || '').toString().trim();

    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar, userId)
      .query(`
        SELECT m._id AS id, m.machineId, m.name, m.type, m.status, m.departmentId,
               em.assigned_date AS assignedDate
        FROM employee_machines em
        INNER JOIN machine m ON em.machine_id = m._id AND m.is_deleted = 0
        WHERE em.employee_id = @employeeId AND em.is_active = 1
      `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/shift', async (req, res) => {
  try {
    const pool = await getPool();
    const userId = (req.user.id || req.user._id || '').toString().trim();

    const result = await pool
      .request()
      .input('employeeId', sql.NVarChar, userId)
      .query(`
        SELECT TOP 1
          shift_type AS type,
          start_time AS startTime,
          end_time AS endTime,
          working_days AS days,
          supervisor_name AS supervisorName,
          hours_worked AS hoursWorked,
          productivity
        FROM employee_shifts
        WHERE employee_id = @employeeId AND is_active = 1
        ORDER BY created_at DESC
      `);
    if (result.recordset.length === 0) {
      return res.json({ success: true, data: null });
    }
    return res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== MANAGER & ADMIN CRUD ENDPOINTS ====================
router.get('/manager/employees/:employeeId/skills', requireManagerOrAdmin, employeeSkillController.getEmployeeSkillsByEmployeeId);
router.post('/manager/employee-skills', requireManagerOrAdmin, employeeSkillController.assignSkillToEmployee);
router.put('/manager/employee-skills/:id', requireManagerOrAdmin, employeeSkillController.updateEmployeeSkill);
router.delete('/manager/employee-skills/:id', requireManagerOrAdmin, employeeSkillController.removeEmployeeSkill);

router.get('/manager/employees/:employeeId/machines', requireManagerOrAdmin, machineAssignmentController.getAssignmentsByEmployee);
router.post('/manager/machine-assignments', requireManagerOrAdmin, machineAssignmentController.assignMachine);
router.put('/manager/machine-assignments/:id', requireManagerOrAdmin, machineAssignmentController.updateAssignment);
router.delete('/manager/machine-assignments/:id', requireManagerOrAdmin, machineAssignmentController.deleteAssignment);

router.get('/manager/employees/:employeeId/shift/active', requireManagerOrAdmin, employeeShiftController.getActiveShift);
router.get('/manager/employees/:employeeId/shifts', requireManagerOrAdmin, employeeShiftController.getShiftHistory);
router.post('/manager/employee-shifts', requireManagerOrAdmin, employeeShiftController.createShift);
router.put('/manager/employee-shifts/:id', requireManagerOrAdmin, employeeShiftController.updateShift);
router.delete('/manager/employee-shifts/:id', requireManagerOrAdmin, employeeShiftController.deactivateShift);

// ==================== MANAGEMENT ENDPOINTS (Non-Admin) ====================
router.get('/with-details', blockAdmin, getUsersWithDetails);
router.get('/full', blockAdmin, getUsersFull);
router.get('/', blockAdmin, getAllUsers);
router.get('/:id', blockAdmin, getUserById);
router.post('/', blockAdmin, createUser);
router.delete('/:id', blockAdmin, deleteUser);

module.exports = router;