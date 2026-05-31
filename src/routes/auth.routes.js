const express = require('express');
const router = express.Router();
const { 
  login, 
  validate, 
  resetPassword, 
  changePassword,
  forgotPassword          // ← ADDED
} = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/validate', validate);
router.post('/forgot-password', forgotPassword);  // ← ADDED
router.patch('/reset-password', resetPassword);
router.patch('/change-password', changePassword);

module.exports = router;

