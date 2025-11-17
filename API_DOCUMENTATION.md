# Accounting API Backend - Complete Documentation

## Overview

This is a fully functional, production-ready accounting backend API built with Node.js, Express, Prisma, and PostgreSQL. It supports all features required by the ZirakBook frontend.

## Base URL

- **Production**: `https://accounting-api.alexandratechlab.com/api/v1`
- **Local**: `http://localhost:8003/api/v1`

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Login Credentials (Seeded Data)

```
Email: admin@democompany.com
Password: demo123
Role: COMPANY_ADMIN
Company: Demo Company Ltd (ID: da490d94-334d-45aa-a664-40f46afd7bb5)

Email: superadmin@zirakbook.com
Password: admin123
Role: SUPERADMIN
Company: None (System Admin)

Email: accountant@democompany.com
Password: demo123
Role: ACCOUNTANT
Company: Demo Company Ltd
```

## API Endpoints

### 1. Authentication & Users

#### POST /auth/login
Login to get JWT token
```json
Request:
{
  "email": "admin@democompany.com",
  "password": "demo123"
}

Response:
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@democompany.com",
      "name": "John Smith",
      "role": "COMPANY_ADMIN",
      "companyId": "uuid",
      "companyName": "Demo Company Ltd"
    },
    "token": "jwt-token-here"
  }
}
```

#### POST /auth/register
Register new user
```json
Request:
{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "New User",
  "role": "USER",
  "companyId": "uuid"
}
```

#### GET /auth/me
Get current user info (requires auth)

#### GET /auth/User/company/:companyId
Get all users for a company

#### POST /auth/User
Create new user

#### PUT /auth/User/:id
Update user

#### DELETE /auth/User/:id
Delete user

### 2. Companies

#### GET /auth/Company or /companies
List all companies

#### GET /auth/Company/:id or /companies/:id
Get company details

#### POST /auth/Company or /companies
Create new company
```json
{
  "name": "New Company Inc",
  "email": "info@newcompany.com",
  "phone": "+1-555-0100",
  "address": "123 Business St",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "zipCode": "10001",
  "taxId": "TAX-123",
  "baseCurrency": "USD"
}
```

#### PUT /auth/Company/:id or /companies/:id
Update company

#### DELETE /auth/Company/:id or /companies/:id
Delete company

### 3. Chart of Accounts

#### GET /account/company/:companyId
Get all accounts for company

#### GET /account/getAccountByCompany/:companyId
Alternative endpoint to get accounts

#### POST /account
Create new account
```json
{
  "accountCode": "1000",
  "accountName": "Cash",
  "accountType": "ASSET",
  "description": "Cash account",
  "companyId": "uuid"
}
```
Account types: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE

#### PUT /account/:id
Update account

#### DELETE /account/:id
Delete account

### 4. Customers

#### GET /customers/getCustomersByCompany/:companyId
Get all customers for company

#### GET /customers/:id
Get customer details

#### POST /customers
Create customer
```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+1-555-0100",
  "address": "123 Street",
  "city": "City",
  "state": "State",
  "country": "Country",
  "zipCode": "12345",
  "creditLimit": 10000,
  "creditPeriodDays": 30,
  "companyId": "uuid"
}
```

#### PUT /customers/:id
Update customer

#### DELETE /customers/:id
Delete customer

### 5. Suppliers

#### GET /suppliers/getSuppliersByCompany/:companyId
Get all suppliers

#### GET /suppliers/:id
Get supplier details

#### POST /suppliers
Create supplier (same structure as customer)

#### PUT /suppliers/:id
Update supplier

#### DELETE /suppliers/:id
Delete supplier

### 6. Products

#### GET /products/company/:companyId
Get all products

#### GET /products/:id
Get product details

#### POST /products
Create product
```json
{
  "name": "Product Name",
  "description": "Product description",
  "category": "Electronics",
  "unit": "pcs",
  "sellingPrice": 100,
  "purchasePrice": 60,
  "taxRate": 10,
  "currentStock": 100,
  "reorderLevel": 20,
  "companyId": "uuid"
}
```

#### PUT /products/:id
Update product

#### DELETE /products/:id
Delete product

### 7. Sales Invoices

#### GET /invoices/company/:companyId
Get all invoices

#### GET /invoices/:id
Get invoice details with items

#### POST /invoices
Create invoice
```json
{
  "customerId": "uuid",
  "invoiceDate": "2024-01-01",
  "dueDate": "2024-01-31",
  "items": [
    {
      "productId": "uuid",
      "description": "Product name",
      "quantity": 5,
      "unitPrice": 100,
      "taxRate": 10,
      "discountAmount": 0
    }
  ],
  "discountAmount": 0,
  "notes": "Invoice notes",
  "status": "DRAFT",
  "companyId": "uuid"
}
```
Status: DRAFT, SENT, PARTIALLY_PAID, PAID, OVERDUE, CANCELLED

#### PUT /invoices/:id
Update invoice

#### DELETE /invoices/:id
Delete invoice

### 8. Purchase Bills

#### GET /bills/company/:companyId
Get all bills

#### GET /bills/:id
Get bill details

#### POST /bills
Create bill (same structure as invoice, but with supplierId)

#### PUT /bills/:id
Update bill

#### DELETE /bills/:id
Delete bill

### 9. Payments

#### GET /payments/company/:companyId
Get all payments

#### GET /payments/:id
Get payment details

#### POST /payments
Create payment
```json
{
  "amount": 1000,
  "paymentMethod": "BANK_TRANSFER",
  "paymentDate": "2024-01-15",
  "referenceNumber": "REF-001",
  "notes": "Payment received",
  "invoiceId": "uuid",
  "companyId": "uuid"
}
```
Payment methods: CASH, BANK_TRANSFER, CREDIT_CARD, DEBIT_CARD, CHEQUE, UPI, OTHER

