const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const csv = require('csv-parser');
const fs = require('fs');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  sanitizeSearchQuery,
  cleanObject,
  calculateAging
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * List customers with pagination, search, and filters
 * GET /api/v1/customers
 */
const listCustomers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const { skip, take } = paginate(page, limit);

    // Ensure company isolation
    const companyId = req.user.companyId;
    if (!companyId && req.user.role !== 'SUPERADMIN') {
      return res.status(400).json(errorResponse('Company context required'));
    }

    // Build where clause
    const where = {
      companyId: req.user.role === 'SUPERADMIN' && req.query.companyId
        ? req.query.companyId
        : companyId
    };

    if (search) {
      const searchTerm = sanitizeSearchQuery(search);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm, mode: 'insensitive' } },
        { customerCode: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (status !== undefined) {
      where.isActive = status === 'active';
    }

    // Build orderBy
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    // Get customers with aggregated data
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: {
            select: {
              invoices: true
            }
          }
        }
      }),
      prisma.customer.count({ where })
    ]);

    // Calculate outstanding balance for each customer
    const customersWithBalance = await Promise.all(
      customers.map(async (customer) => {
        const outstandingInvoices = await prisma.invoice.aggregate({
          where: {
            customerId: customer.id,
            status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
          },
          _sum: {
            balanceAmount: true
          }
        });

        return {
          ...customer,
          outstandingBalance: outstandingInvoices._sum.balanceAmount || 0,
          totalInvoices: customer._count.invoices
        };
      })
    );

    res.json(paginatedResponse(customersWithBalance, total, page, limit));
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json(errorResponse('Failed to fetch customers', error));
  }
};

/**
 * Create a new customer
 * POST /api/v1/customers
 */
const createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      taxId,
      contactPerson,
      creditLimit = 0,
      paymentTerms = 30
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json(errorResponse('Customer name is required'));
    }

    const companyId = req.user.companyId;
    if (!companyId && req.user.role !== 'SUPERADMIN') {
      return res.status(400).json(errorResponse('Company context required'));
    }

    // Check for duplicate customer
    if (email) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          companyId,
          email: email.toLowerCase()
        }
      });

      if (existingCustomer) {
        return res.status(409).json(
          errorResponse('Customer with this email already exists')
        );
      }
    }

    // Generate customer code
    const customerCount = await prisma.customer.count({ where: { companyId } });
    const customerCode = `CUST-${String(customerCount + 1).padStart(5, '0')}`;

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        id: uuidv4(),
        customerCode,
        name,
        email: email?.toLowerCase(),
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        taxId,
        creditLimit,
        creditPeriodDays: paymentTerms || 30,
        companyId,
        balance: 0,
        isActive: true
      }
    });

    res.status(201).json(successResponse(customer, 'Customer created successfully'));
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json(errorResponse('Failed to create customer', error));
  }
};

/**
 * Get customer details
 * GET /api/v1/customers/:id
 */
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const customer = await prisma.customer.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            totalAmount: true,
            balanceDue: true,
            status: true
          }
        },
        _count: {
          select: {
            invoices: true
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Calculate statistics
    const [totalSales, outstandingBalance, overdueAmount] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          customerId: id,
          status: { in: ['PAID', 'PARTIALLY_PAID'] }
        },
        _sum: {
          totalAmount: true
        }
      }),
      prisma.invoice.aggregate({
        where: {
          customerId: id,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceDue: true
        }
      }),
      prisma.invoice.aggregate({
        where: {
          customerId: id,
          status: 'OVERDUE'
        },
        _sum: {
          balanceDue: true
        }
      })
    ]);

    const customerData = {
      ...customer,
      statistics: {
        totalSales: totalSales._sum.totalAmount || 0,
        outstandingBalance: outstandingBalance._sum.balanceDue || 0,
        overdueAmount: overdueAmount._sum.balanceDue || 0,
        totalInvoices: customer._count.invoices,
        creditAvailable: customer.creditLimit - (outstandingBalance._sum.balanceDue || 0)
      }
    };

    res.json(successResponse(customerData));
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json(errorResponse('Failed to fetch customer details', error));
  }
};

/**
 * Update customer
 * PUT /api/v1/customers/:id
 */
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      }
    });

    if (!existingCustomer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Clean update data
    const updateData = cleanObject({
      name: req.body.name,
      email: req.body.email?.toLowerCase(),
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      zipCode: req.body.zipCode,
      taxId: req.body.taxId,
      contactPerson: req.body.contactPerson,
      creditLimit: req.body.creditLimit,
      paymentTerms: req.body.paymentTerms
    });

    // Check for duplicate email if updating
    if (updateData.email && updateData.email !== existingCustomer.email) {
      const duplicateEmail = await prisma.customer.findFirst({
        where: {
          companyId: existingCustomer.companyId,
          email: updateData.email,
          id: { not: id }
        }
      });

      if (duplicateEmail) {
        return res.status(409).json(
          errorResponse('Another customer with this email already exists')
        );
      }
    }

    // Update customer
    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(updatedCustomer, 'Customer updated successfully'));
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json(errorResponse('Failed to update customer', error));
  }
};

