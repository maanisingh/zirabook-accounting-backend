const { PrismaClient } = require('@prisma/client');
const {
  successResponse,
  errorResponse,
  getDateRange,
  getFiscalYear
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Profit & Loss Statement
 * GET /api/v1/reports/profit-loss
 */
const getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const companyId = req.user.companyId;

    // Get date range
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.entryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get revenue accounts
    const revenueAccounts = await prisma.account.findMany({
      where: {
        companyId,
        accountType: 'REVENUE',
        isActive: true
      },
      include: {
        journalLineItems: {
          where: {
            journalEntry: {
              status: 'POSTED',
              ...dateFilter
            }
          }
        }
      }
    });

    // Get expense accounts
    const expenseAccounts = await prisma.account.findMany({
      where: {
        companyId,
        accountType: 'EXPENSE',
        isActive: true
      },
      include: {
        journalLineItems: {
          where: {
            journalEntry: {
              status: 'POSTED',
              ...dateFilter
            }
          }
        }
      }
    });

    // Calculate totals
    let totalRevenue = 0;
    const revenues = revenueAccounts.map(account => {
      const credit = account.journalLineItems.reduce((sum, item) => sum + item.credit, 0);
      const debit = account.journalLineItems.reduce((sum, item) => sum + item.debit, 0);
      const balance = credit - debit;
      totalRevenue += balance;
      return {
        accountCode: account.accountCode,
        accountName: account.accountName,
        amount: balance
      };
    }).filter(item => item.amount !== 0);

    let totalExpenses = 0;
    const expenses = expenseAccounts.map(account => {
      const debit = account.journalLineItems.reduce((sum, item) => sum + item.debit, 0);
      const credit = account.journalLineItems.reduce((sum, item) => sum + item.credit, 0);
      const balance = debit - credit;
      totalExpenses += balance;
      return {
        accountCode: account.accountCode,
        accountName: account.accountName,
        amount: balance
      };
    }).filter(item => item.amount !== 0);

    const netIncome = totalRevenue - totalExpenses;

    const report = {
      period: { startDate, endDate },
      revenues,
      totalRevenue,
      expenses,
      totalExpenses,
      netIncome,
      profitMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get profit loss error:', error);
    res.status(500).json(errorResponse('Failed to generate profit & loss report', error));
  }
};

/**
 * Balance Sheet
 * GET /api/v1/reports/balance-sheet
 */
const getBalanceSheet = async (req, res) => {
  try {
    const { asOfDate = new Date() } = req.query;
    const companyId = req.user.companyId;

    // Get all accounts with balances
    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        isActive: true
      },
      include: {
        journalLineItems: {
          where: {
            journalEntry: {
              status: 'POSTED',
              entryDate: { lte: new Date(asOfDate) }
            }
          }
        }
      }
    });

    // Process accounts by type
    const assets = [];
    const liabilities = [];
    const equity = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    accounts.forEach(account => {
      let balance = 0;

      // Calculate balance based on account type
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        balance = account.journalLineItems.reduce((sum, item) => sum + item.debit - item.credit, 0);
      } else {
        balance = account.journalLineItems.reduce((sum, item) => sum + item.credit - item.debit, 0);
      }

      if (balance === 0) return;

      const accountData = {
        accountCode: account.accountCode,
        accountName: account.accountName,
        balance
      };

      switch (account.accountType) {
        case 'ASSET':
          assets.push(accountData);
          totalAssets += balance;
          break;
        case 'LIABILITY':
          liabilities.push(accountData);
          totalLiabilities += balance;
          break;
        case 'EQUITY':
          equity.push(accountData);
          totalEquity += balance;
          break;
      }
    });

    const report = {
      asOfDate,
      assets: {
        accounts: assets,
        total: totalAssets
      },
      liabilities: {
        accounts: liabilities,
        total: totalLiabilities
      },
      equity: {
        accounts: equity,
        total: totalEquity
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get balance sheet error:', error);
    res.status(500).json(errorResponse('Failed to generate balance sheet', error));
  }
};

/**
 * Cash Flow Statement
 * GET /api/v1/reports/cashflow
 */
