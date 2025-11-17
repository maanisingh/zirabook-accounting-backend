const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Company dashboard routes
router.get('/company', authMiddleware, dashboardController.getCompanyDashboardStats);
router.get('/company/charts', authMiddleware, dashboardController.getCompanyDashboardCharts);

// Superadmin dashboard route
router.get('/superadmin', authMiddleware, requireRole('SUPERADMIN'), dashboardController.getSuperadminDashboardStats);

module.exports = router;
