#!/bin/bash
# Dry-run test for MySQL schema - validates SQL syntax without applying changes

set -e

echo "=== MySQL Schema Dry-Run Test ==="

if ! command -v mysql &> /dev/null; then
    echo "ERROR: mysql client not found. Install MySQL client to run this test."
    exit 1
fi

MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"

echo "Attempting to validate SQL syntax..."
echo "Note: This creates a temporary database for validation"

# Create a test database name
TEST_DB="kayak_test_$$"

# Try to connect and validate
if [ -z "$MYSQL_PASSWORD" ]; then
    MYSQL_CMD="mysql -u $MYSQL_USER -h $MYSQL_HOST"
else
    MYSQL_CMD="mysql -u $MYSQL_USER -p$MYSQL_PASSWORD -h $MYSQL_HOST"
fi

# Check connection
if ! $MYSQL_CMD -e "SELECT 1;" &> /dev/null; then
    echo "WARNING: Cannot connect to MySQL. Skipping full validation."
    echo "To test properly, ensure MySQL is running and credentials are set:"
    echo "  export MYSQL_USER=your_user"
    echo "  export MYSQL_PASSWORD=your_password"
    exit 0
fi

# Validate schema syntax by attempting to create test DB
echo "Creating test database: $TEST_DB"
$MYSQL_CMD <<EOF 2>&1 | grep -v "Using a password" || true
DROP DATABASE IF EXISTS \`$TEST_DB\`;
CREATE DATABASE \`$TEST_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE \`$TEST_DB\`;
EOF

echo "Loading schema..."
if $MYSQL_CMD $TEST_DB < db/mysql/schema.sql 2>&1 | grep -i "error" | grep -v "Using a password"; then
    echo "✗ Schema validation FAILED"
    $MYSQL_CMD -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;" 2>/dev/null || true
    exit 1
else
    echo "✓ Schema loaded successfully"
    
    # Verify tables were created
    TABLE_COUNT=$($MYSQL_CMD $TEST_DB -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$TEST_DB';" 2>/dev/null || echo "0")
    echo "✓ Created $TABLE_COUNT tables"
    
    # Cleanup
    $MYSQL_CMD -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;" 2>/dev/null || true
    echo "✓ Validation complete - schema is syntactically valid"
fi

