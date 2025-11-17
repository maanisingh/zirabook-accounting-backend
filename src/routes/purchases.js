const express = require('express');
const router = express.Router();
const purchasesController = require('../controllers/purchasesController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Purchase Quotations
router.post('/quotations', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.createPurchaseQuotation);
router.get('/quotations', authMiddleware, purchasesController.getPurchaseQuotations);
router.get('/quotations/:id', authMiddleware, purchasesController.getPurchaseQuotationById);
router.put('/quotations/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updatePurchaseQuotation);
router.delete('/quotations/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), purchasesController.deletePurchaseQuotation);
router.put('/quotations/:id/status', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updatePurchaseQuotationStatus);

// Purchase Orders
router.post('/purchase-orders', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.createPurchaseOrder);
router.get('/purchase-orders', authMiddleware, purchasesController.getPurchaseOrders);
router.get('/purchase-orders/:id', authMiddleware, purchasesController.getPurchaseOrderById);
router.put('/purchase-orders/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updatePurchaseOrder);
router.delete('/purchase-orders/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), purchasesController.deletePurchaseOrder);
router.put('/purchase-orders/:id/status', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updatePurchaseOrderStatus);
router.post('/purchase-orders/:id/convert-to-bill', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.convertToBill);

// Goods Receipts
router.post('/goods-receipts', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.createGoodsReceipt);
router.get('/goods-receipts', authMiddleware, purchasesController.getGoodsReceipts);
router.get('/goods-receipts/:id', authMiddleware, purchasesController.getGoodsReceiptById);
router.put('/goods-receipts/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updateGoodsReceipt);
router.delete('/goods-receipts/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), purchasesController.deleteGoodsReceipt);

// Purchase Returns
router.post('/purchase-returns', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.createPurchaseReturn);
router.get('/purchase-returns', authMiddleware, purchasesController.getPurchaseReturns);
router.get('/purchase-returns/:id', authMiddleware, purchasesController.getPurchaseReturnById);
router.put('/purchase-returns/:id', authMiddleware, requireRole(['COMPANY_ADMIN', 'ACCOUNTANT']), purchasesController.updatePurchaseReturn);
router.delete('/purchase-returns/:id', authMiddleware, requireRole(['COMPANY_ADMIN']), purchasesController.deletePurchaseReturn);
router.put('/purchase-returns/:id/approve', authMiddleware, requireRole(['COMPANY_ADMIN']), purchasesController.approvePurchaseReturn);

module.exports = router;
