const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique quotation number
 */
const generateQuotationNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastQuotation = await prisma.salesQuotation.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (lastQuotation && lastQuotation.quotationNumber) {
    const lastSequence = parseInt(lastQuotation.quotationNumber.split('-').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `SQ-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique sales order number
 */
const generateSalesOrderNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastOrder = await prisma.salesOrder.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (lastOrder && lastOrder.orderNumber) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `SO-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique challan number
 */
const generateChallanNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastChallan = await prisma.deliveryChallan.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (lastChallan && lastChallan.challanNumber) {
    const lastSequence = parseInt(lastChallan.challanNumber.split('-').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `DC-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique return number
 */
const generateReturnNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastReturn = await prisma.salesReturn.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (lastReturn && lastReturn.returnNumber) {
    const lastSequence = parseInt(lastReturn.returnNumber.split('-').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `SR-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Calculate totals from items
 */
const calculateTotals = (items) => {
  let subtotal = 0;
  let taxAmount = 0;

  const processedItems = items.map(item => {
    const itemSubtotal = item.quantity * item.unitPrice;
    const itemDiscount = item.discountAmount || 0;
    const itemTaxableAmount = itemSubtotal - itemDiscount;
    const itemTax = (itemTaxableAmount * (item.taxRate || 0)) / 100;
    const itemTotal = itemTaxableAmount + itemTax;

    subtotal += itemSubtotal;
    taxAmount += itemTax;

    return {
      ...item,
      taxAmount: itemTax,
      totalAmount: itemTotal
    };
  });

  const totalAmount = subtotal - items.reduce((sum, item) => sum + (item.discountAmount || 0), 0) + taxAmount;

  return {
    processedItems,
    subtotal,
    taxAmount,
    totalAmount,
    discountAmount: items.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
  };
};

// ==================== SALES QUOTATIONS ====================

/**
 * Create sales quotation
 * POST /api/v1/sales/quotations
 */
const createQuotation = async (req, res) => {
  try {
    const {
      customerId,
      quotationDate = new Date(),
      validUntil,
      items = [],
      terms,
      notes
    } = req.body;

    // Validation
    if (!customerId || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer and items are required'
      });
    }

    const companyId = req.user.companyId;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Generate quotation number
    const quotationNumber = await generateQuotationNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(items);

    // Create quotation with items in transaction
    const quotation = await prisma.$transaction(async (tx) => {
      return await tx.salesQuotation.create({
        data: {
          quotationNumber,
          customerId,
          companyId,
          quotationDate: new Date(quotationDate),
          validUntil: validUntil ? new Date(validUntil) : null,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          terms,
          notes,
          status: 'draft',
          items: {
            create: processedItems.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 0,
              taxAmount: item.taxAmount,
              discountAmount: item.discountAmount || 0,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true, unit: true }
              }
            }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      data: quotation,
      message: 'Sales quotation created successfully'
    });
  } catch (error) {
    console.error('Create quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sales quotation',
      message: error.message
    });
  }
};

/**
 * Get all quotations with filters
 * GET /api/v1/sales/quotations
 */
const getQuotations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      startDate,
      endDate,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const companyId = req.user.companyId;

    // Build where clause
    const where = { companyId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (startDate && endDate) {
      where.quotationDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { quotationNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [quotations, total] = await Promise.all([
      prisma.salesQuotation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true }
              }
            }
          }
        }
      }),
      prisma.salesQuotation.count({ where })
    ]);

    res.json({
      success: true,
      data: quotations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get quotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotations',
      message: error.message
    });
  }
};

/**
 * Get single quotation by ID
 * GET /api/v1/sales/quotations/:id
 */
const getQuotationById = async (req, res) => {
  try {
    const quotation = await prisma.salesQuotation.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        },
        salesOrders: {
          select: { id: true, orderNumber: true, status: true }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found'
      });
    }

    res.json({
      success: true,
      data: quotation
    });
  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quotation',
      message: error.message
    });
  }
};

/**
 * Update quotation
 * PUT /api/v1/sales/quotations/:id
 */
