#!/bin/bash
# Test All Functionalities
# Comprehensive test script for all features

set -e

BASE_URL="http://localhost:3000/api/v1"
AI_URL="http://localhost:8000"

echo "🧪 Testing Kayak System Functionalities"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

test_function() {
    local name=$1
    local command=$2
    
    echo -n "Testing $name... "
    
    if eval "$command" > /tmp/test_output.json 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        cat /tmp/test_output.json | head -3
        ((FAILED++))
        return 1
    fi
}

# ==================== TIER 3: DATABASE TESTS ====================
echo -e "${BLUE}=== TIER 3: Database Tests ===${NC}"
echo ""

test_function "MySQL Connection" \
    "mysql -u root -p -e 'SELECT 1;' < /dev/null"

test_function "MongoDB Connection" \
    "mongosh --eval 'db.adminCommand(\"ping\")' --quiet"

test_function "MySQL Tables Exist" \
    "mysql -u root -p kayak -e 'SHOW TABLES;' | grep -q users"

test_function "MongoDB Collections Exist" \
    "mongosh kayak_doc --eval 'db.getCollectionNames()' --quiet | grep -q hotels"

echo ""

# ==================== TIER 2: MIDDLEWARE TESTS ====================
echo -e "${BLUE}=== TIER 2: Middleware Tests ===${NC}"
echo ""

test_function "API Gateway Health" \
    "curl -s -f http://localhost:3000/health > /dev/null"

test_function "User Service Health" \
    "curl -s -f $BASE_URL/users/health > /dev/null"

test_function "Search Service Health" \
    "curl -s -f $BASE_URL/search/health > /dev/null"

test_function "Booking Service Health" \
    "curl -s -f $BASE_URL/bookings/health > /dev/null"

echo ""

# ==================== USER OPERATIONS ====================
echo -e "${BLUE}=== User Operations ===${NC}"
echo ""

# Register user
REGISTER_DATA='{
  "userId": "888-77-6666",
  "firstName": "Test",
  "lastName": "User",
  "email": "testuser888@example.com",
  "password": "Test123!",
  "phone": "408-555-8888",
  "address": {
    "street": "888 Test St",
    "city": "San Jose",
    "state": "CA",
    "zipCode": "95123"
  }
}'

test_function "User Registration" \
    "curl -s -f -X POST $BASE_URL/users/register \
    -H 'Content-Type: application/json' \
    -d '$REGISTER_DATA' | grep -q userId"

# Login
LOGIN_DATA='{"email": "testuser888@example.com", "password": "Test123!"}'

test_function "User Login" \
    "curl -s -f -X POST $BASE_URL/users/login \
    -H 'Content-Type: application/json' \
    -d '$LOGIN_DATA' | grep -q token"

# Get token
TOKEN=$(curl -s -X POST $BASE_URL/users/login \
    -H "Content-Type: application/json" \
    -d "$LOGIN_DATA" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✅ Token extracted${NC}"
    export JWT_TOKEN="$TOKEN"
    
    test_function "Get User Profile" \
        "curl -s -f -H 'Authorization: Bearer $TOKEN' \
        $BASE_URL/users/888-77-6666 | grep -q userId"
else
    echo -e "${YELLOW}⚠️  Could not extract token${NC}"
fi

echo ""

# ==================== SEARCH OPERATIONS ====================
echo -e "${BLUE}=== Search Operations ===${NC}"
echo ""

test_function "Search Hotels" \
    "curl -s -f '$BASE_URL/search/hotels?city=San%20Francisco&page=1&limit=5' | grep -q data"

test_function "Search Flights" \
    "curl -s -f '$BASE_URL/search/flights?origin=SFO&destination=LAX&page=1&limit=5' | grep -q data"

test_function "Search Cars" \
    "curl -s -f '$BASE_URL/search/cars?location=San%20Francisco&page=1&limit=5' | grep -q data"

echo ""

# ==================== BOOKING OPERATIONS ====================
echo -e "${BLUE}=== Booking Operations ===${NC}"
echo ""

if [ -n "$JWT_TOKEN" ]; then
    BOOKING_DATA='{
      "listingType": "hotel",
      "listingId": "HTL001",
      "startDate": "2025-12-01",
      "endDate": "2025-12-03",
      "guests": 2,
      "totalPrice": 300.00
    }'
    
    test_function "Create Booking" \
        "curl -s -f -X POST $BASE_URL/bookings \
        -H 'Content-Type: application/json' \
        -H 'Authorization: Bearer $TOKEN' \
        -d '$BOOKING_DATA' | grep -q bookingId"
    
    # Get booking ID
    BOOKING_ID=$(curl -s -X POST $BASE_URL/bookings \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "$BOOKING_DATA" | grep -o '"bookingId":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$BOOKING_ID" ]; then
        test_function "Get User Bookings" \
            "curl -s -f -H 'Authorization: Bearer $TOKEN' \
            $BASE_URL/bookings/user/888-77-6666 | grep -q bookingId"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping booking tests (no auth token)${NC}"
fi

echo ""

# ==================== AI SERVICE TESTS ====================
echo -e "${BLUE}=== AI Service Tests ===${NC}"
echo ""

test_function "AI Service Health" \
    "curl -s -f $AI_URL/health > /dev/null"

test_function "AI Service Docs" \
    "curl -s -f $AI_URL/docs > /dev/null"

echo ""

# ==================== SUMMARY ====================
echo -e "${BLUE}=== Test Summary ===${NC}"
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check logs above.${NC}"
    exit 1
fi

