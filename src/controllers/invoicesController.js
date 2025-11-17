const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  sanitizeSearchQuery,
  cleanObject,
  generateInvoiceNumber,
  calculateLineItemsTotal
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * List invoices with filters
 * GET /api/v1/invoices
 */
const listInvoices = async (req, res) => {
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

    const { skip, take } = paginate(page, limit);
    const companyId = req.user.companyId;

    // Build where clause
    const where = { companyId };

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (startDate && endDate) {
      where.invoiceDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    if (search) {
      const searchTerm = sanitizeSearchQuery(search);
      where.OR = [
        { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
        { customer: { name: { contains: searchTerm, mode: 'insensitive' } } }
      ];
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true }
          },
          items: true
        }
      }),
      prisma.invoice.count({ where })
    ]);

    res.json(paginatedResponse(invoices, total, page, limit));
  } catch (error) {
    console.error('List invoices error:', error);
    res.status(500).json(errorResponse('Failed to fetch invoices', error));
  }
};

/**
 * Create invoice
 * POST /api/v1/invoices
 */
const createInvoice = async (req, res) => {
  try {
    const {
      customerId,
      invoiceDate = new Date(),
      dueDate,
      items = [],
      notes,
      termsConditions
    } = req.body;

    // Validate required fields
    if (!customerId || items.length === 0) {
      return res.status(400).json(errorResponse('Customer and items are required'));
    }

    const companyId = req.user.companyId;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Calculate due date if not provided
    const paymentDays = customer.creditPeriodDays || 30; // Default to 30 days if not set
    const calculatedDueDate = dueDate || new Date(
      new Date(invoiceDate).getTime() + paymentDays * 24 * 60 * 60 * 1000
    );

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber('INV');

    // Calculate totals
    let subtotal = 0;
    let totalTaxAmount = 0;
    let totalDiscountAmount = 0;

    const processedItems = items.map(item => {
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscountAmount = item.discountAmount || 0;
      const itemTaxRate = item.taxRate || 0;

      // Calculate tax on (subtotal - discount)
      const taxableAmount = itemSubtotal - itemDiscountAmount;
      const itemTaxAmount = (taxableAmount * itemTaxRate) / 100;
      const itemTotal = taxableAmount + itemTaxAmount;

      subtotal += itemSubtotal;
      totalDiscountAmount += itemDiscountAmount;
      totalTaxAmount += itemTaxAmount;

      return {
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: itemTaxRate,
        taxAmount: itemTaxAmount,
        discountAmount: itemDiscountAmount,
        totalAmount: itemTotal
      };
    });

    const totalAmount = subtotal - totalDiscountAmount + totalTaxAmount;

    // Create invoice with transaction
    const invoice = await prisma.$transaction(async (tx) => {
      // Create invoice
      const newInvoice = await tx.invoice.create({
        data: {
          id: uuidv4(),
          invoiceNumber,
          customerId,
          companyId,
          invoiceDate: new Date(invoiceDate),
          dueDate: calculatedDueDate,
          subtotal,
          discountAmount: totalDiscountAmount,
          taxAmount: totalTaxAmount,
          totalAmount,
          paidAmount: 0,
          balanceAmount: totalAmount,
          status: 'DRAFT',
          notes,
          termsConditions,
          createdById: req.user.id,
          items: {
            create: processedItems.map(item => ({
              id: uuidv4(),
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
          items: true
        }
      });

      // Update product stock if needed
      for (const item of processedItems) {
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

      return newInvoice;
    });

    res.status(201).json(successResponse(invoice, 'Invoice created successfully'));
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json(errorResponse('Failed to create invoice', error));
  }
};

/**
 * Get invoice details
 * GET /api/v1/invoices/:id
 */
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: {
          include: { product: true }
        },
        payments: true,
        createdBy: {
          select: { id: true, name: true, email: true }
        },
        company: true
      }
    });

    if (!invoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    res.json(successResponse(invoice));
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json(errorResponse('Failed to fetch invoice', error));
  }
};

/**
 * Update draft invoice
 * PUT /api/v1/invoices/:id
 */
const updateInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id;

    // Check if invoice exists and is DRAFT
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: req.user.companyId
      }
    });

    if (!existingInvoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    if (existingInvoice.status !== 'DRAFT') {
      return res.status(400).json(errorResponse('Can only update draft invoices'));
    }

    // Recalculate totals if items changed
    const { items } = req.body;
    let updateData = cleanObject(req.body);

    if (items) {
      let subtotal = 0;
      let totalTaxAmount = 0;
      let totalDiscountAmount = 0;

      const processedItems = items.map(item => {
        const itemSubtotal = item.quantity * item.unitPrice;
        const itemDiscountAmount = item.discountAmount || 0;
        const itemTaxRate = item.taxRate || 0;

        const taxableAmount = itemSubtotal - itemDiscountAmount;
        const itemTaxAmount = (taxableAmount * itemTaxRate) / 100;
        const itemTotal = taxableAmount + itemTaxAmount;

        subtotal += itemSubtotal;
        totalDiscountAmount += itemDiscountAmount;
        totalTaxAmount += itemTaxAmount;

        return {
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: itemTaxRate,
          taxAmount: itemTaxAmount,
          discountAmount: itemDiscountAmount,
          totalAmount: itemTotal
        };
      });

      const totalAmount = subtotal - totalDiscountAmount + totalTaxAmount;

      updateData = {
        ...updateData,
        subtotal,
        discountAmount: totalDiscountAmount,
        taxAmount: totalTaxAmount,
        totalAmount,
        balanceAmount: totalAmount
      };

      // Delete existing items and create new ones
      await prisma.invoiceItem.deleteMany({
        where: { invoiceId }
      });

      // Store processed items for later use
      updateData.processedItems = processedItems;
    }

    // Remove processedItems from updateData before update
    const processedItemsForCreate = updateData.processedItems;
    delete updateData.processedItems;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ...updateData,
        items: items ? {
          create: processedItemsForCreate.map(item => ({
            id: uuidv4(),
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            discountAmount: item.discountAmount,
            totalAmount: item.totalAmount
          }))
        } : undefined
      },
      include: {
        customer: true,
        items: true
      }
    });

    res.json(successResponse(updatedInvoice, 'Invoice updated successfully'));
  } catch (error) {
    console.error('Update invoice error:', error);
    res.status(500).json(errorResponse('Failed to update invoice', error));
  }
};

