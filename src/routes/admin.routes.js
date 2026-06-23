const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');

const {
  getAllUsersAdmin,
  adminDeleteUser,
  adminSetPassword,
  getPasswordRequests,
  approvePasswordRequest,
  rejectPasswordRequest,
  getAuditLog,
} = require('../controllers/admin.controller');

const {
  getCurrentUsers,
  getUserForEdit,
  updateUserByAdmin,
  deleteUserByAdmin,
  createUserByAdmin
} = require('../controllers/user.controller');

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users/current - Get all active users
router.get('/users/current', requireAdmin, getCurrentUsers);

// GET /api/admin/users/:id - Get single user for editing
router.get('/users/:id', requireAdmin, getUserForEdit);

// POST /api/admin/users - Create new user
router.post('/users', requireAdmin, createUserByAdmin);

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', requireAdmin, updateUserByAdmin);

// DELETE /api/admin/users/:id - Soft delete user
router.delete('/users/:id', requireAdmin, deleteUserByAdmin);

// GET /api/admin/users - Get all users with stats
router.get('/users', requireAdmin, getAllUsersAdmin);

// PATCH /api/admin/users/:id/set-password - Admin set user password
router.patch('/users/:id/set-password', requireAdmin, adminSetPassword);

// DELETE /api/admin/users/:id/perm - Permanent hard delete (use with caution)
router.delete('/users/:id/perm', requireAdmin, adminDeleteUser);

// ==================== PASSWORD CHANGE REQUESTS (Admin actions) ====================

// GET /api/admin/password-requests - Admin views all requests (supports ?status=pending etc.)
router.get('/password-requests', requireAdmin, getPasswordRequests);

// POST /api/admin/password-requests/:requestId/approve - Admin approves a request
router.post('/password-requests/:requestId/approve', requireAdmin, approvePasswordRequest);

// POST /api/admin/password-requests/:requestId/reject - Admin rejects a request
router.post('/password-requests/:requestId/reject', requireAdmin, rejectPasswordRequest);

// ==================== AUDIT LOG ====================

// GET /api/admin/audit-log - View audit trail
router.get('/audit-log', requireAdmin, getAuditLog);

module.exports = router;