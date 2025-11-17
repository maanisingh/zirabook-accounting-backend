require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 8003;

// Security middleware
app.use(helmet());

// CORS configuration - Allow all origins for development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'https://accounting.alexandratechlab.com',
      'https://frontend-production-32b8.up.railway.app',
      'http://zirakbook.91.98.157.75.nip.io',
      'http://91.98.157.75',
      'http://localhost:3000',
      'http://localhost:8003'
    ];

    // Check if origin is in allowed list or is any Railway/nip.io domain
    if (allowedOrigins.indexOf(origin) !== -1 ||
        origin.includes('.railway.app') ||
        origin.includes('.nip.io') ||
        origin.includes('alexandratechlab.com')) {
      callback(null, true);
    } else {
      console.log(`⚠️  CORS blocked origin: ${origin}`);
      callback(null, true); // Allow anyway for development
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize database connection
const prisma = require('./src/config/database');

// Import route files
const authRoutes = require('./src/routes/auth');
const companiesRoutes = require('./src/routes/companies');
const customersRoutes = require('./src/routes/customers');
const suppliersRoutes = require('./src/routes/suppliers');
const productsRoutes = require('./src/routes/products');
const accountsRoutes = require('./src/routes/accounts');
const invoicesRoutes = require('./src/routes/invoices');
const billsRoutes = require('./src/routes/bills');
const paymentsRoutes = require('./src/routes/payments');
const expensesRoutes = require('./src/routes/expenses');
const journalRoutes = require('./src/routes/journal');
const reportsRoutes = require('./src/routes/reports');
const usersRoutes = require('./src/routes/users');
// New routes
const salesRoutes = require('./src/routes/sales');
const purchasesRoutes = require('./src/routes/purchases');
const ledgerRoutes = require('./src/routes/ledger');
const dashboardRoutes = require('./src/routes/dashboard');

// Import middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { authMiddleware } = require('./src/middleware/auth');

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'ZirakBook Accounting API',
    version: '2.0.0',
    endpoints: {
      health: '/api/v1/health',
      auth: '/api/v1/auth',
      docs: 'https://github.com/maanisingh/zirabook-accounting-backend'
    }
  });
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'Accounting API is running',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/companies', companiesRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/suppliers', suppliersRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/accounts', accountsRoutes);
app.use('/api/v1/invoices', invoicesRoutes);
app.use('/api/v1/bills', billsRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/expenses', expensesRoutes);
app.use('/api/v1/journal-entries', journalRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/users', usersRoutes);
// New routes
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/purchases', purchasesRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// User roles endpoint (protected)
app.get('/api/v1/user-roles', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 1, name: 'SUPERADMIN', description: 'Full system access', isActive: true },
      { id: 2, name: 'COMPANY_ADMIN', description: 'Company administrator', isActive: true },
      { id: 3, name: 'ACCOUNTANT', description: 'Accounting staff', isActive: true },
      { id: 4, name: 'USER', description: 'Regular user', isActive: true }
    ]
  });
});

// Dashboard statistics endpoint (protected)
app.get('/api/v1/dashboard/stats', authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId;

    // Get basic counts
    const [
      totalCustomers,
      totalSuppliers,
      totalProducts,
      totalInvoices,
      totalBills,
      activeUsers
    ] = await Promise.all([
      prisma.customer.count({ where: { companyId, isActive: true } }),
      prisma.supplier.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.invoice.count({ where: { companyId } }),
      prisma.bill.count({ where: { companyId } }),
      prisma.user.count({ where: { companyId, isActive: true } })
    ]);

    // Get financial summaries
    const [
      revenue,
      expenses,
      receivables,
      payables
    ] = await Promise.all([
      prisma.invoice.aggregate({
        where: { companyId, status: 'PAID' },
        _sum: { totalAmount: true }
      }),
      prisma.bill.aggregate({
        where: { companyId, status: 'PAID' },
        _sum: { totalAmount: true }
      }),
      prisma.invoice.aggregate({
        where: {
          companyId,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: { balanceDue: true }
      }),
      prisma.bill.aggregate({
        where: {
          companyId,
          status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: { balanceDue: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        counts: {
          customers: totalCustomers,
          suppliers: totalSuppliers,
          products: totalProducts,
          invoices: totalInvoices,
          bills: totalBills,
          users: activeUsers
        },
        financials: {
          totalRevenue: revenue._sum.totalAmount || 0,
          totalExpenses: expenses._sum.totalAmount || 0,
          netIncome: (revenue._sum.totalAmount || 0) - (expenses._sum.totalAmount || 0),
          totalReceivables: receivables._sum.balanceDue || 0,
          totalPayables: payables._sum.balanceDue || 0
        }
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Error handling middleware - must be last
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing HTTP server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing HTTP server...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ========================================
  🚀 Accounting API Server Started
  ========================================
  📍 Port: ${PORT}
  🌍 Environment: ${process.env.NODE_ENV || 'development'}
  🔗 API Base: http://localhost:${PORT}/api/v1
  ⚡ Health Check: http://localhost:${PORT}/api/v1/health
  ========================================
  `);
});