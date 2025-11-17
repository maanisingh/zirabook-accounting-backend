const express = require('express');
const router = express.Router();
const invoicesController = require('../controllers/invoicesController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', invoicesController.listInvoices);
router.post('/', invoicesController.createInvoice);
router.get('/overdue', invoicesController.getOverdueInvoices);
router.get('/stats', invoicesController.getInvoiceStatistics);
router.get('/:id', invoicesController.getInvoiceById);
router.put('/:id', invoicesController.updateInvoice);
router.delete('/:id', invoicesController.deleteInvoice);
router.patch('/:id/send', invoicesController.sendInvoice);
router.patch('/:id/payment', invoicesController.recordPayment);
router.get('/:id/pdf', invoicesController.generateInvoicePDF);

module.exports = router;
