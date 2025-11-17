const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get products by company
exports.getProductsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: {
          companyId,
          isActive: true
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where: { companyId, isActive: true } })
    ]);

    res.json(successResponse({
      products,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single product
exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            invoiceItems: true,
            billItems: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json(errorResponse('Product not found'));
    }

    res.json(successResponse(product));
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create product
exports.createProduct = async (req, res) => {
  try {
    const {
      productCode,
      name,
      description,
      category,
      unit,
      sellingPrice,
      purchasePrice,
      taxRate,
      currentStock,
      reorderLevel,
      companyId
    } = req.body;

    if (!name || !sellingPrice) {
      return res.status(400).json(errorResponse('Product name and selling price are required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate product code if not provided
    let finalProductCode = productCode;
    if (!finalProductCode) {
      const count = await prisma.product.count({ where: { companyId: finalCompanyId } });
      finalProductCode = generateCode('PROD', count + 1);
    }

    // Check if product code already exists
    const existing = await prisma.product.findFirst({
      where: {
        companyId: finalCompanyId,
        productCode: finalProductCode
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Product code already exists'));
    }

    const product = await prisma.product.create({
      data: {
        productCode: finalProductCode,
        name,
        description,
        category,
        unit: unit || 'pcs',
        sellingPrice: parseFloat(sellingPrice),
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        taxRate: taxRate ? parseFloat(taxRate) : 0,
        currentStock: currentStock ? parseFloat(currentStock) : 0,
        reorderLevel: reorderLevel ? parseFloat(reorderLevel) : null,
        companyId: finalCompanyId
      }
    });

    res.status(201).json(successResponse(product, 'Product created successfully'));
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.companyId;
    delete updateData.productCode;

    // Parse numeric fields
    if (updateData.sellingPrice !== undefined) {
      updateData.sellingPrice = parseFloat(updateData.sellingPrice);
    }
    if (updateData.purchasePrice !== undefined) {
      updateData.purchasePrice = parseFloat(updateData.purchasePrice);
    }
    if (updateData.taxRate !== undefined) {
      updateData.taxRate = parseFloat(updateData.taxRate);
    }
    if (updateData.currentStock !== undefined) {
      updateData.currentStock = parseFloat(updateData.currentStock);
    }
    if (updateData.reorderLevel !== undefined) {
      updateData.reorderLevel = parseFloat(updateData.reorderLevel);
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(product, 'Product updated successfully'));
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Product not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if product is used in invoices or bills
    const [invoiceItems, billItems] = await Promise.all([
      prisma.invoiceItem.count({ where: { productId: id } }),
      prisma.billItem.count({ where: { productId: id } })
    ]);

    if (invoiceItems > 0 || billItems > 0) {
      return res.status(400).json(errorResponse('Cannot delete product used in invoices or bills'));
    }

    await prisma.product.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Product deleted successfully'));
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Product not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};