/**
 * Delete draft invoice
 * DELETE /api/v1/invoices/:id
 */
const deleteInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: req.user.companyId
      }
    });

    if (!invoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    if (invoice.status !== 'DRAFT') {
      return res.status(400).json(errorResponse('Can only delete draft invoices'));
    }

    // Delete invoice and items (cascade)
    await prisma.invoice.delete({
      where: { id: invoiceId }
    });

    res.json(successResponse(null, 'Invoice deleted successfully'));
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json(errorResponse('Failed to delete invoice', error));
  }
};

/**
 * Send invoice (mark as sent)
 * PATCH /api/v1/invoices/:id/send
 */
const sendInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: req.user.companyId
        }
      });

      if (!existingInvoice) {
        throw new Error('Invoice not found');
      }

      if (existingInvoice.status !== 'DRAFT') {
        throw new Error('Invoice has already been sent');
      }

      // Update invoice status
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'SENT'
        }
      });

      // Create accounting entries
      await createInvoiceAccountingEntries(tx, updatedInvoice, req.user.companyId);

      // Update customer balance
      await tx.customer.update({
        where: { id: updatedInvoice.customerId },
        data: {
          balance: {
            increment: updatedInvoice.totalAmount
          }
        }
      });

      return updatedInvoice;
    });

    // In production, send email to customer here
    // await sendInvoiceEmail(invoice);

    res.json(successResponse(invoice, 'Invoice sent successfully'));
  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to send invoice', error));
  }
};

/**
 * Record payment for invoice
 * PATCH /api/v1/invoices/:id/payment
 */
