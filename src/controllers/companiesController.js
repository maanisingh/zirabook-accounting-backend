const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  sanitizeSearchQuery,
  cleanObject
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * List all companies (SUPERADMIN only)
 * GET /api/v1/companies
 */
const listCompanies = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const { skip, take } = paginate(page, limit);

    // Build where clause
    const where = {};

    if (search) {
      const searchTerm = sanitizeSearchQuery(search);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { taxId: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Get companies with pagination
    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
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
      }),
      prisma.company.count({ where })
    ]);

    res.json(paginatedResponse(companies, total, page, limit));
  } catch (error) {
    console.error('List companies error:', error);
    res.status(500).json(errorResponse('Failed to fetch companies', error));
  }
};

/**
 * Create a new company (SUPERADMIN only)
 * POST /api/v1/companies
 */
const createCompany = async (req, res) => {
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
      logo,
      fiscalYearStart = 1,
      baseCurrency = 'USD'
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json(errorResponse('Company name is required'));
    }

    // Check if company with same name or taxId exists
    if (taxId) {
      const existingCompany = await prisma.company.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: 'insensitive' } },
            { taxId }
          ]
        }
      });

      if (existingCompany) {
        return res.status(409).json(
          errorResponse('Company with this name or tax ID already exists')
        );
      }
    }

    // Create company
    const company = await prisma.company.create({
      data: {
        id: uuidv4(),
        name,
        email,
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        taxId,
        logo,
        fiscalYearStart,
        baseCurrency,
        isActive: true
      }
    });

    // Create default chart of accounts for the company
    await createDefaultAccounts(company.id);

    res.status(201).json(successResponse(company, 'Company created successfully'));
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json(errorResponse('Failed to create company', error));
  }
};

/**
 * Get company details
 * GET /api/v1/companies/:id
 */
const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check access rights
    if (req.user.role !== 'SUPERADMIN' && req.user.companyId !== id) {
      return res.status(403).json(
        errorResponse('You do not have permission to view this company')
      );
    }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            suppliers: true,
            products: true,
            invoices: true,
            bills: true,
            accounts: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    // Get additional statistics
    const stats = await getCompanyStatistics(id);
    company.statistics = stats;

    res.json(successResponse(company));
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json(errorResponse('Failed to fetch company details', error));
  }
};

/**
 * Update company details
 * PUT /api/v1/companies/:id
 */
const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;

    // Check access rights
    if (req.user.role !== 'SUPERADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json(
        errorResponse('You do not have permission to update company details')
      );
    }

    if (req.user.role === 'COMPANY_ADMIN' && req.user.companyId !== id) {
      return res.status(403).json(
        errorResponse('You can only update your own company')
      );
    }

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id }
    });

    if (!existingCompany) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    // Clean and validate update data
    const updateData = cleanObject({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      country: req.body.country,
      zipCode: req.body.zipCode,
      taxId: req.body.taxId,
      logo: req.body.logo,
      fiscalYearStart: req.body.fiscalYearStart,
      baseCurrency: req.body.baseCurrency
    });

    // Check for duplicate taxId if updating
    if (updateData.taxId && updateData.taxId !== existingCompany.taxId) {
      const duplicateTaxId = await prisma.company.findFirst({
        where: {
          taxId: updateData.taxId,
          id: { not: id }
        }
      });

      if (duplicateTaxId) {
        return res.status(409).json(
          errorResponse('Another company with this tax ID already exists')
        );
      }
    }

    // Update company
    const updatedCompany = await prisma.company.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(updatedCompany, 'Company updated successfully'));
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json(errorResponse('Failed to update company', error));
  }
};

/**
 * Soft delete company (SUPERADMIN only)
 * DELETE /api/v1/companies/:id
 */
const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if company exists
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            invoices: true,
            bills: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    // Check if company has active transactions
    if (company._count.invoices > 0 || company._count.bills > 0) {
      return res.status(400).json(
        errorResponse('Cannot delete company with existing transactions')
      );
    }

    // Soft delete (deactivate)
    const deletedCompany = await prisma.company.update({
      where: { id },
      data: { isActive: false }
    });

    // Deactivate all users
    await prisma.user.updateMany({
      where: { companyId: id },
      data: { isActive: false }
    });

    res.json(successResponse(deletedCompany, 'Company deactivated successfully'));
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json(errorResponse('Failed to delete company', error));
  }
};

/**
 * Update company settings
 * PATCH /api/v1/companies/:id/settings
 */
const updateCompanySettings = async (req, res) => {
  try {
    const { id } = req.params;

    // Check access rights
    if (req.user.role !== 'SUPERADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json(
        errorResponse('You do not have permission to update company settings')
      );
    }

    if (req.user.role === 'COMPANY_ADMIN' && req.user.companyId !== id) {
      return res.status(403).json(
        errorResponse('You can only update your own company settings')
      );
    }

    const settings = cleanObject({
      fiscalYearStart: req.body.fiscalYearStart,
      baseCurrency: req.body.baseCurrency,
      logo: req.body.logo
    });

    if (Object.keys(settings).length === 0) {
      return res.status(400).json(errorResponse('No settings to update'));
    }

    const updatedCompany = await prisma.company.update({
      where: { id },
      data: settings
    });

    res.json(successResponse(updatedCompany, 'Settings updated successfully'));
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json(errorResponse('Failed to update settings', error));
  }
};