const getCashFlow = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const companyId = req.user.companyId;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get all payments
    const payments = await prisma.payment.findMany({
      where: {
        companyId,
        ...dateFilter
      },
      include: {
        invoice: true,
        bill: true
      }
    });

    // Categorize cash flows
    let operatingInflow = 0;
    let operatingOutflow = 0;
    let investingInflow = 0;
    let investingOutflow = 0;
    let financingInflow = 0;
    let financingOutflow = 0;

    payments.forEach(payment => {
      if (payment.type === 'INCOMING') {
        // Inflows (mostly from customers)
        operatingInflow += payment.amount;
      } else {
        // Outflows (to suppliers, expenses)
        operatingOutflow += payment.amount;
      }
    });

    const report = {
      period: { startDate, endDate },
      operating: {
        inflows: operatingInflow,
        outflows: operatingOutflow,
        net: operatingInflow - operatingOutflow
      },
      investing: {
        inflows: investingInflow,
        outflows: investingOutflow,
        net: investingInflow - investingOutflow
      },
      financing: {
        inflows: financingInflow,
        outflows: financingOutflow,
        net: financingInflow - financingOutflow
      },
      netCashFlow: (operatingInflow - operatingOutflow) +
                   (investingInflow - investingOutflow) +
                   (financingInflow - financingOutflow)
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get cash flow error:', error);
    res.status(500).json(errorResponse('Failed to generate cash flow report', error));
  }
};

/**
 * Trial Balance
 * GET /api/v1/reports/trial-balance
 */
const getTrialBalance = async (req, res) => {
  try {
    const { asOfDate = new Date() } = req.query;
    const companyId = req.user.companyId;

    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        isActive: true
      },
      include: {
        journalLineItems: {
          where: {
            journalEntry: {
              status: 'POSTED',
              entryDate: { lte: new Date(asOfDate) }
            }
          }
        }
      },
      orderBy: { accountCode: 'asc' }
    });

    const trialBalance = [];
    let totalDebits = 0;
    let totalCredits = 0;

    accounts.forEach(account => {
      const debits = account.journalLineItems.reduce((sum, item) => sum + item.debit, 0);
      const credits = account.journalLineItems.reduce((sum, item) => sum + item.credit, 0);

      if (debits === 0 && credits === 0) return;

      let debitBalance = 0;
      let creditBalance = 0;

      // Normal balances
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        const balance = debits - credits;
        if (balance > 0) {
          debitBalance = balance;
        } else {
          creditBalance = Math.abs(balance);
        }
      } else {
        const balance = credits - debits;
        if (balance > 0) {
          creditBalance = balance;
        } else {
          debitBalance = Math.abs(balance);
        }
      }

      totalDebits += debitBalance;
      totalCredits += creditBalance;

      trialBalance.push({
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debit: debitBalance,
        credit: creditBalance
      });
    });

    const report = {
      asOfDate,
      accounts: trialBalance,
      totals: {
        debits: totalDebits,
        credits: totalCredits,
        isBalanced: Math.abs(totalDebits - totalCredits) < 0.01
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get trial balance error:', error);
    res.status(500).json(errorResponse('Failed to generate trial balance', error));
  }
};

/**
 * Sales Report (Enhanced with filters and grouping)
 * GET /api/v1/reports/sales
 */
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, customerId, productId, groupBy = 'customer' } = req.query;
    const companyId = req.user.companyId;

    const whereClause = {
      companyId,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] }
    };

    // Date filter
    if (startDate && endDate) {
      whereClause.invoiceDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Customer filter
    if (customerId) {
      whereClause.customerId = customerId;
    }

    const invoices = await prisma.invoice.findMany({
      where: whereClause,
      include: {
        customer: true,
        items: {
          include: { product: true }
        }
      },
      orderBy: { invoiceDate: 'desc' }
    });

    // Filter by product if specified
    let filteredInvoices = invoices;
    if (productId) {
      filteredInvoices = invoices.filter(inv =>
        inv.items.some(item => item.productId === productId)
      );
    }

    // Calculate totals
    const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const totalOutstanding = filteredInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);
    const totalTax = filteredInvoices.reduce((sum, inv) => sum + inv.taxAmount, 0);

    // Group by customer
    const customerBreakdown = {};
    filteredInvoices.forEach(inv => {
      if (!customerBreakdown[inv.customerId]) {
        customerBreakdown[inv.customerId] = {
          customerId: inv.customer.id,
          customerName: inv.customer.name,
          totalAmount: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          invoiceCount: 0,
          invoices: []
        };
      }
      customerBreakdown[inv.customerId].totalAmount += inv.totalAmount;
      customerBreakdown[inv.customerId].totalPaid += inv.paidAmount;
      customerBreakdown[inv.customerId].totalOutstanding += inv.balanceAmount;
      customerBreakdown[inv.customerId].invoiceCount++;
      customerBreakdown[inv.customerId].invoices.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount
      });
    });

    // Group by product
    const productBreakdown = {};
    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.productId) {
          if (!productBreakdown[item.productId]) {
            productBreakdown[item.productId] = {
              productId: item.product.id,
              productName: item.product.name,
              productCode: item.product.productCode,
              quantity: 0,
              totalAmount: 0,
              averagePrice: 0
            };
          }
          productBreakdown[item.productId].quantity += item.quantity;
          productBreakdown[item.productId].totalAmount += item.totalAmount;
        }
      });
    });

    // Calculate average price for products
    Object.values(productBreakdown).forEach(product => {
      if (product.quantity > 0) {
        product.averagePrice = product.totalAmount / product.quantity;
      }
    });

    // Group by date
    const dateBreakdown = {};
    filteredInvoices.forEach(inv => {
      const dateKey = inv.invoiceDate.toISOString().split('T')[0];
      if (!dateBreakdown[dateKey]) {
        dateBreakdown[dateKey] = {
          date: dateKey,
          totalAmount: 0,
          invoiceCount: 0
        };
      }
      dateBreakdown[dateKey].totalAmount += inv.totalAmount;
      dateBreakdown[dateKey].invoiceCount++;
    });

    const report = {
      period: { startDate, endDate },
      filters: { customerId, productId, groupBy },
      summary: {
        totalInvoices: filteredInvoices.length,
        totalSales,
        totalPaid,
        totalOutstanding,
        totalTax,
        averageInvoiceValue: filteredInvoices.length > 0 ? totalSales / filteredInvoices.length : 0
      },
      customerBreakdown: Object.values(customerBreakdown).sort((a, b) => b.totalAmount - a.totalAmount),
      productBreakdown: Object.values(productBreakdown).sort((a, b) => b.totalAmount - a.totalAmount),
      dateBreakdown: Object.values(dateBreakdown).sort((a, b) => a.date.localeCompare(b.date))
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json(errorResponse('Failed to generate sales report', error));
  }
};

