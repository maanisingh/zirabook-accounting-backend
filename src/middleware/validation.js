const Joi = require('joi');

/**
 * Validation middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // Auth schemas
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('USER', 'ACCOUNTANT', 'COMPANY_ADMIN', 'SUPERADMIN').optional(),
    companyId: Joi.string().uuid().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // Company schemas
  createCompany: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    taxId: Joi.string().optional(),
    logo: Joi.string().uri().optional(),
    fiscalYearStart: Joi.number().min(1).max(12).optional(),
    baseCurrency: Joi.string().length(3).optional()
  }),

  // Customer schemas
  createCustomer: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    taxId: Joi.string().optional(),
    contactPerson: Joi.string().optional(),
    creditLimit: Joi.number().min(0).optional(),
    paymentTerms: Joi.number().min(0).max(365).optional()
  }),

  // Supplier schemas
  createSupplier: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    taxId: Joi.string().optional(),
    contactPerson: Joi.string().optional(),
    paymentTerms: Joi.number().min(0).max(365).optional(),
    bankAccount: Joi.string().optional(),
    bankName: Joi.string().optional()
  }),

  // Product schemas
  createProduct: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    sku: Joi.string().optional(),
    barcode: Joi.string().optional(),
    description: Joi.string().optional(),
    category: Joi.string().optional(),
    unitCost: Joi.number().min(0).required(),
    unitPrice: Joi.number().min(0).required(),
    currentStock: Joi.number().min(0).optional(),
    reorderLevel: Joi.number().min(0).optional(),
    supplierId: Joi.string().uuid().optional()
  }),

  // Invoice schemas
  createInvoice: Joi.object({
    customerId: Joi.string().uuid().required(),
    invoiceDate: Joi.date().optional(),
    dueDate: Joi.date().optional(),
    discount: Joi.number().min(0).max(100).optional(),
    taxRate: Joi.number().min(0).max(100).optional(),
    shippingFee: Joi.number().min(0).optional(),
    notes: Joi.string().optional(),
    termsAndConditions: Joi.string().optional(),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().uuid().optional(),
        description: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unitPrice: Joi.number().positive().required(),
        discount: Joi.number().min(0).max(100).optional(),
        tax: Joi.number().min(0).max(100).optional()
      })
    ).min(1).required()
  }),

  // Bill schemas
  createBill: Joi.object({
    supplierId: Joi.string().uuid().required(),
    billDate: Joi.date().optional(),
    dueDate: Joi.date().optional(),
    discount: Joi.number().min(0).max(100).optional(),
    taxRate: Joi.number().min(0).max(100).optional(),
    notes: Joi.string().optional(),
    items: Joi.array().items(
      Joi.object({
        productId: Joi.string().uuid().optional(),
        description: Joi.string().required(),
        quantity: Joi.number().positive().required(),
        unitPrice: Joi.number().positive().required()
      })
    ).min(1).required()
  }),

  // Payment schemas
  receivePayment: Joi.object({
    customerId: Joi.string().uuid().required(),
    amount: Joi.number().positive().required(),
    paymentDate: Joi.date().optional(),
    paymentMethod: Joi.string().valid('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHEQUE', 'UPI').required(),
    invoiceId: Joi.string().uuid().optional(),
    reference: Joi.string().optional()
  }),

  makePayment: Joi.object({
    supplierId: Joi.string().uuid().required(),
    amount: Joi.number().positive().required(),
    paymentDate: Joi.date().optional(),
    paymentMethod: Joi.string().valid('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHEQUE', 'UPI').required(),
    billId: Joi.string().uuid().optional(),
    reference: Joi.string().optional()
  }),

  recordInvoicePayment: Joi.object({
    amount: Joi.number().positive().required(),
    paymentDate: Joi.date().optional(),
    paymentMethod: Joi.string().valid('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHEQUE', 'UPI').required(),
    reference: Joi.string().optional()
  }),

  // Expense schemas
  createExpense: Joi.object({
    amount: Joi.number().positive().required(),
    category: Joi.string().required(),
    description: Joi.string().optional(),
    expenseDate: Joi.date().optional(),
    paymentMethod: Joi.string().valid('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHEQUE', 'UPI').optional(),
    receiptUrl: Joi.string().uri().optional()
  }),

  // Account schemas
  createAccount: Joi.object({
    accountCode: Joi.string().required(),
    accountName: Joi.string().required(),
    accountType: Joi.string().valid('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE').required(),
    parentId: Joi.string().uuid().optional(),
    description: Joi.string().optional()
  }),

  // Journal Entry schemas
  createJournalEntry: Joi.object({
    entryDate: Joi.date().optional(),
    description: Joi.string().required(),
    reference: Joi.string().optional(),
    type: Joi.string().valid('MANUAL', 'SALE', 'PURCHASE', 'PAYMENT', 'RECEIPT', 'ADJUSTMENT').optional(),
    lineItems: Joi.array().items(
      Joi.object({
        accountId: Joi.string().uuid().required(),
        debit: Joi.number().min(0).optional(),
        credit: Joi.number().min(0).optional(),
        description: Joi.string().optional()
      })
    ).min(2).required()
  }),

  // User schemas
  createUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('USER', 'ACCOUNTANT', 'COMPANY_ADMIN', 'SUPERADMIN').optional(),
    companyId: Joi.string().uuid().optional()
  }),

  updateUser: Joi.object({
    email: Joi.string().email().optional(),
    name: Joi.string().min(2).max(100).optional(),
    role: Joi.string().valid('USER', 'ACCOUNTANT', 'COMPANY_ADMIN', 'SUPERADMIN').optional(),
    isActive: Joi.boolean().optional()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required()
  }),

  // Pagination and filtering
  pagination: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  }),

  dateRange: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().min(Joi.ref('startDate')).optional()
  })
};

/**
 * ID validation middleware
 */
const validateId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }

  next();
};

/**
 * Query parameter validation
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: false
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors
      });
    }

    next();
  };
};

module.exports = {
  validate,
  validateId,
  validateQuery,
  schemas
};