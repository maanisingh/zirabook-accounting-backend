const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter, reportLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());
router.use(reportLimiter);

// Financial Reports
router.get('/profit-loss', reportsController.getProfitLoss);
router.get('/balance-sheet', reportsController.getBalanceSheet);
router.get('/cash-flow', reportsController.getCashFlow);
router.get('/trial-balance', reportsController.getTrialBalanceReport);

// Sales & Purchase Reports
router.get('/sales', reportsController.getSalesReport);
router.get('/purchase', reportsController.getPurchaseReport);

// Tax Reports
router.get('/tax-summary', reportsController.getTaxReport);
router.get('/vat-report', reportsController.getVATReport);

// Aging Reports
router.get('/aging-receivables', reportsController.getAgingReceivables);
router.get('/aging-payables', reportsController.getAgingPayables);

// Inventory Reports
router.get('/inventory', reportsController.getInventoryReport);
router.get('/inventory-summary', reportsController.getInventorySummaryReport);

// Day Book & Journal Reports
router.get('/day-book', reportsController.getDayBookReport);
router.get('/journal-entries', reportsController.getJournalEntriesReport);

// Ledger Report
router.get('/ledger/:accountId', reportsController.getLedgerReport);

module.exports = router;