/**
 * Purchase Report (Enhanced with filters)
 * GET /api/v1/reports/purchases
 */
const getPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate, supplierId, productId } = req.query;
    const companyId = req.user.companyId;

    const whereClause = {
      companyId,
      status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] }
    };

    // Date filter
    if (startDate && endDate) {
      whereClause.billDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Supplier filter
    if (supplierId) {
      whereClause.supplierId = supplierId;
    }

    const bills = await prisma.bill.findMany({
      where: whereClause,
      include: {
        supplier: true,
        items: {
          include: { product: true }
        }
      },
      orderBy: { billDate: 'desc' }
    });

    // Filter by product if specified
    let filteredBills = bills;
    if (productId) {
      filteredBills = bills.filter(bill =>
        bill.items.some(item => item.productId === productId)
      );
    }

    // Calculate totals
    const totalPurchases = filteredBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const totalPaid = filteredBills.reduce((sum, bill) => sum + bill.paidAmount, 0);
    const totalOutstanding = filteredBills.reduce((sum, bill) => sum + bill.balanceAmount, 0);
    const totalTax = filteredBills.reduce((sum, bill) => sum + bill.taxAmount, 0);

    // Group by supplier
    const supplierBreakdown = {};
    filteredBills.forEach(bill => {
      if (!supplierBreakdown[bill.supplierId]) {
        supplierBreakdown[bill.supplierId] = {
          supplierId: bill.supplier.id,
          supplierName: bill.supplier.name,
          totalAmount: 0,
          totalPaid: 0,
          totalOutstanding: 0,
          billCount: 0,
          bills: []
        };
      }
      supplierBreakdown[bill.supplierId].totalAmount += bill.totalAmount;
      supplierBreakdown[bill.supplierId].totalPaid += bill.paidAmount;
      supplierBreakdown[bill.supplierId].totalOutstanding += bill.balanceAmount;
      supplierBreakdown[bill.supplierId].billCount++;
      supplierBreakdown[bill.supplierId].bills.push({
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        balanceAmount: bill.balanceAmount
      });
    });

    // Group by product
    const productBreakdown = {};
    filteredBills.forEach(bill => {
      bill.items.forEach(item => {
        if (item.productId) {
          if (!productBreakdown[item.productId]) {
            productBreakdown[item.productId] = {
              productId: item.product.id,
              productName: item.product.name,
              productCode: item.product.productCode,
              quantity: 0,
              totalAmount: 0,
              averagePrice: 0
            };
          }
          productBreakdown[item.productId].quantity += item.quantity;
          productBreakdown[item.productId].totalAmount += item.totalAmount;
        }
      });
    });

    // Calculate average price for products
    Object.values(productBreakdown).forEach(product => {
      if (product.quantity > 0) {
        product.averagePrice = product.totalAmount / product.quantity;
      }
    });

    const report = {
      period: { startDate, endDate },
      filters: { supplierId, productId },
      summary: {
        totalBills: filteredBills.length,
        totalPurchases,
        totalPaid,
        totalOutstanding,
        totalTax,
        averageBillValue: filteredBills.length > 0 ? totalPurchases / filteredBills.length : 0
      },
      supplierBreakdown: Object.values(supplierBreakdown).sort((a, b) => b.totalAmount - a.totalAmount),
      productBreakdown: Object.values(productBreakdown).sort((a, b) => b.totalAmount - a.totalAmount)
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get purchase report error:', error);
    res.status(500).json(errorResponse('Failed to generate purchase report', error));
  }
};

