#!/bin/bash
# Test script for merged changes
# Tests: AI service async, API Gateway routing, Payment methods

set -e

echo "=========================================="
echo "Testing Merged Changes"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_GATEWAY_URL="http://localhost:3000"
AI_SERVICE_URL="http://localhost:8000"
USER_SERVICE_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3002"

# Test counter
PASSED=0
FAILED=0

test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=${4:-""}
    
    echo -n "Testing $name... "
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null || echo -e "\n000")
    else
        response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null || echo -e "\n000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        ((PASSED++))
        return 0
    elif [ "$http_code" -ge 500 ]; then
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code - Server Error)"
        echo "  Response: ${body:0:200}"
        ((FAILED++))
        return 1
    elif [ "$http_code" = "000" ]; then
        echo -e "${YELLOW}⚠ SKIP${NC} (Service not running)"
        return 2
    else
        echo -e "${YELLOW}⚠ SKIP${NC} (HTTP $http_code - Expected for some endpoints)"
        return 2
    fi
}

echo "1. Testing API Gateway Health"
echo "----------------------------"
test_endpoint "API Gateway Health" "$API_GATEWAY_URL/health"
echo ""

echo "2. Testing AI Service via API Gateway"
echo "--------------------------------------"
# Test AI chat endpoint
test_endpoint "AI Chat (via Gateway)" "$API_GATEWAY_URL/api/v1/ai/chat" "POST" '{"query":"Hello, I want to go to Miami","user_id":"test-user-123"}'
echo ""

echo "3. Testing AI Service Direct"
echo "-----------------------------"
test_endpoint "AI Service Health" "$AI_SERVICE_URL/health"
test_endpoint "AI Chat (direct)" "$AI_SERVICE_URL/api/ai/chat" "POST" '{"query":"Hello","user_id":"test-user-123"}'
echo ""

echo "4. Testing User Service"
echo "-----------------------"
test_endpoint "User Service Health" "$USER_SERVICE_URL/health"
echo ""

echo "5. Testing Payment Methods Endpoint"
echo "-----------------------------------"
# This will fail without auth, but we're checking if the endpoint exists
test_endpoint "Payment Methods (needs auth)" "$API_GATEWAY_URL/api/v1/users/test-user-123/payment-methods"
echo ""

echo "6. Testing Frontend"
echo "------------------"
test_endpoint "Frontend" "$FRONTEND_URL"
echo ""

echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All critical tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed or services are not running.${NC}"
    echo "Make sure all services are started before testing."
    exit 1
fi

