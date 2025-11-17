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
 * List suppliers with pagination, search, and filters
 * GET /api/v1/suppliers
 */
const listSuppliers = async (req, res) => {
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
        { supplierCode: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (status !== undefined) {
      where.isActive = status === 'active';
    }

    // Build orderBy
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    // Get suppliers with aggregated data
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: {
            select: {
              bills: true
            }
          }
        }
      }),
      prisma.supplier.count({ where })
    ]);

    // Calculate outstanding balance for each supplier
    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (supplier) => {
        const outstandingBills = await prisma.bill.aggregate({
          where: {
            supplierId: supplier.id,
            status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
          },
          _sum: {
            balanceDue: true
          }
        });

        return {
          ...supplier,
          outstandingBalance: outstandingBills._sum.balanceDue || 0,
          totalBills: supplier._count.bills
        };
      })
    );

    res.json(paginatedResponse(suppliersWithBalance, total, page, limit));
  } catch (error) {
    console.error('List suppliers error:', error);
    res.status(500).json(errorResponse('Failed to fetch suppliers', error));
  }
};

/**
 * Create a new supplier
 * POST /api/v1/suppliers
 */
const createSupplier = async (req, res) => {
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
      paymentTerms = 30,
      bankAccount,
      bankName
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json(errorResponse('Supplier name is required'));
    }

    const companyId = req.user.companyId;
    if (!companyId && req.user.role !== 'SUPERADMIN') {
      return res.status(400).json(errorResponse('Company context required'));
    }

    // Check for duplicate supplier
    if (email) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: {
          companyId,
          email: email.toLowerCase()
        }
      });

      if (existingSupplier) {
        return res.status(409).json(
          errorResponse('Supplier with this email already exists')
        );
      }
    }

    // Generate supplier code
    const supplierCount = await prisma.supplier.count({ where: { companyId } });
    const supplierCode = `SUPP-${String(supplierCount + 1).padStart(5, '0')}`;

    // Create supplier
    const supplier = await prisma.supplier.create({
      data: {
        id: uuidv4(),
        supplierCode,
        name,
        email: email?.toLowerCase(),
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        taxId,
        contactPerson,
        paymentTerms,
        bankAccount,
        bankName,
        companyId,
        balance: 0,
        isActive: true
      }
    });

    res.status(201).json(successResponse(supplier, 'Supplier created successfully'));
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json(errorResponse('Failed to create supplier', error));
  }
};

/**
 * Get supplier details
 * GET /api/v1/suppliers/:id
 */
const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      },
      include: {
        bills: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            billNumber: true,
            billDate: true,
            dueDate: true,
            totalAmount: true,
            balanceDue: true,
            status: true
          }
        },
        products: {
          take: 10,
          select: {
            id: true,
            name: true,
            sku: true,
            currentStock: true,
            unitPrice: true
          }
        },
        _count: {
          select: {
            bills: true,
            products: true
          }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    // Calculate statistics
    const [totalPurchases, outstandingBalance, overdueAmount] = await Promise.all([
      prisma.bill.aggregate({
        where: {
          supplierId: id,
          status: { in: ['PAID', 'PARTIALLY_PAID'] }
        },
        _sum: {
          totalAmount: true
        }
      }),
      prisma.bill.aggregate({
        where: {
          supplierId: id,
          status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceDue: true
        }
      }),
      prisma.bill.aggregate({
        where: {
          supplierId: id,
          status: 'OVERDUE'
        },
        _sum: {
          balanceDue: true
        }
      })
    ]);

    const supplierData = {
      ...supplier,
      statistics: {
        totalPurchases: totalPurchases._sum.totalAmount || 0,
        outstandingBalance: outstandingBalance._sum.balanceDue || 0,
        overdueAmount: overdueAmount._sum.balanceDue || 0,
        totalBills: supplier._count.bills,
        totalProducts: supplier._count.products
      }
    };

    res.json(successResponse(supplierData));
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json(errorResponse('Failed to fetch supplier details', error));
  }
};

