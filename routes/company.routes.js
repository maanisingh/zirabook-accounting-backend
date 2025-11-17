const express = require('express');
const router = express.Router();
const companyController = require('../controllers/company.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', companyController.getCompanies);
router.get('/:id', companyController.getCompany);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.delete('/:id', companyController.deleteCompany);

module.exports = router;