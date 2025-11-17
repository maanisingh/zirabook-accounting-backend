#!/bin/bash

echo "🚀 Creating all route files..."

# Suppliers routes
cat > src/routes/suppliers.js << 'EOF'
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
EOF

# Products routes
cat > src/routes/products.js << 'EOF'
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
EOF

# Accounts routes
cat > src/routes/accounts.js << 'EOF'
const express = require('express');
const router = express.Router();
const accountsController = require('../controllers/accountsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', accountsController.listAccounts);
router.post('/', accountsController.createAccount);
router.get('/trial-balance', accountsController.getTrialBalance);
router.get('/:id', accountsController.getAccountById);
router.put('/:id', accountsController.updateAccount);
router.delete('/:id', accountsController.deleteAccount);
router.get('/:id/ledger', accountsController.getAccountLedger);

module.exports = router;
EOF

# Invoices routes
cat > src/routes/invoices.js << 'EOF'
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
EOF

# Bills routes
cat > src/routes/bills.js << 'EOF'
const express = require('express');
const router = express.Router();
const billsController = require('../controllers/billsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', billsController.listBills);
router.post('/', billsController.createBill);
router.get('/overdue', billsController.getOverdueBills);
router.get('/:id', billsController.getBillById);
router.put('/:id', billsController.updateBill);
router.delete('/:id', billsController.deleteBill);
router.patch('/:id/approve', billsController.approveBill);
router.patch('/:id/payment', billsController.recordBillPayment);

module.exports = router;
EOF

# Payments routes
cat > src/routes/payments.js << 'EOF'
const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/paymentsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', paymentsController.listPayments);
router.post('/receive', paymentsController.receivePayment);
router.post('/make', paymentsController.makePayment);
router.get('/cashflow', paymentsController.getCashflow);
router.get('/:id', paymentsController.getPaymentById);
router.delete('/:id', paymentsController.voidPayment);

module.exports = router;
EOF

# Expenses routes
cat > src/routes/expenses.js << 'EOF'
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
EOF

# Journal routes
cat > src/routes/journal.js << 'EOF'
const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', journalController.listJournalEntries);
router.post('/', journalController.createJournalEntry);
router.get('/:id', journalController.getJournalEntryById);
router.delete('/:id', journalController.deleteJournalEntry);
router.patch('/:id/post', journalController.postJournalEntry);

module.exports = router;
EOF

# Reports routes
cat > src/routes/reports.js << 'EOF'
const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter, reportLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());
router.use(reportLimiter);

router.get('/reports/profit-loss', reportsController.getProfitLoss);
router.get('/reports/balance-sheet', reportsController.getBalanceSheet);
router.get('/reports/cashflow', reportsController.getCashFlow);
router.get('/reports/trial-balance', reportsController.getTrialBalance);
router.get('/reports/sales', reportsController.getSalesReport);
router.get('/reports/purchases', reportsController.getPurchasesReport);
router.get('/reports/aging-receivables', reportsController.getAgingReceivables);
router.get('/reports/aging-payables', reportsController.getAgingPayables);
router.get('/reports/inventory', reportsController.getInventoryReport);
router.get('/reports/tax-summary', reportsController.getTaxSummary);

module.exports = router;
EOF

# Users routes
cat > src/routes/users.js << 'EOF'
const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);

router.get('/', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.listUsers);
router.post('/', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.createUser);
router.get('/:id', usersController.getUserById);
router.put('/:id', usersController.updateUser);
router.delete('/:id', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.deleteUser);
router.patch('/:id/role', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.changeUserRole);
router.patch('/:id/password', usersController.changeUserPassword);

module.exports = router;
EOF

echo "✅ All route files created successfully!"