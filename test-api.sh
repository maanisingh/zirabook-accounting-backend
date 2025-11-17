#!/bin/bash

# ZirakBook Accounting API - Test Script
# Tests all major endpoints to verify functionality

echo "=========================================="
echo "ZirakBook Accounting API - Test Suite"
echo "=========================================="
echo ""

BASE_URL="http://localhost:8003/api/v1"
COMPANY_ID=""
TOKEN=""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local auth=$5

    echo -n "Testing: $name... "

    if [ "$auth" == "true" ]; then
        if [ -z "$TOKEN" ]; then
            echo -e "${RED}SKIP (no token)${NC}"
            return
        fi
        HEADERS="-H 'Authorization: Bearer $TOKEN'"
    else
        HEADERS=""
    fi

    if [ "$method" == "GET" ]; then
        RESPONSE=$(eval curl -s -X GET "$BASE_URL$endpoint" $HEADERS)
    else
        RESPONSE=$(eval curl -s -X $method "$BASE_URL$endpoint" -H \'Content-Type: application/json\' -d \'$data\' $HEADERS)
    fi

    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}"
        echo "Response: $RESPONSE"
        FAILED=$((FAILED + 1))
    fi
}

# 1. Health Check
echo "1. Testing Health Check"
test_endpoint "Health Check" "GET" "/health" "" "false"
echo ""

# 2. Authentication
echo "2. Testing Authentication"
LOGIN_DATA='{"email":"admin@democompany.com","password":"demo123"}'
echo -n "Testing: Login... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' -d "$LOGIN_DATA")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
    TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
    COMPANY_ID=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['user']['companyId'])" 2>/dev/null)
    echo "  Token: ${TOKEN:0:30}..."
    echo "  Company ID: $COMPANY_ID"
else
    echo -e "${RED}FAIL${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# 3. Companies
echo "3. Testing Companies"
test_endpoint "Get Companies" "GET" "/companies" "" "true"
echo ""

# 4. Chart of Accounts
echo "4. Testing Chart of Accounts"
test_endpoint "Get Accounts" "GET" "/account/company/$COMPANY_ID" "" "true"
echo ""

# 5. Customers
echo "5. Testing Customers"
test_endpoint "Get Customers" "GET" "/customers/getCustomersByCompany/$COMPANY_ID" "" "true"
echo ""

# 6. Suppliers
echo "6. Testing Suppliers"
test_endpoint "Get Suppliers" "GET" "/suppliers/getSuppliersByCompany/$COMPANY_ID" "" "true"
echo ""

# 7. Products
echo "7. Testing Products"
test_endpoint "Get Products" "GET" "/products/company/$COMPANY_ID" "" "true"
echo ""

# 8. Invoices
echo "8. Testing Invoices"
test_endpoint "Get Invoices" "GET" "/invoices/company/$COMPANY_ID" "" "true"
echo ""

# 9. Bills
echo "9. Testing Bills"
test_endpoint "Get Bills" "GET" "/bills/company/$COMPANY_ID" "" "true"
echo ""

# 10. Payments
echo "10. Testing Payments"
test_endpoint "Get Payments" "GET" "/payments/company/$COMPANY_ID" "" "true"
echo ""

# 11. Expenses
echo "11. Testing Expenses"
test_endpoint "Get Expenses" "GET" "/expenses/company/$COMPANY_ID" "" "true"
echo ""

# 12. Journal Entries
echo "12. Testing Journal Entries"
test_endpoint "Get Journal Entries" "GET" "/journal-entries/company/$COMPANY_ID" "" "true"
echo ""

# 13. Dashboard & Reports
echo "13. Testing Dashboard & Reports"
test_endpoint "Dashboard" "GET" "/superadmindhasboard?company_id=$COMPANY_ID" "" "true"
test_endpoint "Sales Report" "GET" "/sales-reports/summary?company_id=$COMPANY_ID" "" "true"
test_endpoint "Purchase Report" "GET" "/purchase-reports/summary?company_id=$COMPANY_ID" "" "true"
echo ""

# 14. User Roles
echo "14. Testing User Roles"
test_endpoint "Get Roles" "GET" "/user-roles?company_id=$COMPANY_ID" "" "true"
echo ""

# 15. Plans
echo "15. Testing Plans"
test_endpoint "Get Plans" "GET" "/plans" "" "true"
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! API is fully operational.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Check the output above.${NC}"
    exit 1
fi