/**
 * Get company statistics
 */
async function getCompanyStatistics(companyId) {
  try {
    const [
      totalRevenue,
      totalExpenses,
      outstandingReceivables,
      outstandingPayables,
      activeCustomers,
      activeSuppliers
    ] = await Promise.all([
      // Total revenue from paid invoices
      prisma.invoice.aggregate({
        where: {
          companyId,
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        }
      }),
      // Total expenses from paid bills
      prisma.bill.aggregate({
        where: {
          companyId,
          status: 'PAID'
        },
        _sum: {
          totalAmount: true
        }
      }),
      // Outstanding receivables
      prisma.invoice.aggregate({
        where: {
          companyId,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceDue: true
        }
      }),
      // Outstanding payables
      prisma.bill.aggregate({
        where: {
          companyId,
          status: { in: ['APPROVED', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        _sum: {
          balanceDue: true
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
      })
    ]);

    return {
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalExpenses: totalExpenses._sum.totalAmount || 0,
      netProfit: (totalRevenue._sum.totalAmount || 0) - (totalExpenses._sum.totalAmount || 0),
      outstandingReceivables: outstandingReceivables._sum.balanceDue || 0,
      outstandingPayables: outstandingPayables._sum.balanceDue || 0,
      activeCustomers,
      activeSuppliers
    };
  } catch (error) {
    console.error('Error calculating company statistics:', error);
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      outstandingReceivables: 0,
      outstandingPayables: 0,
      activeCustomers: 0,
      activeSuppliers: 0
    };
  }
}

/**
 * Create default chart of accounts for a new company
 */
async function createDefaultAccounts(companyId) {
  try {
    const defaultAccounts = [
      // Assets
      { accountCode: '1000', accountName: 'Cash', accountType: 'ASSET' },
      { accountCode: '1100', accountName: 'Bank Account', accountType: 'ASSET' },
      { accountCode: '1200', accountName: 'Accounts Receivable', accountType: 'ASSET' },
      { accountCode: '1300', accountName: 'Inventory', accountType: 'ASSET' },
      { accountCode: '1400', accountName: 'Prepaid Expenses', accountType: 'ASSET' },
      { accountCode: '1500', accountName: 'Fixed Assets', accountType: 'ASSET' },

      // Liabilities
      { accountCode: '2000', accountName: 'Accounts Payable', accountType: 'LIABILITY' },
      { accountCode: '2100', accountName: 'Credit Card', accountType: 'LIABILITY' },
      { accountCode: '2200', accountName: 'Sales Tax Payable', accountType: 'LIABILITY' },
      { accountCode: '2300', accountName: 'Loans Payable', accountType: 'LIABILITY' },

      // Equity
      { accountCode: '3000', accountName: 'Owner\'s Equity', accountType: 'EQUITY' },
      { accountCode: '3100', accountName: 'Retained Earnings', accountType: 'EQUITY' },
      { accountCode: '3200', accountName: 'Capital Stock', accountType: 'EQUITY' },

      // Revenue
      { accountCode: '4000', accountName: 'Sales Revenue', accountType: 'REVENUE' },
      { accountCode: '4100', accountName: 'Service Revenue', accountType: 'REVENUE' },
      { accountCode: '4200', accountName: 'Other Income', accountType: 'REVENUE' },

      // Expenses
      { accountCode: '5000', accountName: 'Cost of Goods Sold', accountType: 'EXPENSE' },
      { accountCode: '5100', accountName: 'Salaries and Wages', accountType: 'EXPENSE' },
      { accountCode: '5200', accountName: 'Rent Expense', accountType: 'EXPENSE' },
      { accountCode: '5300', accountName: 'Utilities', accountType: 'EXPENSE' },
      { accountCode: '5400', accountName: 'Office Supplies', accountType: 'EXPENSE' },
      { accountCode: '5500', accountName: 'Marketing and Advertising', accountType: 'EXPENSE' },
      { accountCode: '5600', accountName: 'Professional Fees', accountType: 'EXPENSE' },
      { accountCode: '5700', accountName: 'Insurance', accountType: 'EXPENSE' },
      { accountCode: '5800', accountName: 'Depreciation', accountType: 'EXPENSE' },
      { accountCode: '5900', accountName: 'Other Expenses', accountType: 'EXPENSE' }
    ];

    const accounts = defaultAccounts.map(account => ({
      id: uuidv4(),
      ...account,
      companyId,
      balance: 0,
      isActive: true
    }));

    await prisma.account.createMany({
      data: accounts,
      skipDuplicates: true
    });

    console.log(`Created ${accounts.length} default accounts for company ${companyId}`);
  } catch (error) {
    console.error('Error creating default accounts:', error);
  }
}

module.exports = {
  listCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  updateCompanySettings
};