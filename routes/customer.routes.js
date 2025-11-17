const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/getCustomersByCompany/:companyId', customerController.getCustomersByCompany);
router.get('/:id', customerController.getCustomer);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;