/**
 * Accounts Receivable Aging
 * GET /api/v1/reports/aging-receivables
 */
const getAgingReceivables = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const today = new Date();

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceDue: { gt: 0 }
      },
      include: {
        customer: true
      }
    });

    const aging = {
      current: { amount: 0, count: 0, invoices: [] },
      '1-30': { amount: 0, count: 0, invoices: [] },
      '31-60': { amount: 0, count: 0, invoices: [] },
      '61-90': { amount: 0, count: 0, invoices: [] },
      over90: { amount: 0, count: 0, invoices: [] }
    };

    let totalOutstanding = 0;

    invoices.forEach(invoice => {
      const daysOverdue = Math.floor((today - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24));
      let bucket;

      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else bucket = 'over90';

      aging[bucket].amount += invoice.balanceDue;
      aging[bucket].count++;
      aging[bucket].invoices.push({
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer.name,
        dueDate: invoice.dueDate,
        amount: invoice.balanceDue,
        daysOverdue: Math.max(0, daysOverdue)
      });

      totalOutstanding += invoice.balanceDue;
    });

    const report = {
      asOfDate: today,
      totalOutstanding,
      aging,
      summary: {
        current: (aging.current.amount / totalOutstanding * 100).toFixed(2),
        overdue: ((totalOutstanding - aging.current.amount) / totalOutstanding * 100).toFixed(2)
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get aging receivables error:', error);
    res.status(500).json(errorResponse('Failed to generate aging report', error));
  }
};

/**
 * Accounts Payable Aging
 * GET /api/v1/reports/aging-payables
 */
const getAgingPayables = async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const today = new Date();

    const bills = await prisma.bill.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceDue: { gt: 0 }
      },
      include: {
        supplier: true
      }
    });

    const aging = {
      current: { amount: 0, count: 0, bills: [] },
      '1-30': { amount: 0, count: 0, bills: [] },
      '31-60': { amount: 0, count: 0, bills: [] },
      '61-90': { amount: 0, count: 0, bills: [] },
      over90: { amount: 0, count: 0, bills: [] }
    };

    let totalOutstanding = 0;

    bills.forEach(bill => {
      const daysOverdue = Math.floor((today - new Date(bill.dueDate)) / (1000 * 60 * 60 * 24));
      let bucket;

      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = '1-30';
      else if (daysOverdue <= 60) bucket = '31-60';
      else if (daysOverdue <= 90) bucket = '61-90';
      else bucket = 'over90';

      aging[bucket].amount += bill.balanceDue;
      aging[bucket].count++;
      aging[bucket].bills.push({
        billNumber: bill.billNumber,
        supplierName: bill.supplier.name,
        dueDate: bill.dueDate,
        amount: bill.balanceDue,
        daysOverdue: Math.max(0, daysOverdue)
      });

      totalOutstanding += bill.balanceDue;
    });

    const report = {
      asOfDate: today,
      totalOutstanding,
      aging,
      summary: {
        current: totalOutstanding > 0 ? (aging.current.amount / totalOutstanding * 100).toFixed(2) : 0,
        overdue: totalOutstanding > 0 ? ((totalOutstanding - aging.current.amount) / totalOutstanding * 100).toFixed(2) : 0
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get aging payables error:', error);
    res.status(500).json(errorResponse('Failed to generate aging report', error));
  }
};

/**
 * Inventory Valuation
 * GET /api/v1/reports/inventory
 */
const getInventoryReport = async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const products = await prisma.product.findMany({
      where: {
        companyId,
        isActive: true
      },
      orderBy: { name: 'asc' }
    });

    const inventory = products.map(product => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      currentStock: product.currentStock,
      unitCost: product.unitCost,
      unitPrice: product.unitPrice,
      totalValue: product.currentStock * product.unitCost,
      reorderLevel: product.reorderLevel,
      needsReorder: product.currentStock <= product.reorderLevel
    }));

    const totalValue = inventory.reduce((sum, item) => sum + item.totalValue, 0);
    const lowStockItems = inventory.filter(item => item.needsReorder);

    const report = {
      asOfDate: new Date(),
      inventory,
      summary: {
        totalItems: inventory.length,
        totalValue,
        lowStockCount: lowStockItems.length,
        averageValue: inventory.length > 0 ? totalValue / inventory.length : 0
      },
      lowStockItems
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get inventory report error:', error);
    res.status(500).json(errorResponse('Failed to generate inventory report', error));
  }
};

