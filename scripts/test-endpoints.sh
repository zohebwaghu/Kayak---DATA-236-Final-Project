#!/bin/bash
# Test All API Endpoints
# This script tests all middleware endpoints

set -e

BASE_URL="http://localhost:3000/api/v1"
API_GATEWAY="http://localhost:3000"

echo "🧪 Testing Kayak System Endpoints"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -n "Testing $description... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        echo "   Response: $body"
        return 1
    fi
}

# Test 1: API Gateway Health
echo "=== API Gateway ==="
test_endpoint "GET" "$API_GATEWAY/health" "" "API Gateway Health"

# Test 2: User Service Health
echo ""
echo "=== User Service ==="
test_endpoint "GET" "$BASE_URL/users/health" "" "User Service Health"

# Test 3: Search Service Health
echo ""
echo "=== Search Service ==="
test_endpoint "GET" "$BASE_URL/search/health" "" "Search Service Health"

# Test 4: Booking Service Health
echo ""
echo "=== Booking Service ==="
test_endpoint "GET" "$BASE_URL/bookings/health" "" "Booking Service Health"

# Test 5: User Registration
echo ""
echo "=== User Operations ==="
REGISTER_DATA='{
  "userId": "999-88-7777",
  "firstName": "Test",
  "lastName": "User",
  "email": "testuser@example.com",
  "password": "Test123!",
  "phone": "408-555-9999",
  "address": {
    "street": "999 Test Ave",
    "city": "San Jose",
    "state": "CA",
    "zipCode": "95123"
  }
}'

test_endpoint "POST" "$BASE_URL/users/register" "$REGISTER_DATA" "User Registration"

# Test 6: User Login
LOGIN_DATA='{
  "email": "testuser@example.com",
  "password": "Test123!"
}'

test_endpoint "POST" "$BASE_URL/users/login" "$LOGIN_DATA" "User Login"

# Extract token from login response (if successful)
TOKEN=$(curl -s -X POST "$BASE_URL/users/login" \
    -H "Content-Type: application/json" \
    -d "$LOGIN_DATA" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✅ Token extracted${NC}"
    export JWT_TOKEN="$TOKEN"
else
    echo -e "${YELLOW}⚠️  Could not extract token (may need to login manually)${NC}"
fi

# Test 7: Search Hotels
echo ""
echo "=== Search Operations ==="
test_endpoint "GET" "$BASE_URL/search/hotels?city=San%20Francisco&page=1&limit=5" "" "Search Hotels"

# Test 8: Search Flights
test_endpoint "GET" "$BASE_URL/search/flights?origin=SFO&destination=LAX&page=1&limit=5" "" "Search Flights"

# Test 9: Search Cars
test_endpoint "GET" "$BASE_URL/search/cars?location=San%20Francisco&page=1&limit=5" "" "Search Cars"

# Test 10: Get User Profile (requires auth)
if [ -n "$JWT_TOKEN" ]; then
    echo ""
    echo "=== Authenticated Operations ==="
    test_endpoint "GET" "$BASE_URL/users/999-88-7777" "" "Get User Profile" \
        -H "Authorization: Bearer $JWT_TOKEN"
fi

echo ""
echo "=== Test Summary ==="
echo "✅ Basic endpoint tests completed"
echo ""
echo "📝 Next Steps:"
echo "   1. Test booking flow (requires valid listing IDs)"
echo "   2. Test payment flow"
echo "   3. Test admin operations (requires admin token)"
echo "   4. Test AI service endpoints"

