const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', paymentsController.listPayments);
router.post('/receive', paymentsController.receivePayment);
router.post('/make', paymentsController.makePayment);
router.post('/auto-allocate', paymentsController.autoAllocatePayment);
router.get('/cashflow', paymentsController.getCashflow);
router.get('/:id', paymentsController.getPaymentById);
router.delete('/:id', paymentsController.voidPayment);

module.exports = router;