/**
 * Update supplier
 * PUT /api/v1/suppliers/:id
 */
const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    // Check if supplier exists
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      }
    });

    if (!existingSupplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
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
      paymentTerms: req.body.paymentTerms,
      bankAccount: req.body.bankAccount,
      bankName: req.body.bankName
    });

    // Check for duplicate email if updating
    if (updateData.email && updateData.email !== existingSupplier.email) {
      const duplicateEmail = await prisma.supplier.findFirst({
        where: {
          companyId: existingSupplier.companyId,
          email: updateData.email,
          id: { not: id }
        }
      });

      if (duplicateEmail) {
        return res.status(409).json(
          errorResponse('Another supplier with this email already exists')
        );
      }
    }

    // Update supplier
    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(updatedSupplier, 'Supplier updated successfully'));
  } catch (error) {
    console.error('Update supplier error:', error);
    res.status(500).json(errorResponse('Failed to update supplier', error));
  }
};

/**
 * Soft delete supplier
 * DELETE /api/v1/suppliers/:id
 */
const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    // Check if supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : companyId
      },
      include: {
        _count: {
          select: {
            bills: true
          }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    // Check for outstanding balance
    const outstandingBalance = await prisma.bill.aggregate({
      where: {
        supplierId: id,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
      },
      _sum: {
        balanceDue: true
      }
    });

    if (outstandingBalance._sum.balanceDue > 0) {
      return res.status(400).json(
        errorResponse('Cannot delete supplier with outstanding balance')
      );
    }

    // Soft delete
    const deletedSupplier = await prisma.supplier.update({
      where: { id },
      data: { isActive: false }
    });

    res.json(successResponse(deletedSupplier, 'Supplier deleted successfully'));
  } catch (error) {
    console.error('Delete supplier error:', error);
    res.status(500).json(errorResponse('Failed to delete supplier', error));
  }
};

/**
 * Get supplier bills
 * GET /api/v1/suppliers/:id/bills
 */
const getSupplierBills = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const { skip, take } = paginate(page, limit);

    // Build where clause
    const where = { supplierId: id };
    if (status) {
      where.status = status;
    }

    // Verify supplier exists and user has access
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          billNumber: true,
          billDate: true,
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
      prisma.bill.count({ where })
    ]);

    res.json(paginatedResponse(bills, total, page, limit));
  } catch (error) {
    console.error('Get supplier bills error:', error);
    res.status(500).json(errorResponse('Failed to fetch supplier bills', error));
  }
};

/**
 * Get supplier balance
 * GET /api/v1/suppliers/:id/balance
 */
const getSupplierBalance = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        companyId: req.user.role === 'SUPERADMIN' ? undefined : req.user.companyId
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    // Get all outstanding bills
    const outstandingBills = await prisma.bill.findMany({
      where: {
        supplierId: id,
        status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] },
        balanceDue: { gt: 0 }
      },
      select: {
        id: true,
        billNumber: true,
        billDate: true,
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

    outstandingBills.forEach(bill => {
      const agingPeriod = calculateAging(bill.dueDate);
      aging[agingPeriod] += bill.balanceDue;
      totalOutstanding += bill.balanceDue;
    });

    // Get payment history
    const recentPayments = await prisma.payment.findMany({
      where: {
        supplierId: id
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
      supplier: {
        id: supplier.id,
        name: supplier.name,
        paymentTerms: supplier.paymentTerms
      },
      summary: {
        totalOutstanding,
        overdueAmount: aging['1-30'] + aging['31-60'] + aging['61-90'] + aging.over90
      },
      aging,
      outstandingBills,
      recentPayments
    };

    res.json(successResponse(balanceData));
  } catch (error) {
    console.error('Get supplier balance error:', error);
    res.status(500).json(errorResponse('Failed to fetch supplier balance', error));
  }
};

module.exports = {
  listSuppliers,
  createSupplier,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  getSupplierBills,
  getSupplierBalance
};