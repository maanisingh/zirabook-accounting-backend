const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get expenses by company
exports.getExpensesByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where: { companyId },
        skip,
        take,
        orderBy: { expenseDate: 'desc' }
      }),
      prisma.expense.count({ where: { companyId } })
    ]);

    res.json(successResponse({
      expenses,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single expense
exports.getExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id }
    });

    if (!expense) {
      return res.status(404).json(errorResponse('Expense not found'));
    }

    res.json(successResponse(expense));
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create expense
exports.createExpense = async (req, res) => {
  try {
    const {
      expenseNumber,
      expenseDate,
      category,
      amount,
      taxAmount,
      paymentMethod,
      description,
      receipt,
      companyId
    } = req.body;

    if (!category || !amount || !paymentMethod) {
      return res.status(400).json(errorResponse('Category, amount, and payment method are required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate expense number if not provided
    let finalExpenseNumber = expenseNumber;
    if (!finalExpenseNumber) {
      const count = await prisma.expense.count({ where: { companyId: finalCompanyId } });
      finalExpenseNumber = generateCode('EXP', count + 1);
    }

    // Check if expense number already exists
    const existing = await prisma.expense.findFirst({
      where: {
        companyId: finalCompanyId,
        expenseNumber: finalExpenseNumber
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Expense number already exists'));
    }

    const expenseAmount = parseFloat(amount);
    const tax = parseFloat(taxAmount || 0);
    const total = expenseAmount + tax;

    const expense = await prisma.expense.create({
      data: {
        expenseNumber: finalExpenseNumber,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        category,
        amount: expenseAmount,
        taxAmount: tax,
        totalAmount: total,
        paymentMethod,
        description,
        receipt,
        companyId: finalCompanyId
      }
    });

    res.status(201).json(successResponse(expense, 'Expense created successfully'));
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.companyId;
    delete updateData.expenseNumber;

    // Recalculate total if amount or tax changed
    if (updateData.amount !== undefined || updateData.taxAmount !== undefined) {
      const existing = await prisma.expense.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json(errorResponse('Expense not found'));
      }

      const amount = parseFloat(updateData.amount !== undefined ? updateData.amount : existing.amount);
      const tax = parseFloat(updateData.taxAmount !== undefined ? updateData.taxAmount : existing.taxAmount);
      updateData.amount = amount;
      updateData.taxAmount = tax;
      updateData.totalAmount = amount + tax;
    }

    if (updateData.expenseDate) {
      updateData.expenseDate = new Date(updateData.expenseDate);
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData
    });

    res.json(successResponse(expense, 'Expense updated successfully'));
  } catch (error) {
    console.error('Update expense error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Expense not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.expense.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Expense deleted successfully'));
  } catch (error) {
    console.error('Delete expense error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Expense not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};