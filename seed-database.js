const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function seedDatabase() {
  console.log('🌱 Starting database seed...');

  try {
    // Create test company
    const companyId = 'test-company-id-123';
    const company = await prisma.company.upsert({
      where: { id: companyId },
      update: {},
      create: {
        id: companyId,
        name: 'Test Company',
        email: 'info@testcompany.com',
        phone: '+1234567890',
        address: '123 Test Street',
        city: 'Test City',
        state: 'TS',
        country: 'Test Country',
        zipCode: '12345',
        taxId: 'TEST123456',
        fiscalYearStart: 1,
        baseCurrency: 'USD',
        isActive: true
      }
    });

    console.log('✅ Company created:', company.name);

    // Create test users
    const hashedPassword = await bcrypt.hash('Test@123456', 10);

    const users = [
      {
        email: 'superadmin@test.com',
        name: 'Super Admin',
        role: 'SUPERADMIN',
        companyId: null
      },
      {
        email: 'admin@test.com',
        name: 'Company Admin',
        role: 'COMPANY_ADMIN',
        companyId: company.id
      },
      {
        email: 'accountant@test.com',
        name: 'Test Accountant',
        role: 'ACCOUNTANT',
        companyId: company.id
      },
      {
        email: 'user@test.com',
        name: 'Test User',
        role: 'USER',
        companyId: company.id
      }
    ];

    for (const userData of users) {
      const user = await prisma.user.upsert({
        where: { email: userData.email },
        update: {},
        create: {
          id: uuidv4(),
          ...userData,
          password: hashedPassword,
          isActive: true
        }
      });
      console.log(`✅ User created: ${user.email} (${user.role})`);
    }

    // Create default chart of accounts
    const accounts = [
      { accountCode: '1000', accountName: 'Cash', accountType: 'ASSET' },
      { accountCode: '1100', accountName: 'Bank Account', accountType: 'ASSET' },
      { accountCode: '1200', accountName: 'Accounts Receivable', accountType: 'ASSET' },
      { accountCode: '1300', accountName: 'Inventory', accountType: 'ASSET' },
      { accountCode: '2000', accountName: 'Accounts Payable', accountType: 'LIABILITY' },
      { accountCode: '2100', accountName: 'Credit Card', accountType: 'LIABILITY' },
      { accountCode: '3000', accountName: 'Owner\'s Equity', accountType: 'EQUITY' },
      { accountCode: '4000', accountName: 'Sales Revenue', accountType: 'REVENUE' },
      { accountCode: '5000', accountName: 'Cost of Goods Sold', accountType: 'EXPENSE' },
      { accountCode: '5100', accountName: 'Operating Expenses', accountType: 'EXPENSE' }
    ];

    for (const accountData of accounts) {
      await prisma.account.upsert({
        where: {
          companyId_accountCode: {
            companyId: company.id,
            accountCode: accountData.accountCode
          }
        },
        update: {},
        create: {
          id: uuidv4(),
          ...accountData,
          companyId: company.id,
          balance: 0,
          isActive: true
        }
      });
    }

    console.log('✅ Chart of accounts created');

    // Create test customers
    const customers = [
      {
        name: 'Acme Corporation',
        email: 'contact@acme.com',
        phone: '+1987654321',
        creditLimit: 10000
      },
      {
        name: 'Beta Industries',
        email: 'info@beta.com',
        phone: '+1122334455',
        creditLimit: 15000
      }
    ];

    for (let i = 0; i < customers.length; i++) {
      const customerId = `test-customer-${i + 1}`;
      await prisma.customer.upsert({
        where: { id: customerId },
        update: {},
        create: {
          id: customerId,
          customerCode: `CUST-${String(i + 1).padStart(5, '0')}`,
          ...customers[i],
          companyId: company.id,
          balance: 0,
          paymentTerms: 30,
          isActive: true
        }
      });
    }

    console.log('✅ Test customers created');

    // Create test suppliers
    const suppliers = [
      {
        name: 'Supply Co',
        email: 'orders@supplyco.com',
        phone: '+1555666777'
      },
      {
        name: 'Wholesale Partners',
        email: 'sales@wholesale.com',
        phone: '+1888999000'
      }
    ];

    for (let i = 0; i < suppliers.length; i++) {
      await prisma.supplier.upsert({
        where: {
          companyId_email: {
            companyId: company.id,
            email: suppliers[i].email
          }
        },
        update: {},
        create: {
          id: uuidv4(),
          supplierCode: `SUPP-${String(i + 1).padStart(5, '0')}`,
          ...suppliers[i],
          companyId: company.id,
          balance: 0,
          paymentTerms: 30,
          isActive: true
        }
      });
    }

    console.log('✅ Test suppliers created');

    // Create test products
    const products = [
      {
        name: 'Widget A',
        sku: 'WGT-001',
        unitCost: 10.00,
        unitPrice: 25.00,
        currentStock: 100,
        reorderLevel: 20
      },
      {
        name: 'Gadget B',
        sku: 'GDG-002',
        unitCost: 15.00,
        unitPrice: 35.00,
        currentStock: 50,
        reorderLevel: 10
      }
    ];

    for (const productData of products) {
      await prisma.product.upsert({
        where: {
          companyId_sku: {
            companyId: company.id,
            sku: productData.sku
          }
        },
        update: {},
        create: {
          id: uuidv4(),
          ...productData,
          companyId: company.id,
          isActive: true
        }
      });
    }

    console.log('✅ Test products created');

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('  Super Admin: superadmin@test.com / Test@123456');
    console.log('  Company Admin: admin@test.com / Test@123456');
    console.log('  Accountant: accountant@test.com / Test@123456');
    console.log('  User: user@test.com / Test@123456');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
seedDatabase()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });