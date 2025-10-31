# Expected Constraint Test Results

## Purpose
This document explains the **expected failures** in `test_constraints.sql`. These errors are **INTENTIONAL** and prove that validation constraints are working correctly.

## Expected Errors (These Should FAIL [correct failure])

### Test 1: Invalid SSN Format
```sql
'123-45-678'  -- Only 3 digits at end, should be 4
```
**Expected Error**: `ERROR 3819: Check constraint 'chk_users_ssn' is violated`
**Status**: **CORRECT** - Constraint is working!

### Test 2: Invalid ZIP Code
```sql
'1234'  -- Only 4 digits, should be 5
```
**Expected Error**: `ERROR 3819: Check constraint 'chk_users_zip' is violated`
**Status**: **CORRECT** - Constraint is working!

### Test 3: Invalid State Code
```sql
'XX'  -- Not in us_states table
```
**Expected Error**: `ERROR 1452: Cannot add or update a child row: a foreign key constraint fails`
**Status**: **CORRECT** - Foreign key constraint is working!

### Test 4: Invalid Flight Times
```sql
arrival before departure
```
**Expected Error**: `ERROR 3819: Check constraint 'chk_flights_times' is violated`
**Status**: **CORRECT** - Constraint is working!

### Test 5: Invalid Booking Dates
```sql
end_date before start_date
```
**Expected Error**: `ERROR 3819: Check constraint 'chk_dates_order' is violated`
**Status**: **CORRECT** - Constraint is working!

## How to Run Full Test

The test script will **stop on first error** by default. To see all validation failures:

```bash
# Run with error continuation (each error shows the constraint working)
mysql -u root kayak < db/test_constraints.sql 2>&1 | grep ERROR
```

## What Success Looks Like

**Good**: Seeing constraint violation errors means your data validation is working
**Bad**: If invalid data inserts successfully, constraints are NOT working

## Testing Valid Data Separately

Use `db/test_sample_data.sql` to test valid inserts - those should all succeed:
```bash
mysql -u root kayak < db/test_sample_data.sql
```