const updateQuotation = async (req, res) => {
  try {
    const quotationId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if quotation exists
    const existingQuotation = await prisma.salesQuotation.findFirst({
      where: {
        id: quotationId,
        companyId: req.user.companyId
      }
    });

    if (!existingQuotation) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found'
      });
    }

    // Only allow updates to draft or sent quotations
    if (!['draft', 'sent'].includes(existingQuotation.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only update draft or sent quotations'
      });
    }

    // Prepare update data
    let finalUpdateData = { ...updateData };

    // If items are being updated, recalculate totals
    if (items && items.length > 0) {
      const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(items);

      finalUpdateData = {
        ...finalUpdateData,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount
      };

      // Delete existing items
      await prisma.salesQuotationItem.deleteMany({
        where: { quotationId }
      });
    }

    // Update quotation
    const updatedQuotation = await prisma.$transaction(async (tx) => {
      return await tx.salesQuotation.update({
        where: { id: quotationId },
        data: {
          ...finalUpdateData,
          ...(items && items.length > 0 && {
            items: {
              create: calculateTotals(items).processedItems.map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                taxRate: item.taxRate || 0,
                taxAmount: item.taxAmount,
                discountAmount: item.discountAmount || 0,
                totalAmount: item.totalAmount
              }))
            }
          })
        },
        include: {
          customer: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedQuotation,
      message: 'Quotation updated successfully'
    });
  } catch (error) {
    console.error('Update quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update quotation',
      message: error.message
    });
  }
};

/**
 * Delete quotation
 * DELETE /api/v1/sales/quotations/:id
 */
const deleteQuotation = async (req, res) => {
  try {
    const quotationId = req.params.id;

    const quotation = await prisma.salesQuotation.findFirst({
      where: {
        id: quotationId,
        companyId: req.user.companyId
      },
      include: {
        salesOrders: true
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found'
      });
    }

    // Cannot delete if quotation has been converted to sales order
    if (quotation.salesOrders && quotation.salesOrders.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete quotation that has been converted to sales order'
      });
    }

    // Only allow deletion of draft or expired quotations
    if (!['draft', 'expired', 'rejected'].includes(quotation.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete draft, expired, or rejected quotations'
      });
    }

    await prisma.salesQuotation.delete({
      where: { id: quotationId }
    });

    res.json({
      success: true,
      message: 'Quotation deleted successfully'
    });
  } catch (error) {
    console.error('Delete quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete quotation',
      message: error.message
    });
  }
};

/**
 * Update quotation status
 * PATCH /api/v1/sales/quotations/:id/status
 */
const updateQuotationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const quotation = await prisma.salesQuotation.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Quotation not found'
      });
    }

    const updatedQuotation = await prisma.salesQuotation.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        customer: true,
        items: {
          include: { product: true }
        }
      }
    });

    res.json({
      success: true,
      data: updatedQuotation,
      message: `Quotation status updated to ${status}`
    });
  } catch (error) {
    console.error('Update quotation status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update quotation status',
      message: error.message
    });
  }
};

// ==================== SALES ORDERS ====================

/**
 * Create sales order
 * POST /api/v1/sales/orders
 */
const createSalesOrder = async (req, res) => {
  try {
    const {
      quotationId,
      customerId,
      orderDate = new Date(),
      expectedDelivery,
      items = [],
      terms,
      notes
    } = req.body;

    const companyId = req.user.companyId;
    let orderItems = items;
    let orderCustomerId = customerId;

    // If creating from quotation, fetch quotation items
    if (quotationId) {
      const quotation = await prisma.salesQuotation.findFirst({
        where: { id: quotationId, companyId },
        include: { items: true }
      });

      if (!quotation) {
        return res.status(404).json({
          success: false,
          error: 'Quotation not found'
        });
      }

      if (quotation.status !== 'accepted') {
        return res.status(400).json({
          success: false,
          error: 'Can only create order from accepted quotation'
        });
      }

      orderCustomerId = quotation.customerId;
      orderItems = quotation.items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        discountAmount: item.discountAmount
      }));
    }

    // Validation
    if (!orderCustomerId || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer and items are required'
      });
    }

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id: orderCustomerId, companyId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Generate order number
    const orderNumber = await generateSalesOrderNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(orderItems);

    // Create sales order with items in transaction
    const salesOrder = await prisma.$transaction(async (tx) => {
      return await tx.salesOrder.create({
        data: {
          orderNumber,
          quotationId: quotationId || null,
          customerId: orderCustomerId,
          companyId,
          orderDate: new Date(orderDate),
          expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
          subtotal,
          taxAmount,
          discountAmount,
          totalAmount,
          terms,
          notes,
          status: 'pending',
          items: {
            create: processedItems.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 0,
              taxAmount: item.taxAmount,
              discountAmount: item.discountAmount || 0,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true, unit: true }
              }
            }
          },
          quotation: {
            select: { id: true, quotationNumber: true }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      data: salesOrder,
      message: 'Sales order created successfully'
    });
  } catch (error) {
    console.error('Create sales order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sales order',
      message: error.message
    });
  }
};

