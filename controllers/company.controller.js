const prisma = require('../config/database');
const { successResponse, errorResponse, getPaginationParams } = require('../utils/helpers');

// Get all companies
exports.getCompanies = async (req, res) => {
  try {
    const { skip, take } = getPaginationParams(req.query);

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        skip,
        take,
        include: {
          _count: {
            select: { users: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.company.count()
    ]);

    res.json(successResponse({
      companies,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single company
exports.getCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            customers: true,
            suppliers: true,
            products: true,
            invoices: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    res.json(successResponse(company));
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create company
exports.createCompany = async (req, res) => {
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
      fiscalYearStart,
      baseCurrency
    } = req.body;

    if (!name) {
      return res.status(400).json(errorResponse('Company name is required'));
    }

    const company = await prisma.company.create({
      data: {
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
        fiscalYearStart: fiscalYearStart || 1,
        baseCurrency: baseCurrency || 'USD'
      }
    });

    res.status(201).json(successResponse(company, 'Company created successfully'));
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update company
exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id; // Remove id from update data

    const company = await prisma.company.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(company, 'Company updated successfully'));
  } catch (error) {
    console.error('Update company error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Company not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete company
exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if company has related records
    const counts = await prisma.company.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            users: true,
            invoices: true,
            bills: true
          }
        }
      }
    });

    if (!counts) {
      return res.status(404).json(errorResponse('Company not found'));
    }

    if (counts._count.users > 0 || counts._count.invoices > 0 || counts._count.bills > 0) {
      return res.status(400).json(errorResponse('Cannot delete company with existing records'));
    }

    await prisma.company.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Company deleted successfully'));
  } catch (error) {
    console.error('Delete company error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Company not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};