const recordPayment = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { amount, paymentDate = new Date(), paymentMethod, reference } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json(errorResponse('Valid payment amount is required'));
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: req.user.companyId
        }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'PAID') {
        throw new Error('Invoice is already fully paid');
      }

      if (amount > invoice.balanceAmount) {
        throw new Error('Payment amount exceeds balance due');
      }

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          paymentNumber: generateInvoiceNumber('PAY'),
          paymentDate: new Date(paymentDate),
          amount,
          paymentMethod,
          reference,
          type: 'INCOMING',
          invoiceId,
          customerId: invoice.customerId,
          companyId: req.user.companyId,
          createdById: req.user.id
        }
      });

      // Update invoice
      const newPaidAmount = invoice.paidAmount + amount;
      const newBalanceDue = invoice.totalAmount - newPaidAmount;
      const newStatus = newBalanceDue === 0 ? 'PAID' : 'PARTIALLY_PAID';

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: newBalanceDue,
          status: newStatus
        }
      });

      // Update customer balance
      await tx.customer.update({
        where: { id: invoice.customerId },
        data: {
          balance: {
            decrement: amount
          }
        }
      });

      // Create accounting entries for payment
      await createPaymentAccountingEntries(tx, payment, invoice, req.user.companyId);

      return { invoice: updatedInvoice, payment };
    });

    res.json(successResponse(result, 'Payment recorded successfully'));
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to record payment', error));
  }
};

/**
 * Get overdue invoices
 * GET /api/v1/invoices/overdue
 */
const getOverdueInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { skip, take } = paginate(page, limit);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = {
      companyId: req.user.companyId,
      dueDate: { lt: today },
      status: { in: ['SENT', 'PARTIALLY_PAID'] }
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { dueDate: 'asc' },
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true }
          }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    // Calculate days overdue
    const overdueInvoices = invoices.map(invoice => {
      const daysOverdue = Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
      return {
        ...invoice,
        daysOverdue
      };
    });

    res.json(paginatedResponse(overdueInvoices, total, page, limit));
  } catch (error) {
    console.error('Get overdue invoices error:', error);
    res.status(500).json(errorResponse('Failed to fetch overdue invoices', error));
  }
};

/**
 * Get invoice statistics
 * GET /api/v1/invoices/stats
 */
const getInvoiceStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const companyId = req.user.companyId;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.invoiceDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [totalInvoices, paidInvoices, overdueInvoices, revenue] = await Promise.all([
      prisma.invoice.count({
        where: { companyId, ...dateFilter }
      }),
      prisma.invoice.count({
        where: { companyId, status: 'PAID', ...dateFilter }
      }),
      prisma.invoice.count({
        where: {
          companyId,
          status: { in: ['SENT', 'PARTIALLY_PAID'] },
          dueDate: { lt: new Date() }
        }
      }),
      prisma.invoice.aggregate({
        where: { companyId, status: 'PAID', ...dateFilter },
        _sum: { totalAmount: true }
      })
    ]);

    const stats = {
      totalInvoices,
      paidInvoices,
      overdueInvoices,
      totalRevenue: revenue._sum.totalAmount || 0,
      averageInvoiceValue: totalInvoices > 0
        ? (revenue._sum.totalAmount || 0) / paidInvoices
        : 0
    };

    res.json(successResponse(stats));
  } catch (error) {
    console.error('Get invoice stats error:', error);
    res.status(500).json(errorResponse('Failed to fetch invoice statistics', error));
  }
};

/**
 * Generate PDF (placeholder)
 * GET /api/v1/invoices/:id/pdf
 */
const generateInvoicePDF = async (req, res) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        customer: true,
        items: true,
        company: true
      }
    });

    if (!invoice) {
      return res.status(404).json(errorResponse('Invoice not found'));
    }

    // In production, generate actual PDF using pdfkit or similar
    res.json(successResponse({
      message: 'PDF generation would happen here',
      invoiceNumber: invoice.invoiceNumber
    }));
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json(errorResponse('Failed to generate PDF', error));
  }
};