/**
 * Tax Summary Report
 * GET /api/v1/reports/tax-summary
 */
const getTaxSummary = async (req, res) => {
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

    // Get tax from sales
    const salesInvoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
        ...dateFilter
      }
    });

    const salesTax = salesInvoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0);

    // Get tax from purchases
    const purchaseBills = await prisma.bill.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
        billDate: dateFilter.invoiceDate || {}
      }
    });

    const purchaseTax = purchaseBills.reduce((sum, bill) => sum + (bill.taxAmount || 0), 0);

    const report = {
      period: { startDate, endDate },
      sales: {
        totalSales: salesInvoices.reduce((sum, inv) => sum + inv.subtotal, 0),
        totalTaxCollected: salesTax,
        invoiceCount: salesInvoices.length
      },
      purchases: {
        totalPurchases: purchaseBills.reduce((sum, bill) => sum + bill.subtotal, 0),
        totalTaxPaid: purchaseTax,
        billCount: purchaseBills.length
      },
      netTaxLiability: salesTax - purchaseTax
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get tax summary error:', error);
    res.status(500).json(errorResponse('Failed to generate tax summary', error));
  }
};

/**
 * Tax Report (Enhanced with tax type filter)
 * GET /api/v1/reports/tax
 */
const getTaxReport = async (req, res) => {
  try {
    const { startDate, endDate, taxType } = req.query;
    const companyId = req.user.companyId;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.gte = new Date(startDate);
      dateFilter.lte = new Date(endDate);
    }

    // Get tax from sales (tax collected)
    const salesInvoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
        ...(startDate && endDate ? { invoiceDate: dateFilter } : {})
      },
      include: {
        items: true,
        customer: true
      },
      orderBy: { invoiceDate: 'desc' }
    });

    // Get tax from purchases (tax paid)
    const purchaseBills = await prisma.bill.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
        ...(startDate && endDate ? { billDate: dateFilter } : {})
      },
      include: {
        items: true,
        supplier: true
      },
      orderBy: { billDate: 'desc' }
    });

    // Calculate sales tax collected
    const salesTaxDetails = salesInvoices.map(inv => ({
      documentNumber: inv.invoiceNumber,
      documentDate: inv.invoiceDate,
      customerName: inv.customer.name,
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      totalAmount: inv.totalAmount
    }));

    const totalTaxCollected = salesInvoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0);
    const totalSales = salesInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);

    // Calculate purchase tax paid
    const purchaseTaxDetails = purchaseBills.map(bill => ({
      documentNumber: bill.billNumber,
      documentDate: bill.billDate,
      supplierName: bill.supplier.name,
      subtotal: bill.subtotal,
      taxAmount: bill.taxAmount,
      totalAmount: bill.totalAmount
    }));

    const totalTaxPaid = purchaseBills.reduce((sum, bill) => sum + (bill.taxAmount || 0), 0);
    const totalPurchases = purchaseBills.reduce((sum, bill) => sum + bill.subtotal, 0);

    // Net tax liability
    const netTaxPayable = totalTaxCollected - totalTaxPaid;

    const report = {
      period: { startDate, endDate },
      taxType: taxType || 'GST/VAT',
      taxCollected: {
        transactions: salesTaxDetails,
        totalSales,
        totalTaxCollected,
        transactionCount: salesInvoices.length
      },
      taxPaid: {
        transactions: purchaseTaxDetails,
        totalPurchases,
        totalTaxPaid,
        transactionCount: purchaseBills.length
      },
      summary: {
        totalTaxCollected,
        totalTaxPaid,
        netTaxPayable,
        effectiveTaxRate: totalSales > 0 ? (totalTaxCollected / totalSales) * 100 : 0
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get tax report error:', error);
    res.status(500).json(errorResponse('Failed to generate tax report', error));
  }
};

/**
 * Inventory Summary Report
 * GET /api/v1/reports/inventory-summary
 */
