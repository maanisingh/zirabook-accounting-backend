// Generate unique codes/numbers for various entities
const generateCode = (prefix, number) => {
  const paddedNumber = String(number).padStart(6, '0');
  return `${prefix}-${paddedNumber}`;
};

// Calculate financial totals
const calculateTotals = (items) => {
  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  items.forEach(item => {
    const itemTotal = item.quantity * item.unitPrice;
    const itemTax = itemTotal * (item.taxRate / 100);
    const itemDiscount = item.discountAmount || 0;

    subtotal += itemTotal;
    taxAmount += itemTax;
    totalAmount += itemTotal + itemTax - itemDiscount;
  });

  return {
    subtotal,
    taxAmount,
    totalAmount
  };
};

// Format date for consistent response
const formatDate = (date) => {
  return date ? new Date(date).toISOString() : null;
};

// Pagination helper
const getPaginationParams = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const skip = (page - 1) * limit;

  return { skip, take: limit, page, limit };
};

// Standard response format
const successResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data
  };
};

const errorResponse = (message, error = null) => {
  const response = {
    success: false,
    message
  };
  if (error && process.env.NODE_ENV === 'development') {
    response.error = error.toString();
  }
  return response;
};

module.exports = {
  generateCode,
  calculateTotals,
  formatDate,
  getPaginationParams,
  successResponse,
  errorResponse
};