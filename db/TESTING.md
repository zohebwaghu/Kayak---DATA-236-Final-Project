# Database Schema Testing Guide

## Quick Validation (No DB Required)

Run the basic validation script:
```bash
./db/test_validation.sh
```

This checks:
- File existence and line counts
- Basic syntax (parentheses balance)
- MySQL and MongoDB CLI availability

## Full Schema Validation (Requires MySQL)

### Prerequisites
- MySQL 8.0+ server running
- MySQL client installed
- Optional: Set credentials via environment variables:
  ```bash
  export MYSQL_USER=root
  export MYSQL_PASSWORD=your_password
  ```

### Run Dry-Run Test
```bash
./db/test_schema_dry_run.sh
```

This:
1. Creates a temporary test database
2. Loads the schema
3. Verifies tables are created
4. Cleans up automatically

**Expected output**: `✓ Schema loaded successfully` and table count > 0

## Integration Testing with Sample Data

After successfully creating the schema, test with sample data:

```bash
mysql -u <user> -p < db/mysql/schema.sql
mysql -u <user> -p < db/test_sample_data.sql
```

The sample data script:
- Inserts valid users, flights, hotels, cars
- Creates bookings and billing records
- Verifies foreign key relationships
- Tests constraint validations (valid SSN, ZIP, state codes)

## Constraint Testing (Manual)

Run constraint tests to verify validation rules fail appropriately:

```bash
mysql -u <user> -p < db/test_constraints.sql
```

**Expected behavior**:
- Invalid SSN/ZIP/state inserts should **FAIL** with constraint violations
- Valid inserts should **SUCCEED**

## MongoDB Testing

### Prerequisites
- MongoDB 6+ server running
- mongosh installed

### Run MongoDB Init Script
```bash
mongosh < db/mongodb/init.js
```

**Expected output**: `MongoDB schema created in database: kayak_doc`

### Verify Collections
```bash
mongosh kayak_doc --eval "db.getCollectionNames()"
```

Expected collections:
- `reviews`
- `images`
- `logs`
- `analytics_aggregates`
- `deal_events`
- `watches`

## Pre-Commit Checklist

Before pushing to GitHub:

- [ ] All SQL files pass syntax validation
- [ ] `test_validation.sh` runs without errors
- [ ] MySQL schema creates all expected tables (run `test_schema_dry_run.sh`)
- [ ] Sample data inserts successfully
- [ ] Constraint tests verify validation rules (invalid inputs fail)
- [ ] MongoDB collections created with indexes
- [ ] README_DB.md documents all design decisions
- [ ] No sensitive data in schema files (no passwords, no raw card data)

## Common Issues

### MySQL: "Unknown database"
- Ensure MySQL server is running: `mysql.server start` (macOS) or `systemctl start mysql` (Linux)

### MongoDB: "Connection refused"
- Start MongoDB: `brew services start mongodb-community` (macOS) or `systemctl start mongod` (Linux)

### Syntax Errors
- Verify MySQL version: `mysql --version` (should be 8.0+)
- Check for unclosed quotes or parentheses in SQL
- Ensure all table definitions end properly before partitions

### Foreign Key Errors
- Ensure reference tables (`us_states`, `airports`) are created before dependent tables
- Check that INSERT order respects FK dependencies

## Performance Notes

For large-scale testing (10k+ records):
- Use transactions for bulk inserts
- Consider disabling FK checks temporarily: `SET FOREIGN_KEY_CHECKS=0;` (re-enable after)
- Use `LOAD DATA INFILE` for CSV imports instead of individual INSERT statements

