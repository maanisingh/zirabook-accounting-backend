const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // Clean existing data (in correct order to avoid FK constraints)
  console.log('🧹 Cleaning existing data...');
  await prisma.journalLineItem.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.billItem.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  console.log('✓ Cleaned existing data\n');

  // Create Companies
  console.log('🏢 Creating companies...');
  const company1 = await prisma.company.create({
    data: {
      name: 'Demo Company Ltd',
      email: 'info@democompany.com',
      phone: '+1-555-0100',
      address: '123 Business Street',
      city: 'New York',
      state: 'NY',
      country: 'USA',
      zipCode: '10001',
      taxId: 'TAX-001-2024',
      fiscalYearStart: 1,
      baseCurrency: 'USD'
    }
  });

  const company2 = await prisma.company.create({
    data: {
      name: 'Tech Solutions Inc',
      email: 'contact@techsolutions.com',
      phone: '+1-555-0200',
      address: '456 Innovation Ave',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      zipCode: '94102',
      taxId: 'TAX-002-2024',
      fiscalYearStart: 1,
      baseCurrency: 'USD'
    }
  });
  console.log(`✓ Created ${2} companies\n`);

  // Create Users
  console.log('👥 Creating users...');
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@zirakbook.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPERADMIN'
    }
  });

  const companyAdmin1 = await prisma.user.create({
    data: {
      email: 'admin@democompany.com',
      password: await bcrypt.hash('demo123', 10),
      name: 'John Smith',
      role: 'COMPANY_ADMIN',
      companyId: company1.id
    }
  });

  const accountant1 = await prisma.user.create({
    data: {
      email: 'accountant@democompany.com',
      password: await bcrypt.hash('demo123', 10),
      name: 'Sarah Johnson',
      role: 'ACCOUNTANT',
      companyId: company1.id
    }
  });

  const companyAdmin2 = await prisma.user.create({
    data: {
      email: 'admin@techsolutions.com',
      password: await bcrypt.hash('tech123', 10),
      name: 'Mike Chen',
      role: 'COMPANY_ADMIN',
      companyId: company2.id
    }
  });
  console.log(`✓ Created ${4} users\n`);

  // Create Chart of Accounts for Company 1
  console.log('📊 Creating chart of accounts...');
  const accounts = [];

  // Assets
  accounts.push(await prisma.account.create({
    data: {
      accountCode: '1000',
      accountName: 'Cash',
      accountType: 'ASSET',
      balance: 50000,
      companyId: company1.id
    }
  }));

  accounts.push(await prisma.account.create({
    data: {
      accountCode: '1100',
      accountName: 'Accounts Receivable',
      accountType: 'ASSET',
      balance: 15000,
      companyId: company1.id
    }
  }));

  accounts.push(await prisma.account.create({
    data: {
      accountCode: '1500',
      accountName: 'Inventory',
      accountType: 'ASSET',
      balance: 25000,
      companyId: company1.id
    }
  }));

  // Liabilities
  accounts.push(await prisma.account.create({
    data: {
      accountCode: '2000',
      accountName: 'Accounts Payable',
      accountType: 'LIABILITY',
      balance: 8000,
      companyId: company1.id
    }
  }));

  // Equity
  accounts.push(await prisma.account.create({
    data: {
      accountCode: '3000',
      accountName: 'Owner\'s Equity',
      accountType: 'EQUITY',
      balance: 100000,
      companyId: company1.id
    }
  }));

  // Revenue
  accounts.push(await prisma.account.create({
    data: {
      accountCode: '4000',
      accountName: 'Sales Revenue',
      accountType: 'REVENUE',
      balance: 0,
      companyId: company1.id
    }
  }));

  // Expenses
  accounts.push(await prisma.account.create({
    data: {
      accountCode: '5000',
      accountName: 'Cost of Goods Sold',
      accountType: 'EXPENSE',
      balance: 0,
      companyId: company1.id
    }
  }));

  accounts.push(await prisma.account.create({
    data: {
      accountCode: '5100',
      accountName: 'Operating Expenses',
      accountType: 'EXPENSE',
      balance: 0,
      companyId: company1.id
    }
  }));
  console.log(`✓ Created ${accounts.length} accounts\n`);

  // Create Customers
  console.log('🛒 Creating customers...');
  const customers = [];

  for (let i = 1; i <= 10; i++) {
    customers.push(await prisma.customer.create({
      data: {
        customerCode: `CUST-${String(i).padStart(6, '0')}`,
        name: `Customer ${i}`,
        email: `customer${i}@example.com`,
        phone: `+1-555-01${String(i).padStart(2, '0')}`,
        address: `${i * 100} Customer Street`,
        city: 'New York',
        state: 'NY',
        country: 'USA',
        zipCode: '10001',
        creditLimit: 10000,
        creditPeriodDays: 30,
        balance: 0,
        companyId: company1.id
      }
    }));
  }
  console.log(`✓ Created ${customers.length} customers\n`);

  // Create Suppliers
  console.log('🚚 Creating suppliers...');
  const suppliers = [];

  for (let i = 1; i <= 5; i++) {
    suppliers.push(await prisma.supplier.create({
      data: {
        supplierCode: `SUPP-${String(i).padStart(6, '0')}`,
        name: `Supplier ${i}`,
        email: `supplier${i}@example.com`,
        phone: `+1-555-02${String(i).padStart(2, '0')}`,
        address: `${i * 200} Supplier Avenue`,
        city: 'Los Angeles',
        state: 'CA',
        country: 'USA',
        zipCode: '90001',
        creditPeriodDays: 30,
        balance: 0,
        companyId: company1.id
      }
    }));
  }
  console.log(`✓ Created ${suppliers.length} suppliers\n`);

  // Create Products
  console.log('📦 Creating products...');
  const products = [];

  const productData = [
    { name: 'Laptop Computer', category: 'Electronics', sellingPrice: 1200, purchasePrice: 800, stock: 50 },
    { name: 'Office Chair', category: 'Furniture', sellingPrice: 250, purchasePrice: 150, stock: 100 },
    { name: 'Desk Lamp', category: 'Accessories', sellingPrice: 45, purchasePrice: 25, stock: 200 },
    { name: 'Notebook Set', category: 'Stationery', sellingPrice: 15, purchasePrice: 8, stock: 500 },
    { name: 'Wireless Mouse', category: 'Electronics', sellingPrice: 35, purchasePrice: 20, stock: 150 },
    { name: 'USB Cable', category: 'Accessories', sellingPrice: 10, purchasePrice: 5, stock: 300 },
    { name: 'Monitor 24"', category: 'Electronics', sellingPrice: 300, purchasePrice: 200, stock: 75 },
    { name: 'Keyboard', category: 'Electronics', sellingPrice: 80, purchasePrice: 50, stock: 120 },
    { name: 'Filing Cabinet', category: 'Furniture', sellingPrice: 180, purchasePrice: 120, stock: 40 },
    { name: 'Printer Paper (Ream)', category: 'Stationery', sellingPrice: 25, purchasePrice: 15, stock: 250 }
  ];

  for (let i = 0; i < productData.length; i++) {
    const prod = productData[i];
    products.push(await prisma.product.create({
      data: {
        productCode: `PROD-${String(i + 1).padStart(6, '0')}`,
        name: prod.name,
        category: prod.category,
        unit: 'pcs',
        sellingPrice: prod.sellingPrice,
        purchasePrice: prod.purchasePrice,
        taxRate: 10,
        currentStock: prod.stock,
        reorderLevel: 20,
        companyId: company1.id
      }
    }));
  }
  console.log(`✓ Created ${products.length} products\n`);

  // Create Invoices
  console.log('📄 Creating invoices...');
  const invoices = [];

  for (let i = 1; i <= 15; i++) {
    const customer = customers[i % customers.length];
    const invoiceDate = new Date(2024, 0, i * 2); // Dates in January 2024
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30);

    // Select 2-4 random products
    const numItems = 2 + Math.floor(Math.random() * 3);
    const selectedProducts = [];
    for (let j = 0; j < numItems; j++) {
      selectedProducts.push(products[Math.floor(Math.random() * products.length)]);
    }

    let subtotal = 0;
    let taxAmount = 0;

    const items = selectedProducts.map(product => {
      const quantity = 1 + Math.floor(Math.random() * 5);
      const itemSubtotal = quantity * product.sellingPrice;
      const itemTax = itemSubtotal * (product.taxRate / 100);

      subtotal += itemSubtotal;
      taxAmount += itemTax;

      return {
        productId: product.id,
        description: product.name,
        quantity,
        unitPrice: product.sellingPrice,
        taxRate: product.taxRate,
        taxAmount: itemTax,
        discountAmount: 0,
        totalAmount: itemSubtotal + itemTax
      };
    });

    const totalAmount = subtotal + taxAmount;
    const paidAmount = i % 3 === 0 ? totalAmount : (i % 2 === 0 ? totalAmount / 2 : 0);
    const balanceAmount = totalAmount - paidAmount;

    let status = 'SENT';
    if (paidAmount === totalAmount) status = 'PAID';
    else if (paidAmount > 0) status = 'PARTIALLY_PAID';
    else if (new Date() > dueDate) status = 'OVERDUE';

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-2024-${String(i).padStart(6, '0')}`,
        customerId: customer.id,
        invoiceDate,
        dueDate,
        status,
        subtotal,
        taxAmount,
        discountAmount: 0,
        totalAmount,
        paidAmount,
        balanceAmount,
        notes: `Invoice for ${customer.name}`,
        companyId: company1.id,
        createdById: companyAdmin1.id,
        items: {
          create: items
        }
      }
    });

    invoices.push(invoice);

    // Update customer balance
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        balance: {
          increment: balanceAmount
        }
      }
    });
  }
  console.log(`✓ Created ${invoices.length} invoices\n`);

  // Create Bills
  console.log('📋 Creating bills...');
  const bills = [];

  for (let i = 1; i <= 8; i++) {
    const supplier = suppliers[i % suppliers.length];
    const billDate = new Date(2024, 0, i * 3);
    const dueDate = new Date(billDate);
    dueDate.setDate(dueDate.getDate() + 30);

    const numItems = 2 + Math.floor(Math.random() * 3);
    const selectedProducts = [];
    for (let j = 0; j < numItems; j++) {
      selectedProducts.push(products[Math.floor(Math.random() * products.length)]);
    }

    let subtotal = 0;
    let taxAmount = 0;

    const items = selectedProducts.map(product => {
      const quantity = 5 + Math.floor(Math.random() * 15);
      const itemSubtotal = quantity * product.purchasePrice;
      const itemTax = itemSubtotal * (product.taxRate / 100);

      subtotal += itemSubtotal;
      taxAmount += itemTax;

      return {
        productId: product.id,
        description: product.name,
        quantity,
        unitPrice: product.purchasePrice,
        taxRate: product.taxRate,
        taxAmount: itemTax,
        discountAmount: 0,
        totalAmount: itemSubtotal + itemTax
      };
    });

    const totalAmount = subtotal + taxAmount;
    const paidAmount = i % 2 === 0 ? totalAmount : 0;
    const balanceAmount = totalAmount - paidAmount;

    let status = paidAmount === totalAmount ? 'PAID' : (paidAmount > 0 ? 'PARTIALLY_PAID' : 'APPROVED');

    const bill = await prisma.bill.create({
      data: {
        billNumber: `BILL-2024-${String(i).padStart(6, '0')}`,
        supplierId: supplier.id,
        billDate,
        dueDate,
        status,
        subtotal,
        taxAmount,
        discountAmount: 0,
        totalAmount,
        paidAmount,
        balanceAmount,
        notes: `Purchase from ${supplier.name}`,
        companyId: company1.id,
        items: {
          create: items
        }
      }
    });

    bills.push(bill);

    // Update supplier balance
    await prisma.supplier.update({
      where: { id: supplier.id },
      data: {
        balance: {
          increment: balanceAmount
        }
      }
    });
  }
  console.log(`✓ Created ${bills.length} bills\n`);

  // Create Payments
  console.log('💰 Creating payments...');
  let paymentCount = 0;

  for (let i = 0; i < 10; i++) {
    const invoice = invoices[i];
    if (invoice.paidAmount > 0) {
      await prisma.payment.create({
        data: {
          paymentNumber: `PAY-${String(paymentCount + 1).padStart(6, '0')}`,
          paymentDate: new Date(2024, 0, i * 2 + 5),
          amount: invoice.paidAmount,
          paymentMethod: ['CASH', 'BANK_TRANSFER', 'CREDIT_CARD'][Math.floor(Math.random() * 3)],
          referenceNumber: `REF-${String(paymentCount + 1).padStart(8, '0')}`,
          notes: 'Payment received',
          invoiceId: invoice.id,
          companyId: company1.id,
          createdById: accountant1.id
        }
      });
      paymentCount++;
    }
  }

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (bill.paidAmount > 0) {
      await prisma.payment.create({
        data: {
          paymentNumber: `PAY-${String(paymentCount + 1).padStart(6, '0')}`,
          paymentDate: new Date(2024, 0, i * 3 + 10),
          amount: bill.paidAmount,
          paymentMethod: ['BANK_TRANSFER', 'CHEQUE'][Math.floor(Math.random() * 2)],
          referenceNumber: `REF-${String(paymentCount + 1).padStart(8, '0')}`,
          notes: 'Payment made',
          billId: bill.id,
          companyId: company1.id,
          createdById: accountant1.id
        }
      });
      paymentCount++;
    }
  }
  console.log(`✓ Created ${paymentCount} payments\n`);

  // Create Expenses
  console.log('💸 Creating expenses...');
  const expenseCategories = ['Office Supplies', 'Utilities', 'Rent', 'Marketing', 'Transportation'];

  for (let i = 1; i <= 12; i++) {
    await prisma.expense.create({
      data: {
        expenseNumber: `EXP-${String(i).padStart(6, '0')}`,
        expenseDate: new Date(2024, 0, i * 2),
        category: expenseCategories[i % expenseCategories.length],
        amount: 100 + Math.floor(Math.random() * 900),
        taxAmount: 0,
        totalAmount: 100 + Math.floor(Math.random() * 900),
        paymentMethod: 'BANK_TRANSFER',
        description: `Monthly ${expenseCategories[i % expenseCategories.length]}`,
        companyId: company1.id
      }
    });
  }
  console.log(`✓ Created ${12} expenses\n`);

  // Create Journal Entries
  console.log('📖 Creating journal entries...');
  for (let i = 1; i <= 5; i++) {
    await prisma.journalEntry.create({
      data: {
        journalNumber: `JE-${String(i).padStart(6, '0')}`,
        entryDate: new Date(2024, 0, i * 5),
        description: `Journal Entry ${i}`,
        totalDebit: 1000,
        totalCredit: 1000,
        status: 'POSTED',
        companyId: company1.id,
        createdById: accountant1.id,
        lineItems: {
          create: [
            {
              accountId: accounts[0].id, // Cash
              description: 'Debit entry',
              debitAmount: 1000,
              creditAmount: 0
            },
            {
              accountId: accounts[5].id, // Sales Revenue
              description: 'Credit entry',
              debitAmount: 0,
              creditAmount: 1000
            }
          ]
        }
      }
    });
  }
  console.log(`✓ Created ${5} journal entries\n`);

  console.log('✅ Database seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   - Companies: 2`);
  console.log(`   - Users: 4`);
  console.log(`   - Accounts: ${accounts.length}`);
  console.log(`   - Customers: ${customers.length}`);
  console.log(`   - Suppliers: ${suppliers.length}`);
  console.log(`   - Products: ${products.length}`);
  console.log(`   - Invoices: ${invoices.length}`);
  console.log(`   - Bills: ${bills.length}`);
  console.log(`   - Payments: ${paymentCount}`);
  console.log(`   - Expenses: 12`);
  console.log(`   - Journal Entries: 5`);
  console.log('\n🔐 Login Credentials:');
  console.log('   - superadmin@zirakbook.com / admin123 (SUPERADMIN)');
  console.log('   - admin@democompany.com / demo123 (COMPANY_ADMIN)');
  console.log('   - accountant@democompany.com / demo123 (ACCOUNTANT)');
  console.log('   - admin@techsolutions.com / tech123 (COMPANY_ADMIN)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });