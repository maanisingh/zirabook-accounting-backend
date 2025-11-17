const { PrismaClient } = require('@prisma/client');
const { successResponse, errorResponse } = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * Get Company Dashboard Statistics
 * GET /api/v1/dashboard/company
 *
 * Returns statistics for a specific company:
 * - Total revenue (from paid invoices)
 * - Total expenses (from paid bills + expenses)
 * - Outstanding receivables (unpaid invoices)
 * - Outstanding payables (unpaid bills)
 * - Active customers count
 * - Active suppliers count
 * - Low stock products count
 * - Recent transactions (last 10)
 */
const getCompanyDashboardStats = async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json(errorResponse('Company ID is required'));
    }

    // Fetch all statistics in parallel for better performance
    const [
      totalRevenue,
      totalExpensesFromBills,
      totalExpensesFromExpenses,
      outstandingReceivables,
      outstandingPayables,
      activeCustomersCount,
      activeSuppliersCount,
      lowStockProductsCount,
      recentInvoices,
      recentBills,
      recentPayments,
      recentExpenses
    ] = await Promise.all([
      // Total revenue - sum of paid invoices
      prisma.invoice.aggregate({
        where: {
          companyId,
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Total expenses from bills
      prisma.bill.aggregate({
        where: {
          companyId,
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Total expenses from expense records
      prisma.expense.aggregate({
        where: {
          companyId
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Outstanding receivables - unpaid invoice balances
      prisma.invoice.aggregate({
        where: {
          companyId,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceAmount: true
        }
      }),

      // Outstanding payables - unpaid bill balances
      prisma.bill.aggregate({
        where: {
          companyId,
          status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceAmount: true
        }
      }),

      // Active customers count
      prisma.customer.count({
        where: {
          companyId,
          isActive: true
        }
      }),

      // Active suppliers count
      prisma.supplier.count({
        where: {
          companyId,
          isActive: true
        }
      }),

      // Low stock products (stock below reorder level)
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM products
        WHERE "companyId" = ${companyId}
          AND "isActive" = true
          AND "reorderLevel" IS NOT NULL
          AND "currentStock" <= "reorderLevel"
      `.then(result => result[0]?.count || 0),

      // Recent invoices (last 5)
      prisma.invoice.findMany({
        where: { companyId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          status: true,
          invoiceDate: true,
          customer: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),

      // Recent bills (last 5)
      prisma.bill.findMany({
        where: { companyId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          billNumber: true,
          totalAmount: true,
          status: true,
          billDate: true,
          supplier: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),

      // Recent payments (last 5)
      prisma.payment.findMany({
        where: { companyId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paymentDate: true,
          paymentMethod: true,
          invoice: {
            select: {
              invoiceNumber: true,
              customer: {
                select: { name: true }
              }
            }
          },
          bill: {
            select: {
              billNumber: true,
              supplier: {
                select: { name: true }
              }
            }
          }
        }
      }),

      // Recent expenses (last 5)
      prisma.expense.findMany({
        where: { companyId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          expenseNumber: true,
          totalAmount: true,
          category: true,
          expenseDate: true,
          description: true
        }
      })
    ]);

    // Combine and format recent transactions
    const recentTransactions = [
      ...recentInvoices.map(inv => ({
        id: inv.id,
        type: 'invoice',
        number: inv.invoiceNumber,
        amount: inv.totalAmount,
        status: inv.status,
        date: inv.invoiceDate,
        party: inv.customer.name,
        partyId: inv.customer.id
      })),
      ...recentBills.map(bill => ({
        id: bill.id,
        type: 'bill',
        number: bill.billNumber,
        amount: bill.totalAmount,
        status: bill.status,
        date: bill.billDate,
        party: bill.supplier.name,
        partyId: bill.supplier.id
      })),
      ...recentPayments.map(payment => ({
        id: payment.id,
        type: 'payment',
        number: payment.paymentNumber,
        amount: payment.amount,
        status: 'completed',
        date: payment.paymentDate,
        method: payment.paymentMethod,
        party: payment.invoice
          ? payment.invoice.customer.name
          : payment.bill?.supplier.name || 'N/A',
        reference: payment.invoice?.invoiceNumber || payment.bill?.billNumber
      })),
      ...recentExpenses.map(expense => ({
        id: expense.id,
        type: 'expense',
        number: expense.expenseNumber,
        amount: expense.totalAmount,
        status: 'completed',
        date: expense.expenseDate,
        category: expense.category,
        description: expense.description
      }))
    ]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10); // Get top 10 most recent

    // Calculate totals
    const revenue = totalRevenue._sum.totalAmount || 0;
    const expensesFromBills = totalExpensesFromBills._sum.totalAmount || 0;
    const expensesFromExpenseRecords = totalExpensesFromExpenses._sum.totalAmount || 0;
    const totalExpenses = expensesFromBills + expensesFromExpenseRecords;
    const netProfit = revenue - totalExpenses;

    const stats = {
      revenue: {
        total: revenue,
        currency: 'USD'
      },
      expenses: {
        total: totalExpenses,
        fromBills: expensesFromBills,
        fromExpenses: expensesFromExpenseRecords,
        currency: 'USD'
      },
      netProfit: {
        total: netProfit,
        currency: 'USD'
      },
      receivables: {
        outstanding: outstandingReceivables._sum.balanceAmount || 0,
        currency: 'USD'
      },
      payables: {
        outstanding: outstandingPayables._sum.balanceAmount || 0,
        currency: 'USD'
      },
      customers: {
        active: activeCustomersCount
      },
      suppliers: {
        active: activeSuppliersCount
      },
      products: {
        lowStock: lowStockProductsCount
      },
      recentTransactions
    };

    res.json(successResponse(stats, 'Company dashboard statistics retrieved successfully'));
  } catch (error) {
    console.error('Get company dashboard stats error:', error);
    res.status(500).json(errorResponse('Failed to fetch company dashboard statistics', error));
  }
};

/**
 * Get Superadmin Dashboard Statistics
 * GET /api/v1/dashboard/superadmin
 *
 * Returns platform-wide statistics (SUPERADMIN only):
 * - Total companies count
 * - Active companies count
 * - Total users count
 * - Total revenue across all companies
 * - Recent company signups (last 10)
 */
const getSuperadminDashboardStats = async (req, res) => {
  try {
    // Check if user is SUPERADMIN
    if (req.user.role !== 'SUPERADMIN') {
      return res.status(403).json(
        errorResponse('Access denied. SUPERADMIN role required.')
      );
    }

    // Fetch superadmin statistics in parallel
    const [
      totalCompaniesCount,
      activeCompaniesCount,
      totalUsersCount,
      activeUsersCount,
      totalRevenue,
      totalInvoicesCount,
      totalBillsCount,
      recentCompanies
    ] = await Promise.all([
      // Total companies
      prisma.company.count(),

      // Active companies
      prisma.company.count({
        where: { isActive: true }
      }),

      // Total users
      prisma.user.count(),

      // Active users
      prisma.user.count({
        where: { isActive: true }
      }),

      // Total revenue across all companies
      prisma.invoice.aggregate({
        where: {
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Total invoices count
      prisma.invoice.count(),

      // Total bills count
      prisma.bill.count(),

      // Recent company signups (last 10)
      prisma.company.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              customers: true,
              suppliers: true,
              invoices: true,
              bills: true
            }
          }
        }
      })
    ]);

    const stats = {
      companies: {
        total: totalCompaniesCount,
        active: activeCompaniesCount,
        inactive: totalCompaniesCount - activeCompaniesCount
      },
      users: {
        total: totalUsersCount,
        active: activeUsersCount,
        inactive: totalUsersCount - activeUsersCount
      },
      revenue: {
        total: totalRevenue._sum.totalAmount || 0,
        currency: 'USD'
      },
      transactions: {
        totalInvoices: totalInvoicesCount,
        totalBills: totalBillsCount
      },
      recentCompanies: recentCompanies.map(company => ({
        id: company.id,
        name: company.name,
        email: company.email,
        isActive: company.isActive,
        createdAt: company.createdAt,
        stats: {
          users: company._count.users,
          customers: company._count.customers,
          suppliers: company._count.suppliers,
          invoices: company._count.invoices,
          bills: company._count.bills
        }
      }))
    };

    res.json(successResponse(stats, 'Superadmin dashboard statistics retrieved successfully'));
  } catch (error) {
    console.error('Get superadmin dashboard stats error:', error);
    res.status(500).json(errorResponse('Failed to fetch superadmin dashboard statistics', error));
  }
};

/**
 * Get Company Dashboard Charts Data
 * GET /api/v1/dashboard/company/charts
 *
 * Returns chart data for company dashboard:
 * - Monthly revenue (last 12 months)
 * - Monthly expenses (last 12 months)
 * - Top customers by revenue (top 10)
 * - Top products by sales (top 10)
 */
const getCompanyDashboardCharts = async (req, res) => {
  try {
    const companyId = req.user.companyId;

    if (!companyId) {
      return res.status(400).json(errorResponse('Company ID is required'));
    }

    // Calculate date range for last 12 months
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Fetch chart data in parallel
    const [
      invoicesByMonth,
      billsByMonth,
      expensesByMonth,
      topCustomers,
      topProducts
    ] = await Promise.all([
      // Monthly invoices for last 12 months
      prisma.invoice.groupBy({
        by: ['invoiceDate'],
        where: {
          companyId,
          status: 'PAID',
          invoiceDate: {
            gte: twelveMonthsAgo
          }
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Monthly bills for last 12 months
      prisma.bill.groupBy({
        by: ['billDate'],
        where: {
          companyId,
          status: 'PAID',
          billDate: {
            gte: twelveMonthsAgo
          }
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Monthly expenses for last 12 months
      prisma.expense.groupBy({
        by: ['expenseDate'],
        where: {
          companyId,
          expenseDate: {
            gte: twelveMonthsAgo
          }
        },
        _sum: {
          totalAmount: true
        }
      }),

      // Top 10 customers by revenue
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: {
          companyId,
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        },
        _count: {
          id: true
        },
        orderBy: {
          _sum: {
            totalAmount: 'desc'
          }
        },
        take: 10
      }),

      // Top 10 products by sales
      prisma.invoiceItem.groupBy({
        by: ['productId'],
        where: {
          invoice: {
            companyId,
            status: 'PAID'
          },
          productId: { not: null }
        },
        _sum: {
          totalAmount: true,
          quantity: true
        },
        _count: {
          id: true
        },
        orderBy: {
          _sum: {
            totalAmount: 'desc'
          }
        },
        take: 10
      })
    ]);

    // Process monthly revenue data
    const monthlyRevenueMap = {};
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenueMap[key] = 0;
    }

    invoicesByMonth.forEach(item => {
      const date = new Date(item.invoiceDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyRevenueMap.hasOwnProperty(key)) {
        monthlyRevenueMap[key] += item._sum.totalAmount || 0;
      }
    });

    const monthlyRevenue = Object.entries(monthlyRevenueMap).map(([month, amount]) => ({
      month,
      amount
    }));

    // Process monthly expenses data
    const monthlyExpensesMap = {};
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyExpensesMap[key] = 0;
    }

    // Add bills to expenses
    billsByMonth.forEach(item => {
      const date = new Date(item.billDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyExpensesMap.hasOwnProperty(key)) {
        monthlyExpensesMap[key] += item._sum.totalAmount || 0;
      }
    });

    // Add expense records to expenses
    expensesByMonth.forEach(item => {
      const date = new Date(item.expenseDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyExpensesMap.hasOwnProperty(key)) {
        monthlyExpensesMap[key] += item._sum.totalAmount || 0;
      }
    });

    const monthlyExpenses = Object.entries(monthlyExpensesMap).map(([month, amount]) => ({
      month,
      amount
    }));

    // Fetch customer details for top customers
    const customerIds = topCustomers.map(c => c.customerId);
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    const customerMap = {};
    customers.forEach(c => {
      customerMap[c.id] = c;
    });

    const topCustomersByRevenue = topCustomers.map(item => ({
      customerId: item.customerId,
      customerName: customerMap[item.customerId]?.name || 'Unknown',
      customerEmail: customerMap[item.customerId]?.email,
      totalRevenue: item._sum.totalAmount || 0,
      invoiceCount: item._count.id
    }));

    // Fetch product details for top products
    const productIds = topProducts.map(p => p.productId).filter(id => id !== null);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: {
        id: true,
        name: true,
        productCode: true,
        category: true
      }
    });

    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = p;
    });

    const topProductsBySales = topProducts
      .filter(item => item.productId !== null)
      .map(item => ({
        productId: item.productId,
        productName: productMap[item.productId]?.name || 'Unknown',
        productCode: productMap[item.productId]?.productCode,
        category: productMap[item.productId]?.category,
        totalSales: item._sum.totalAmount || 0,
        quantitySold: item._sum.quantity || 0,
        transactionCount: item._count.id
      }));

    const chartData = {
      monthlyRevenue,
      monthlyExpenses,
      topCustomersByRevenue,
      topProductsBySales
    };

    res.json(successResponse(chartData, 'Company dashboard chart data retrieved successfully'));
  } catch (error) {
    console.error('Get company dashboard charts error:', error);
    res.status(500).json(errorResponse('Failed to fetch company dashboard chart data', error));
  }
};

module.exports = {
  getCompanyDashboardStats,
  getSuperadminDashboardStats,
  getCompanyDashboardCharts
};
