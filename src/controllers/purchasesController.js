const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique purchase quotation number
 */
const generatePurchaseQuotationNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastQuotation = await prisma.purchaseQuotation.findFirst({
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

  return `PQ-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique purchase order number
 */
const generatePurchaseOrderNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastOrder = await prisma.purchaseOrder.findFirst({
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

  return `PO-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique goods receipt number
 */
const generateGoodsReceiptNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastReceipt = await prisma.goodsReceipt.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' }
  });

  let sequence = 1;
  if (lastReceipt && lastReceipt.receiptNumber) {
    const lastSequence = parseInt(lastReceipt.receiptNumber.split('-').pop());
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `GR-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

/**
 * Generate unique purchase return number
 */
const generatePurchaseReturnNumber = async (companyId) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');

  const lastReturn = await prisma.purchaseReturn.findFirst({
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

  return `PR-${year}${month}-${String(sequence).padStart(4, '0')}`;
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

// ==================== PURCHASE QUOTATIONS ====================

/**
 * Create purchase quotation
 * POST /api/v1/purchases/quotations
 */
const createPurchaseQuotation = async (req, res) => {
  try {
    const {
      supplierId,
      quotationDate = new Date(),
      validUntil,
      items = [],
      terms,
      notes
    } = req.body;

    // Validation
    if (!supplierId || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Supplier and items are required'
      });
    }

    const companyId = req.user.companyId;

    // Verify supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, companyId }
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    // Generate quotation number
    const quotationNumber = await generatePurchaseQuotationNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(items);

    // Create quotation with items in transaction
    const quotation = await prisma.$transaction(async (tx) => {
      return await tx.purchaseQuotation.create({
        data: {
          quotationNumber,
          supplierId,
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
          supplier: {
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
      message: 'Purchase quotation created successfully'
    });
  } catch (error) {
    console.error('Create purchase quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create purchase quotation',
      message: error.message
    });
  }
};

/**
 * Get all purchase quotations with filters
 * GET /api/v1/purchases/quotations
 */
const getPurchaseQuotations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
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
    if (supplierId) where.supplierId = supplierId;

    if (startDate && endDate) {
      where.quotationDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { quotationNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [quotations, total] = await Promise.all([
      prisma.purchaseQuotation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
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
      prisma.purchaseQuotation.count({ where })
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
    console.error('Get purchase quotations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase quotations',
      message: error.message
    });
  }
};

/**
 * Get single purchase quotation by ID
 * GET /api/v1/purchases/quotations/:id
 */
const getPurchaseQuotationById = async (req, res) => {
  try {
    const quotation = await prisma.purchaseQuotation.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        },
        purchaseOrders: {
          select: { id: true, orderNumber: true, status: true }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Purchase quotation not found'
      });
    }

    res.json({
      success: true,
      data: quotation
    });
  } catch (error) {
    console.error('Get purchase quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase quotation',
      message: error.message
    });
  }
};

/**
 * Update purchase quotation
 * PUT /api/v1/purchases/quotations/:id
 */
const updatePurchaseQuotation = async (req, res) => {
  try {
    const quotationId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if quotation exists
    const existingQuotation = await prisma.purchaseQuotation.findFirst({
      where: {
        id: quotationId,
        companyId: req.user.companyId
      }
    });

    if (!existingQuotation) {
      return res.status(404).json({
        success: false,
        error: 'Purchase quotation not found'
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
      await prisma.purchaseQuotationItem.deleteMany({
        where: { quotationId }
      });
    }

    // Update quotation
    const updatedQuotation = await prisma.$transaction(async (tx) => {
      return await tx.purchaseQuotation.update({
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
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedQuotation,
      message: 'Purchase quotation updated successfully'
    });
  } catch (error) {
    console.error('Update purchase quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase quotation',
      message: error.message
    });
  }
};

/**
 * Delete purchase quotation
 * DELETE /api/v1/purchases/quotations/:id
 */
const deletePurchaseQuotation = async (req, res) => {
  try {
    const quotationId = req.params.id;

    const quotation = await prisma.purchaseQuotation.findFirst({
      where: {
        id: quotationId,
        companyId: req.user.companyId
      },
      include: {
        purchaseOrders: true
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Purchase quotation not found'
      });
    }

    // Cannot delete if quotation has been converted to purchase order
    if (quotation.purchaseOrders && quotation.purchaseOrders.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete quotation that has been converted to purchase order'
      });
    }

    // Only allow deletion of draft or expired quotations
    if (!['draft', 'expired', 'rejected'].includes(quotation.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete draft, expired, or rejected quotations'
      });
    }

    await prisma.purchaseQuotation.delete({
      where: { id: quotationId }
    });

    res.json({
      success: true,
      message: 'Purchase quotation deleted successfully'
    });
  } catch (error) {
    console.error('Delete purchase quotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete purchase quotation',
      message: error.message
    });
  }
};

/**
 * Update purchase quotation status
 * PATCH /api/v1/purchases/quotations/:id/status
 */
const updatePurchaseQuotationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const quotation = await prisma.purchaseQuotation.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        error: 'Purchase quotation not found'
      });
    }

    const updatedQuotation = await prisma.purchaseQuotation.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      }
    });

    res.json({
      success: true,
      data: updatedQuotation,
      message: `Purchase quotation status updated to ${status}`
    });
  } catch (error) {
    console.error('Update purchase quotation status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase quotation status',
      message: error.message
    });
  }
};

// ==================== PURCHASE ORDERS ====================

/**
 * Create purchase order
 * POST /api/v1/purchases/orders
 */
const createPurchaseOrder = async (req, res) => {
  try {
    const {
      quotationId,
      supplierId,
      orderDate = new Date(),
      expectedDelivery,
      items = [],
      terms,
      notes
    } = req.body;

    const companyId = req.user.companyId;
    let orderItems = items;
    let orderSupplierId = supplierId;

    // If creating from quotation, fetch quotation items
    if (quotationId) {
      const quotation = await prisma.purchaseQuotation.findFirst({
        where: { id: quotationId, companyId },
        include: { items: true }
      });

      if (!quotation) {
        return res.status(404).json({
          success: false,
          error: 'Purchase quotation not found'
        });
      }

      if (quotation.status !== 'accepted') {
        return res.status(400).json({
          success: false,
          error: 'Can only create order from accepted quotation'
        });
      }

      orderSupplierId = quotation.supplierId;
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
    if (!orderSupplierId || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Supplier and items are required'
      });
    }

    // Verify supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: { id: orderSupplierId, companyId }
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    // Generate order number
    const orderNumber = await generatePurchaseOrderNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount, discountAmount } = calculateTotals(orderItems);

    // Create purchase order with items in transaction
    const purchaseOrder = await prisma.$transaction(async (tx) => {
      return await tx.purchaseOrder.create({
        data: {
          orderNumber,
          quotationId: quotationId || null,
          supplierId: orderSupplierId,
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
          supplier: {
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
      data: purchaseOrder,
      message: 'Purchase order created successfully'
    });
  } catch (error) {
    console.error('Create purchase order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create purchase order',
      message: error.message
    });
  }
};

/**
 * Get all purchase orders with filters
 * GET /api/v1/purchases/orders
 */
const getPurchaseOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
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
    if (supplierId) where.supplierId = supplierId;

    if (startDate && endDate) {
      where.orderDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [purchaseOrders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
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
      prisma.purchaseOrder.count({ where })
    ]);

    res.json({
      success: true,
      data: purchaseOrders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase orders',
      message: error.message
    });
  }
};

/**
 * Get single purchase order by ID
 * GET /api/v1/purchases/orders/:id
 */
const getPurchaseOrderById = async (req, res) => {
  try {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        },
        quotation: {
          select: { id: true, quotationNumber: true }
        },
        goodsReceipts: {
          select: { id: true, receiptNumber: true, status: true, receiptDate: true }
        }
      }
    });

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    res.json({
      success: true,
      data: purchaseOrder
    });
  } catch (error) {
    console.error('Get purchase order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase order',
      message: error.message
    });
  }
};

/**
 * Update purchase order
 * PUT /api/v1/purchases/orders/:id
 */
const updatePurchaseOrder = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if order exists
    const existingOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        companyId: req.user.companyId
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
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
      await prisma.purchaseOrderItem.deleteMany({
        where: { orderId }
      });
    }

    // Update order
    const updatedOrder = await prisma.$transaction(async (tx) => {
      return await tx.purchaseOrder.update({
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
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Purchase order updated successfully'
    });
  } catch (error) {
    console.error('Update purchase order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase order',
      message: error.message
    });
  }
};

/**
 * Delete purchase order
 * DELETE /api/v1/purchases/orders/:id
 */
const deletePurchaseOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        companyId: req.user.companyId
      },
      include: {
        goodsReceipts: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    // Cannot delete if order has goods receipts
    if (order.goodsReceipts?.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete order that has goods receipts'
      });
    }

    // Only allow deletion of pending or cancelled orders
    if (!['pending', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending or cancelled orders'
      });
    }

    await prisma.purchaseOrder.delete({
      where: { id: orderId }
    });

    res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    });
  } catch (error) {
    console.error('Delete purchase order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete purchase order',
      message: error.message
    });
  }
};

/**
 * Update purchase order status
 * PATCH /api/v1/purchases/orders/:id/status
 */
const updatePurchaseOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    const updatedOrder = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      }
    });

    res.json({
      success: true,
      data: updatedOrder,
      message: `Purchase order status updated to ${status}`
    });
  } catch (error) {
    console.error('Update purchase order status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase order status',
      message: error.message
    });
  }
};

/**
 * Convert purchase order to bill
 * POST /api/v1/purchases/orders/:id/convert-to-bill
 */
const convertToBill = async (req, res) => {
  try {
    const orderId = req.params.id;
    const companyId = req.user.companyId;

    // Get purchase order
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id: orderId, companyId },
      include: {
        items: true,
        supplier: true
      }
    });

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      });
    }

    if (purchaseOrder.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: 'Cannot convert cancelled order to bill'
      });
    }

    // Check if bill already exists for this order
    const existingBill = await prisma.bill.findFirst({
      where: {
        companyId,
        notes: {
          contains: `Purchase Order: ${purchaseOrder.orderNumber}`
        }
      }
    });

    if (existingBill) {
      return res.status(400).json({
        success: false,
        error: 'Bill may already exist for this purchase order',
        data: existingBill
      });
    }

    // Generate bill number
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');

    const lastBill = await prisma.bill.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' }
    });

    let sequence = 1;
    if (lastBill && lastBill.billNumber) {
      const lastSequence = parseInt(lastBill.billNumber.split('-').pop());
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }

    const billNumber = `BILL-${year}${month}-${String(sequence).padStart(4, '0')}`;

    // Calculate due date based on supplier credit period
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (purchaseOrder.supplier.creditPeriodDays || 30));

    // Create bill from purchase order
    const bill = await prisma.$transaction(async (tx) => {
      const newBill = await tx.bill.create({
        data: {
          billNumber,
          supplierId: purchaseOrder.supplierId,
          companyId,
          billDate: new Date(),
          dueDate,
          subtotal: purchaseOrder.subtotal,
          taxAmount: purchaseOrder.taxAmount,
          discountAmount: purchaseOrder.discountAmount,
          totalAmount: purchaseOrder.totalAmount,
          paidAmount: 0,
          balanceAmount: purchaseOrder.totalAmount,
          status: 'DRAFT',
          notes: `Purchase Order: ${purchaseOrder.orderNumber}\n${purchaseOrder.notes || ''}`,
          items: {
            create: purchaseOrder.items.map(item => ({
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
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });

      // Update purchase order status
      await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: 'completed' }
      });

      return newBill;
    });

    res.status(201).json({
      success: true,
      data: bill,
      message: 'Purchase order converted to bill successfully'
    });
  } catch (error) {
    console.error('Convert to bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to convert purchase order to bill',
      message: error.message
    });
  }
};

// ==================== GOODS RECEIPTS ====================

/**
 * Create goods receipt
 * POST /api/v1/purchases/goods-receipts
 */
const createGoodsReceipt = async (req, res) => {
  try {
    const {
      purchaseOrderId,
      supplierId,
      receiptDate = new Date(),
      items = [],
      notes
    } = req.body;

    const companyId = req.user.companyId;
    let receiptItems = items;
    let receiptSupplierId = supplierId;

    // If creating from purchase order, fetch order items
    if (purchaseOrderId) {
      const purchaseOrder = await prisma.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, companyId },
        include: { items: true }
      });

      if (!purchaseOrder) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      receiptSupplierId = purchaseOrder.supplierId;
      receiptItems = purchaseOrder.items.map(item => ({
        productId: item.productId,
        description: item.description,
        quantity: item.quantity
      }));
    }

    // Validation
    if (!receiptSupplierId || receiptItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Supplier and items are required'
      });
    }

    // Verify supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: { id: receiptSupplierId, companyId }
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    // Generate receipt number
    const receiptNumber = await generateGoodsReceiptNumber(companyId);

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    // Create goods receipt and update inventory
    const goodsReceipt = await prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: purchaseOrderId || null,
          supplierId: receiptSupplierId,
          companyId,
          receiptDate: new Date(receiptDate),
          subtotal,
          taxAmount,
          totalAmount,
          notes,
          status: 'received',
          items: {
            create: receiptItems.map(item => ({
              productId: item.productId,
              description: item.description,
              quantity: item.quantity
            }))
          }
        },
        include: {
          supplier: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true, unit: true }
              }
            }
          },
          purchaseOrder: {
            select: { id: true, orderNumber: true }
          }
        }
      });

      // Update product stock for each item
      for (const item of receiptItems) {
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

      return receipt;
    });

    res.status(201).json({
      success: true,
      data: goodsReceipt,
      message: 'Goods receipt created successfully'
    });
  } catch (error) {
    console.error('Create goods receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create goods receipt',
      message: error.message
    });
  }
};

/**
 * Get all goods receipts
 * GET /api/v1/purchases/goods-receipts
 */
const getGoodsReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
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
    if (supplierId) where.supplierId = supplierId;

    if (startDate && endDate) {
      where.receiptDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { receiptNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [receipts, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: { id: true, name: true, email: true, phone: true }
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, productCode: true }
              }
            }
          },
          purchaseOrder: {
            select: { id: true, orderNumber: true }
          }
        }
      }),
      prisma.goodsReceipt.count({ where })
    ]);

    res.json({
      success: true,
      data: receipts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get goods receipts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goods receipts',
      message: error.message
    });
  }
};

/**
 * Get single goods receipt by ID
 * GET /api/v1/purchases/goods-receipts/:id
 */
const getGoodsReceiptById = async (req, res) => {
  try {
    const receipt = await prisma.goodsReceipt.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        },
        purchaseOrder: {
          select: { id: true, orderNumber: true, status: true }
        }
      }
    });

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Goods receipt not found'
      });
    }

    res.json({
      success: true,
      data: receipt
    });
  } catch (error) {
    console.error('Get goods receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goods receipt',
      message: error.message
    });
  }
};

/**
 * Update goods receipt
 * PUT /api/v1/purchases/goods-receipts/:id
 */
const updateGoodsReceipt = async (req, res) => {
  try {
    const receiptId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if receipt exists
    const existingReceipt = await prisma.goodsReceipt.findFirst({
      where: {
        id: receiptId,
        companyId: req.user.companyId
      },
      include: {
        items: true
      }
    });

    if (!existingReceipt) {
      return res.status(404).json({
        success: false,
        error: 'Goods receipt not found'
      });
    }

    // Only allow updates to received receipts
    if (existingReceipt.status !== 'received') {
      return res.status(400).json({
        success: false,
        error: 'Can only update received goods receipts'
      });
    }

    // If items are being updated, reverse previous stock updates and apply new ones
    const updatedReceipt = await prisma.$transaction(async (tx) => {
      if (items && items.length > 0) {
        // Reverse previous stock updates
        for (const item of existingReceipt.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                currentStock: {
                  decrement: item.quantity
                }
              }
            });
          }
        }

        // Delete existing items
        await tx.goodsReceiptItem.deleteMany({
          where: { receiptId }
        });

        // Update receipt with new items
        const receipt = await tx.goodsReceipt.update({
          where: { id: receiptId },
          data: {
            ...updateData,
            items: {
              create: items.map(item => ({
                productId: item.productId,
                description: item.description,
                quantity: item.quantity
              }))
            }
          },
          include: {
            supplier: true,
            items: {
              include: { product: true }
            }
          }
        });

        // Apply new stock updates
        for (const item of items) {
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

        return receipt;
      } else {
        // No items update, just update other fields
        return await tx.goodsReceipt.update({
          where: { id: receiptId },
          data: updateData,
          include: {
            supplier: true,
            items: {
              include: { product: true }
            }
          }
        });
      }
    });

    res.json({
      success: true,
      data: updatedReceipt,
      message: 'Goods receipt updated successfully'
    });
  } catch (error) {
    console.error('Update goods receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update goods receipt',
      message: error.message
    });
  }
};

/**
 * Delete goods receipt
 * DELETE /api/v1/purchases/goods-receipts/:id
 */
const deleteGoodsReceipt = async (req, res) => {
  try {
    const receiptId = req.params.id;

    const receipt = await prisma.goodsReceipt.findFirst({
      where: {
        id: receiptId,
        companyId: req.user.companyId
      },
      include: {
        items: true
      }
    });

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Goods receipt not found'
      });
    }

    // Only allow deletion of received receipts
    if (receipt.status !== 'received') {
      return res.status(400).json({
        success: false,
        error: 'Can only delete received goods receipts'
      });
    }

    // Delete and reverse stock updates
    await prisma.$transaction(async (tx) => {
      // Reverse stock updates
      for (const item of receipt.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: {
                decrement: item.quantity
              }
            }
          });
        }
      }

      // Delete receipt
      await tx.goodsReceipt.delete({
        where: { id: receiptId }
      });
    });

    res.json({
      success: true,
      message: 'Goods receipt deleted successfully'
    });
  } catch (error) {
    console.error('Delete goods receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete goods receipt',
      message: error.message
    });
  }
};

// ==================== PURCHASE RETURNS ====================

/**
 * Create purchase return
 * POST /api/v1/purchases/returns
 */
const createPurchaseReturn = async (req, res) => {
  try {
    const {
      supplierId,
      returnDate = new Date(),
      items = [],
      reason,
      notes
    } = req.body;

    const companyId = req.user.companyId;

    // Validation
    if (!supplierId || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Supplier and items are required'
      });
    }

    // Verify supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, companyId }
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    // Generate return number
    const returnNumber = await generatePurchaseReturnNumber(companyId);

    // Calculate totals
    const { processedItems, subtotal, taxAmount, totalAmount } = calculateTotals(items);

    // Create purchase return
    const purchaseReturn = await prisma.$transaction(async (tx) => {
      return await tx.purchaseReturn.create({
        data: {
          returnNumber,
          supplierId,
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
          supplier: {
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
      data: purchaseReturn,
      message: 'Purchase return created successfully'
    });
  } catch (error) {
    console.error('Create purchase return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create purchase return',
      message: error.message
    });
  }
};

/**
 * Get all purchase returns
 * GET /api/v1/purchases/returns
 */
const getPurchaseReturns = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
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
    if (supplierId) where.supplierId = supplierId;

    if (startDate && endDate) {
      where.returnDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [returns, total] = await Promise.all([
      prisma.purchaseReturn.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
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
      prisma.purchaseReturn.count({ where })
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
    console.error('Get purchase returns error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase returns',
      message: error.message
    });
  }
};

/**
 * Get single purchase return by ID
 * GET /api/v1/purchases/returns/:id
 */
const getPurchaseReturnById = async (req, res) => {
  try {
    const purchaseReturn = await prisma.purchaseReturn.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        supplier: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!purchaseReturn) {
      return res.status(404).json({
        success: false,
        error: 'Purchase return not found'
      });
    }

    res.json({
      success: true,
      data: purchaseReturn
    });
  } catch (error) {
    console.error('Get purchase return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch purchase return',
      message: error.message
    });
  }
};

/**
 * Update purchase return
 * PUT /api/v1/purchases/returns/:id
 */
const updatePurchaseReturn = async (req, res) => {
  try {
    const returnId = req.params.id;
    const { items, ...updateData } = req.body;

    // Check if return exists
    const existingReturn = await prisma.purchaseReturn.findFirst({
      where: {
        id: returnId,
        companyId: req.user.companyId
      }
    });

    if (!existingReturn) {
      return res.status(404).json({
        success: false,
        error: 'Purchase return not found'
      });
    }

    // Only allow updates to pending returns
    if (existingReturn.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only update pending purchase returns'
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
      await prisma.purchaseReturnItem.deleteMany({
        where: { returnId }
      });
    }

    // Update return
    const updatedReturn = await prisma.$transaction(async (tx) => {
      return await tx.purchaseReturn.update({
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
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });
    });

    res.json({
      success: true,
      data: updatedReturn,
      message: 'Purchase return updated successfully'
    });
  } catch (error) {
    console.error('Update purchase return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase return',
      message: error.message
    });
  }
};

/**
 * Delete purchase return
 * DELETE /api/v1/purchases/returns/:id
 */
const deletePurchaseReturn = async (req, res) => {
  try {
    const returnId = req.params.id;

    const purchaseReturn = await prisma.purchaseReturn.findFirst({
      where: {
        id: returnId,
        companyId: req.user.companyId
      }
    });

    if (!purchaseReturn) {
      return res.status(404).json({
        success: false,
        error: 'Purchase return not found'
      });
    }

    // Only allow deletion of pending or rejected returns
    if (!['pending', 'rejected'].includes(purchaseReturn.status)) {
      return res.status(400).json({
        success: false,
        error: 'Can only delete pending or rejected purchase returns'
      });
    }

    await prisma.purchaseReturn.delete({
      where: { id: returnId }
    });

    res.json({
      success: true,
      message: 'Purchase return deleted successfully'
    });
  } catch (error) {
    console.error('Delete purchase return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete purchase return',
      message: error.message
    });
  }
};

/**
 * Approve purchase return
 * PATCH /api/v1/purchases/returns/:id/approve
 */
const approvePurchaseReturn = async (req, res) => {
  try {
    const returnId = req.params.id;
    const companyId = req.user.companyId;

    const purchaseReturn = await prisma.purchaseReturn.findFirst({
      where: { id: returnId, companyId },
      include: { items: true, supplier: true }
    });

    if (!purchaseReturn) {
      return res.status(404).json({
        success: false,
        error: 'Purchase return not found'
      });
    }

    if (purchaseReturn.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only approve pending purchase returns'
      });
    }

    // Approve return and update inventory and supplier balance
    const approvedReturn = await prisma.$transaction(async (tx) => {
      // Update return status
      const updated = await tx.purchaseReturn.update({
        where: { id: returnId },
        data: { status: 'approved' },
        include: {
          supplier: true,
          items: {
            include: { product: true }
          }
        }
      });

      // Update product stock for each item (decrease stock)
      for (const item of purchaseReturn.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: {
                decrement: item.quantity
              }
            }
          });
        }
      }

      // Update supplier balance (decrease what we owe)
      await tx.supplier.update({
        where: { id: purchaseReturn.supplierId },
        data: {
          balance: {
            decrement: purchaseReturn.totalAmount
          }
        }
      });

      return updated;
    });

    res.json({
      success: true,
      data: approvedReturn,
      message: 'Purchase return approved successfully'
    });
  } catch (error) {
    console.error('Approve purchase return error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve purchase return',
      message: error.message
    });
  }
};

// ==================== EXPORTS ====================

module.exports = {
  // Helper functions
  generatePurchaseQuotationNumber,
  generatePurchaseOrderNumber,
  generateGoodsReceiptNumber,
  generatePurchaseReturnNumber,
  calculateTotals,

  // Purchase Quotations
  createPurchaseQuotation,
  getPurchaseQuotations,
  getPurchaseQuotationById,
  updatePurchaseQuotation,
  deletePurchaseQuotation,
  updatePurchaseQuotationStatus,

  // Purchase Orders
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  convertToBill,

  // Goods Receipts
  createGoodsReceipt,
  getGoodsReceipts,
  getGoodsReceiptById,
  updateGoodsReceipt,
  deleteGoodsReceipt,

  // Purchase Returns
  createPurchaseReturn,
  getPurchaseReturns,
  getPurchaseReturnById,
  updatePurchaseReturn,
  deletePurchaseReturn,
  approvePurchaseReturn
};
