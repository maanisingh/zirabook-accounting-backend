const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  generateInvoiceNumber
} = require('../utils/helpers');

const prisma = new PrismaClient();

const listPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (type) where.type = type;

    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { paymentDate: 'desc' },
        include: {
          invoice: true,
          bill: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }),
      prisma.payment.count({ where })
    ]);

    res.json(paginatedResponse(payments, total, page, limit));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch payments', error));
  }
};

const receivePayment = async (req, res) => {
  try {
    const { customerId, amount, paymentDate = new Date(), paymentMethod, invoiceId } = req.body;

    if (!customerId || !amount) {
      return res.status(400).json(errorResponse('Customer and amount are required'));
    }

    const payment = await prisma.payment.create({
      data: {
        id: uuidv4(),
        paymentNumber: generateInvoiceNumber('REC'),
        type: 'INCOMING',
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        customerId,
        invoiceId,
        companyId: req.user.companyId,
        createdById: req.user.id
      }
    });

    res.status(201).json(successResponse(payment, 'Payment received successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to receive payment', error));
  }
};

const makePayment = async (req, res) => {
  try {
    const { supplierId, amount, paymentDate = new Date(), paymentMethod, billId } = req.body;

    if (!supplierId || !amount) {
      return res.status(400).json(errorResponse('Supplier and amount are required'));
    }

    const payment = await prisma.payment.create({
      data: {
        id: uuidv4(),
        paymentNumber: generateInvoiceNumber('PAY'),
        type: 'OUTGOING',
        amount,
        paymentDate: new Date(paymentDate),
        paymentMethod,
        supplierId,
        billId,
        companyId: req.user.companyId,
        createdById: req.user.id
      }
    });

    res.status(201).json(successResponse(payment, 'Payment made successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to make payment', error));
  }
};

const getPaymentById = async (req, res) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { customer: true, supplier: true, invoice: true, bill: true }
    });

    if (!payment) {
      return res.status(404).json(errorResponse('Payment not found'));
    }

    res.json(successResponse(payment));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch payment', error));
  }
};

const voidPayment = async (req, res) => {
  try {
    await prisma.payment.update({
      where: { id: req.params.id },
      data: { status: 'VOIDED' }
    });

    res.json(successResponse(null, 'Payment voided successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to void payment', error));
  }
};

const getCashflow = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate && endDate) {
      dateFilter.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [incoming, outgoing] = await Promise.all([
      prisma.payment.aggregate({
        where: { companyId: req.user.companyId, type: 'INCOMING', ...dateFilter },
        _sum: { amount: true }
      }),
      prisma.payment.aggregate({
        where: { companyId: req.user.companyId, type: 'OUTGOING', ...dateFilter },
        _sum: { amount: true }
      })
    ]);

    const cashflow = {
      totalIncoming: incoming._sum.amount || 0,
      totalOutgoing: outgoing._sum.amount || 0,
      netCashflow: (incoming._sum.amount || 0) - (outgoing._sum.amount || 0)
    };

    res.json(successResponse(cashflow));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch cashflow', error));
  }
};

