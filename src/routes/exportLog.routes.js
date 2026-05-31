const express = require('express');
const router = express.Router();
const {
  getAllExportLogs,
  getExportLogById,
  createExportLog,
  updateExportLogStatus,
  deleteExportLog,
} = require('../controllers/exportLog.controller');

router.get('/', getAllExportLogs);
router.get('/:id', getExportLogById);
router.post('/', createExportLog);
router.patch('/:id/status', updateExportLogStatus);
router.delete('/:id', deleteExportLog);

module.exports = router;
