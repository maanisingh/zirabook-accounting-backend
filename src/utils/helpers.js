/**
 * Helper functions for API responses and common utilities
 */

/**
 * Success response formatter
 */
const successResponse = (data = null, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};

/**
 * Error response formatter
 */
const errorResponse = (message = 'An error occurred', error = null) => {
  const response = {
    success: false,
    message
  };

  if (error && process.env.NODE_ENV === 'development') {
    response.error = error.message || error;
    if (error.stack) {
      response.stack = error.stack;
    }
  }

  return response;
};

/**
 * Pagination helper
 */
const paginate = (page = 1, limit = 20) => {
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  return {
    skip,
    take: limitNum,
    page: pageNum,
    limit: limitNum
  };
};

/**
 * Format pagination response
 */
const paginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * Generate unique codes
 */
const generateCode = (prefix = '', length = 6) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, length);
  return `${prefix}${timestamp}${random}`.toUpperCase();
};

/**
 * Generate invoice/bill numbers
 */
const generateInvoiceNumber = (prefix = 'INV') => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}-${random}`;
};

/**
 * Calculate total from line items
 */
const calculateLineItemsTotal = (lineItems) => {
  if (!Array.isArray(lineItems)) return 0;

  return lineItems.reduce((total, item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const discount = parseFloat(item.discount) || 0;
    const tax = parseFloat(item.tax) || 0;

    const subtotal = quantity * unitPrice;
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * tax) / 100;

    return total + taxableAmount + taxAmount;
  }, 0);
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
};

/**
 * Date range helper
 */
const getDateRange = (period = 'month') => {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
    case 'month':
      start.setMonth(end.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(end.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 1);
      break;
    default:
      start.setMonth(end.getMonth() - 1);
  }

  return { start, end };
};

/**
 * Fiscal year helper
 */
const getFiscalYear = (date = new Date(), fiscalYearStart = 1) => {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  if (month >= fiscalYearStart) {
    return {
      start: new Date(year, fiscalYearStart - 1, 1),
      end: new Date(year + 1, fiscalYearStart - 1, 0),
      year: `${year}-${year + 1}`
    };
  } else {
    return {
      start: new Date(year - 1, fiscalYearStart - 1, 1),
      end: new Date(year, fiscalYearStart - 1, 0),
      year: `${year - 1}-${year}`
    };
  }
};

/**
 * Sanitize search query
 */
const sanitizeSearchQuery = (query) => {
  if (!query) return '';
  return query.replace(/[^a-zA-Z0-9\s\-_.@]/g, '').trim();
};

/**
 * Build where clause for search
 */
const buildSearchWhere = (searchFields, searchTerm) => {
  if (!searchTerm || !Array.isArray(searchFields)) return {};

  const sanitized = sanitizeSearchQuery(searchTerm);
  if (!sanitized) return {};

  return {
    OR: searchFields.map(field => ({
      [field]: {
        contains: sanitized,
        mode: 'insensitive'
      }
    }))
  };
};

/**
 * Sleep helper for testing
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate UUID
 */
const isValidUUID = (uuid) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Clean object (remove undefined/null values)
 */
const cleanObject = (obj) => {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

/**
 * Calculate aging periods
 */
const calculateAging = (dueDate) => {
  const now = new Date();
  const due = new Date(dueDate);
  const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return 'over90';
};

module.exports = {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  generateCode,
  generateInvoiceNumber,
  calculateLineItemsTotal,
  formatCurrency,
  getDateRange,
  getFiscalYear,
  sanitizeSearchQuery,
  buildSearchWhere,
  sleep,
  isValidUUID,
  cleanObject,
  calculateAging
};