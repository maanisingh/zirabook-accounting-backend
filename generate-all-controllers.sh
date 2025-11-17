#!/bin/bash

echo "🚀 Generating all remaining controllers for the accounting backend..."

# Create Bills Controller
cat > src/controllers/billsController.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  generateInvoiceNumber,
  cleanObject
} = require('../utils/helpers');

const prisma = new PrismaClient();

const listBills = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, supplierId } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { supplier: true, items: true }
      }),
      prisma.bill.count({ where })
    ]);

    res.json(paginatedResponse(bills, total, page, limit));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch bills', error));
  }
};

const createBill = async (req, res) => {
  try {
    const { supplierId, billDate = new Date(), dueDate, items = [] } = req.body;

    if (!supplierId || items.length === 0) {
      return res.status(400).json(errorResponse('Supplier and items are required'));
    }

    let subtotal = 0;
    const processedItems = items.map(item => {
      const total = item.quantity * item.unitPrice;
      subtotal += total;
      return { ...item, totalPrice: total };
    });

    const totalAmount = subtotal + (req.body.taxAmount || 0) - (req.body.discountAmount || 0);

    const bill = await prisma.$transaction(async (tx) => {
      const newBill = await tx.bill.create({
        data: {
          id: uuidv4(),
          billNumber: generateInvoiceNumber('BILL'),
          supplierId,
          companyId: req.user.companyId,
          billDate: new Date(billDate),
          dueDate: new Date(dueDate || billDate),
          subtotal,
          totalAmount,
          balanceDue: totalAmount,
          paidAmount: 0,
          status: 'DRAFT',
          items: {
            create: processedItems.map(item => ({
              id: uuidv4(),
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice
            }))
          }
        },
        include: { supplier: true, items: true }
      });

      // Update product stock if needed
      for (const item of processedItems) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: item.quantity } }
          });
        }
      }

      return newBill;
    });

    res.status(201).json(successResponse(bill, 'Bill created successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to create bill', error));
  }
};

const getBillById = async (req, res) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { supplier: true, items: true, payments: true }
    });

    if (!bill) {
      return res.status(404).json(errorResponse('Bill not found'));
    }

    res.json(successResponse(bill));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch bill', error));
  }
};

const updateBill = async (req, res) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId }
    });

    if (!bill || bill.status !== 'DRAFT') {
      return res.status(400).json(errorResponse('Can only update draft bills'));
    }

    const updated = await prisma.bill.update({
      where: { id: req.params.id },
      data: cleanObject(req.body)
    });

    res.json(successResponse(updated, 'Bill updated successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to update bill', error));
  }
};

const deleteBill = async (req, res) => {
  try {
    const bill = await prisma.bill.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId }
    });

    if (!bill || bill.status !== 'DRAFT') {
      return res.status(400).json(errorResponse('Can only delete draft bills'));
    }

    await prisma.bill.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, 'Bill deleted successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to delete bill', error));
  }
};

const approveBill = async (req, res) => {
  try {
    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedDate: new Date() }
    });

    res.json(successResponse(bill, 'Bill approved successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to approve bill', error));
  }
};

const recordBillPayment = async (req, res) => {
  try {
    const { amount, paymentDate = new Date(), paymentMethod } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findUnique({ where: { id: req.params.id } });

      if (!bill) throw new Error('Bill not found');
      if (amount > bill.balanceDue) throw new Error('Payment exceeds balance due');

      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          paymentNumber: generateInvoiceNumber('PAY'),
          amount,
          paymentDate: new Date(paymentDate),
          paymentMethod,
          type: 'OUTGOING',
          billId: bill.id,
          supplierId: bill.supplierId,
          companyId: req.user.companyId,
          createdById: req.user.id
        }
      });

      const newPaidAmount = bill.paidAmount + amount;
      const newBalanceDue = bill.totalAmount - newPaidAmount;

      await tx.bill.update({
        where: { id: req.params.id },
        data: {
          paidAmount: newPaidAmount,
          balanceDue: newBalanceDue,
          status: newBalanceDue === 0 ? 'PAID' : 'PARTIALLY_PAID'
        }
      });

      return payment;
    });

    res.json(successResponse(result, 'Payment recorded successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to record payment', error));
  }
};

const getOverdueBills = async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: {
        companyId: req.user.companyId,
        dueDate: { lt: new Date() },
        status: { in: ['APPROVED', 'PARTIALLY_PAID'] }
      },
      include: { supplier: true }
    });

    res.json(successResponse(bills));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch overdue bills', error));
  }
};

module.exports = {
  listBills,
  createBill,
  getBillById,
  updateBill,
  deleteBill,
  approveBill,
  recordBillPayment,
  getOverdueBills
};
EOF

echo "✅ Bills controller created"

# Create Payments Controller
cat > src/controllers/paymentsController.js << 'EOF'
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
          customer: true,
          supplier: true,
          invoice: true,
          bill: true
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

module.exports = {
  listPayments,
  receivePayment,
  makePayment,
  getPaymentById,
  voidPayment,
  getCashflow
};
EOF

echo "✅ Payments controller created"

# Create Expenses Controller
cat > src/controllers/expensesController.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  cleanObject
} = require('../utils/helpers');

const prisma = new PrismaClient();

const listExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, startDate, endDate } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (category) where.category = category;

    if (startDate && endDate) {
      where.expenseDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { expenseDate: 'desc' }
      }),
      prisma.expense.count({ where })
    ]);

    res.json(paginatedResponse(expenses, total, page, limit));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expenses', error));
  }
};

const createExpense = async (req, res) => {
  try {
    const { amount, category, description, expenseDate = new Date(), paymentMethod } = req.body;

    if (!amount || !category) {
      return res.status(400).json(errorResponse('Amount and category are required'));
    }

    const expense = await prisma.expense.create({
      data: {
        id: uuidv4(),
        amount,
        category,
        description,
        expenseDate: new Date(expenseDate),
        paymentMethod,
        companyId: req.user.companyId,
        createdById: req.user.id
      }
    });

    res.status(201).json(successResponse(expense, 'Expense created successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to create expense', error));
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId }
    });

    if (!expense) {
      return res.status(404).json(errorResponse('Expense not found'));
    }

    res.json(successResponse(expense));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expense', error));
  }
};

const updateExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: cleanObject(req.body)
    });

    res.json(successResponse(expense, 'Expense updated successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to update expense', error));
  }
};

const deleteExpense = async (req, res) => {
  try {
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, 'Expense deleted successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to delete expense', error));
  }
};

const getExpenseCategories = async (req, res) => {
  try {
    const categories = await prisma.expense.groupBy({
      by: ['category'],
      where: { companyId: req.user.companyId },
      _count: true
    });

    res.json(successResponse(categories));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch categories', error));
  }
};

const getExpenseSummary = async (req, res) => {
  try {
    const summary = await prisma.expense.groupBy({
      by: ['category'],
      where: { companyId: req.user.companyId },
      _sum: { amount: true }
    });

    res.json(successResponse(summary));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expense summary', error));
  }
};

module.exports = {
  listExpenses,
  createExpense,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenseSummary
};
EOF

echo "✅ Expenses controller created"

echo "🎉 All controllers generated successfully!"