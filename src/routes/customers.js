const express = require('express');
const router = express.Router();
const multer = require('multer');
const customersController = require('../controllers/customersController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiter');

// Configure multer for file uploads
const upload = multer({
  dest: '/tmp/uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Apply rate limiting
router.use(apiLimiter);

// All routes require authentication
router.use(authMiddleware);

// Apply company access control
router.use(requireCompanyAccess());

// Customer routes
router.get('/', customersController.listCustomers);
router.post('/', customersController.createCustomer);
router.get('/:id', customersController.getCustomerById);
router.put('/:id', customersController.updateCustomer);
router.delete('/:id', customersController.deleteCustomer);

// Customer-specific endpoints
router.get('/:id/invoices', customersController.getCustomerInvoices);
router.get('/:id/balance', customersController.getCustomerBalance);

// Bulk import
router.post('/import', uploadLimiter, upload.single('file'), customersController.importCustomers);

module.exports = router;