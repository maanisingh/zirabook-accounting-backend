const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, calculateTotals, getPaginationParams } = require('../utils/helpers');

// Get bills by company
exports.getBillsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where: { companyId },
        skip,
        take,
        include: {
          supplier: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { billDate: 'desc' }
      }),
      prisma.bill.count({ where: { companyId } })
    ]);

    res.json(successResponse({
      bills,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get bills error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single bill
exports.getBill = async (req, res) => {
  try {
    const { id } = req.params;

    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        supplier: true,
        company: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            country: true,
            phone: true,
            email: true,
            taxId: true
          }
        },
        items: {
          include: {
            product: true
          }
        },
        payments: true
      }
    });

    if (!bill) {
      return res.status(404).json(errorResponse('Bill not found'));
    }

    res.json(successResponse(bill));
  } catch (error) {
    console.error('Get bill error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create bill
exports.createBill = async (req, res) => {
  try {
    const {
      billNumber,
      supplierId,
      billDate,
      dueDate,
      items,
      discountAmount,
      notes,
      status,
      companyId
    } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json(errorResponse('Supplier and bill items are required'));
    }

    const finalCompanyId = companyId || req.user.companyId;

    // Generate bill number if not provided
    let finalBillNumber = billNumber;
    if (!finalBillNumber) {
      const count = await prisma.bill.count({ where: { companyId: finalCompanyId } });
      const year = new Date().getFullYear();
      finalBillNumber = `BILL-${year}-${String(count + 1).padStart(6, '0')}`;
    }

    // Check if bill number already exists
    const existing = await prisma.bill.findFirst({
      where: {
        companyId: finalCompanyId,
        billNumber: finalBillNumber
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Bill number already exists'));
    }

    // Calculate totals
    const totals = calculateTotals(items);
    const finalDiscountAmount = discountAmount || 0;
    const finalTotalAmount = totals.totalAmount - finalDiscountAmount;

    // Create bill with items
    const bill = await prisma.bill.create({
      data: {
        billNumber: finalBillNumber,
        supplierId,
        billDate: billDate ? new Date(billDate) : new Date(),
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: status || 'DRAFT',
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        paidAmount: 0,
        balanceAmount: finalTotalAmount,
        notes,
        companyId: finalCompanyId,
        items: {
          create: items.map(item => ({
            productId: item.productId || null,
            description: item.description,
            quantity: parseFloat(item.quantity),
            unitPrice: parseFloat(item.unitPrice),
            taxRate: parseFloat(item.taxRate || 0),
            taxAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100),
            discountAmount: parseFloat(item.discountAmount || 0),
            totalAmount: (parseFloat(item.quantity) * parseFloat(item.unitPrice)) +
                        (parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100)) -
                        parseFloat(item.discountAmount || 0)
          }))
        }
      },
      include: {
        supplier: true,
        items: true
      }
    });

    // Update supplier balance
    await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        balance: {
          increment: finalTotalAmount
        }
      }
    });

    res.status(201).json(successResponse(bill, 'Bill created successfully'));
  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update bill
exports.updateBill = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      supplierId,
      billDate,
      dueDate,
      items,
      discountAmount,
      notes,
      status
    } = req.body;

    // Get existing bill
    const existingBill = await prisma.bill.findUnique({
      where: { id }
    });

    if (!existingBill) {
      return res.status(404).json(errorResponse('Bill not found'));
    }

    // Don't allow updating if paid
    if (existingBill.status === 'PAID') {
      return res.status(400).json(errorResponse('Cannot update a paid bill'));
    }

    let updateData = {
      supplierId,
      billDate: billDate ? new Date(billDate) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      status
    };

    // If items are provided, recalculate totals
    if (items && items.length > 0) {
      const totals = calculateTotals(items);
      const finalDiscountAmount = discountAmount || existingBill.discountAmount;
      const finalTotalAmount = totals.totalAmount - finalDiscountAmount;

      updateData = {
        ...updateData,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discountAmount: finalDiscountAmount,
        totalAmount: finalTotalAmount,
        balanceAmount: finalTotalAmount - existingBill.paidAmount
      };

      // Delete existing items and create new ones
      await prisma.billItem.deleteMany({
        where: { billId: id }
      });

      await prisma.billItem.createMany({
        data: items.map(item => ({
          billId: id,
          productId: item.productId || null,
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          taxRate: parseFloat(item.taxRate || 0),
          taxAmount: parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100),
          discountAmount: parseFloat(item.discountAmount || 0),
          totalAmount: (parseFloat(item.quantity) * parseFloat(item.unitPrice)) +
                      (parseFloat(item.quantity) * parseFloat(item.unitPrice) * (parseFloat(item.taxRate || 0) / 100)) -
                      parseFloat(item.discountAmount || 0)
        }))
      });
    }

    const bill = await prisma.bill.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true,
        items: true
      }
    });

    res.json(successResponse(bill, 'Bill updated successfully'));
  } catch (error) {
    console.error('Update bill error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete bill
exports.deleteBill = async (req, res) => {
  try {
    const { id } = req.params;

    // Get bill details
    const bill = await prisma.bill.findUnique({
      where: { id }
    });

    if (!bill) {
      return res.status(404).json(errorResponse('Bill not found'));
    }

    // Don't allow deleting if payments exist
    if (bill.paidAmount > 0) {
      return res.status(400).json(errorResponse('Cannot delete bill with payments'));
    }

    // Update supplier balance
    await prisma.supplier.update({
      where: { id: bill.supplierId },
      data: {
        balance: {
          decrement: bill.balanceAmount
        }
      }
    });

    // Delete bill (items will cascade delete)
    await prisma.bill.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Bill deleted successfully'));
  } catch (error) {
    console.error('Delete bill error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};