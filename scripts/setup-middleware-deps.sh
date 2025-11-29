#!/bin/bash
# Setup Middleware Dependencies
# Installs all required dependencies for middleware services

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT"

echo "📦 Setting up Middleware Dependencies"
echo "====================================="
echo ""

# Step 1: Install root middleware dependencies
echo "1. Installing middleware root dependencies..."
cd middleware
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ Middleware root dependencies installed"
else
    echo "✅ Middleware root dependencies already installed"
fi

# Step 2: Install service-specific dependencies
echo ""
echo "2. Installing service-specific dependencies..."

cd services/api-gateway
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ API Gateway dependencies installed"
else
    echo "✅ API Gateway dependencies already installed"
fi

cd ../user-service
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ User Service dependencies installed"
else
    echo "✅ User Service dependencies already installed"
fi

cd ../search-service
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ Search Service dependencies installed"
else
    echo "✅ Search Service dependencies already installed"
fi

cd ../booking-service
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ Booking Service dependencies installed"
else
    echo "✅ Booking Service dependencies already installed"
fi

cd "$PROJECT_ROOT"

echo ""
echo "✅ All middleware dependencies installed!"
echo ""
echo "📝 Key dependencies:"
echo "   - kafkajs (for Kafka messaging)"
echo "   - mysql2 (for MySQL database)"
echo "   - mongodb (for MongoDB database)"
echo "   - redis (for caching)"
echo "   - express (for HTTP server)"
echo "   - jsonwebtoken (for JWT authentication)"
echo ""
echo "🔍 Verifying installations..."

# Verify kafkajs
if [ -d "middleware/node_modules/kafkajs" ]; then
    echo "✅ kafkajs found in middleware root"
else
    echo "❌ kafkajs not found - run: cd middleware && npm install"
fi

# Verify mysql2
if [ -d "middleware/node_modules/mysql2" ]; then
    echo "✅ mysql2 found in middleware root"
else
    echo "❌ mysql2 not found"
fi

# Verify mongodb
if [ -d "middleware/node_modules/mongodb" ]; then
    echo "✅ mongodb found in middleware root"
else
    echo "❌ mongodb not found"
fi

echo ""
echo "✅ Setup complete! You can now start the services."

