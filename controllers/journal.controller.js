const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get journal entries by company
exports.getJournalEntriesByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [journalEntries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { companyId },
        skip,
        take,
        include: {
          lineItems: {
            include: {
              account: {
                select: { id: true, accountCode: true, accountName: true }
              }
            }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { entryDate: 'desc' }
      }),
      prisma.journalEntry.count({ where: { companyId } })
    ]);

    res.json(successResponse({
      journalEntries,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get journal entries error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single journal entry
exports.getJournalEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lineItems: {
          include: {
            account: true
          }
        },
        company: {
          select: { id: true, name: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!journalEntry) {
      return res.status(404).json(errorResponse('Journal entry not found'));
    }

    res.json(successResponse(journalEntry));
  } catch (error) {
    console.error('Get journal entry error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create journal entry
exports.createJournalEntry = async (req, res) => {
  try {
    const {
      journalNumber,
      entryDate,
      description,
      lineItems,
      status,
      companyId
    } = req.body;

    if (!description || !lineItems || lineItems.length === 0) {
      return res.status(400).json(errorResponse('Description and line items are required'));
    }

    // Validate that debits equal credits
    let totalDebit = 0;
    let totalCredit = 0;

    lineItems.forEach(item => {
      totalDebit += parseFloat(item.debitAmount || 0);
      totalCredit += parseFloat(item.creditAmount || 0);
    });

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json(errorResponse('Total debits must equal total credits'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate journal number if not provided
    let finalJournalNumber = journalNumber;
    if (!finalJournalNumber) {
      const count = await prisma.journalEntry.count({ where: { companyId: finalCompanyId } });
      finalJournalNumber = generateCode('JE', count + 1);
    }

    // Check if journal number already exists
    const existing = await prisma.journalEntry.findFirst({
      where: {
        companyId: finalCompanyId,
        journalNumber: finalJournalNumber
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Journal number already exists'));
    }

    // Create journal entry with line items
    const journalEntry = await prisma.journalEntry.create({
      data: {
        journalNumber: finalJournalNumber,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        description,
        totalDebit,
        totalCredit,
        status: status || 'DRAFT',
        companyId: finalCompanyId,
        createdById: req.user.userId,
        lineItems: {
          create: lineItems.map(item => ({
            accountId: item.accountId,
            description: item.description,
            debitAmount: parseFloat(item.debitAmount || 0),
            creditAmount: parseFloat(item.creditAmount || 0)
          }))
        }
      },
      include: {
        lineItems: {
          include: {
            account: true
          }
        }
      }
    });

    // If status is POSTED, update account balances
    if (status === 'POSTED') {
      for (const item of lineItems) {
        const debit = parseFloat(item.debitAmount || 0);
        const credit = parseFloat(item.creditAmount || 0);
        const netChange = debit - credit;

        await prisma.account.update({
          where: { id: item.accountId },
          data: {
            balance: {
              increment: netChange
            }
          }
        });
      }
    }

    res.status(201).json(successResponse(journalEntry, 'Journal entry created successfully'));
  } catch (error) {
    console.error('Create journal entry error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update journal entry
exports.updateJournalEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      entryDate,
      description,
      lineItems,
      status
    } = req.body;

    // Get existing journal entry
    const existingEntry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lineItems: true }
    });

    if (!existingEntry) {
      return res.status(404).json(errorResponse('Journal entry not found'));
    }

    // Don't allow updating if posted
    if (existingEntry.status === 'POSTED') {
      return res.status(400).json(errorResponse('Cannot update a posted journal entry'));
    }

    let updateData = {
      entryDate: entryDate ? new Date(entryDate) : undefined,
      description,
      status
    };

    // If line items are provided, recalculate totals
    if (lineItems && lineItems.length > 0) {
      let totalDebit = 0;
      let totalCredit = 0;

      lineItems.forEach(item => {
        totalDebit += parseFloat(item.debitAmount || 0);
        totalCredit += parseFloat(item.creditAmount || 0);
      });

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json(errorResponse('Total debits must equal total credits'));
      }

      updateData.totalDebit = totalDebit;
      updateData.totalCredit = totalCredit;

      // Delete existing line items and create new ones
      await prisma.journalLineItem.deleteMany({
        where: { journalEntryId: id }
      });

      await prisma.journalLineItem.createMany({
        data: lineItems.map(item => ({
          journalEntryId: id,
          accountId: item.accountId,
          description: item.description,
          debitAmount: parseFloat(item.debitAmount || 0),
          creditAmount: parseFloat(item.creditAmount || 0)
        }))
      });

      // If posting, update account balances
      if (status === 'POSTED') {
        for (const item of lineItems) {
          const debit = parseFloat(item.debitAmount || 0);
          const credit = parseFloat(item.creditAmount || 0);
          const netChange = debit - credit;

          await prisma.account.update({
            where: { id: item.accountId },
            data: {
              balance: {
                increment: netChange
              }
            }
          });
        }
      }
    }

    const journalEntry = await prisma.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        lineItems: {
          include: {
            account: true
          }
        }
      }
    });

    res.json(successResponse(journalEntry, 'Journal entry updated successfully'));
  } catch (error) {
    console.error('Update journal entry error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete journal entry
exports.deleteJournalEntry = async (req, res) => {
  try {
    const { id } = req.params;

    // Get journal entry details
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lineItems: true }
    });

    if (!journalEntry) {
      return res.status(404).json(errorResponse('Journal entry not found'));
    }

    // Don't allow deleting if posted
    if (journalEntry.status === 'POSTED') {
      return res.status(400).json(errorResponse('Cannot delete a posted journal entry. Cancel it first.'));
    }

    // Delete journal entry (line items will cascade delete)
    await prisma.journalEntry.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Journal entry deleted successfully'));
  } catch (error) {
    console.error('Delete journal entry error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};