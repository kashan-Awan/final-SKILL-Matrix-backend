const express = require('express');
const router = express.Router();
const {
  getAllSkillMatrices,
  getSkillMatrixById,
  getSkillMatrixByEmployee,
  getSkillMatrixByDepartment,
  createSkillMatrix,
  updateSkillMatrix,
  deleteSkillMatrix,
} = require('../controllers/skillMatrix.controller');

router.get('/', getAllSkillMatrices);
router.get('/employee/:employeeId', getSkillMatrixByEmployee);
router.get('/department/:departmentId', getSkillMatrixByDepartment);
router.get('/:id', getSkillMatrixById);
router.post('/', createSkillMatrix);
router.put('/:id', updateSkillMatrix);
router.delete('/:id', deleteSkillMatrix);

module.exports = router;