/**
 * Get all sales orders with filters
 * GET /api/v1/sales/orders
 */
const getSalesOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      startDate,
      endDate,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const companyId = req.user.companyId;

    // Build where clause
    const where = { companyId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (startDate && endDate) {
      where.orderDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [salesOrders, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true }
              }
            }
          },
          quotation: {
            select: { id: true, quotationNumber: true }
          }
        }
      }),
      prisma.salesOrder.count({ where })
    ]);

    res.json({
      success: true,
      data: salesOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get sales orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales orders',
      message: error.message
    });
  }
};

/**
 * Get single sales order by ID
 * GET /api/v1/sales/orders/:id
 */
const getSalesOrderById = async (req, res) => {
  try {
    const salesOrder = await prisma.salesOrder.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        },
        quotation: {
          select: { id: true, quotationNumber: true }
        },
        deliveryChallans: {
          select: { id: true, challanNumber: true, status: true, deliveryDate: true }
        },
        invoices: {
          select: { id: true, invoiceNumber: true, status: true, totalAmount: true }
        }
      }
    });

    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        error: 'Sales order not found'
      });
    }

    res.json({
      success: true,
      data: salesOrder
    });
  } catch (error) {
    console.error('Get sales order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales order',
      message: error.message
    });
  }
};

/**
 * Update sales order
 * PUT /api/v1/sales/orders/:id
 */
const updateSalesOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if order exists
    const existingOrder = await prisma.salesOrder.findFirst({
      where: {
        id: orderId,
        companyId: req.user.companyId
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: 'Sales order not found'
      });
    }

    // Only allow updates to pending orders
    if (existingOrder.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only update pending orders'
      });
    }

    // Prepare update data
    let finalUpdateData = { ...updateData };

    // If items are being updated, recalculate totals
    if (items && items.length > 0) {
      const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(items);

      finalUpdateData = {
        ...finalUpdateData,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount
      };

      // Delete existing items
      await prisma.salesOrderItem.deleteMany({
        where: { orderId }
      });
    }

    // Update order
    const updatedOrder = await prisma.$transaction(async (tx) => {
      return await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          ...finalUpdateData,
          ...(items && items.length > 0 && {
            items: {
              create: calculateTotals(items).processedItems.map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                taxRate: item.taxRate || 0,
                taxAmount: item.taxAmount,
                discountAmount: item.discountAmount || 0,
                totalAmount: item.totalAmount
              }))
            }
          })
        },
        include: {
          customer: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Sales order updated successfully'
    });
  } catch (error) {
    console.error('Update sales order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sales order',
      message: error.message
    });
  }
};

/**
 * Delete sales order
 * DELETE /api/v1/sales/orders/:id
 */
const deleteSalesOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await prisma.salesOrder.findFirst({
      where: {
        id: orderId,
        companyId: req.user.companyId
      },
      include: {
        invoices: true,
        deliveryChallans: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Sales order not found'
      });
    }

    // Cannot delete if order has invoices or challans
    if (order.invoices?.length > 0 || order.deliveryChallans?.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete order that has invoices or delivery challans'
      });
    }

    // Only allow deletion of pending or cancelled orders
    if (!['pending', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending or cancelled orders'
      });
    }

    await prisma.salesOrder.delete({
      where: { id: orderId }
    });

    res.json({
      success: true,
      message: 'Sales order deleted successfully'
    });
  } catch (error) {
    console.error('Delete sales order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete sales order',
      message: error.message
    });
  }
};

