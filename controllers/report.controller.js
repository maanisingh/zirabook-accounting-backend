const prisma = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

// Dashboard summary
exports.getDashboardSummary = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.user.companyId;

    if (!companyId) {
      return res.status(400).json(errorResponse('Company ID is required'));
    }

    // Get counts and totals
    const [
      customersCount,
      suppliersCount,
      productsCount,
      invoicesCount,
      invoicesTotal,
      unpaidInvoicesTotal,
      billsCount,
      billsTotal,
      unpaidBillsTotal,
      paymentsCount,
      paymentsTotal,
      expensesTotal,
      recentInvoices,
      recentPayments
    ] = await Promise.all([
      prisma.customer.count({ where: { companyId, isActive: true } }),
      prisma.supplier.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.invoice.count({ where: { companyId } }),
      prisma.invoice.aggregate({
        where: { companyId },
        _sum: { totalAmount: true }
      }),
      prisma.invoice.aggregate({
        where: { companyId, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { balanceAmount: true }
      }),
      prisma.bill.count({ where: { companyId } }),
      prisma.bill.aggregate({
        where: { companyId },
        _sum: { totalAmount: true }
      }),
      prisma.bill.aggregate({
        where: { companyId, status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        _sum: { balanceAmount: true }
      }),
      prisma.payment.count({ where: { companyId } }),
      prisma.payment.aggregate({
        where: { companyId },
        _sum: { amount: true }
      }),
      prisma.expense.aggregate({
        where: { companyId },
        _sum: { totalAmount: true }
      }),
      prisma.invoice.findMany({
        where: { companyId },
        take: 5,
        orderBy: { invoiceDate: 'desc' },
        include: {
          customer: {
            select: { id: true, name: true }
          }
        }
      }),
      prisma.payment.findMany({
        where: { companyId },
        take: 5,
        orderBy: { paymentDate: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customer: {
                select: { id: true, name: true }
              }
            }
          },
          bill: {
            select: {
              id: true,
              billNumber: true,
              supplier: {
                select: { id: true, name: true }
              }
            }
          }
        }
      })
    ]);

    const summary = {
      customers: customersCount,
      suppliers: suppliersCount,
      products: productsCount,
      invoices: {
        count: invoicesCount,
        total: invoicesTotal._sum.totalAmount || 0,
        unpaid: unpaidInvoicesTotal._sum.balanceAmount || 0
      },
      bills: {
        count: billsCount,
        total: billsTotal._sum.totalAmount || 0,
        unpaid: unpaidBillsTotal._sum.balanceAmount || 0
      },
      payments: {
        count: paymentsCount,
        total: paymentsTotal._sum.amount || 0
      },
      expenses: {
        total: expensesTotal._sum.totalAmount || 0
      },
      revenue: invoicesTotal._sum.totalAmount || 0,
      profit: (invoicesTotal._sum.totalAmount || 0) - (billsTotal._sum.totalAmount || 0) - (expensesTotal._sum.totalAmount || 0),
      recentInvoices,
      recentPayments
    };

    res.json(successResponse(summary));
  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Sales report summary
exports.getSalesReportSummary = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.user.companyId;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        invoiceDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        customer: {
          select: { id: true, name: true }
        }
      },
      orderBy: { invoiceDate: 'desc' }
    });

    const summary = {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
      totalPaid: invoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
      totalUnpaid: invoices.reduce((sum, inv) => sum + inv.balanceAmount, 0),
      byStatus: {
        draft: invoices.filter(inv => inv.status === 'DRAFT').length,
        sent: invoices.filter(inv => inv.status === 'SENT').length,
        partiallyPaid: invoices.filter(inv => inv.status === 'PARTIALLY_PAID').length,
        paid: invoices.filter(inv => inv.status === 'PAID').length,
        overdue: invoices.filter(inv => inv.status === 'OVERDUE').length
      },
      invoices
    };

    res.json(successResponse(summary));
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Purchase report summary
exports.getPurchaseReportSummary = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.user.companyId;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();

    const bills = await prisma.bill.findMany({
      where: {
        companyId,
        billDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        supplier: {
          select: { id: true, name: true }
        }
      },
      orderBy: { billDate: 'desc' }
    });

    const summary = {
      totalBills: bills.length,
      totalAmount: bills.reduce((sum, bill) => sum + bill.totalAmount, 0),
      totalPaid: bills.reduce((sum, bill) => sum + bill.paidAmount, 0),
      totalUnpaid: bills.reduce((sum, bill) => sum + bill.balanceAmount, 0),
      byStatus: {
        draft: bills.filter(bill => bill.status === 'DRAFT').length,
        approved: bills.filter(bill => bill.status === 'APPROVED').length,
        partiallyPaid: bills.filter(bill => bill.status === 'PARTIALLY_PAID').length,
        paid: bills.filter(bill => bill.status === 'PAID').length,
        overdue: bills.filter(bill => bill.status === 'OVERDUE').length
      },
      bills
    };

    res.json(successResponse(summary));
  } catch (error) {
    console.error('Get purchase report error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Detailed sales report
exports.getSalesReportDetailed = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.user.companyId;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();

    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          companyId,
          invoiceDate: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        invoice: {
          include: {
            customer: {
              select: { id: true, name: true }
            }
          }
        },
        product: true
      }
    });

    // Group by product
    const productSummary = {};
    invoiceItems.forEach(item => {
      const productId = item.productId || 'no-product';
      const productName = item.product?.name || item.description;

      if (!productSummary[productId]) {
        productSummary[productId] = {
          productId,
          productName,
          quantity: 0,
          totalAmount: 0
        };
      }

      productSummary[productId].quantity += item.quantity;
      productSummary[productId].totalAmount += item.totalAmount;
    });

    res.json(successResponse({
      items: invoiceItems,
      productSummary: Object.values(productSummary)
    }));
  } catch (error) {
    console.error('Get detailed sales report error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Detailed purchase report
exports.getPurchaseReportDetailed = async (req, res) => {
  try {
    const companyId = req.query.company_id || req.user.companyId;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();

    const billItems = await prisma.billItem.findMany({
      where: {
        bill: {
          companyId,
          billDate: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        bill: {
          include: {
            supplier: {
              select: { id: true, name: true }
            }
          }
        },
        product: true
      }
    });

    // Group by product
    const productSummary = {};
    billItems.forEach(item => {
      const productId = item.productId || 'no-product';
      const productName = item.product?.name || item.description;

      if (!productSummary[productId]) {
        productSummary[productId] = {
          productId,
          productName,
          quantity: 0,
          totalAmount: 0
        };
      }

      productSummary[productId].quantity += item.quantity;
      productSummary[productId].totalAmount += item.totalAmount;
    });

    res.json(successResponse({
      items: billItems,
      productSummary: Object.values(productSummary)
    }));
  } catch (error) {
    console.error('Get detailed purchase report error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// POS Invoice report
exports.getPOSInvoices = async (req, res) => {
  try {
    const { companyId } = req.params;

    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['PAID', 'SENT'] }
      },
      include: {
        customer: {
          select: { id: true, name: true }
        },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { invoiceDate: 'desc' },
      take: 100
    });

    res.json(successResponse(invoices));
  } catch (error) {
    console.error('Get POS invoices error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};