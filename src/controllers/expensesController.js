const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  cleanObject
} = require('../utils/helpers');

const prisma = new PrismaClient();

const listExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, startDate, endDate } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (category) where.category = category;

    if (startDate && endDate) {
      where.expenseDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { expenseDate: 'desc' }
      }),
      prisma.expense.count({ where })
    ]);

    res.json(paginatedResponse(expenses, total, page, limit));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expenses', error));
  }
};

const createExpense = async (req, res) => {
  try {
    const { amount, category, description, expenseDate = new Date(), paymentMethod } = req.body;

    if (!amount || !category) {
      return res.status(400).json(errorResponse('Amount and category are required'));
    }

    const expense = await prisma.expense.create({
      data: {
        id: uuidv4(),
        amount,
        category,
        description,
        expenseDate: new Date(expenseDate),
        paymentMethod,
        companyId: req.user.companyId,
        createdById: req.user.id
      }
    });

    res.status(201).json(successResponse(expense, 'Expense created successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to create expense', error));
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId }
    });

    if (!expense) {
      return res.status(404).json(errorResponse('Expense not found'));
    }

    res.json(successResponse(expense));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expense', error));
  }
};

const updateExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: cleanObject(req.body)
    });

    res.json(successResponse(expense, 'Expense updated successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to update expense', error));
  }
};

const deleteExpense = async (req, res) => {
  try {
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, 'Expense deleted successfully'));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to delete expense', error));
  }
};

const getExpenseCategories = async (req, res) => {
  try {
    const categories = await prisma.expense.groupBy({
      by: ['category'],
      where: { companyId: req.user.companyId },
      _count: true
    });

    res.json(successResponse(categories));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch categories', error));
  }
};

const getExpenseSummary = async (req, res) => {
  try {
    const summary = await prisma.expense.groupBy({
      by: ['category'],
      where: { companyId: req.user.companyId },
      _sum: { amount: true }
    });

    res.json(successResponse(summary));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch expense summary', error));
  }
};

module.exports = {
  listExpenses,
  createExpense,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenseSummary
};
