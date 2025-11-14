#!/bin/bash

# ================================================================
# DATABASE SETUP SCRIPT
# Sets up Tier 3 databases with Tier 2 compatibility
# ================================================================

set -e

echo "======================================================================"
echo "🗄️  SETTING UP DATABASES (Tier 3 Schema + Tier 2 Compatibility)"
echo "======================================================================"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check if MySQL container is running
if ! docker ps | grep -q kayak-mysql; then
    echo "❌ MySQL container not running. Start it first:"
    echo "   cd middleware && docker-compose up -d mysql"
    exit 1
fi

# Check if MongoDB container is running
if ! docker ps | grep -q kayak-mongodb; then
    echo "❌ MongoDB container not running. Start it first:"
    echo "   cd middleware && docker-compose up -d mongodb"
    exit 1
fi

echo "Step 1: Setting up MySQL..."
echo "--------------------------------------------------------------------"

# Copy Tier 3 schema
echo "📋 Copying Tier 3 schema..."
cp "$PROJECT_ROOT/database-tier3/db/mysql/schema.sql" "$SCRIPT_DIR/mysql-schema.sql"
cp "$PROJECT_ROOT/database-tier3/db/mysql/migration_tier2_compatibility.sql" "$SCRIPT_DIR/mysql-migration.sql"

# Run base schema
echo "📥 Running base schema..."
docker exec -i kayak-mysql mysql -u root -ppassword < "$SCRIPT_DIR/mysql-schema.sql"

# Run migration for Tier 2 compatibility
echo "🔧 Running Tier 2 compatibility migration..."
docker exec -i kayak-mysql mysql -u root -ppassword < "$SCRIPT_DIR/mysql-migration.sql"

echo ""
echo "✅ MySQL setup complete!"
echo ""

echo "Step 2: Setting up MongoDB..."
echo "--------------------------------------------------------------------"

# Run base MongoDB init
echo "📥 Running base MongoDB schema..."
docker exec -i kayak-mongodb mongosh < "$PROJECT_ROOT/database-tier3/db/mongodb/init.js"

# Create search collections for Tier 2
echo "🔧 Creating search collections for Tier 2..."
docker exec -i kayak-mongodb mongosh < "$PROJECT_ROOT/database-tier3/db/mongodb/create_search_collections_tier2.js"

# Run full migration if it exists
if [ -f "$PROJECT_ROOT/database-tier3/db/mongodb/migration_tier2_compatibility.js" ]; then
    echo "📥 Running MongoDB compatibility migration..."
    docker exec -i kayak-mongodb mongosh < "$PROJECT_ROOT/database-tier3/db/mongodb/migration_tier2_compatibility.js"
fi

echo ""
echo "✅ MongoDB setup complete!"
echo ""

echo "Step 3: Verifying setup..."
echo "--------------------------------------------------------------------"

# Verify MySQL
echo "Checking MySQL databases..."
MYSQL_DBS=$(docker exec kayak-mysql mysql -u root -ppassword -e "SHOW DATABASES;" 2>/dev/null | grep -E "kayak|kayak_users|kayak_bookings" || echo "")

if echo "$MYSQL_DBS" | grep -q "kayak"; then
    echo "✅ MySQL database 'kayak' exists"
fi

if echo "$MYSQL_DBS" | grep -q "kayak_users"; then
    echo "✅ MySQL database 'kayak_users' exists"
fi

if echo "$MYSQL_DBS" | grep -q "kayak_bookings"; then
    echo "✅ MySQL database 'kayak_bookings' exists"
fi

# Check users table columns
echo "Checking users table..."
USERS_COLS=$(docker exec kayak-mysql mysql -u root -ppassword kayak -e "DESCRIBE users;" 2>/dev/null || echo "")

if echo "$USERS_COLS" | grep -q "password_hash"; then
    echo "✅ users.password_hash column exists"
else
    echo "❌ users.password_hash column MISSING"
fi

if echo "$USERS_COLS" | grep -q "role"; then
    echo "✅ users.role column exists"
else
    echo "❌ users.role column MISSING"
fi

# Verify MongoDB
echo "Checking MongoDB collections..."
MONGO_COLLS=$(docker exec kayak-mongodb mongosh kayak_doc --quiet --eval "db.getCollectionNames()" 2>/dev/null || echo "")

if echo "$MONGO_COLLS" | grep -q "hotels"; then
    echo "✅ MongoDB collection 'hotels' exists"
else
    echo "❌ MongoDB collection 'hotels' MISSING"
fi

if echo "$MONGO_COLLS" | grep -q "flights"; then
    echo "✅ MongoDB collection 'flights' exists"
else
    echo "❌ MongoDB collection 'flights' MISSING"
fi

if echo "$MONGO_COLLS" | grep -q "cars"; then
    echo "✅ MongoDB collection 'cars' exists"
else
    echo "❌ MongoDB collection 'cars' MISSING"
fi

echo ""
echo "======================================================================"
echo "✅ DATABASE SETUP COMPLETE!"
echo "======================================================================"
echo ""
echo "Next steps:"
echo "  1. Start middleware services: cd middleware && docker-compose up -d"
echo "  2. Run alignment check: ./check-alignment.sh"
echo "  3. Test integration: ./test-full-stack.sh"
echo ""

