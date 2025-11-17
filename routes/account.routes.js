const express = require('express');
const router = express.Router();
const accountController = require('../controllers/account.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/company/:companyId', accountController.getAccountsByCompany);
router.get('/getAccountByCompany/:companyId', accountController.getAccountsByCompany);
router.post('/', accountController.createAccount);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);

module.exports = router;