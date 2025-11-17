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

// List products with pagination and filters
const listProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, lowStock } = req.query;
    const { skip, take } = paginate(page, limit);

    const companyId = req.user.companyId;
    const where = { companyId };

    if (search) {
      const searchTerm = sanitizeSearchQuery(search);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { sku: { contains: searchTerm, mode: 'insensitive' } },
        { barcode: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (category) where.category = category;
    if (lowStock === 'true') {
      where.currentStock = { lte: prisma.product.fields.reorderLevel };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, skip, take, orderBy: { name: 'asc' } }),
      prisma.product.count({ where })
    ]);

    res.json(paginatedResponse(products, total, page, limit));
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json(errorResponse('Failed to fetch products', error));
  }
};

// Create product
const createProduct = async (req, res) => {
  try {
    const data = req.body;
    if (!data.name) {
      return res.status(400).json(errorResponse('Product name is required'));
    }

    const companyId = req.user.companyId;

    // Generate product code if not provided
    let productCode = data.productCode;
    if (!productCode) {
      const productCount = await prisma.product.count({ where: { companyId } });
      productCode = `PROD-${String(productCount + 1).padStart(5, '0')}`;
    }

    // Extract valid product fields only
    const {
      name,
      description,
      category,
      unit,
      sellingPrice,
      purchasePrice,
      taxRate,
      reorderLevel
    } = data;

    const product = await prisma.product.create({
      data: {
        id: uuidv4(),
        productCode,
        name,
        description,
        category,
        unit: unit || 'pcs',
        sellingPrice,
        purchasePrice,
        taxRate: taxRate || 0,
        reorderLevel,
        companyId,
        currentStock: data.openingStock || data.currentStock || 0,
        isActive: true
      }
    });

    res.status(201).json(successResponse(product, 'Product created successfully'));
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json(errorResponse('Failed to create product', error));
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        supplier: true,
        _count: { select: { invoiceItems: true, billItems: true } }
      }
    });

    if (!product) {
      return res.status(404).json(errorResponse('Product not found'));
    }

    res.json(successResponse(product));
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json(errorResponse('Failed to fetch product', error));
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: cleanObject(req.body)
    });

    res.json(successResponse(product, 'Product updated successfully'));
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json(errorResponse('Failed to update product', error));
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    res.json(successResponse(null, 'Product deleted successfully'));
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json(errorResponse('Failed to delete product', error));
  }
};

// Update stock
const updateStock = async (req, res) => {
  try {
    const { quantity, type, reason } = req.body;
    const productId = req.params.id;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json(errorResponse('Product not found'));
    }

    const newStock = type === 'add'
      ? product.currentStock + quantity
      : product.currentStock - quantity;

    if (newStock < 0) {
      return res.status(400).json(errorResponse('Insufficient stock'));
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { currentStock: newStock }
    });

    res.json(successResponse(updatedProduct, 'Stock updated successfully'));
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json(errorResponse('Failed to update stock', error));
  }
};

// Get low stock products
const getLowStockProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        companyId: req.user.companyId,
        currentStock: { lte: prisma.product.fields.reorderLevel }
      }
    });

    res.json(successResponse(products));
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json(errorResponse('Failed to fetch low stock products', error));
  }
};

// Stock adjustment
const adjustStock = async (req, res) => {
  try {
    const { adjustmentType, quantity, reason, notes } = req.body;
    const productId = req.params.id;

    const product = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({ where: { id: productId } });
      if (!current) throw new Error('Product not found');

      const newStock = adjustmentType === 'increase'
        ? current.currentStock + quantity
        : current.currentStock - quantity;

      if (newStock < 0) throw new Error('Stock cannot be negative');

      // Update product stock
      const updated = await tx.product.update({
        where: { id: productId },
        data: { currentStock: newStock }
      });

      // Create stock adjustment record (if you have a StockAdjustment model)
      // await tx.stockAdjustment.create({...});

      return updated;
    });

    res.json(successResponse(product, 'Stock adjusted successfully'));
  } catch (error) {
    console.error('Adjust stock error:', error);
    res.status(500).json(errorResponse('Failed to adjust stock', error));
  }
};

module.exports = {
  listProducts,
  createProduct,
  getProductById,
  updateProduct,
  deleteProduct,
  updateStock,
  getLowStockProducts,
  adjustStock
};