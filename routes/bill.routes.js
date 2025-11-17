const express = require('express');
const router = express.Router();
const billController = require('../controllers/bill.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/company/:companyId', billController.getBillsByCompany);
router.get('/:id', billController.getBill);
router.post('/', billController.createBill);
router.put('/:id', billController.updateBill);
router.delete('/:id', billController.deleteBill);

module.exports = router;