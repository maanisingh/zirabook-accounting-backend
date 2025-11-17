const express = require('express');
const router = express.Router();
const billsController = require('../controllers/billsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', billsController.listBills);
router.post('/', billsController.createBill);
router.get('/overdue', billsController.getOverdueBills);
router.get('/:id', billsController.getBillById);
router.put('/:id', billsController.updateBill);
router.delete('/:id', billsController.deleteBill);
router.patch('/:id/approve', billsController.approveBill);
router.patch('/:id/payment', billsController.recordBillPayment);

module.exports = router;
