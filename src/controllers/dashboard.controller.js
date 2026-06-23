const { getPool, sql } = require('../config/db');
const { sendSuccess, sendError } = require('../helpers/responseHelper');

// GET /api/dashboard/stats
// Matches frontend dashboard/stats route shape
const getDashboardStats = async (req, res) => {
  try {
    const pool = await getPool();

    const [empCount, deptCount, skillCount, byDept, skillLevels, genders] = await Promise.all([
      pool.request().query(`
        SELECT COUNT(u._id) AS count 
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u.is_deleted = 0 AND d.is_deleted = 0 AND UPPER(u.role) IN ('EMPLOYEE','MANAGER')`),
      pool.request().query("SELECT COUNT(*) AS count FROM departments WHERE is_deleted = 0"),
      pool.request().query("SELECT COUNT(*) AS count FROM skills WHERE is_deleted = 0"),
      pool.request().query(`
        SELECT d.name AS department, COUNT(u._id) AS count
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u.is_deleted = 0 AND d.is_deleted = 0 AND UPPER(u.role) IN ('EMPLOYEE','MANAGER')
        GROUP BY d.name
      `),
      pool.request().query(`
        SELECT UPPER(LTRIM(RTRIM(es.level))) AS level, COUNT(es.id) AS count
        FROM employee_skills es
        JOIN dawlance_user u ON es.employee_id = u._id
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE es.is_deleted = 0 AND u.is_deleted = 0 AND d.is_deleted = 0
        GROUP BY UPPER(LTRIM(RTRIM(es.level)))
      `),
      pool.request().query(`
        SELECT u.gender, COUNT(u._id) AS count
        FROM dawlance_user u
        LEFT JOIN departments d ON u.departmentId = d.id AND d.is_deleted = 0
        WHERE u.is_deleted = 0 AND d.is_deleted = 0 AND UPPER(u.role) IN ('EMPLOYEE','MANAGER') AND u.gender IS NOT NULL AND u.gender != ''
        GROUP BY u.gender
      `),
    ]);

    return sendSuccess(res, {
      overview: {
        totalEmployees:  empCount.recordset[0].count,
        totalDepartments: deptCount.recordset[0].count,
        totalSkills:     skillCount.recordset[0].count,
        lastUpdated:     new Date().toISOString(),
      },
      distributions: {
        departments: byDept.recordset,
        skillLevels: skillLevels.recordset,
        genders:     genders.recordset,
      },
    }, 'Dashboard stats retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/dashboard/department-performance?year=2026
// Returns monthly performance per department from work history
const getDepartmentPerformance = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const pool = await getPool();
    const result = await pool
      .request()
      .input('year', sql.Int, year)
      .query(`
        SELECT
          MONTH(wh.workDate)               AS month,
          d.name                           AS departmentName,
          AVG(CAST(wh.productivity AS FLOAT) * 0.5 + CAST(wh.qualityScore AS FLOAT) * 0.5) AS score
        FROM emploee_work_history wh
        LEFT JOIN departments d ON wh.departmentId = d.id AND d.is_deleted = 0
        WHERE wh.is_deleted = 0 AND YEAR(wh.workDate) = @year
        GROUP BY MONTH(wh.workDate), d.id, d.name
        ORDER BY month ASC
      `);

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const byMonth = {};
    for (const row of result.recordset) {
      const monthLabel = monthNames[row.month - 1];
      if (!byMonth[monthLabel]) byMonth[monthLabel] = { month: monthLabel };
      byMonth[monthLabel][row.departmentName] = parseFloat((row.score || 0).toFixed(2));
    }
    const data = Object.values(byMonth);

    return sendSuccess(res, data, 'Department performance retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/dashboard/machine-scores?departmentId=xxx
// Returns machine skill scores — matches frontend department-machine-scores route
const getMachineScores = async (req, res) => {
  try {
    const { departmentId } = req.query;
    const pool = await getPool();
    const request = pool.request();

    let deptFilter = '';
    if (departmentId) {
      deptFilter = 'AND m.departmentId = @departmentId';
      request.input('departmentId', sql.NVarChar, departmentId);
    }

    const result = await request.query(`
      SELECT
        m._id        AS machineId,
        m.name       AS machineName,
        m.type       AS machineType,
        m.status,
        d.id         AS departmentId,
        d.name       AS departmentName,
        COUNT(DISTINCT u._id)  AS operatorCount,
        ISNULL(AVG(CAST(
          CASE UPPER(LTRIM(RTRIM(es.level)))
            WHEN 'LOW'      THEN 1
            WHEN 'MEDIUM'   THEN 2
            WHEN 'HIGH'     THEN 3
            WHEN 'ADVANCED' THEN 4
            WHEN 'EXPERT'   THEN 4
            ELSE 0
          END AS FLOAT)), 0) AS avgSkillScore
      FROM machine m
      LEFT JOIN departments d    ON m.departmentId = d.id AND d.is_deleted = 0
      LEFT JOIN dawlance_user u  ON u.departmentId = m.departmentId AND u.is_deleted = 0
      LEFT JOIN employee_skills es ON es.employee_id = u._id AND es.is_deleted = 0
      WHERE m.is_deleted = 0 AND d.is_deleted = 0 ${deptFilter}
      GROUP BY m._id, m.name, m.type, m.status, d.id, d.name
      ORDER BY d.name, m.name
    `);

    return sendSuccess(res, result.recordset, 'Machine scores retrieved successfully');
  } catch (err) {
    return sendError(res, err.message);
  }
};

// GET /api/dashboard/health
const getHealth = async (req, res) => {
  try {
    const pool = await getPool();
    const [emp, dept] = await Promise.all([
      pool.request().query('SELECT COUNT(*) AS employeeCount FROM dawlance_user WHERE is_deleted = 0'),
      pool.request().query('SELECT COUNT(*) AS departmentCount FROM departments WHERE is_deleted = 0'),
    ]);
    return sendSuccess(res, {
      status: 'connected',
      message: 'Database connection is healthy',
      employeeCount:   emp.recordset[0].employeeCount,
      departmentCount: dept.recordset[0].departmentCount,
      timestamp:       new Date().toISOString(),
    });
  } catch (err) {
    return sendError(res, err.message, 503);
  }
};

module.exports = { getDashboardStats, getDepartmentPerformance, getMachineScores, getHealth };
