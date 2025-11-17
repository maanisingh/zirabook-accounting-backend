const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Sales Quotations
router.post('/quotations', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.createQuotation);
router.get('/quotations', authMiddleware, salesController.getQuotations);
router.get('/quotations/:id', authMiddleware, salesController.getQuotationById);
router.put('/quotations/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateQuotation);
router.delete('/quotations/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), salesController.deleteQuotation);
router.put('/quotations/:id/status', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateQuotationStatus);

// Sales Orders
router.post('/sales-orders', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.createSalesOrder);
router.get('/sales-orders', authMiddleware, salesController.getSalesOrders);
router.get('/sales-orders/:id', authMiddleware, salesController.getSalesOrderById);
router.put('/sales-orders/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateSalesOrder);
router.delete('/sales-orders/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), salesController.deleteSalesOrder);
router.put('/sales-orders/:id/status', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateSalesOrderStatus);
router.post('/sales-orders/:id/convert-to-invoice', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.convertToInvoice);

// Delivery Challans
router.post('/delivery-challans', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.createDeliveryChallan);
router.get('/delivery-challans', authMiddleware, salesController.getDeliveryChallans);
router.get('/delivery-challans/:id', authMiddleware, salesController.getDeliveryChallanById);
router.put('/delivery-challans/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateDeliveryChallan);
router.delete('/delivery-challans/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), salesController.deleteDeliveryChallan);

// Sales Returns
router.post('/sales-returns', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.createSalesReturn);
router.get('/sales-returns', authMiddleware, salesController.getSalesReturns);
router.get('/sales-returns/:id', authMiddleware, salesController.getSalesReturnById);
router.put('/sales-returns/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), salesController.updateSalesReturn);
router.delete('/sales-returns/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), salesController.deleteSalesReturn);
router.put('/sales-returns/:id/approve', authMiddleware, requireRole(['COMPANY_ADMIN']), salesController.approveSalesReturn);

module.exports = router;
