const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const employeesRoutes = require('./employees.routes');
const departmentRoutes = require('./department.routes');
const skillRoutes = require('./skill.routes');
const employeeSkillRoutes = require('./employeeSkill.routes');
const machineRoutes = require('./machine.routes');
const workHistoryRoutes = require('./workHistory.routes');
const skillMatrixRoutes = require('./skillMatrix.routes');
const exportLogRoutes = require('./exportLog.routes');
const dashboardRoutes = require('./dashboard.routes');
const adminRoutes = require('./admin.routes');
// const approvalRoutes = require('./approval.routes');  // DELETED – file removed
const registrationRoutes = require('./registration.routes'); // Keeping registration.routes.js

const { requireAuth } = require('../middleware/requireAuth');

// Public routes
router.use('/auth', authRoutes);
router.use('/auth', registrationRoutes);

// Public health check
router.get('/', (req, res) => {
  res.json({ success: true, message: 'API is running. See documentation for endpoints.' });
});

// All routes below require authentication
router.use(requireAuth);

// Protected routes
router.use('/users', userRoutes);
router.use('/employees', employeesRoutes);
router.use('/departments', departmentRoutes);
router.use('/skills', skillRoutes);
router.use('/employee-skills', employeeSkillRoutes);
router.use('/machines', machineRoutes);
router.use('/work-history', workHistoryRoutes);
router.use('/skill-matrix', skillMatrixRoutes);
router.use('/skills-mapping', skillMatrixRoutes); // Alias to match frontend URL
router.use('/export-logs', exportLogRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);

module.exports = router;