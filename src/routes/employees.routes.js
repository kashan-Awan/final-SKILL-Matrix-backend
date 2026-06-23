const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');

// GET /api/employees - fetch all employees (protected)
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    // Join with departments to provide the department name and include necessary fields for the UI
    const result = await pool.request().query(`
      SELECT 
        u._id,
        u._id AS id,
        u.employeeId,
        u.name,
        u.email,
        u.role,
        u.title,
        u.departmentId,
        d.name AS department,
        CASE WHEN u.is_deleted = 0 THEN 1 ELSE 0 END AS isActive,
        u.createdAt,
        u.updatedAt,
        -- Provide a fallback displayId if employeeId is missing
        COALESCE(u.employeeId, RIGHT(CAST(u._id AS VARCHAR(36)), 8)) AS displayId,
        d.name AS departmentName
      FROM dawlance_user u
      LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0 -- departments.id is char(24)
      WHERE u.is_deleted = 0
      ORDER BY u.name ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('Error fetching employees:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;