const getInventorySummaryReport = async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const products = await prisma.product.findMany({
      where: {
        companyId,
        isActive: true
      },
      orderBy: { name: 'asc' }
    });

    const inventoryItems = products.map(product => {
      const currentValue = product.currentStock * (product.purchasePrice || 0);
      const needsReorder = product.reorderLevel ? product.currentStock <= product.reorderLevel : false;

      return {
        productId: product.id,
        productCode: product.productCode,
        productName: product.name,
        category: product.category,
        unit: product.unit,
        currentStock: product.currentStock,
        reorderLevel: product.reorderLevel,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        currentValue,
        needsReorder,
        reorderStatus: needsReorder ? 'LOW_STOCK' : 'ADEQUATE'
      };
    });

    // Calculate totals
    const totalInventoryValue = inventoryItems.reduce((sum, item) => sum + item.currentValue, 0);
    const lowStockItems = inventoryItems.filter(item => item.needsReorder);
    const outOfStockItems = inventoryItems.filter(item => item.currentStock === 0);

    // Group by category
    const categoryBreakdown = {};
    inventoryItems.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          category,
          itemCount: 0,
          totalValue: 0,
          totalStock: 0
        };
      }
      categoryBreakdown[category].itemCount++;
      categoryBreakdown[category].totalValue += item.currentValue;
      categoryBreakdown[category].totalStock += item.currentStock;
    });

    const report = {
      asOfDate: new Date(),
      summary: {
        totalProducts: inventoryItems.length,
        totalInventoryValue,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        averageItemValue: inventoryItems.length > 0 ? totalInventoryValue / inventoryItems.length : 0
      },
      inventory: inventoryItems,
      lowStockItems,
      outOfStockItems,
      categoryBreakdown: Object.values(categoryBreakdown).sort((a, b) => b.totalValue - a.totalValue)
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get inventory summary report error:', error);
    res.status(500).json(errorResponse('Failed to generate inventory summary report', error));
  }
};

/**
 * VAT Report
 * GET /api/v1/reports/vat
 */
const getVATReport = async (req, res) => {
  try {
    const { period } = req.query; // Expected format: YYYY-MM
    const companyId = req.user.companyId;

    if (!period) {
      return res.status(400).json(errorResponse('Period parameter (YYYY-MM) is required'));
    }

    // Parse period
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const dateFilter = {
      gte: startDate,
      lte: endDate
    };

    // Get VAT from sales
    const salesInvoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] },
        invoiceDate: dateFilter
      },
      include: {
        customer: true,
        items: true
      },
      orderBy: { invoiceDate: 'asc' }
    });

    // Get VAT from purchases
    const purchaseBills = await prisma.bill.findMany({
      where: {
        companyId,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'PAID'] },
        billDate: dateFilter
      },
      include: {
        supplier: true,
        items: true
      },
      orderBy: { billDate: 'asc' }
    });

    // Calculate VAT on sales (Output VAT)
    const vatOnSales = salesInvoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0);
    const totalSalesValue = salesInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);

    // Calculate VAT on purchases (Input VAT)
    const vatOnPurchases = purchaseBills.reduce((sum, bill) => sum + (bill.taxAmount || 0), 0);
    const totalPurchasesValue = purchaseBills.reduce((sum, bill) => sum + bill.subtotal, 0);

    // Net VAT payable (Output VAT - Input VAT)
    const netVATPayable = vatOnSales - vatOnPurchases;

    const report = {
      period: {
        month: period,
        startDate,
        endDate
      },
      outputVAT: {
        totalSales: totalSalesValue,
        vatAmount: vatOnSales,
        transactionCount: salesInvoices.length,
        transactions: salesInvoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          customerName: inv.customer.name,
          netAmount: inv.subtotal,
          vatAmount: inv.taxAmount,
          grossAmount: inv.totalAmount
        }))
      },
      inputVAT: {
        totalPurchases: totalPurchasesValue,
        vatAmount: vatOnPurchases,
        transactionCount: purchaseBills.length,
        transactions: purchaseBills.map(bill => ({
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          supplierName: bill.supplier.name,
          netAmount: bill.subtotal,
          vatAmount: bill.taxAmount,
          grossAmount: bill.totalAmount
        }))
      },
      summary: {
        outputVAT: vatOnSales,
        inputVAT: vatOnPurchases,
        netVATPayable,
        status: netVATPayable > 0 ? 'PAYABLE' : netVATPayable < 0 ? 'REFUNDABLE' : 'NIL'
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get VAT report error:', error);
    res.status(500).json(errorResponse('Failed to generate VAT report', error));
  }
};

/**
 * Day Book Report
 * GET /api/v1/reports/daybook
 */