/**
 * Soft delete customer
 * DELETE /api/v1/customers/:id
 */
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    // Check if customer exists
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      },
      include: {
        _count: {
          select: {
            invoices: true
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Check for outstanding balance
    const outstandingBalance = await prisma.invoice.aggregate({
      where: {
        customerId: id,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
      },
      _sum: {
        balanceDue: true
      }
    });

    if (outstandingBalance._sum.balanceDue > 0) {
      return res.status(400).json(
        errorResponse('Cannot delete customer with outstanding balance')
      );
    }

    // Soft delete
    const deletedCustomer = await prisma.customer.update({
      where: { id },
      data: { isActive: false }
    });

    res.json(successResponse(deletedCustomer, 'Customer deleted successfully'));
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json(errorResponse('Failed to delete customer', error));
  }
};

/**
 * Get customer invoices
 * GET /api/v1/customers/:id/invoices
 */
const getCustomerInvoices = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const { skip, take } = paginate(page, limit);

    // Build where clause
    const where = { customerId: id };
    if (status) {
      where.status = status;
    }

    // Verify customer exists and user has access
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          totalAmount: true,
          paidAmount: true,
          balanceDue: true,
          status: true,
          items: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true
            }
          }
        }
      }),
      prisma.invoice.count({ where })
    ]);

    res.json(paginatedResponse(invoices, total, page, limit));
  } catch (error) {
    console.error('Get customer invoices error:', error);
    res.status(500).json(errorResponse('Failed to fetch customer invoices', error));
  }
};

/**
 * Get customer balance and aging
 * GET /api/v1/customers/:id/balance
 */
const getCustomerBalance = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    // Get all outstanding invoices
    const outstandingInvoices = await prisma.invoice.findMany({
      where: {
        customerId: id,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceDue: { gt: 0 }
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        balanceDue: true,
        status: true
      }
    });

    // Calculate aging buckets
    const aging = {
      current: 0,
      '1-30': 0,
      '31-60': 0,
      '61-90': 0,
      over90: 0
    };

    let totalOutstanding = 0;

    outstandingInvoices.forEach(invoice => {
      const agingPeriod = calculateAging(invoice.dueDate);
      aging[agingPeriod] += invoice.balanceDue;
      totalOutstanding += invoice.balanceDue;
    });

    // Get payment history
    const recentPayments = await prisma.payment.findMany({
      where: {
        customerId: id
      },
      orderBy: { paymentDate: 'desc' },
      take: 10,
      select: {
        id: true,
        paymentNumber: true,
        paymentDate: true,
        amount: true,
        paymentMethod: true,
        reference: true
      }
    });

    const balanceData = {
      customer: {
        id: customer.id,
        name: customer.name,
        creditLimit: customer.creditLimit
      },
      summary: {
        totalOutstanding,
        creditAvailable: customer.creditLimit - totalOutstanding,
        overdueAmount: aging['1-30'] + aging['31-60'] + aging['61-90'] + aging.over90
      },
      aging,
      outstandingInvoices,
      recentPayments
    };

    res.json(successResponse(balanceData));
  } catch (error) {
    console.error('Get customer balance error:', error);
    res.status(500).json(errorResponse('Failed to fetch customer balance', error));
  }
};

/**
 * Import customers from CSV
 * POST /api/v1/customers/import
 */
const importCustomers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('CSV file is required'));
    }

    const companyId = req.user.companyId;
    if (!companyId && req.user.role !== 'SUPERADMIN') {
      return res.status(400).json(errorResponse('Company context required'));
    }

    const results = [];
    const errors = [];
    let processedCount = 0;

    // Parse CSV file
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', async (data) => {
        processedCount++;

        try {
          // Validate required fields
          if (!data.name) {
            errors.push({
              row: processedCount,
              error: 'Name is required',
              data
            });
            return;
          }

          // Check for duplicate
          if (data.email) {
            const existing = await prisma.customer.findFirst({
              where: {
                companyId,
                email: data.email.toLowerCase()
              }
            });

            if (existing) {
              errors.push({
                row: processedCount,
                error: 'Customer with this email already exists',
                data
              });
              return;
            }
          }

          // Generate customer code
          const customerCount = await prisma.customer.count({ where: { companyId } });
          const customerCode = `CUST-${String(customerCount + processedCount).padStart(5, '0')}`;

          // Create customer
          const customer = await prisma.customer.create({
            data: {
              id: uuidv4(),
              customerCode,
              name: data.name,
              email: data.email?.toLowerCase(),
              phone: data.phone,
              address: data.address,
              city: data.city,
              state: data.state,
              country: data.country,
              zipCode: data.zipCode,
              taxId: data.taxId,
              contactPerson: data.contactPerson,
              creditLimit: parseFloat(data.creditLimit) || 0,
              paymentTerms: parseInt(data.paymentTerms) || 30,
              companyId,
              balance: 0,
              isActive: true
            }
          });

          results.push(customer);
        } catch (error) {
          errors.push({
            row: processedCount,
            error: error.message,
            data
          });
        }
      })
      .on('end', () => {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
          success: true,
          message: `Import completed. ${results.length} customers imported successfully.`,
          data: {
            imported: results.length,
            failed: errors.length,
            errors: errors.slice(0, 10) // Return first 10 errors
          }
        });
      })
      .on('error', (error) => {
        fs.unlinkSync(req.file.path);
        res.status(500).json(errorResponse('Failed to process CSV file', error));
      });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Import customers error:', error);
    res.status(500).json(errorResponse('Failed to import customers', error));
  }
};

module.exports = {
  listCustomers,
  createCustomer,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getCustomerInvoices,
  getCustomerBalance,
  importCustomers
};