const express = require('express');
const router = express.Router();
const suppliersController = require('../controllers/suppliersController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', suppliersController.listSuppliers);
router.post('/', suppliersController.createSupplier);
router.get('/:id', suppliersController.getSupplierById);
router.put('/:id', suppliersController.updateSupplier);
router.delete('/:id', suppliersController.deleteSupplier);
router.get('/:id/bills', suppliersController.getSupplierBills);
router.get('/:id/balance', suppliersController.getSupplierBalance);

module.exports = router;
