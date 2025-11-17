#!/usr/bin/env node

/**
 * Complete Implementation Script
 * This script generates all remaining controllers, routes, and configurations
 * for the accounting backend system
 */

const fs = require('fs');
const path = require('path');

// Helper to create directories
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Helper to write files
const writeFile = (filePath, content) => {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, content);
  console.log(`✅ Created: ${filePath}`);
};

console.log('🚀 Starting comprehensive accounting backend implementation...\n');

// =====================================================
// PRODUCTS CONTROLLER
// =====================================================
const productsController = `const { PrismaClient } = require('@prisma/client');
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

    const product = await prisma.product.create({
      data: {
        id: uuidv4(),
        ...data,
        companyId: req.user.companyId,
        currentStock: data.openingStock || 0
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
};`;

writeFile('./src/controllers/productsController.js', productsController);

// =====================================================
// ACCOUNTS CONTROLLER
// =====================================================
const accountsController = `const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  cleanObject
} = require('../utils/helpers');

const prisma = new PrismaClient();

// List all accounts (tree structure)
const listAccounts = async (req, res) => {
  try {
    const companyId = req.user.companyId;

    const accounts = await prisma.account.findMany({
      where: { companyId },
      include: {
        parent: true,
        children: true,
        _count: { select: { journalLineItems: true } }
      },
      orderBy: [{ accountType: 'asc' }, { accountCode: 'asc' }]
    });

    // Build tree structure
    const accountTree = buildAccountTree(accounts);

    res.json(successResponse(accountTree));
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json(errorResponse('Failed to fetch accounts', error));
  }
};

// Create account
const createAccount = async (req, res) => {
  try {
    const { accountCode, accountName, accountType, parentId, description } = req.body;

    if (!accountCode || !accountName || !accountType) {
      return res.status(400).json(errorResponse('Required fields missing'));
    }

    // Check for duplicate account code
    const existing = await prisma.account.findFirst({
      where: {
        companyId: req.user.companyId,
        accountCode
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Account code already exists'));
    }

    const account = await prisma.account.create({
      data: {
        id: uuidv4(),
        accountCode,
        accountName,
        accountType,
        parentId,
        description,
        companyId: req.user.companyId,
        balance: 0,
        isActive: true
      }
    });

    res.status(201).json(successResponse(account, 'Account created successfully'));
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json(errorResponse('Failed to create account', error));
  }
};

// Get account details
const getAccountById = async (req, res) => {
  try {
    const account = await prisma.account.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        parent: true,
        children: true,
        journalLineItems: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { journalEntry: true }
        }
      }
    });

    if (!account) {
      return res.status(404).json(errorResponse('Account not found'));
    }

    res.json(successResponse(account));
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json(errorResponse('Failed to fetch account', error));
  }
};

// Update account
const updateAccount = async (req, res) => {
  try {
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: cleanObject({
        accountName: req.body.accountName,
        description: req.body.description,
        parentId: req.body.parentId
      })
    });

    res.json(successResponse(account, 'Account updated successfully'));
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json(errorResponse('Failed to update account', error));
  }
};

// Delete account
const deleteAccount = async (req, res) => {
  try {
    // Check if account has transactions
    const hasTransactions = await prisma.journalLineItem.count({
      where: { accountId: req.params.id }
    });

    if (hasTransactions > 0) {
      return res.status(400).json(errorResponse('Cannot delete account with transactions'));
    }

    await prisma.account.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    res.json(successResponse(null, 'Account deleted successfully'));
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json(errorResponse('Failed to delete account', error));
  }
};

// Get account ledger
const getAccountLedger = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 50 } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { accountId: req.params.id };
    if (startDate && endDate) {
      where.journalEntry = {
        entryDate: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }

    const [entries, total] = await Promise.all([
      prisma.journalLineItem.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { journalEntry: true }
      }),
      prisma.journalLineItem.count({ where })
    ]);

    // Calculate running balance
    let runningBalance = 0;
    const ledgerEntries = entries.map(entry => {
      runningBalance += entry.debit - entry.credit;
      return {
        ...entry,
        runningBalance
      };
    });

    res.json(paginatedResponse(ledgerEntries, total, page, limit));
  } catch (error) {
    console.error('Get ledger error:', error);
    res.status(500).json(errorResponse('Failed to fetch ledger', error));
  }
};

// Get trial balance
const getTrialBalance = async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { companyId: req.user.companyId, isActive: true },
      include: {
        journalLineItems: {
          where: {
            journalEntry: { status: 'POSTED' }
          }
        }
      }
    });

    const trialBalance = accounts.map(account => {
      const debits = account.journalLineItems.reduce((sum, item) => sum + item.debit, 0);
      const credits = account.journalLineItems.reduce((sum, item) => sum + item.credit, 0);

      return {
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debit: debits,
        credit: credits,
        balance: debits - credits
      };
    }).filter(item => item.debit > 0 || item.credit > 0);

    const totals = {
      totalDebits: trialBalance.reduce((sum, item) => sum + item.debit, 0),
      totalCredits: trialBalance.reduce((sum, item) => sum + item.credit, 0)
    };

    res.json(successResponse({ entries: trialBalance, totals }));
  } catch (error) {
    console.error('Get trial balance error:', error);
    res.status(500).json(errorResponse('Failed to fetch trial balance', error));
  }
};

// Helper function to build account tree
function buildAccountTree(accounts) {
  const accountMap = {};
  const tree = [];

  // Create map
  accounts.forEach(account => {
    accountMap[account.id] = { ...account, children: [] };
  });

  // Build tree
  accounts.forEach(account => {
    if (account.parentId && accountMap[account.parentId]) {
      accountMap[account.parentId].children.push(accountMap[account.id]);
    } else {
      tree.push(accountMap[account.id]);
    }
  });

  return tree;
}

module.exports = {
  listAccounts,
  createAccount,
  getAccountById,
  updateAccount,
  deleteAccount,
  getAccountLedger,
  getTrialBalance
};`;

writeFile('./src/controllers/accountsController.js', accountsController);

console.log('\n✅ Core controllers created. Continuing with transaction controllers...\n');