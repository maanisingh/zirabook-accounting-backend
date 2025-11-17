const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get customers by company
exports.getCustomersByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: {
          companyId,
          isActive: true
        },
        skip,
        take,
        include: {
          _count: {
            select: { invoices: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customer.count({ where: { companyId, isActive: true } })
    ]);

    res.json(successResponse({
      customers,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single customer
exports.getCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            status: true
          },
          orderBy: { invoiceDate: 'desc' },
          take: 10
        },
        _count: {
          select: { invoices: true }
        }
      }
    });

    if (!customer) {
      return res.status(404).json(errorResponse('Customer not found'));
    }

    res.json(successResponse(customer));
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create customer
exports.createCustomer = async (req, res) => {
  try {
    const {
      customerCode,
      name,
      email,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      taxId,
      creditLimit,
      creditPeriodDays,
      companyId
    } = req.body;

    if (!name) {
      return res.status(400).json(errorResponse('Customer name is required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate customer code if not provided
    let finalCustomerCode = customerCode;
    if (!finalCustomerCode) {
      const count = await prisma.customer.count({ where: { companyId: finalCompanyId } });
      finalCustomerCode = generateCode('CUST', count + 1);
    }

    // Check if customer code already exists
    const existing = await prisma.customer.findFirst({
      where: {
        companyId: finalCompanyId,
        customerCode: finalCustomerCode
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Customer code already exists'));
    }

    const customer = await prisma.customer.create({
      data: {
        customerCode: finalCustomerCode,
        name,
        email,
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        taxId,
        creditLimit: creditLimit || 0,
        creditPeriodDays: creditPeriodDays || 30,
        balance: 0,
        companyId: finalCompanyId
      }
    });

    res.status(201).json(successResponse(customer, 'Customer created successfully'));
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update customer
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.companyId;
    delete updateData.customerCode;

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(customer, 'Customer updated successfully'));
  } catch (error) {
    console.error('Update customer error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Customer not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer has invoices
    const invoices = await prisma.invoice.count({
      where: { customerId: id }
    });

    if (invoices > 0) {
      return res.status(400).json(errorResponse('Cannot delete customer with existing invoices'));
    }

    await prisma.customer.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Customer deleted successfully'));
  } catch (error) {
    console.error('Delete customer error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Customer not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};