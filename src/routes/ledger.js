const express = require('express');
const router = express.Router();
const ledgerController = require('../controllers/ledgerController');
const { authMiddleware } = require('../middleware/auth');

// Ledger routes
router.get('/account/:accountId', authMiddleware, ledgerController.getAccountLedger);
router.get('/customer/:customerId', authMiddleware, ledgerController.getCustomerLedger);
router.get('/supplier/:supplierId', authMiddleware, ledgerController.getSupplierLedger);
router.get('/general', authMiddleware, ledgerController.getGeneralLedger);

module.exports = router;
