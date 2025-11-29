#!/bin/bash
# Setup .env file for middleware
# Creates .env with correct MySQL password (empty for Homebrew)

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT/middleware"

echo "🔧 Setting up middleware .env file"
echo "==================================="
echo ""

if [ -f ".env" ]; then
    echo "⚠️  .env file already exists"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file"
        exit 0
    fi
fi

# Test MySQL connection to determine password
echo "Testing MySQL connection..."
if mysql -u root -e "SELECT 1;" 2>/dev/null; then
    MYSQL_PASSWORD=""
    echo "✅ MySQL root has no password (Homebrew default)"
elif mysql -u root -proot -e "SELECT 1;" 2>/dev/null; then
    MYSQL_PASSWORD="root"
    echo "✅ MySQL root password is 'root'"
else
    echo "⚠️  Could not determine MySQL password"
    read -p "Enter MySQL root password (or press Enter for no password): " MYSQL_PASSWORD
fi

# Create .env file
cat > .env <<EOF
# API Gateway Configuration
API_GATEWAY_PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=24h

# Kafka Configuration
KAFKA_BROKER=localhost:9092
KAFKA_CLIENT_ID=kayak-middleware

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TTL=300

# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_DB_USERS=kayak_users
MYSQL_DB_BOOKINGS=kayak_bookings
MYSQL_DB_BILLING=kayak_billing

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017
MONGO_DB_SEARCH=kayak_doc
MONGO_DB_ANALYTICS=kayak_analytics

# Service Ports
USER_SERVICE_PORT=3001
LISTINGS_SERVICE_PORT=3002
SEARCH_SERVICE_PORT=3003
BOOKING_SERVICE_PORT=3004
BILLING_SERVICE_PORT=3005
ADMIN_SERVICE_PORT=3006

# Environment
NODE_ENV=development

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Suppress KafkaJS partitioner warning
KAFKAJS_NO_PARTITIONER_WARNING=1
EOF

echo ""
echo "✅ .env file created at middleware/.env"
echo ""
echo "📝 Next steps:"
echo "   1. Ensure databases exist: kayak_users, kayak_bookings, kayak_billing"
echo "   2. Run migration: mysql -u root < db/mysql/migration_tier2_compatibility.sql"
echo "   3. Start services"

