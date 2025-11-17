const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const {
  successResponse,
  errorResponse,
  paginate,
  paginatedResponse,
  generateInvoiceNumber
} = require('../utils/helpers');

const prisma = new PrismaClient();

/**
 * List journal entries
 * GET /api/v1/journal-entries
 */
const listJournalEntries = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, startDate, endDate } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (status) where.status = status;
    if (type) where.type = type;

    if (startDate && endDate) {
      where.entryDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip,
        take,
        orderBy: { entryDate: 'desc' },
        include: {
          lineItems: {
            include: { account: true }
          },
          createdBy: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      prisma.journalEntry.count({ where })
    ]);

    res.json(paginatedResponse(entries, total, page, limit));
  } catch (error) {
    console.error('List journal entries error:', error);
    res.status(500).json(errorResponse('Failed to fetch journal entries', error));
  }
};

/**
 * Create manual journal entry
 * POST /api/v1/journal-entries
 */
const createJournalEntry = async (req, res) => {
  try {
    const {
      entryDate = new Date(),
      description,
      reference,
      type = 'MANUAL',
      lineItems = []
    } = req.body;

    // Validate line items
    if (lineItems.length < 2) {
      return res.status(400).json(errorResponse('At least 2 line items are required'));
    }

    // Validate debits equal credits
    const totalDebits = lineItems.reduce((sum, item) => sum + (item.debit || 0), 0);
    const totalCredits = lineItems.reduce((sum, item) => sum + (item.credit || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json(
        errorResponse(`Debits (${totalDebits}) must equal credits (${totalCredits})`)
      );
    }

    // Validate all accounts exist
    const accountIds = lineItems.map(item => item.accountId);
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: accountIds },
        companyId: req.user.companyId
      }
    });

    if (accounts.length !== accountIds.length) {
      return res.status(400).json(errorResponse('Invalid account IDs provided'));
    }

    // Create journal entry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        id: uuidv4(),
        entryNumber: generateInvoiceNumber('JE'),
        entryDate: new Date(entryDate),
        description,
        reference,
        type,
        status: 'DRAFT',
        companyId: req.user.companyId,
        createdById: req.user.id,
        lineItems: {
          create: lineItems.map(item => ({
            id: uuidv4(),
            accountId: item.accountId,
            debit: item.debit || 0,
            credit: item.credit || 0,
            description: item.description
          }))
        }
      },
      include: {
        lineItems: {
          include: { account: true }
        }
      }
    });

    res.status(201).json(successResponse(journalEntry, 'Journal entry created successfully'));
  } catch (error) {
    console.error('Create journal entry error:', error);
    res.status(500).json(errorResponse('Failed to create journal entry', error));
  }
};

/**
 * Get journal entry details
 * GET /api/v1/journal-entries/:id
 */
const getJournalEntryById = async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      },
      include: {
        lineItems: {
          include: { account: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!entry) {
      return res.status(404).json(errorResponse('Journal entry not found'));
    }

    res.json(successResponse(entry));
  } catch (error) {
    console.error('Get journal entry error:', error);
    res.status(500).json(errorResponse('Failed to fetch journal entry', error));
  }
};

/**
 * Delete draft journal entry
 * DELETE /api/v1/journal-entries/:id
 */
const deleteJournalEntry = async (req, res) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user.companyId
      }
    });

    if (!entry) {
      return res.status(404).json(errorResponse('Journal entry not found'));
    }

    if (entry.status === 'POSTED') {
      return res.status(400).json(errorResponse('Cannot delete posted journal entries'));
    }

    await prisma.journalEntry.delete({
      where: { id: req.params.id }
    });

    res.json(successResponse(null, 'Journal entry deleted successfully'));
  } catch (error) {
    console.error('Delete journal entry error:', error);
    res.status(500).json(errorResponse('Failed to delete journal entry', error));
  }
};

/**
 * Post journal entry (finalize)
 * PATCH /api/v1/journal-entries/:id/post
 */
const postJournalEntry = async (req, res) => {
  try {
    const entryId = req.params.id;

    const entry = await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.journalEntry.findFirst({
        where: {
          id: entryId,
          companyId: req.user.companyId
        },
        include: { lineItems: true }
      });

      if (!existingEntry) {
        throw new Error('Journal entry not found');
      }

      if (existingEntry.status === 'POSTED') {
        throw new Error('Journal entry is already posted');
      }

      // Validate debits equal credits
      const totalDebits = existingEntry.lineItems.reduce((sum, item) => sum + item.debit, 0);
      const totalCredits = existingEntry.lineItems.reduce((sum, item) => sum + item.credit, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error('Debits must equal credits before posting');
      }

      // Update journal entry status
      const postedEntry = await tx.journalEntry.update({
        where: { id: entryId },
        data: {
          status: 'POSTED',
          postedDate: new Date()
        }
      });

      // Update account balances
      for (const lineItem of existingEntry.lineItems) {
        const account = await tx.account.findUnique({
          where: { id: lineItem.accountId }
        });

        let balanceChange = 0;

        // Calculate balance change based on account type
        if (['ASSET', 'EXPENSE'].includes(account.accountType)) {
          // Debits increase, credits decrease
          balanceChange = lineItem.debit - lineItem.credit;
        } else {
          // Credits increase, debits decrease
          balanceChange = lineItem.credit - lineItem.debit;
        }

        await tx.account.update({
          where: { id: lineItem.accountId },
          data: {
            balance: {
              increment: balanceChange
            }
          }
        });
      }

      return postedEntry;
    });

    res.json(successResponse(entry, 'Journal entry posted successfully'));
  } catch (error) {
    console.error('Post journal entry error:', error);
    res.status(500).json(errorResponse(error.message || 'Failed to post journal entry', error));
  }
};

module.exports = {
  listJournalEntries,
  createJournalEntry,
  getJournalEntryById,
  deleteJournalEntry,
  postJournalEntry
};