For bill payments, use "billId" instead of "invoiceId"

#### PUT /payments/:id
Update payment

#### DELETE /payments/:id
Delete payment

### 10. Expenses

#### GET /expenses/company/:companyId
Get all expenses

#### GET /expenses/:id
Get expense details

#### POST /expenses
Create expense
```json
{
  "category": "Office Supplies",
  "amount": 500,
  "taxAmount": 50,
  "paymentMethod": "BANK_TRANSFER",
  "expenseDate": "2024-01-01",
  "description": "Monthly supplies",
  "companyId": "uuid"
}
```

#### PUT /expenses/:id
Update expense

#### DELETE /expenses/:id
Delete expense

### 11. Journal Entries

#### GET /journal-entries/company/:companyId
Get all journal entries

#### GET /journal-entries/:id
Get journal entry details

#### POST /journal-entries
Create journal entry
```json
{
  "entryDate": "2024-01-01",
  "description": "Journal entry description",
  "lineItems": [
    {
      "accountId": "uuid",
      "description": "Debit entry",
      "debitAmount": 1000,
      "creditAmount": 0
    },
    {
      "accountId": "uuid",
      "description": "Credit entry",
      "debitAmount": 0,
      "creditAmount": 1000
    }
  ],
  "status": "DRAFT",
  "companyId": "uuid"
}
```
Note: Total debits must equal total credits

Status: DRAFT, POSTED, CANCELLED

#### PUT /journal-entries/:id
Update journal entry

#### DELETE /journal-entries/:id
Delete journal entry

### 12. Reports & Dashboard

#### GET /superadmindhasboard?company_id=:companyId
Get dashboard summary
```json
Response:
{
  "success": true,
  "data": {
    "customers": 10,
    "suppliers": 5,
    "products": 10,
    "invoices": {
      "count": 15,
      "total": 34397,
      "unpaid": 12025.75
    },
    "bills": {
      "count": 8,
      "total": 39500,
      "unpaid": 3540
    },
    "payments": {
      "count": 11,
      "total": 54800
    },
    "expenses": {
      "total": 6415
    },
    "revenue": 34397,
    "profit": -11518,
    "recentInvoices": [...],
    "recentPayments": [...]
  }
}
```

#### GET /sales-reports/summary?company_id=:id&start_date=:date&end_date=:date
Get sales report summary

#### GET /sales-reports/detailed?company_id=:id&start_date=:date&end_date=:date
Get detailed sales report

#### GET /purchase-reports/summary?company_id=:id&start_date=:date&end_date=:date
Get purchase report summary

#### GET /purchase-reports/detailed?company_id=:id&start_date=:date&end_date=:date
Get detailed purchase report

#### GET /posinvoice/company/:companyId
Get POS invoices

### 13. User Roles & Permissions

#### GET /user-roles?company_id=:id
Get all roles

#### POST /user-roles
Create role

#### PUT /user-roles/:id
Update role

#### DELETE /user-roles/:id
Delete role

#### PATCH /user-roles/:id/status
Update role status

### 14. Plans & Pricing

#### GET /plans
Get all subscription plans

#### POST /plans
Create plan

#### PUT /plans/:id
Update plan

#### DELETE /plans/:id
Delete plan

#### POST /modules
Create module

#### GET /requestforplan
Get plan requests

#### PUT /requestforplan/:id
Update plan request

### 15. Vouchers

#### GET /contravouchers/company/:companyId
Get contra vouchers (uses journal entry structure)

#### POST /contravouchers
Create contra voucher

#### GET /income-vouchers
Get income vouchers

#### POST /income-vouchers
Create income voucher

## Response Format

All responses follow this standard format:

```json
Success:
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}

Error:
{
  "success": false,
  "message": "Error description",
  "error": "Technical error (dev mode only)"
}
```

## Error Codes

- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 409: Conflict (duplicate entry)
- 500: Internal Server Error

## Pagination

List endpoints support pagination:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

Example: `/customers/getCustomersByCompany/:id?page=2&limit=50`

## Testing

Use the seeded data to test:
1. Login with test credentials
2. Use the returned token in Authorization header
3. Use company ID from login response for API calls
4. Test CRUD operations on all modules

## Database Schema

The system uses PostgreSQL with Prisma ORM. Key tables:
- companies
- users
- accounts (chart of accounts)
- customers
- suppliers
- products
- invoices / invoice_items
- bills / bill_items
- payments
- expenses
- journal_entries / journal_line_items

## Features

✅ User authentication with JWT
✅ Role-based access control
✅ Multi-company support
✅ Chart of accounts management
✅ Customer & supplier management
✅ Product/inventory tracking
✅ Sales invoicing with line items
✅ Purchase bill management
✅ Payment recording and tracking
✅ Expense management
✅ Double-entry journal entries
✅ Financial reports & dashboard
✅ Real-time balance calculations
✅ Transaction validation
✅ Data relationships and integrity

## Server Information

- Port: 8003
- PM2 Process: accounting-api
- Health Check: /api/v1/health
- Database: PostgreSQL on port 5437
- Environment: Production ready with error handling

## Deployment

The API is already running on PM2:
```bash
pm2 status accounting-api
pm2 logs accounting-api
pm2 restart accounting-api
```

## Maintenance

### Re-seed Database
```bash
cd /root/accounting-api-backend
node prisma/seed.js
```

### Check Database Connection
```bash
cd /root/accounting-api-backend
npx prisma db pull
```

### View Logs
```bash
pm2 logs accounting-api --lines 100
```

## Support

For issues or questions:
- Check PM2 logs for errors
- Verify database connection
- Ensure JWT tokens are valid
- Check API endpoint URLs match documentation