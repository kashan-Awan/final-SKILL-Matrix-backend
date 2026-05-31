const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const departmentRoutes = require('./department.routes');
const skillRoutes = require('./skill.routes');
const employeeSkillRoutes = require('./employeeSkill.routes');
const machineRoutes = require('./machine.routes');
const workHistoryRoutes = require('./workHistory.routes');
const skillMatrixRoutes = require('./skillMatrix.routes');
const exportLogRoutes = require('./exportLog.routes');
const dashboardRoutes = require('./dashboard.routes');
const adminRoutes = require('./admin.routes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/departments', departmentRoutes);
router.use('/skills', skillRoutes);
router.use('/employee-skills', employeeSkillRoutes);
router.use('/machines', machineRoutes);
router.use('/work-history', workHistoryRoutes);
router.use('/skill-matrix', skillMatrixRoutes);
router.use('/export-logs', exportLogRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);

// Health check
router.get('/health', (req, res) => res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() }));

// Default /api route
router.get('/', (req, res) => {
	res.json({
		message: 'API is running. See /api/health or other endpoints.'
	});
});

module.exports = router;
