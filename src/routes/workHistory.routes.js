const express = require('express');
const router = express.Router();
const {
  getAllWorkHistory,
  getWorkHistoryById,
  getWorkHistoryByEmployee,
  createWorkHistory,
  updateWorkHistory,
  deleteWorkHistory,
} = require('../controllers/workHistory.controller');

router.get('/', getAllWorkHistory);
router.get('/employee/:employeeId', getWorkHistoryByEmployee);
router.get('/:id', getWorkHistoryById);
router.post('/', createWorkHistory);
router.put('/:id', updateWorkHistory);
router.delete('/:id', deleteWorkHistory);

module.exports = router;
