const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');

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

module.exports = router;