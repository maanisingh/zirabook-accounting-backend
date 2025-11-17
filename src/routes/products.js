const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', productsController.listProducts);
router.post('/', productsController.createProduct);
router.get('/low-stock', productsController.getLowStockProducts);
router.get('/:id', productsController.getProductById);
router.put('/:id', productsController.updateProduct);
router.delete('/:id', productsController.deleteProduct);
router.patch('/:id/stock', productsController.updateStock);
router.post('/:id/adjust-stock', productsController.adjustStock);

module.exports = router;
