const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accountsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', accountsController.listAccounts);
router.post('/', accountsController.createAccount);
router.get('/trial-balance', accountsController.getTrialBalance);
router.get('/:id', accountsController.getAccountById);
router.put('/:id', accountsController.updateAccount);
router.delete('/:id', accountsController.deleteAccount);
router.get('/:id/ledger', accountsController.getAccountLedger);

module.exports = router;
