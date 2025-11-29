#!/bin/bash
# Fix Module Path Issues in Middleware Services
# Ensures all services use correct paths to shared modules

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT"

echo "🔧 Fixing Module Paths in Middleware Services"
echo "=============================================="
echo ""

# Check if shared folder exists
if [ ! -d "middleware/shared" ]; then
    echo "❌ middleware/shared directory not found!"
    exit 1
fi

echo "✅ Shared modules found at: middleware/shared/"
echo ""

# Verify all services use correct path (../../shared/)
echo "Checking service paths..."

# API Gateway
if grep -q "require('./shared/" middleware/services/api-gateway/server.js 2>/dev/null; then
    echo "⚠️  API Gateway has incorrect path - fixing..."
    sed -i '' "s|require('./shared/|require('../../shared/|g" middleware/services/api-gateway/server.js
    echo "✅ Fixed API Gateway"
else
    echo "✅ API Gateway paths are correct"
fi

# Verify other services
for service in user-service search-service booking-service; do
    if grep -q "require('../../shared/" "middleware/services/$service/server.js" 2>/dev/null; then
        echo "✅ $service paths are correct"
    else
        echo "⚠️  $service may have path issues"
    fi
done

echo ""
echo "✅ Module path check complete!"
echo ""
echo "📝 All services should use: require('../../shared/moduleName')"
echo "   (going up 2 directories from services/service-name/ to middleware/)"

