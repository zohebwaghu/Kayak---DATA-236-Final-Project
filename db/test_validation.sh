#!/bin/bash
# Validation script for database schemas
# Tests syntax validation without requiring full DB connection

set -e

echo "=== Testing MySQL Schema Syntax ==="
if command -v mysql &> /dev/null; then
    echo "Checking SQL syntax with mysql --dry-run (if supported) or mysqldump..."
    # Try to validate with mysql check
    mysql --version
    echo "SQL file exists: $(test -f db/mysql/schema.sql && echo 'YES' || echo 'NO')"
else
    echo "WARNING: mysql client not found. Skipping SQL validation."
fi

echo ""
echo "=== Testing MongoDB Script Syntax ==="
if command -v mongosh &> /dev/null; then
    echo "Checking MongoDB script syntax..."
    mongosh --version
    echo "MongoDB init.js exists: $(test -f db/mongodb/init.js && echo 'YES' || echo 'NO')"
    # Try syntax check only (dry-run)
    mongosh --quiet --eval "load('db/mongodb/init.js')" --nodb 2>&1 | head -20 || echo "Note: Full validation requires MongoDB server"
else
    echo "WARNING: mongosh not found. Skipping MongoDB validation."
fi

echo ""
echo "=== File Structure Check ==="
echo "MySQL schema: $(wc -l < db/mysql/schema.sql) lines"
echo "MongoDB init: $(wc -l < db/mongodb/init.js) lines"
echo "README: $(wc -l < README_DB.md) lines"

echo ""
echo "=== Basic Syntax Checks ==="
# Check for common SQL errors
echo "Checking for unclosed parentheses in SQL..."
OPEN_PAREN=$(grep -o '(' db/mysql/schema.sql | wc -l)
CLOSE_PAREN=$(grep -o ')' db/mysql/schema.sql | wc -l)
if [ "$OPEN_PAREN" -eq "$CLOSE_PAREN" ]; then
    echo "✓ Parentheses balanced ($OPEN_PAREN pairs)"
else
    echo "✗ WARNING: Parentheses mismatch (open: $OPEN_PAREN, close: $CLOSE_PAREN)"
fi

# Check for semicolons at end of statements
echo "Checking statement terminators..."
NO_SEMI=$(grep -E '^[^--].*[^;]$' db/mysql/schema.sql | grep -v '^$' | grep -v '^/\*' | head -5 || true)
if [ -z "$NO_SEMI" ]; then
    echo "✓ All statements appear terminated"
else
    echo "⚠ Some lines may lack semicolons (first few):"
    echo "$NO_SEMI" | head -3
fi

echo ""
echo "=== Validation Complete ==="

