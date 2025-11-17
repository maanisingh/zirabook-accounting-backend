const express = require('express');
const router = express.Router();
const companiesController = require('../controllers/companiesController');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Apply rate limiting to all routes
router.use(apiLimiter);

// All routes require authentication
router.use(authMiddleware);

// List all companies (SUPERADMIN only)
router.get('/', requireRole('SUPERADMIN'), companiesController.listCompanies);

// Create a new company (SUPERADMIN only)
router.post('/', requireRole('SUPERADMIN'), companiesController.createCompany);

// Get company details
router.get('/:id', companiesController.getCompanyById);

// Update company details
router.put('/:id', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), companiesController.updateCompany);

// Delete company (SUPERADMIN only)
router.delete('/:id', requireRole('SUPERADMIN'), companiesController.deleteCompany);

// Update company settings
router.patch('/:id/settings', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), companiesController.updateCompanySettings);

module.exports = router;