// Helper function to create accounting entries for invoice
async function createInvoiceAccountingEntries(tx, invoice, companyId) {
  // Get default accounts
  const [receivableAccount, revenueAccount, taxPayableAccount] = await Promise.all([
    tx.account.findFirst({
      where: { companyId, accountCode: '1200' } // Accounts Receivable
    }),
    tx.account.findFirst({
      where: { companyId, accountCode: '4000' } // Sales Revenue
    }),
    tx.account.findFirst({
      where: { companyId, accountCode: '2300' } // Tax Payable
    })
  ]);

  if (!receivableAccount || !revenueAccount) {
    throw new Error('Default accounts not configured (AR or Revenue missing)');
  }

  // Build journal line items
  const lineItems = [
    {
      id: uuidv4(),
      accountId: receivableAccount.id,
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
      description: `AR - ${invoice.invoiceNumber}`
    },
    {
      id: uuidv4(),
      accountId: revenueAccount.id,
      debitAmount: 0,
      creditAmount: invoice.subtotal - invoice.discountAmount, // Revenue = subtotal minus discounts
      description: `Revenue - ${invoice.invoiceNumber}`
    }
  ];

  // Add tax liability line if there's tax and tax account exists
  if (invoice.taxAmount > 0 && taxPayableAccount) {
    lineItems.push({
      id: uuidv4(),
      accountId: taxPayableAccount.id,
      debitAmount: 0,
      creditAmount: invoice.taxAmount,
      description: `Tax Payable - ${invoice.invoiceNumber}`
    });
  }

  // Calculate totals for double-entry validation
  const totalDebit = lineItems.reduce((sum, item) => sum + item.debitAmount, 0);
  const totalCredit = lineItems.reduce((sum, item) => sum + item.creditAmount, 0);

  // Create journal entry
  const journalEntry = await tx.journalEntry.create({
    data: {
      id: uuidv4(),
      journalNumber: generateInvoiceNumber('JE'),
      entryDate: invoice.invoiceDate,
      description: `Invoice ${invoice.invoiceNumber}`,
      totalDebit,
      totalCredit,
      status: 'POSTED',
      companyId,
      createdById: invoice.createdById,
      lineItems: {
        create: lineItems
      }
    }
  });

  // Update account balances
  await tx.account.update({
    where: { id: receivableAccount.id },
    data: { balance: { increment: invoice.totalAmount } }
  });

  await tx.account.update({
    where: { id: revenueAccount.id },
    data: { balance: { increment: invoice.subtotal - invoice.discountAmount } }
  });

  if (invoice.taxAmount > 0 && taxPayableAccount) {
    await tx.account.update({
      where: { id: taxPayableAccount.id },
      data: { balance: { increment: invoice.taxAmount } }
    });
  }

  return journalEntry;
}

// Helper function to create accounting entries for payment
async function createPaymentAccountingEntries(tx, payment, invoice, companyId) {
  const [cashAccount, receivableAccount] = await Promise.all([
    tx.account.findFirst({
      where: { companyId, accountCode: '1100' } // Bank Account
    }),
    tx.account.findFirst({
      where: { companyId, accountCode: '1200' } // Accounts Receivable
    })
  ]);

  if (!cashAccount || !receivableAccount) {
    throw new Error('Default accounts not configured (Cash or AR missing)');
  }

  const lineItems = [
    {
      id: uuidv4(),
      accountId: cashAccount.id,
      debitAmount: payment.amount,
      creditAmount: 0,
      description: `Payment received - ${payment.paymentNumber}`
    },
    {
      id: uuidv4(),
      accountId: receivableAccount.id,
      debitAmount: 0,
      creditAmount: payment.amount,
      description: `AR reduction - ${invoice.invoiceNumber}`
    }
  ];

  const journalEntry = await tx.journalEntry.create({
    data: {
      id: uuidv4(),
      journalNumber: generateInvoiceNumber('JE'),
      entryDate: payment.paymentDate,
      description: `Payment for Invoice ${invoice.invoiceNumber}`,
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      status: 'POSTED',
      companyId,
      createdById: payment.createdById,
      lineItems: {
        create: lineItems
      }
    }
  });

  // Update account balances
  await tx.account.update({
    where: { id: cashAccount.id },
    data: { balance: { increment: payment.amount } }
  });

  await tx.account.update({
    where: { id: receivableAccount.id },
    data: { balance: { decrement: payment.amount } }
  });

  return journalEntry;
}

module.exports = {
  listInvoices,
  createInvoice,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  recordPayment,
  getOverdueInvoices,
  getInvoiceStatistics,
  generateInvoicePDF
};