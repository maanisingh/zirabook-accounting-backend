const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get suppliers by company
exports.getSuppliersByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where: {
          companyId,
          isActive: true
        },
        skip,
        take,
        include: {
          _count: {
            select: { bills: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.supplier.count({ where: { companyId, isActive: true } })
    ]);

    res.json(successResponse({
      suppliers,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single supplier
exports.getSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        bills: {
          select: {
            id: true,
            billNumber: true,
            billDate: true,
            totalAmount: true,
            status: true
          },
          orderBy: { billDate: 'desc' },
          take: 10
        },
        _count: {
          select: { bills: true }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json(errorResponse('Supplier not found'));
    }

    res.json(successResponse(supplier));
  } catch (error) {
    console.error('Get supplier error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create supplier
exports.createSupplier = async (req, res) => {
  try {
    const {
      supplierCode,
      name,
      email,
      phone,
      address,
      city,
      state,
      country,
      zipCode,
      taxId,
      creditPeriodDays,
      companyId
    } = req.body;

    if (!name) {
      return res.status(400).json(errorResponse('Supplier name is required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate supplier code if not provided
    let finalSupplierCode = supplierCode;
    if (!finalSupplierCode) {
      const count = await prisma.supplier.count({ where: { companyId: finalCompanyId } });
      finalSupplierCode = generateCode('SUPP', count + 1);
    }

    // Check if supplier code already exists
    const existing = await prisma.supplier.findFirst({
      where: {
        companyId: finalCompanyId,
        supplierCode: finalSupplierCode
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Supplier code already exists'));
    }

    const supplier = await prisma.supplier.create({
      data: {
        supplierCode: finalSupplierCode,
        name,
        email,
        phone,
        address,
        city,
        state,
        country,
        zipCode,
        taxId,
        creditPeriodDays: creditPeriodDays || 30,
        balance: 0,
        companyId: finalCompanyId
      }
    });

    res.status(201).json(successResponse(supplier, 'Supplier created successfully'));
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update supplier
exports.updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.companyId;
    delete updateData.supplierCode;

    const supplier = await prisma.supplier.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(supplier, 'Supplier updated successfully'));
  } catch (error) {
    console.error('Update supplier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Supplier not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete supplier
exports.deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if supplier has bills
    const bills = await prisma.bill.count({
      where: { supplierId: id }
    });

    if (bills > 0) {
      return res.status(400).json(errorResponse('Cannot delete supplier with existing bills'));
    }

    await prisma.supplier.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Supplier deleted successfully'));
  } catch (error) {
    console.error('Delete supplier error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Supplier not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};