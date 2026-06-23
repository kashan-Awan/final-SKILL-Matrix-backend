const express = require('express');
const router = express.Router();
const {
  getAllEmployeeSkills,
  getEmployeeSkillsByEmployeeId,
  assignSkillToEmployee,
  updateEmployeeSkill,
  removeEmployeeSkill,
} = require('../controllers/employeeSkill.controller');

router.get('/', getAllEmployeeSkills);
router.get('/:employeeId', getEmployeeSkillsByEmployeeId);
router.post('/', assignSkillToEmployee);
router.put('/:id', updateEmployeeSkill);
router.delete('/:id', removeEmployeeSkill);

module.exports = router;