const autoAllocatePayment = async (req, res) => {
  try {
    const { customerId, supplierId, amount, paymentDate = new Date(), paymentMethod, notes } = req.body;

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json(errorResponse('Valid payment amount is required'));
    }

    if (!customerId && !supplierId) {
      return res.status(400).json(errorResponse('Either customerId or supplierId is required'));
    }

    if (customerId && supplierId) {
      return res.status(400).json(errorResponse('Cannot specify both customerId and supplierId'));
    }

    // Use transaction for data consistency
    const result = await prisma.$transaction(async (tx) => {
      let remainingAmount = amount;
      const allocations = [];
      let paymentType;
      let paymentNumberPrefix;

      if (customerId) {
        // Handle customer payment - allocate to unpaid invoices
        paymentType = 'INCOMING';
        paymentNumberPrefix = 'REC';

        // Verify customer exists
        const customer = await tx.customer.findFirst({
          where: { id: customerId, companyId: req.user.companyId }
        });

        if (!customer) {
          throw new Error('Customer not found');
        }

        // Get all unpaid/partially paid invoices sorted by date (oldest first)
        const unpaidInvoices = await tx.invoice.findMany({
          where: {
            customerId,
            companyId: req.user.companyId,
            status: {
              in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE']
            },
            balanceAmount: {
              gt: 0
            }
          },
          orderBy: {
            invoiceDate: 'asc'
          }
        });

        // Allocate payment to invoices
        for (const invoice of unpaidInvoices) {
          if (remainingAmount <= 0) break;

          const allocationAmount = Math.min(remainingAmount, invoice.balanceAmount);
          const newPaidAmount = invoice.paidAmount + allocationAmount;
          const newBalanceAmount = invoice.balanceAmount - allocationAmount;

          // Determine new status
          let newStatus = invoice.status;
          if (newBalanceAmount === 0) {
            newStatus = 'PAID';
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID';
          }

          // Create payment record
          const payment = await tx.payment.create({
            data: {
              id: uuidv4(),
              paymentNumber: generateInvoiceNumber(paymentNumberPrefix),
              type: paymentType,
              amount: allocationAmount,
              paymentDate: new Date(paymentDate),
              paymentMethod,
              notes,
              customerId,
              invoiceId: invoice.id,
              companyId: req.user.companyId,
              createdById: req.user.id
            }
          });

          // Update invoice
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: newPaidAmount,
              balanceAmount: newBalanceAmount,
              status: newStatus
            }
          });

          allocations.push({
            paymentId: payment.id,
            paymentNumber: payment.paymentNumber,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: allocationAmount,
            previousBalance: invoice.balanceAmount,
            newBalance: newBalanceAmount,
            status: newStatus
          });

          remainingAmount -= allocationAmount;
        }
      } else {
        // Handle supplier payment - allocate to unpaid bills
        paymentType = 'OUTGOING';
        paymentNumberPrefix = 'PAY';

        // Verify supplier exists
        const supplier = await tx.supplier.findFirst({
          where: { id: supplierId, companyId: req.user.companyId }
        });

        if (!supplier) {
          throw new Error('Supplier not found');
        }

        // Get all unpaid/partially paid bills sorted by date (oldest first)
        const unpaidBills = await tx.bill.findMany({
          where: {
            supplierId,
            companyId: req.user.companyId,
            status: {
              in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE']
            },
            balanceAmount: {
              gt: 0
            }
          },
          orderBy: {
            billDate: 'asc'
          }
        });

        // Allocate payment to bills
        for (const bill of unpaidBills) {
          if (remainingAmount <= 0) break;

          const allocationAmount = Math.min(remainingAmount, bill.balanceAmount);
          const newPaidAmount = bill.paidAmount + allocationAmount;
          const newBalanceAmount = bill.balanceAmount - allocationAmount;

          // Determine new status
          let newStatus = bill.status;
          if (newBalanceAmount === 0) {
            newStatus = 'PAID';
          } else if (newPaidAmount > 0) {
            newStatus = 'PARTIALLY_PAID';
          }

          // Create payment record
          const payment = await tx.payment.create({
            data: {
              id: uuidv4(),
              paymentNumber: generateInvoiceNumber(paymentNumberPrefix),
              type: paymentType,
              amount: allocationAmount,
              paymentDate: new Date(paymentDate),
              paymentMethod,
              notes,
              supplierId,
              billId: bill.id,
              companyId: req.user.companyId,
              createdById: req.user.id
            }
          });

          // Update bill
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paidAmount: newPaidAmount,
              balanceAmount: newBalanceAmount,
              status: newStatus
            }
          });

          allocations.push({
            paymentId: payment.id,
            paymentNumber: payment.paymentNumber,
            billId: bill.id,
            billNumber: bill.billNumber,
            amount: allocationAmount,
            previousBalance: bill.balanceAmount,
            newBalance: newBalanceAmount,
            status: newStatus
          });

          remainingAmount -= allocationAmount;
        }
      }

      return {
        allocations,
        totalAllocated: amount - remainingAmount,
        remainingAmount,
        paymentType
      };
    });

    if (result.allocations.length === 0) {
      return res.status(404).json(errorResponse('No unpaid invoices/bills found for allocation'));
    }

    res.status(201).json(successResponse({
      message: 'Payment auto-allocated successfully',
      totalAmount: amount,
      totalAllocated: result.totalAllocated,
      remainingAmount: result.remainingAmount,
      allocationsCount: result.allocations.length,
      allocations: result.allocations
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to auto-allocate payment', error));
  }
};

module.exports = {
  listPayments,
  receivePayment,
  makePayment,
  getPaymentById,
  voidPayment,
  getCashflow,
  autoAllocatePayment
};
