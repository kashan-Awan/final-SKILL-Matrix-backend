const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const { requireAuth } = require('../middleware/requireAuth');
const {
  submitRegistrationRequest,
  getRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
  getRegistrationStats
} = require('../controllers/registration.controller');

// ==================== PUBLIC ROUTES (No authentication required) ====================

// POST /api/auth/register - User submits registration request
// Anyone can register - request goes to admin for approval
router.post('/register', submitRegistrationRequest);

// ==================== ADMIN ONLY ROUTES ====================

// GET /api/auth/registrations - Get all registration requests (pending/approved/rejected)
// Query params: ?status=pending|approved|rejected (default: pending)
router.get('/registrations', requireAuth, requireAdmin, getRegistrationRequests);

// GET /api/auth/registrations/stats - Get counts for dashboard (pending, approved, rejected)
router.get('/registrations/stats', requireAuth, requireAdmin, getRegistrationStats);

// POST /api/auth/registrations/:requestId/approve - Admin approves registration
// Creates user in dawlance_user table
router.post('/registrations/:requestId/approve', requireAuth, requireAdmin, approveRegistrationRequest);

// POST /api/auth/registrations/:requestId/reject - Admin rejects registration
// Body: { rejectionReason: "optional reason" }
router.post('/registrations/:requestId/reject', requireAuth, requireAdmin, rejectRegistrationRequest);

module.exports = router;