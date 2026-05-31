const express = require('express');
const router = express.Router();

const blockAdmin = require('../middleware/blockAdmin');
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUsersWithDetails,
  getUsersFull,
} = require('../controllers/user.controller');

// GET /api/users?role=admin|manager|employee
router.get('/with-details', blockAdmin, getUsersWithDetails);
router.get('/full', blockAdmin, getUsersFull);        // all employees + skills map
router.get('/', blockAdmin, getAllUsers);
router.get('/:id', blockAdmin, getUserById);
router.post('/', blockAdmin, createUser);
router.put('/:id', blockAdmin, updateUser);
router.delete('/:id', blockAdmin, deleteUser);

module.exports = router;
