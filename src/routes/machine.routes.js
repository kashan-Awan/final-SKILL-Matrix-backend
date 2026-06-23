const express = require('express');
const router = express.Router();
const {
  getAllMachines,
  getMachineById,
  createMachine,
  updateMachine,
  deleteMachine,
} = require('../controllers/machine.controller');

router.get('/', getAllMachines);
router.get('/:id', getMachineById);
router.post('/', createMachine);
router.put('/:id', updateMachine);
router.delete('/:id', deleteMachine);

module.exports = router;
