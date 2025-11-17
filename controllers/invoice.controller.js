const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, calculateTotals, getPaginationParams } = require('../utils/helpers');

// Get invoices by company
exports.getInvoicesByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId },
        skip,
        take,
        include: {
          customer: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { invoiceDate: 'desc' }
      }),
      prisma.invoice.count({ where: { companyId } })
    ]);

    res.json(successResponse({
      invoices,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single invoice
exports.getInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        company: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            country: true,
            phone: true,
            email: true,
            taxId: true
          }
        },
        items: {
          include: {
            product: true
          }
        },
        payments: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!invoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    res.json(successResponse(invoice));
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create invoice
exports.createInvoice = async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerId,
      invoiceDate,
      dueDate,
      items,
      discountAmount,
      notes,
      termsConditions,
      status,
      companyId
    } = req.body;

    if (!customerId || !items || items.length === 0) {
      return res.status(400).json(errorResponse('Customer and invoice items are required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate invoice number if not provided
    let finalInvoiceNumber = invoiceNumber;
    if (!finalInvoiceNumber) {
      const count = await prisma.invoice.count({ where: { companyId: finalCompanyId } });
      const year = new Date().getFullYear();
      finalInvoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;
    }

    // Check if invoice number already exists
    const existing = await prisma.invoice.findFirst({
      where: {
        companyId: finalCompanyId,
        invoiceNumber: finalInvoiceNumber
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Invoice number already exists'));
    }

    // Calculate totals
    const totals = calculateTotals(items);
    const finalDiscountAmount = discountAmount || 0;
    const finalTotalAmount = totals.totalAmount - finalDiscountAmount;

    // Create invoice with items
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: finalInvoiceNumber,
        customerId,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: status || 'DRAFT',
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        paidAmount: 0,
        balanceAmount: finalTotalAmount,
        notes,
        termsConditions,
        companyId: finalCompanyId,
        createdById: req.user.userId,
        items: {
          create: items.map(item => ({
            productId: item.productId || null,
            description: item.description,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            taxRate: parseFloat(item.taxRate || 0),
            taxAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100),
            discountAmount: parseFloat(item.discountAmount || 0),
            totalAmount: (parseFloat(item.quantity) * parseFloat(item.unitPrice)) +
                        (parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100)) -
                        parseFloat(item.discountAmount || 0)
          }))
        }
      },
      include: {
        customer: true,
        items: true
      }
    });

    // Update customer balance
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        balance: {
          increment: finalTotalAmount
        }
      }
    });

    res.status(201).json(successResponse(invoice, 'Invoice created successfully'));
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update invoice
exports.updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customerId,
      invoiceDate,
      dueDate,
      items,
      discountAmount,
      notes,
      termsConditions,
      status
    } = req.body;

    // Get existing invoice
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (!existingInvoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    // Don't allow updating if paid
    if (existingInvoice.status === 'PAID') {
      return res.status(400).json(errorResponse('Cannot update a paid invoice'));
    }

    let updateData = {
      customerId,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      termsConditions,
      status
    };

    // If items are provided, recalculate totals
    if (items && items.length > 0) {
      const totals = calculateTotals(items);
      const finalDiscountAmount = discountAmount || existingInvoice.discountAmount;
      const finalTotalAmount = totals.totalAmount - finalDiscountAmount;

      updateData = {
        ...updateData,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        balanceAmount: finalTotalAmount - existingInvoice.paidAmount
      };

      // Delete existing items and create new ones
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId: id }
      });

      await prisma.invoiceItem.createMany({
        data: items.map(item => ({
          invoiceId: id,
          productId: item.productId || null,
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          taxRate: parseFloat(item.taxRate || 0),
          taxAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100),
          discountAmount: parseFloat(item.discountAmount || 0),
          totalAmount: (parseFloat(item.quantity) * parseFloat(item.unitPrice)) +
                      (parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100)) -
                      parseFloat(item.discountAmount || 0)
        }))
      });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        items: true
      }
    });

    res.json(successResponse(invoice, 'Invoice updated successfully'));
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete invoice
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice details
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (!invoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    // Don't allow deleting if payments exist
    if (invoice.paidAmount > 0) {
      return res.status(400).json(errorResponse('Cannot delete invoice with payments'));
    }

    // Update customer balance
    await prisma.customer.update({
      where: { id: invoice.customerId },
      data: {
        balance: {
          decrement: invoice.balanceAmount
        }
      }
    });

    // Delete invoice (items will cascade delete)
    await prisma.invoice.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Invoice deleted successfully'));
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};