#!/bin/bash
# Verify .env setup for all services

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT"

echo "🔍 Verifying .env Setup"
echo "======================="
echo ""

# Check if .env exists in middleware root
if [ -f "middleware/.env" ]; then
    echo "✅ middleware/.env exists"
    
    # Check MySQL password setting
    MYSQL_PASS=$(grep "^MYSQL_PASSWORD=" middleware/.env | cut -d'=' -f2)
    if [ -z "$MYSQL_PASS" ]; then
        echo "✅ MYSQL_PASSWORD is empty (correct for Homebrew MySQL)"
    else
        echo "⚠️  MYSQL_PASSWORD is set to: $MYSQL_PASS"
    fi
else
    echo "❌ middleware/.env does not exist"
    echo "   Run: ./scripts/setup-env-file.sh"
    exit 1
fi

echo ""

# Check if .env exists in each service directory
SERVICES=("api-gateway" "user-service" "search-service" "booking-service")

for service in "${SERVICES[@]}"; do
    if [ -f "middleware/services/$service/.env" ]; then
        echo "✅ middleware/services/$service/.env exists"
    else
        echo "⚠️  middleware/services/$service/.env missing"
        echo "   Copying from middleware/.env..."
        cp middleware/.env "middleware/services/$service/.env"
        echo "   ✅ Copied"
    fi
done

echo ""
echo "✅ Environment setup verified!"
echo ""
echo "📝 To test MySQL connection:"
echo "   cd middleware/services/user-service"
echo "   node -e \"require('dotenv').config(); console.log('MYSQL_PASSWORD:', process.env.MYSQL_PASSWORD === '' ? '(empty)' : process.env.MYSQL_PASSWORD);\""

