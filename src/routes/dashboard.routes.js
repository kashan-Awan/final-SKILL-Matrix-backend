const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getDepartmentPerformance,
  getMachineScores,
  getHealth,
} = require('../controllers/dashboard.controller');

router.get('/stats', getDashboardStats);
router.get('/department-performance', getDepartmentPerformance);
router.get('/machine-scores', getMachineScores);
router.get('/health', getHealth);

module.exports = router;
