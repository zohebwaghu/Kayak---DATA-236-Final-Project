# Data Migration Guide

## Migration Scenarios

### Scenario 1: Initial Data Load

#### Import from CSV to MySQL

```bash
# For users
mysql -u root -p kayak -e "
LOAD DATA INFILE '/path/to/users.csv'
INTO TABLE users
FIELDS TERMINATED BY ',' 
ENCLOSED BY '\"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(user_id, first_name, last_name, ...);
"
```

#### Import from JSON to MongoDB

```bash
# For reviews
mongosh kayak_doc --eval "
db.reviews.insertMany([
  {user_id: '123-45-6789', entity_type: 'hotel', entity_id: 1, rating: 5, ...},
  ...
])
"
```

### Scenario 2: Bulk Data Generation

#### Generate Test Data Script

```sql
-- MySQL: Generate 10,000 users
DELIMITER $$
CREATE PROCEDURE generate_test_users()
BEGIN
  DECLARE i INT DEFAULT 1;
  WHILE i <= 10000 DO
    INSERT INTO users (
      user_id, first_name, last_name, address_line1, city, 
      state_code, zip_code, phone_number, email
    ) VALUES (
      CONCAT(LPAD(FLOOR(RAND()*999), 3, '0'), '-', 
             LPAD(FLOOR(RAND()*99), 2, '0'), '-', 
             LPAD(FLOOR(RAND()*9999), 4, '0')),
      CONCAT('FirstName', i),
      CONCAT('LastName', i),
      CONCAT(i, ' Test Street'),
      'San Jose',
      'CA',
      CONCAT(LPAD(FLOOR(RAND()*99999), 5, '0'), '-', LPAD(FLOOR(RAND()*9999), 4, '0')),
      CONCAT('408-555-', LPAD(i, 4, '0')),
      CONCAT('user', i, '@example.com')
    );
    SET i = i + 1;
  END WHILE;
END$$
DELIMITER ;

CALL generate_test_users();
DROP PROCEDURE generate_test_users;
```

### Scenario 3: Dataset Import (Kaggle)

#### Importing Hotel Data from Inside Airbnb

```python
# Python script for data transformation
import pandas as pd
import mysql.connector

# Read CSV
df = pd.read_csv('listings.csv')

# Transform and insert
conn = mysql.connector.connect(...)
cursor = conn.cursor()

for _, row in df.iterrows():
    cursor.execute("""
        INSERT INTO hotels (
            hotel_name, address_line1, city, state_code, zip_code,
            star_rating, num_rooms_total, amenities_json
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (row['name'], row['street'], row['city'], 
          'CA', row['zipcode'], row['stars'], 
          row['room_count'], row['amenities'].to_json()))

conn.commit()
```

#### Importing Flight Data

Similar transformation needed for:
- Route validation (ensure airports exist)
- Date/time parsing
- Price normalization

### Scenario 4: MongoDB Reviews Migration

```javascript
// Migrate reviews from external source
const reviews = [
  {
    user_id: '123-45-6789',
    entity_type: 'hotel',
    entity_id: 1,
    rating: 5,
    title: 'Great stay!',
    text: 'Excellent service and clean rooms.',
    created_at: new Date(),
    tags: ['clean', 'friendly']
  },
  // ... more reviews
];

db.reviews.insertMany(reviews);
```

## Data Validation During Migration

### Pre-Migration Checks

```sql
-- MySQL: Validate SSN format before import
SELECT user_id FROM users 
WHERE user_id NOT REGEXP '^[0-9]{3}-[0-9]{2}-[0-9]{4}$';
-- Should return 0 rows

-- Validate ZIP codes
SELECT zip_code FROM users 
WHERE zip_code NOT REGEXP '^[0-9]{5}(-[0-9]{4})?$';
-- Should return 0 rows
```

### Post-Migration Verification

```sql
-- Check record counts
SELECT 
  'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'flights', COUNT(*) FROM flights
UNION ALL
SELECT 'hotels', COUNT(*) FROM hotels;

-- Verify foreign keys
SELECT COUNT(*) FROM bookings b
LEFT JOIN users u ON b.user_id = u.user_id
WHERE u.user_id IS NULL;
-- Should return 0 (no orphaned bookings)
```

## Migration Best Practices

1. **Backup First**: Always backup before migration
2. **Test in Staging**: Run migration in staging first
3. **Batch Processing**: Process in batches (1000-10000 records)
4. **Transaction Safety**: Use transactions for data integrity
5. **Validate Constantly**: Check data quality during migration
6. **Monitor Performance**: Watch for slow queries during bulk inserts
7. **Index Management**: Drop indexes before bulk insert, recreate after

## Performance Tips

### Fast Bulk Insert

```sql
-- Disable constraints temporarily
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
SET AUTOCOMMIT = 0;

-- Bulk insert
LOAD DATA INFILE ... -- or INSERT statements

-- Re-enable
SET FOREIGN_KEY_CHECKS = 1;
SET UNIQUE_CHECKS = 1;
COMMIT;
SET AUTOCOMMIT = 1;
```

### MongoDB Bulk Operations

```javascript
// Use bulk operations for better performance
const bulk = db.reviews.initializeUnorderedBulkOp();
for (const review of reviews) {
  bulk.insert(review);
}
bulk.execute();
```

