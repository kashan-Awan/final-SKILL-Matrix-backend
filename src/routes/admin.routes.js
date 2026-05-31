const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const {
  getAllUsersAdmin,
  revealPassword,
  adminDeleteUser,
  adminSetPassword,
  getPasswordRequests,
  revealRequestPassword,
  approvePasswordRequest,
  rejectPasswordRequest,
  getAuditLog,
  submitPasswordRequest,
} = require('../controllers/admin.controller');

// ─── User management (all behind requireAdmin) ────────────────────────────────
// GET    /api/admin/users              — list all users + stats
// GET    /api/admin/users/:id/reveal-password
// PATCH  /api/admin/users/:id/set-password
// DELETE /api/admin/users/:id

router.get('/users',                          requireAdmin, getAllUsersAdmin);
router.get('/users/:id/reveal-password',      requireAdmin, revealPassword);
router.patch('/users/:id/set-password',       requireAdmin, adminSetPassword);
router.delete('/users/:id',                   requireAdmin, adminDeleteUser);

// ─── Password-change requests ─────────────────────────────────────────────────
// POST /api/admin/password-requests                        — user submits (no admin guard)
// GET  /api/admin/password-requests                        — admin views
// GET  /api/admin/password-requests/:requestId/reveal-password
// POST /api/admin/password-requests/:requestId/approve
// POST /api/admin/password-requests/:requestId/reject

router.post('/password-requests',                                   submitPasswordRequest);
router.get('/password-requests',                      requireAdmin, getPasswordRequests);
router.get('/password-requests/:requestId/reveal-password', requireAdmin, revealRequestPassword);
router.post('/password-requests/:requestId/approve',  requireAdmin, approvePasswordRequest);
router.post('/password-requests/:requestId/reject',   requireAdmin, rejectPasswordRequest);

// ─── Audit log ────────────────────────────────────────────────────────────────
// GET /api/admin/audit-log?page=1&limit=50

router.get('/audit-log', requireAdmin, getAuditLog);

module.exports = router;
