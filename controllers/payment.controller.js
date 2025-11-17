const prisma = require('../config/database');
const { successResponse, errorResponse, generateCode, getPaginationParams } = require('../utils/helpers');

// Get payments by company
exports.getPaymentsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { skip, take } = getPaginationParams(req.query);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { companyId },
        skip,
        take,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              customer: {
                select: { id: true, name: true }
              }
            }
          },
          bill: {
            select: {
              id: true,
              billNumber: true,
              supplier: {
                select: { id: true, name: true }
              }
            }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { paymentDate: 'desc' }
      }),
      prisma.payment.count({ where: { companyId } })
    ]);

    res.json(successResponse({
      payments,
      total,
      page: req.query.page || 1,
      totalPages: Math.ceil(total / take)
    }));
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Get single payment
exports.getPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            customer: true
          }
        },
        bill: {
          include: {
            supplier: true
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

    if (!payment) {
      return res.status(404).json(errorResponse('Payment not found'));
    }

    res.json(successResponse(payment));
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Create payment
exports.createPayment = async (req, res) => {
  try {
    const {
      paymentNumber,
      paymentDate,
      amount,
      paymentMethod,
      referenceNumber,
      notes,
      invoiceId,
      billId,
      companyId
    } = req.body;

    if (!amount || !paymentMethod) {
      return res.status(400).json(errorResponse('Amount and payment method are required'));
    }

    if (!invoiceId && !billId) {
      return res.status(400).json(errorResponse('Either invoice or bill ID is required'));
    }

    if (invoiceId && billId) {
      return res.status(400).json(errorResponse('Payment can be for either invoice or bill, not both'));
    }

    const finalCompanyId = companyId || req.user.companyId;
    const paymentAmount = parseFloat(amount);

    // Generate payment number if not provided
    let finalPaymentNumber = paymentNumber;
    if (!finalPaymentNumber) {
      const count = await prisma.payment.count({ where: { companyId: finalCompanyId } });
      finalPaymentNumber = generateCode('PAY', count + 1);
    }

    // Check if payment number already exists
    const existing = await prisma.payment.findFirst({
      where: {
        companyId: finalCompanyId,
        paymentNumber: finalPaymentNumber
      }
    });

    if (existing) {
      return res.status(409).json(errorResponse('Payment number already exists'));
    }

    // Handle invoice payment
    if (invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        return res.status(404).json(errorResponse('Invoice not found'));
      }

      if (paymentAmount > invoice.balanceAmount) {
        return res.status(400).json(errorResponse('Payment amount exceeds invoice balance'));
      }

      // Create payment
      const payment = await prisma.payment.create({
        data: {
          paymentNumber: finalPaymentNumber,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          amount: paymentAmount,
          paymentMethod,
          referenceNumber,
          notes,
          invoiceId,
          companyId: finalCompanyId,
          createdById: req.user.userId
        }
      });

      // Update invoice
      const newPaidAmount = invoice.paidAmount + paymentAmount;
      const newBalanceAmount = invoice.totalAmount - newPaidAmount;
      const newStatus = newBalanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus
        }
      });

      // Update customer balance
      await prisma.customer.update({
        where: { id: invoice.customerId },
        data: {
          balance: {
            decrement: paymentAmount
          }
        }
      });

      res.status(201).json(successResponse(payment, 'Payment created successfully'));
    }
    // Handle bill payment
    else if (billId) {
      const bill = await prisma.bill.findUnique({
        where: { id: billId }
      });

      if (!bill) {
        return res.status(404).json(errorResponse('Bill not found'));
      }

      if (paymentAmount > bill.balanceAmount) {
        return res.status(400).json(errorResponse('Payment amount exceeds bill balance'));
      }

      // Create payment
      const payment = await prisma.payment.create({
        data: {
          paymentNumber: finalPaymentNumber,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          amount: paymentAmount,
          paymentMethod,
          referenceNumber,
          notes,
          billId,
          companyId: finalCompanyId,
          createdById: req.user.userId
        }
      });

      // Update bill
      const newPaidAmount = bill.paidAmount + paymentAmount;
      const newBalanceAmount = bill.totalAmount - newPaidAmount;
      const newStatus = newBalanceAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';

      await prisma.bill.update({
        where: { id: billId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus
        }
      });

      // Update supplier balance
      await prisma.supplier.update({
        where: { id: bill.supplierId },
        data: {
          balance: {
            decrement: paymentAmount
          }
        }
      });

      res.status(201).json(successResponse(payment, 'Payment created successfully'));
    }
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Update payment
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentDate, paymentMethod, referenceNumber, notes } = req.body;

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        paymentMethod,
        referenceNumber,
        notes
      }
    });

    res.json(successResponse(payment, 'Payment updated successfully'));
  } catch (error) {
    console.error('Update payment error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json(errorResponse('Payment not found'));
    }
    res.status(500).json(errorResponse('Internal server error', error));
  }
};

// Delete payment
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    // Get payment details
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: true,
        bill: true
      }
    });

    if (!payment) {
      return res.status(404).json(errorResponse('Payment not found'));
    }

    // If it's an invoice payment, update invoice and customer
    if (payment.invoiceId && payment.invoice) {
      const newPaidAmount = payment.invoice.paidAmount - payment.amount;
      const newBalanceAmount = payment.invoice.totalAmount - newPaidAmount;
      const newStatus = newPaidAmount === 0 ? 'SENT' : 'PARTIALLY_PAID';

      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus
        }
      });

      await prisma.customer.update({
        where: { id: payment.invoice.customerId },
        data: {
          balance: {
            increment: payment.amount
          }
        }
      });
    }

    // If it's a bill payment, update bill and supplier
    if (payment.billId && payment.bill) {
      const newPaidAmount = payment.bill.paidAmount - payment.amount;
      const newBalanceAmount = payment.bill.totalAmount - newPaidAmount;
      const newStatus = newPaidAmount === 0 ? 'APPROVED' : 'PARTIALLY_PAID';

      await prisma.bill.update({
        where: { id: payment.billId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: newBalanceAmount,
          status: newStatus
        }
      });

      await prisma.supplier.update({
        where: { id: payment.bill.supplierId },
        data: {
          balance: {
            increment: payment.amount
          }
        }
      });
    }

    // Delete payment
    await prisma.payment.delete({
      where: { id }
    });

    res.json(successResponse(null, 'Payment deleted successfully'));
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json(errorResponse('Internal server error', error));
  }
};