/**
 * Update sales order status
 * PATCH /api/v1/sales/orders/:id/status
 */
const updateSalesOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await prisma.salesOrder.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Sales order not found'
      });
    }

    const updatedOrder = await prisma.salesOrder.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        customer: true,
        items: {
          include: { product: true }
        }
      }
    });

    res.json({
      success: true,
      data: updatedOrder,
      message: `Sales order status updated to ${status}`
    });
  } catch (error) {
    console.error('Update sales order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sales order status',
      message: error.message
    });
  }
};

/**
 * Convert sales order to invoice
 * POST /api/v1/sales/orders/:id/convert-to-invoice
 */
const convertToInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const companyId = req.user.companyId;

    // Get sales order
    const salesOrder = await prisma.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: {
        items: true,
        customer: true
      }
    });

    if (!salesOrder) {
      return res.status(404).json({
        success: false,
        error: 'Sales order not found'
      });
    }

    if (salesOrder.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot convert cancelled order to invoice'
      });
    }

    // Check if invoice already exists for this order
    const existingInvoice = await prisma.invoice.findFirst({
      where: { salesOrderId: orderId, companyId }
    });

    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        error: 'Invoice already exists for this sales order',
        data: existingInvoice
      });
    }

    // Generate invoice number
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    const lastInvoice = await prisma.invoice.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' }
    });

    let sequence = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const lastSequence = parseInt(lastInvoice.invoiceNumber.split('-').pop());
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    const invoiceNumber = `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;

    // Calculate due date based on customer credit period
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (salesOrder.customer.creditPeriodDays || 30));

    // Create invoice from sales order
    const invoice = await prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: salesOrder.customerId,
          companyId,
          salesOrderId: orderId,
          invoiceDate: new Date(),
          dueDate,
          subtotal: salesOrder.subtotal,
          taxAmount: salesOrder.taxAmount,
          discountAmount: salesOrder.discountAmount,
          totalAmount: salesOrder.totalAmount,
          paidAmount: 0,
          balanceAmount: salesOrder.totalAmount,
          status: 'DRAFT',
          notes: salesOrder.notes,
          termsConditions: salesOrder.terms,
          createdById: req.user.id,
          items: {
            create: salesOrder.items.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate,
              taxAmount: item.taxAmount,
              discountAmount: item.discountAmount,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          customer: true,
          items: {
            include: { product: true }
          },
          salesOrder: {
            select: { id: true, orderNumber: true }
          }
        }
      });

      // Update sales order status
      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: 'completed' }
      });

      return newInvoice;
    });

    res.status(201).json({
      success: true,
      data: invoice,
      message: 'Sales order converted to invoice successfully'
    });
  } catch (error) {
    console.error('Convert to invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert sales order to invoice',
      message: error.message
    });
  }
};

// ==================== DELIVERY CHALLANS ====================

/**
 * Create delivery challan
 * POST /api/v1/sales/delivery-challans
 */
const createDeliveryChallan = async (req, res) => {
  try {
    const {
      salesOrderId,
      customerId,
      deliveryDate = new Date(),
      vehicleNumber,
      transportMode,
      items = [],
      notes
    } = req.body;

    const companyId = req.user.companyId;
    let challanItems = items;
    let challanCustomerId = customerId;

    // If creating from sales order, fetch order items
    if (salesOrderId) {
      const salesOrder = await prisma.salesOrder.findFirst({
        where: { id: salesOrderId, companyId },
        include: { items: true }
      });

      if (!salesOrder) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
        });
      }

      challanCustomerId = salesOrder.customerId;
      challanItems = salesOrder.items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity
      }));
    }

    // Validation
    if (!challanCustomerId || challanItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer and items are required'
      });
    }

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id: challanCustomerId, companyId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Generate challan number
    const challanNumber = await generateChallanNumber(companyId);

    // Calculate totals (for challans with pricing)
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    // Create delivery challan
    const deliveryChallan = await prisma.$transaction(async (tx) => {
      return await tx.deliveryChallan.create({
        data: {
          challanNumber,
          salesOrderId: salesOrderId || null,
          customerId: challanCustomerId,
          companyId,
          deliveryDate: new Date(deliveryDate),
          vehicleNumber,
          transportMode,
          subtotal,
          taxAmount,
          totalAmount,
          notes,
          status: 'pending',
          items: {
            create: challanItems.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity
            }))
          }
        },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true, address: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true, unit: true }
              }
            }
          },
          salesOrder: {
            select: { id: true, orderNumber: true }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      data: deliveryChallan,
      message: 'Delivery challan created successfully'
    });
  } catch (error) {
    console.error('Create delivery challan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create delivery challan',
      message: error.message
    });
  }
};

/**
 * Get all delivery challans
 * GET /api/v1/sales/delivery-challans
 */
const getDeliveryChallans = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      startDate,
      endDate,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const companyId = req.user.companyId;

    // Build where clause
    const where = { companyId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (startDate && endDate) {
      where.deliveryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { challanNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [challans, total] = await Promise.all([
      prisma.deliveryChallan.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true }
              }
            }
          },
          salesOrder: {
            select: { id: true, orderNumber: true }
          }
        }
      }),
      prisma.deliveryChallan.count({ where })
    ]);

    res.json({
      success: true,
      data: challans,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get delivery challans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delivery challans',
      message: error.message
    });
  }
};

/**
 * Get single delivery challan by ID
 * GET /api/v1/sales/delivery-challans/:id
 */
const getDeliveryChallanById = async (req, res) => {
  try {
    const challan = await prisma.deliveryChallan.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        },
        salesOrder: {
          select: { id: true, orderNumber: true, status: true }
        }
      }
    });

    if (!challan) {
      return res.status(404).json({
        success: false,
        error: 'Delivery challan not found'
      });
    }

    res.json({
      success: true,
      data: challan
    });
  } catch (error) {
    console.error('Get delivery challan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delivery challan',
      message: error.message
    });
  }
};

/**
 * Update delivery challan
 * PUT /api/v1/sales/delivery-challans/:id
 */
const updateDeliveryChallan = async (req, res) => {
  try {
    const challanId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if challan exists
    const existingChallan = await prisma.deliveryChallan.findFirst({
      where: {
        id: challanId,
        companyId: req.user.companyId
      }
    });

    if (!existingChallan) {
      return res.status(404).json({
        success: false,
        error: 'Delivery challan not found'
      });
    }

    // Only allow updates to pending challans
    if (existingChallan.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only update pending delivery challans'
      });
    }

    // If items are being updated, delete existing items
    if (items && items.length > 0) {
      await prisma.deliveryChallanItem.deleteMany({
        where: { challanId }
      });
    }

    // Update challan
    const updatedChallan = await prisma.$transaction(async (tx) => {
      return await tx.deliveryChallan.update({
        where: { id: challanId },
        data: {
          ...updateData,
          ...(items && items.length > 0 && {
            items: {
              create: items.map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity
              }))
            }
          })
        },
        include: {
          customer: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedChallan,
      message: 'Delivery challan updated successfully'
    });
  } catch (error) {
    console.error('Update delivery challan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update delivery challan',
      message: error.message
    });
  }
};

/**
 * Delete delivery challan
 * DELETE /api/v1/sales/delivery-challans/:id
 */
const deleteDeliveryChallan = async (req, res) => {
  try {
    const challanId = req.params.id;

    const challan = await prisma.deliveryChallan.findFirst({
      where: {
        id: challanId,
        companyId: req.user.companyId
      }
    });

    if (!challan) {
      return res.status(404).json({
        success: false,
        error: 'Delivery challan not found'
      });
    }

    // Only allow deletion of pending challans
    if (challan.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending delivery challans'
      });
    }

    await prisma.deliveryChallan.delete({
      where: { id: challanId }
    });

    res.json({
      success: true,
      message: 'Delivery challan deleted successfully'
    });
  } catch (error) {
    console.error('Delete delivery challan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete delivery challan',
      message: error.message
    });
  }
};

// ==================== SALES RETURNS ====================

/**
 * Create sales return
 * POST /api/v1/sales/returns
 */
const createSalesReturn = async (req, res) => {
  try {
    const {
      invoiceId,
      customerId,
      returnDate = new Date(),
      items = [],
      reason,
      notes
    } = req.body;

    const companyId = req.user.companyId;
    let returnItems = items;
    let returnCustomerId = customerId;

    // If creating from invoice, fetch invoice items
    if (invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, companyId },
        include: { items: true }
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found'
        });
      }

      returnCustomerId = invoice.customerId;

      // Use provided items or all invoice items
      if (items.length === 0) {
        returnItems = invoice.items.map(item => ({
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          discountAmount: item.discountAmount || 0
        }));
      }
    }

    // Validation
    if (!returnCustomerId || returnItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer and items are required'
      });
    }

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id: returnCustomerId, companyId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Generate return number
    const returnNumber = await generateReturnNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount } = calculateTotals(returnItems);

    // Create sales return
    const salesReturn = await prisma.$transaction(async (tx) => {
      return await tx.salesReturn.create({
        data: {
          returnNumber,
          invoiceId: invoiceId || null,
          customerId: returnCustomerId,
          companyId,
          returnDate: new Date(returnDate),
          subtotal,
          taxAmount,
          totalAmount,
          reason,
          notes,
          status: 'pending',
          items: {
            create: processedItems.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxRate: item.taxRate || 0,
              taxAmount: item.taxAmount,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true, unit: true }
              }
            }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      data: salesReturn,
      message: 'Sales return created successfully'
    });
  } catch (error) {
    console.error('Create sales return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create sales return',
      message: error.message
    });
  }
};

/**
 * Get all sales returns
 * GET /api/v1/sales/returns
 */
const getSalesReturns = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      startDate,
      endDate,
      search
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const companyId = req.user.companyId;

    // Build where clause
    const where = { companyId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (startDate && endDate) {
      where.returnDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [returns, total] = await Promise.all([
      prisma.salesReturn.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true }
              }
            }
          },
          invoice: {
            select: { id: true, invoiceNumber: true }
          }
        }
      }),
      prisma.salesReturn.count({ where })
    ]);

    res.json({
      success: true,
      data: returns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get sales returns error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales returns',
      message: error.message
    });
  }
};

/**
 * Get single sales return by ID
 * GET /api/v1/sales/returns/:id
 */
const getSalesReturnById = async (req, res) => {
  try {
    const salesReturn = await prisma.salesReturn.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true }
        }
      }
    });

    if (!salesReturn) {
      return res.status(404).json({
        success: false,
        error: 'Sales return not found'
      });
    }

    res.json({
      success: true,
      data: salesReturn
    });
  } catch (error) {
    console.error('Get sales return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales return',
      message: error.message
    });
  }
};

/**
 * Update sales return
 * PUT /api/v1/sales/returns/:id
 */
const updateSalesReturn = async (req, res) => {
  try {
    const returnId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if return exists
    const existingReturn = await prisma.salesReturn.findFirst({
      where: {
        id: returnId,
        companyId: req.user.companyId
      }
    });

    if (!existingReturn) {
      return res.status(404).json({
        success: false,
        error: 'Sales return not found'
      });
    }

    // Only allow updates to pending returns
    if (existingReturn.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only update pending sales returns'
      });
    }

    // Prepare update data
    let finalUpdateData = { ...updateData };

    // If items are being updated, recalculate totals
    if (items && items.length > 0) {
      const { processedItems, subtotal, taxAmount, totalAmount } = calculateTotals(items);

      finalUpdateData = {
        ...finalUpdateData,
        subtotal,
        taxAmount,
        totalAmount
      };

      // Delete existing items
      await prisma.salesReturnItem.deleteMany({
        where: { returnId }
      });
    }

    // Update return
    const updatedReturn = await prisma.$transaction(async (tx) => {
      return await tx.salesReturn.update({
        where: { id: returnId },
        data: {
          ...finalUpdateData,
          ...(items && items.length > 0 && {
            items: {
              create: calculateTotals(items).processedItems.map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                taxRate: item.taxRate || 0,
                taxAmount: item.taxAmount,
                totalAmount: item.totalAmount
              }))
            }
          })
        },
        include: {
          customer: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedReturn,
      message: 'Sales return updated successfully'
    });
  } catch (error) {
    console.error('Update sales return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sales return',
      message: error.message
    });
  }
};

/**
 * Delete sales return
 * DELETE /api/v1/sales/returns/:id
 */
const deleteSalesReturn = async (req, res) => {
  try {
    const returnId = req.params.id;

    const salesReturn = await prisma.salesReturn.findFirst({
      where: {
        id: returnId,
        companyId: req.user.companyId
      }
    });

    if (!salesReturn) {
      return res.status(404).json({
        success: false,
        error: 'Sales return not found'
      });
    }

    // Only allow deletion of pending or rejected returns
    if (!['pending', 'rejected'].includes(salesReturn.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending or rejected sales returns'
      });
    }

    await prisma.salesReturn.delete({
      where: { id: returnId }
    });

    res.json({
      success: true,
      message: 'Sales return deleted successfully'
    });
  } catch (error) {
    console.error('Delete sales return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete sales return',
      message: error.message
    });
  }
};

/**
 * Approve sales return
 * PATCH /api/v1/sales/returns/:id/approve
 */
const approveSalesReturn = async (req, res) => {
  try {
    const returnId = req.params.id;
    const companyId = req.user.companyId;

    const salesReturn = await prisma.salesReturn.findFirst({
      where: { id: returnId, companyId },
      include: { items: true, invoice: true }
    });

    if (!salesReturn) {
      return res.status(404).json({
        success: false,
        error: 'Sales return not found'
      });
    }

    if (salesReturn.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only approve pending sales returns'
      });
    }

    // Approve return and update inventory
    const approvedReturn = await prisma.$transaction(async (tx) => {
      // Update return status
      const updated = await tx.salesReturn.update({
        where: { id: returnId },
        data: { status: 'approved' },
        include: {
          customer: true,
          items: {
            include: { product: true }
          },
          invoice: true
        }
      });

      // Update product stock for each item
      for (const item of salesReturn.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: {
                increment: item.quantity
              }
            }
          });
        }
      }

      // If linked to invoice, adjust invoice amounts
      if (salesReturn.invoiceId) {
        const invoice = salesReturn.invoice;
        const newBalanceAmount = invoice.balanceAmount - salesReturn.totalAmount;

        await tx.invoice.update({
          where: { id: salesReturn.invoiceId },
          data: {
            balanceAmount: Math.max(0, newBalanceAmount),
            paidAmount: invoice.paidAmount // Keep paid amount same
          }
        });

        // Update customer balance
        await tx.customer.update({
          where: { id: salesReturn.customerId },
          data: {
            balance: {
              decrement: salesReturn.totalAmount
            }
          }
        });
      }

      return updated;
    });

    res.json({
      success: true,
      data: approvedReturn,
      message: 'Sales return approved successfully'
    });
  } catch (error) {
    console.error('Approve sales return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve sales return',
      message: error.message
    });
  }
};

// ==================== EXPORTS ====================

module.exports = {
  // Helper functions
  generateQuotationNumber,
  generateSalesOrderNumber,
  generateChallanNumber,
  generateReturnNumber,

  // Sales Quotations
  createQuotation,
  getQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  updateQuotationStatus,

  // Sales Orders
  createSalesOrder,
  getSalesOrders,
  getSalesOrderById,
  updateSalesOrder,
  deleteSalesOrder,
  updateSalesOrderStatus,
  convertToInvoice,

  // Delivery Challans
  createDeliveryChallan,
  getDeliveryChallans,
  getDeliveryChallanById,
  updateDeliveryChallan,
  deleteDeliveryChallan,

  // Sales Returns
  createSalesReturn,
  getSalesReturns,
  getSalesReturnById,
  updateSalesReturn,
  deleteSalesReturn,
  approveSalesReturn
};