const getDayBookReport = async (req, res) => {
  try {
    const { date } = req.query;
    const companyId = req.user.companyId;

    if (!date) {
      return res.status(400).json(errorResponse('Date parameter is required'));
    }

    const queryDate = new Date(date);
    const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));

    const dateFilter = {
      gte: startOfDay,
      lte: endOfDay
    };

    // Get all invoices for the day
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: dateFilter
      },
      include: {
        customer: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all bills for the day
    const bills = await prisma.bill.findMany({
      where: {
        companyId,
        billDate: dateFilter
      },
      include: {
        supplier: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all payments for the day
    const payments = await prisma.payment.findMany({
      where: {
        companyId,
        paymentDate: dateFilter
      },
      include: {
        invoice: {
          include: { customer: true }
        },
        bill: {
          include: { supplier: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all expenses for the day
    const expenses = await prisma.expense.findMany({
      where: {
        companyId,
        expenseDate: dateFilter
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get all journal entries for the day
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        companyId,
        entryDate: dateFilter
      },
      include: {
        lineItems: {
          include: { account: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Combine all transactions
    const allTransactions = [
      ...invoices.map(inv => ({
        type: 'INVOICE',
        time: inv.createdAt,
        number: inv.invoiceNumber,
        party: inv.customer.name,
        debit: inv.totalAmount,
        credit: 0,
        description: `Sales Invoice - ${inv.customer.name}`,
        status: inv.status
      })),
      ...bills.map(bill => ({
        type: 'BILL',
        time: bill.createdAt,
        number: bill.billNumber,
        party: bill.supplier.name,
        debit: 0,
        credit: bill.totalAmount,
        description: `Purchase Bill - ${bill.supplier.name}`,
        status: bill.status
      })),
      ...payments.map(payment => ({
        type: 'PAYMENT',
        time: payment.createdAt,
        number: payment.paymentNumber,
        party: payment.invoice ? payment.invoice.customer.name : payment.bill ? payment.bill.supplier.name : 'N/A',
        debit: payment.invoice ? 0 : payment.amount,
        credit: payment.invoice ? payment.amount : 0,
        description: `Payment - ${payment.paymentMethod}`,
        status: 'COMPLETED'
      })),
      ...expenses.map(expense => ({
        type: 'EXPENSE',
        time: expense.createdAt,
        number: expense.expenseNumber,
        party: expense.category,
        debit: 0,
        credit: expense.totalAmount,
        description: `Expense - ${expense.category}`,
        status: 'COMPLETED'
      })),
      ...journalEntries.map(journal => ({
        type: 'JOURNAL',
        time: journal.createdAt,
        number: journal.journalNumber,
        party: 'Journal Entry',
        debit: journal.totalDebit,
        credit: journal.totalCredit,
        description: journal.description,
        status: journal.status
      }))
    ].sort((a, b) => a.time - b.time);

    // Calculate totals
    const totalDebit = allTransactions.reduce((sum, txn) => sum + txn.debit, 0);
    const totalCredit = allTransactions.reduce((sum, txn) => sum + txn.credit, 0);

    const report = {
      date: startOfDay,
      summary: {
        totalTransactions: allTransactions.length,
        totalDebit,
        totalCredit,
        invoiceCount: invoices.length,
        billCount: bills.length,
        paymentCount: payments.length,
        expenseCount: expenses.length,
        journalCount: journalEntries.length
      },
      transactions: allTransactions
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get day book report error:', error);
    res.status(500).json(errorResponse('Failed to generate day book report', error));
  }
};

/**
 * Journal Entries Report
 * GET /api/v1/reports/journal-entries
 */
const getJournalEntriesReport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const companyId = req.user.companyId;

    const whereClause = { companyId };

    // Date filter
    if (startDate && endDate) {
      whereClause.entryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Status filter
    if (status) {
      whereClause.status = status;
    }

    const journalEntries = await prisma.journalEntry.findMany({
      where: whereClause,
      include: {
        lineItems: {
          include: {
            account: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: { entryDate: 'desc' }
    });

    // Format journal entries with line items
    const formattedEntries = journalEntries.map(entry => ({
      journalNumber: entry.journalNumber,
      entryDate: entry.entryDate,
      description: entry.description,
      status: entry.status,
      totalDebit: entry.totalDebit,
      totalCredit: entry.totalCredit,
      createdBy: entry.createdBy.name,
      createdAt: entry.createdAt,
      lineItems: entry.lineItems.map(item => ({
        accountCode: item.account.accountCode,
        accountName: item.account.accountName,
        accountType: item.account.accountType,
        description: item.description,
        debit: item.debitAmount,
        credit: item.creditAmount
      }))
    }));

    // Calculate totals
    const totalDebit = journalEntries.reduce((sum, entry) => sum + entry.totalDebit, 0);
    const totalCredit = journalEntries.reduce((sum, entry) => sum + entry.totalCredit, 0);

    // Group by status
    const statusBreakdown = {
      DRAFT: journalEntries.filter(e => e.status === 'DRAFT').length,
      POSTED: journalEntries.filter(e => e.status === 'POSTED').length,
      CANCELLED: journalEntries.filter(e => e.status === 'CANCELLED').length
    };

    const report = {
      period: { startDate, endDate },
      filters: { status },
      summary: {
        totalEntries: journalEntries.length,
        totalDebit,
        totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
        statusBreakdown
      },
      journalEntries: formattedEntries
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get journal entries report error:', error);
    res.status(500).json(errorResponse('Failed to generate journal entries report', error));
  }
};

/**
 * Ledger Report for Account
 * GET /api/v1/reports/ledger
 */
const getLedgerReport = async (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;
    const companyId = req.user.companyId;

    if (!accountId) {
      return res.status(400).json(errorResponse('Account ID is required'));
    }

    // Get account details
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        company: true
      }
    });

    if (!account || account.companyId !== companyId) {
      return res.status(404).json(errorResponse('Account not found'));
    }

    // Build where clause for ledger entries
    const whereClause = {
      companyId,
      accountId
    };

    if (startDate && endDate) {
      whereClause.transactionDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    // Get ledger entries
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: whereClause,
      orderBy: { transactionDate: 'asc' }
    });

    // Calculate opening balance (entries before start date)
    let openingBalance = 0;
    if (startDate) {
      const priorEntries = await prisma.ledgerEntry.findMany({
        where: {
          companyId,
          accountId,
          transactionDate: { lt: new Date(startDate) }
        }
      });

      priorEntries.forEach(entry => {
        if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
          openingBalance += entry.debitAmount - entry.creditAmount;
        } else {
          openingBalance += entry.creditAmount - entry.debitAmount;
        }
      });
    }

    // Format ledger entries with running balance
    let runningBalance = openingBalance;
    const formattedEntries = ledgerEntries.map(entry => {
      // Update running balance
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        runningBalance += entry.debitAmount - entry.creditAmount;
      } else {
        runningBalance += entry.creditAmount - entry.debitAmount;
      }

      return {
        date: entry.transactionDate,
        description: entry.description,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        debit: entry.debitAmount,
        credit: entry.creditAmount,
        balance: runningBalance
      };
    });

    // Calculate totals
    const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debitAmount, 0);
    const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.creditAmount, 0);
    const closingBalance = runningBalance;

    const report = {
      account: {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType
      },
      period: { startDate, endDate },
      openingBalance,
      closingBalance,
      summary: {
        totalTransactions: ledgerEntries.length,
        totalDebit,
        totalCredit,
        netMovement: totalDebit - totalCredit
      },
      transactions: formattedEntries
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get ledger report error:', error);
    res.status(500).json(errorResponse('Failed to generate ledger report', error));
  }
};

/**
 * Trial Balance Report (Enhanced)
 * GET /api/v1/reports/trial-balance-detailed
 */
const getTrialBalanceReport = async (req, res) => {
  try {
    const { asOfDate = new Date() } = req.query;
    const companyId = req.user.companyId;

    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        isActive: true
      },
      include: {
        journalLineItems: {
          where: {
            journalEntry: {
              status: 'POSTED',
              entryDate: { lte: new Date(asOfDate) }
            }
          }
        }
      },
      orderBy: { accountCode: 'asc' }
    });

    const trialBalance = [];
    let totalDebits = 0;
    let totalCredits = 0;

    accounts.forEach(account => {
      const debits = account.journalLineItems.reduce((sum, item) => sum + item.debitAmount, 0);
      const credits = account.journalLineItems.reduce((sum, item) => sum + item.creditAmount, 0);

      if (debits === 0 && credits === 0) return;

      let debitBalance = 0;
      let creditBalance = 0;

      // Normal balances
      if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
        const balance = debits - credits;
        if (balance > 0) {
          debitBalance = balance;
        } else {
          creditBalance = Math.abs(balance);
        }
      } else {
        const balance = credits - debits;
        if (balance > 0) {
          creditBalance = balance;
        } else {
          debitBalance = Math.abs(balance);
        }
      }

      totalDebits += debitBalance;
      totalCredits += creditBalance;

      trialBalance.push({
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debit: debitBalance,
        credit: creditBalance
      });
    });

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    const report = {
      asOfDate,
      accounts: trialBalance,
      totals: {
        debits: totalDebits,
        credits: totalCredits,
        difference: totalDebits - totalCredits,
        isBalanced
      },
      verification: {
        status: isBalanced ? 'BALANCED' : 'UNBALANCED',
        message: isBalanced
          ? 'Total debits equal total credits'
          : `Difference of ${Math.abs(totalDebits - totalCredits).toFixed(2)} detected`
      }
    };

    res.json(successResponse(report));
  } catch (error) {
    console.error('Get trial balance report error:', error);
    res.status(500).json(errorResponse('Failed to generate trial balance report', error));
  }
};

module.exports = {
  getProfitLoss,
  getBalanceSheet,
  getCashFlow,
  getTrialBalance,
  getSalesReport,
  getPurchaseReport,
  getAgingReceivables,
  getAgingPayables,
  getInventoryReport,
  getTaxSummary,
  getTaxReport,
  getInventorySummaryReport,
  getVATReport,
  getDayBookReport,
  getJournalEntriesReport,
  getLedgerReport,
  getTrialBalanceReport
};