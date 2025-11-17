const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Dashboard
router.get('/superadmindhasboard', reportController.getDashboardSummary);

// Sales reports
router.get('/sales-reports/summary', reportController.getSalesReportSummary);
router.get('/sales-reports/detailed', reportController.getSalesReportDetailed);

// Purchase reports
router.get('/purchase-reports/summary', reportController.getPurchaseReportSummary);
router.get('/purchase-reports/detailed', reportController.getPurchaseReportDetailed);

// POS reports
router.get('/posinvoice/company/:companyId', reportController.getPOSInvoices);

module.exports = router;