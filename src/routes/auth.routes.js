const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/requireAuth'); // adjust path if needed
const { 
  login, 
  validate, 
  changePassword,
  resetPasswordDirect,
  submitPasswordRequest // Public password request submission
} = require('../controllers/auth.controller');

// Public routes (no authentication required)
router.post('/login', login);
router.post('/validate', validate);
router.post('/password-requests', submitPasswordRequest); // Public route for password change requests

// Protected routes (require valid token)
router.patch('/change-password', requireAuth, changePassword);
router.post('/reset-password-direct', requireAuth, resetPasswordDirect);  // ← added & protected

module.exports = router; 