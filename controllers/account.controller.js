const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode } = require('../utils/helpers');

// Get accounts by company
exports.getAccountsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const accounts = await prisma.account.findMany({
      where: {
        companyId,
        isActive: true
      },
      include: {
        parent: {
          select: { id: true, accountName: true, accountCode: true }
        },
        children: {
          select: { id: true, accountName: true, accountCode: true, balance: true }
        }
      },
      orderBy: { accountCode: 'asc' }
    });

    res.json(successResponse(accounts));
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create account
exports.createAccount = async (req, res) => {
  try {
    const {
      accountCode,
      accountName,
      accountType,
      parentId,
      description,
      companyId
    } = req.body;

    if (!accountName || !accountType) {
      return res.status(400).json(errorResponse('Account name and type are required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate account code if not provided
    let finalAccountCode = accountCode;
    if (!finalAccountCode) {
      const count = await prisma.account.count({ where: { companyId: finalCompanyId } });
      finalAccountCode = generateCode('ACC', count + 1);
    }

    // Check if account code already exists
    const existing = await prisma.account.findFirst({
      where: {
        companyId: finalCompanyId,
        accountCode: finalAccountCode
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Account code already exists'));
    }

    const account = await prisma.account.create({
      data: {
        accountCode: finalAccountCode,
        accountName,
        accountType,
        parentId,
        description,
        companyId: finalCompanyId,
        balance: 0
      }
    });

    res.status(201).json(successResponse(account, 'Account created successfully'));
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update account
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.companyId; // Prevent changing company
    delete updateData.accountCode; // Prevent changing code

    const account = await prisma.account.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(account, 'Account updated successfully'));
  } catch (error) {
    console.error('Update account error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Account not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if account has transactions
    const journalItems = await prisma.journalLineItem.count({
      where: { accountId: id }
    });

    if (journalItems > 0) {
      return res.status(400).json(errorResponse('Cannot delete account with existing transactions'));
    }

    // Check if account has children
    const children = await prisma.account.count({
      where: { parentId: id }
    });

    if (children > 0) {
      return res.status(400).json(errorResponse('Cannot delete account with sub-accounts'));
    }

    await prisma.account.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Account deleted successfully'));
  } catch (error) {
    console.error('Delete account error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Account not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};