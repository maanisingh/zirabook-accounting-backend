const { PrismaClient } = require('@prisma/client');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Get ledger entries for a specific account
 * GET /api/v1/ledger/account/:accountId
 */
const getAccountLedger = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);
    const companyId = req.user.companyId;

    // Verify account exists and belongs to company
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        companyId
      },
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        balance: true
      }
    });

    if (!account) {
      return res.status(404).json(errorResponse('Account not found'));
    }

    // Build where clause for ledger entries
    const where = {
      accountId,
      companyId
    };

    if (startDate && endDate) {
      where.transactionDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get ledger entries with pagination
    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        skip,
        take,
        orderBy: { transactionDate: 'desc' },
        select: {
          id: true,
          transactionDate: true,
          debitAmount: true,
          creditAmount: true,
          balance: true,
          description: true,
          referenceType: true,
          referenceId: true,
          createdAt: true
        }
      }),
      prisma.ledgerEntry.count({ where })
    ]);

    // Calculate running balance (from oldest to newest)
    let runningBalance = 0;
    const ledgerEntries = entries.reverse().map(entry => {
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        runningBalance += entry.debitAmount - entry.creditAmount;
      } else {
        runningBalance += entry.creditAmount - entry.debitAmount;
      }
      return {
        ...entry,
        runningBalance
      };
    }).reverse();

    // Calculate totals
    const totalDebits = entries.reduce((sum, entry) => sum + entry.debitAmount, 0);
    const totalCredits = entries.reduce((sum, entry) => sum + entry.creditAmount, 0);

    const result = {
      account,
      entries: ledgerEntries,
      summary: {
        openingBalance: account.balance - (totalDebits - totalCredits),
        totalDebits,
        totalCredits,
        closingBalance: account.balance
      }
    };

    res.json(paginatedResponse(result, total, page, limit));
  } catch (error) {
    console.error('Get account ledger error:', error);
    res.status(500).json(errorResponse('Failed to fetch account ledger', error));
  }
};

/**
 * Get ledger for a specific customer
 * GET /api/v1/ledger/customer/:customerId
 */
