const express = require('express');
const router = express.Router();
const expensesController = require('../controllers/expensesController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', expensesController.listExpenses);
router.post('/', expensesController.createExpense);
router.get('/categories', expensesController.getExpenseCategories);
router.get('/summary', expensesController.getExpenseSummary);
router.get('/:id', expensesController.getExpenseById);
router.put('/:id', expensesController.updateExpense);
router.delete('/:id', expensesController.deleteExpense);

module.exports = router;