const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);
    const companyId = req.user.companyId;

    // Verify customer exists and belongs to company
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId
      },
      select: {
        id: true,
        customerCode: true,
        name: true,
        email: true,
        phone: true,
        balance: true,
        creditLimit: true
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.gte = new Date(startDate);
      dateFilter.lte = new Date(endDate);
    }

    // Get invoices
    const invoicesWhere = { customerId, companyId };
    if (startDate && endDate) {
      invoicesWhere.invoiceDate = dateFilter;
    }

    // Get payments
    const paymentsWhere = {
      companyId,
      invoice: { customerId }
    };
    if (startDate && endDate) {
      paymentsWhere.paymentDate = dateFilter;
    }

    // Get sales orders
    const salesOrdersWhere = { customerId, companyId };
    if (startDate && endDate) {
      salesOrdersWhere.orderDate = dateFilter;
    }

    const [invoices, payments, salesOrders] = await Promise.all([
      prisma.invoice.findMany({
        where: invoicesWhere,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
          status: true
        },
        orderBy: { invoiceDate: 'desc' }
      }),
      prisma.payment.findMany({
        where: paymentsWhere,
        select: {
          id: true,
          paymentNumber: true,
          paymentDate: true,
          amount: true,
          paymentMethod: true,
          invoice: {
            select: {
              invoiceNumber: true
            }
          }
        },
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.salesOrder.findMany({
        where: salesOrdersWhere,
        select: {
          id: true,
          orderNumber: true,
          orderDate: true,
          totalAmount: true,
          status: true
        },
        orderBy: { orderDate: 'desc' }
      })
    ]);

    // Combine all transactions and sort by date
    const transactions = [
      ...invoices.map(inv => ({
        id: inv.id,
        date: inv.invoiceDate,
        type: 'INVOICE',
        reference: inv.invoiceNumber,
        description: `Invoice ${inv.invoiceNumber}`,
        debit: inv.totalAmount,
        credit: 0,
        balance: inv.balanceAmount,
        status: inv.status,
        dueDate: inv.dueDate
      })),
      ...payments.map(pay => ({
        id: pay.id,
        date: pay.paymentDate,
        type: 'PAYMENT',
        reference: pay.paymentNumber,
        description: `Payment received - ${pay.invoice?.invoiceNumber || 'Direct'}`,
        debit: 0,
        credit: pay.amount,
        paymentMethod: pay.paymentMethod
      })),
      ...salesOrders.map(so => ({
        id: so.id,
        date: so.orderDate,
        type: 'SALES_ORDER',
        reference: so.orderNumber,
        description: `Sales Order ${so.orderNumber}`,
        amount: so.totalAmount,
        status: so.status
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination to combined transactions
    const paginatedTransactions = transactions.slice(skip, skip + take);

    // Calculate running balance
    let runningBalance = 0;
    const ledgerEntries = paginatedTransactions.map(transaction => {
      if (transaction.type === 'INVOICE') {
        runningBalance += transaction.debit;
      } else if (transaction.type === 'PAYMENT') {
        runningBalance -= transaction.credit;
      }
      return {
        ...transaction,
        runningBalance
      };
    });

    // Calculate summary
    const totalInvoices = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPayments = payments.reduce((sum, pay) => sum + pay.amount, 0);
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

    const result = {
      customer,
      transactions: ledgerEntries,
      summary: {
        totalInvoices,
        totalPayments,
        totalOutstanding,
        currentBalance: customer.balance,
        creditLimit: customer.creditLimit,
        availableCredit: customer.creditLimit ? customer.creditLimit - customer.balance : null,
        invoiceCount: invoices.length,
        paymentCount: payments.length,
        salesOrderCount: salesOrders.length
      }
    };

    res.json(paginatedResponse(result, transactions.length, page, limit));
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json(errorResponse('Failed to fetch customer ledger', error));
  }
};

/**
 * Get ledger for a specific supplier
 * GET /api/v1/ledger/supplier/:supplierId
 */
const getSupplierLedger = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);
    const companyId = req.user.companyId;

    // Verify supplier exists and belongs to company
    const supplier = await prisma.supplier.findFirst({
      where: {
        id: supplierId,
        companyId
      },
      select: {
        id: true,
        supplierCode: true,
        name: true,
        email: true,
        phone: true,
        balance: true
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.gte = new Date(startDate);
      dateFilter.lte = new Date(endDate);
    }

    // Get bills
    const billsWhere = { supplierId, companyId };
    if (startDate && endDate) {
      billsWhere.billDate = dateFilter;
    }

    // Get payments
    const paymentsWhere = {
      companyId,
      bill: { supplierId }
    };
    if (startDate && endDate) {
      paymentsWhere.paymentDate = dateFilter;
    }

    // Get purchase orders
    const purchaseOrdersWhere = { supplierId, companyId };
    if (startDate && endDate) {
      purchaseOrdersWhere.orderDate = dateFilter;
    }

    const [bills, payments, purchaseOrders] = await Promise.all([
      prisma.bill.findMany({
        where: billsWhere,
        select: {
          id: true,
          billNumber: true,
          billDate: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          balanceAmount: true,
          status: true
        },
        orderBy: { billDate: 'desc' }
      }),
      prisma.payment.findMany({
        where: paymentsWhere,
        select: {
          id: true,
          paymentNumber: true,
          paymentDate: true,
          amount: true,
          paymentMethod: true,
          bill: {
            select: {
              billNumber: true
            }
          }
        },
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.purchaseOrder.findMany({
        where: purchaseOrdersWhere,
        select: {
          id: true,
          orderNumber: true,
          orderDate: true,
          totalAmount: true,
          status: true
        },
        orderBy: { orderDate: 'desc' }
      })
    ]);

    // Combine all transactions and sort by date
    const transactions = [
      ...bills.map(bill => ({
        id: bill.id,
        date: bill.billDate,
        type: 'BILL',
        reference: bill.billNumber,
        description: `Bill ${bill.billNumber}`,
        debit: 0,
        credit: bill.totalAmount,
        balance: bill.balanceAmount,
        status: bill.status,
        dueDate: bill.dueDate
      })),
      ...payments.map(pay => ({
        id: pay.id,
        date: pay.paymentDate,
        type: 'PAYMENT',
        reference: pay.paymentNumber,
        description: `Payment made - ${pay.bill?.billNumber || 'Direct'}`,
        debit: pay.amount,
        credit: 0,
        paymentMethod: pay.paymentMethod
      })),
      ...purchaseOrders.map(po => ({
        id: po.id,
        date: po.orderDate,
        type: 'PURCHASE_ORDER',
        reference: po.orderNumber,
        description: `Purchase Order ${po.orderNumber}`,
        amount: po.totalAmount,
        status: po.status
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply pagination to combined transactions
    const paginatedTransactions = transactions.slice(skip, skip + take);

    // Calculate running balance
    let runningBalance = 0;
    const ledgerEntries = paginatedTransactions.map(transaction => {
      if (transaction.type === 'BILL') {
        runningBalance += transaction.credit;
      } else if (transaction.type === 'PAYMENT') {
        runningBalance -= transaction.debit;
      }
      return {
        ...transaction,
        runningBalance
      };
    });

    // Calculate summary
    const totalBills = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const totalPayments = payments.reduce((sum, pay) => sum + pay.amount, 0);
    const totalOutstanding = bills.reduce((sum, bill) => sum + bill.balanceAmount, 0);

    const result = {
      supplier,
      transactions: ledgerEntries,
      summary: {
        totalBills,
        totalPayments,
        totalOutstanding,
        currentBalance: supplier.balance,
        billCount: bills.length,
        paymentCount: payments.length,
        purchaseOrderCount: purchaseOrders.length
      }
    };

    res.json(paginatedResponse(result, transactions.length, page, limit));
  } catch (error) {
    console.error('Get supplier ledger error:', error);
    res.status(500).json(errorResponse('Failed to fetch supplier ledger', error));
  }
};

/**
 * Get general ledger - all transactions grouped by account
 * GET /api/v1/ledger/general
 */
const getGeneralLedger = async (req, res) => {
  try {
    const { startDate, endDate, accountType, page = 1, limit = 100 } = req.query;
    const { skip, take } = paginate(page, limit);
    const companyId = req.user.companyId;

    // Build where clause for accounts
    const accountWhere = { companyId, isActive: true };
    if (accountType) {
      accountWhere.accountType = accountType;
    }

    // Build where clause for ledger entries
    const ledgerWhere = { companyId };
    if (startDate && endDate) {
      ledgerWhere.transactionDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get all relevant accounts
    const accounts = await prisma.account.findMany({
      where: accountWhere,
      select: {
        id: true,
        accountCode: true,
        accountName: true,
        accountType: true,
        balance: true
      },
      orderBy: [
        { accountType: 'asc' },
        { accountCode: 'asc' }
      ]
    });

    // Get ledger entries for all accounts
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: {
        ...ledgerWhere,
        accountId: { in: accounts.map(a => a.id) }
      },
      select: {
        id: true,
        accountId: true,
        transactionDate: true,
        debitAmount: true,
        creditAmount: true,
        balance: true,
        description: true,
        referenceType: true,
        referenceId: true
      },
      orderBy: { transactionDate: 'desc' }
    });

    // Group ledger entries by account
    const ledgerByAccount = ledgerEntries.reduce((acc, entry) => {
      if (!acc[entry.accountId]) {
        acc[entry.accountId] = [];
      }
      acc[entry.accountId].push(entry);
      return acc;
    }, {});

    // Build general ledger report
    const generalLedger = accounts.map(account => {
      const entries = ledgerByAccount[account.id] || [];

      const totalDebits = entries.reduce((sum, e) => sum + e.debitAmount, 0);
      const totalCredits = entries.reduce((sum, e) => sum + e.creditAmount, 0);

      // Calculate opening balance (current balance minus period changes)
      let periodChange = 0;
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        periodChange = totalDebits - totalCredits;
      } else {
        periodChange = totalCredits - totalDebits;
      }

      const openingBalance = account.balance - periodChange;
      const closingBalance = account.balance;

      return {
        account: {
          id: account.id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType
        },
        openingBalance,
        totalDebits,
        totalCredits,
        closingBalance,
        transactionCount: entries.length,
        transactions: entries.slice(0, 10) // Include only recent 10 transactions per account
      };
    }).filter(item => item.transactionCount > 0 || item.openingBalance !== 0 || item.closingBalance !== 0);

    // Apply pagination
    const paginatedLedger = generalLedger.slice(skip, skip + take);

    // Calculate overall totals
    const totals = {
      totalDebits: generalLedger.reduce((sum, item) => sum + item.totalDebits, 0),
      totalCredits: generalLedger.reduce((sum, item) => sum + item.totalCredits, 0),
      accountsWithActivity: generalLedger.length
    };

    // Group by account type for summary
    const byAccountType = generalLedger.reduce((acc, item) => {
      const type = item.account.accountType;
      if (!acc[type]) {
        acc[type] = {
          count: 0,
          totalDebits: 0,
          totalCredits: 0,
          netBalance: 0
        };
      }
      acc[type].count++;
      acc[type].totalDebits += item.totalDebits;
      acc[type].totalCredits += item.totalCredits;
      acc[type].netBalance += item.closingBalance;
      return acc;
    }, {});

    const result = {
      ledger: paginatedLedger,
      summary: {
        totals,
        byAccountType,
        dateRange: startDate && endDate ? {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        } : null
      }
    };

    res.json(paginatedResponse(result, generalLedger.length, page, limit));
  } catch (error) {
    console.error('Get general ledger error:', error);
    res.status(500).json(errorResponse('Failed to fetch general ledger', error));
  }
};

module.exports = {
  getAccountLedger,
  getCustomerLedger,
  getSupplierLedger,
  getGeneralLedger
};
