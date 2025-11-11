# Tier 2 ↔ Tier 3 Alignment Guide

## ✅ All Critical Issues Resolved

This document addresses all alignment issues between Tier 2 (Middleware) and Tier 3 (Database).

---

## Issue 1: Database Names ✅ RESOLVED

### Solution Implemented

**Option A (Recommended)**: Tier 3 now creates **both** database structures:

1. **Original Structure** (for Tier 3 design):
   - MySQL: `kayak` (single database)
   - MongoDB: `kayak_doc` (single database)

2. **Tier 2 Compatible Structure** (for middleware):
   - MySQL: `kayak_users`, `kayak_bookings`, `kayak_billing` (separate databases)
   - MongoDB: `kayak_search`, `kayak_analytics` (separate databases)

### Migration Script

Run after `schema.sql`:
```bash
mysql -u root -p < db/mysql/migration_tier2_compatibility.sql
mongosh < db/mongodb/migration_tier2_compatibility.js
```

This creates the separate databases and copies data for Tier 2 compatibility.

### Connection Strings

**Tier 2 can now use:**
- MySQL: `mysql://localhost:3306/kayak_users` (or `kayak_bookings`, `kayak_billing`)
- MongoDB: `mongodb://localhost:27017/kayak_search` (or `kayak_analytics`)

---

## Issue 2: Users Table Schema ✅ RESOLVED

### Changes Made

Added to `users` table:
- ✅ `password_hash VARCHAR(255)` - For authentication
- ✅ `role ENUM('user', 'admin')` - For authorization

### Column Name Compatibility

**Option 1**: Use compatibility view (recommended)
```sql
SELECT * FROM users_compat;
-- Returns: userId, firstName, lastName, address (JSON), passwordHash, role, etc.
```

**Option 2**: Use original table with snake_case
```sql
SELECT user_id, first_name, last_name, password_hash, role FROM users;
```

### Migration

Existing users will have:
- `password_hash = NULL` (set during registration/login)
- `role = 'user'` (default)

---

## Issue 3: Bookings Table Schema ✅ RESOLVED

### Changes Made

Added to `bookings` table:
- ✅ `listing_id VARCHAR(50)` - References the booked item
- ✅ `guests INT UNSIGNED` - Number of guests/travelers

### Usage

```sql
-- Example booking
INSERT INTO bookings (
  user_id, booking_type, listing_id, guests, 
  start_date, end_date, total_amount
) VALUES (
  '123-45-6789', 'hotel', '42', 2,
  '2025-12-01', '2025-12-03', 659.98
);
```

### Compatibility View

```sql
SELECT * FROM bookings_compat;
-- Returns: bookingId, userId, listingType, listingId, guests, totalPrice, etc.
```

---

## Issue 4: Inventory Table ✅ RESOLVED

### New Unified Inventory Table

Created `inventory` table for all listing types:

```sql
CREATE TABLE inventory (
  inventory_id INT AUTO_INCREMENT PRIMARY KEY,
  listing_type ENUM('hotel', 'flight', 'car'),
  listing_id VARCHAR(50),
  available_count INT UNSIGNED,
  price_per_unit DECIMAL(10,2),
  ...
);
```

### Usage Example

```sql
-- Hotel inventory
INSERT INTO inventory (listing_type, listing_id, available_count, price_per_unit)
VALUES ('hotel', '42', 10, 299.99);

-- Flight inventory
INSERT INTO inventory (listing_type, listing_id, available_count, price_per_unit)
VALUES ('flight', '123', 150, 599.99);

-- Car inventory
INSERT INTO inventory (listing_type, listing_id, available_count, price_per_unit)
VALUES ('car', '789', 5, 89.99);
```

### Booking Flow

```sql
-- 1. Check availability
SELECT available_count FROM inventory 
WHERE listing_type = 'hotel' AND listing_id = '42';

-- 2. Reserve (in transaction)
UPDATE inventory 
SET available_count = available_count - 1 
WHERE listing_type = 'hotel' AND listing_id = '42' AND available_count > 0;

-- 3. Create booking
INSERT INTO bookings (...);
```

---

## Issue 5: MongoDB Search Collections ✅ RESOLVED

### New Collections Created

In `kayak_search` database:
- ✅ `hotels` - Denormalized hotel data for fast search
- ✅ `flights` - Denormalized flight data for fast search
- ✅ `cars` - Denormalized car data for fast search

### Schema

```javascript
// Hotels collection
{
  hotelId: 42,
  name: "Grand Hotel",
  city: "San Francisco",
  state: "CA",
  starRating: 5,
  pricePerNight: 299.99,
  amenities: ["wifi", "parking", "pool"],
  rating: 4.8,
  availableRooms: 10,
  ...
}

// Flights collection
{
  flightId: 123,
  airline: "American Airlines",
  departure: { airport: "SFO", city: "San Francisco", time: ISODate(...) },
  arrival: { airport: "LAX", city: "Los Angeles", time: ISODate(...) },
  price: 599.99,
  availableSeats: 150,
  ...
}

// Cars collection
{
  carId: 789,
  provider: "Enterprise",
  type: "SUV",
  pricePerDay: 89.99,
  location: { city: "San Francisco", state: "CA" },
  available: true,
  ...
}
```

### Indexes

All collections have indexes on:
- Primary key (hotelId, flightId, carId)
- Location fields (city, state)
- Price fields
- Availability fields

---

## Quick Start for Tier 2

### Step 1: Run Base Schema
```bash
mysql -u root -p < db/mysql/schema.sql
mongosh < db/mongodb/init.js
```

### Step 2: Run Compatibility Migration
```bash
mysql -u root -p < db/mysql/migration_tier2_compatibility.sql
mongosh < db/mongodb/migration_tier2_compatibility.js
```

### Step 3: Verify
```bash
# MySQL
mysql -u root -p -e "SHOW DATABASES LIKE 'kayak%';"
mysql -u root -p kayak_users -e "DESCRIBE users;"
mysql -u root -p kayak_bookings -e "DESCRIBE bookings;"

# MongoDB
mongosh kayak_search --eval "db.getCollectionNames()"
mongosh kayak_search --eval "db.hotels.getIndexes()"
```

---

## Connection Examples

### MySQL (Tier 2)
```javascript
// Option 1: Use separate databases
const usersDB = mysql.createConnection({
  host: 'localhost',
  database: 'kayak_users'
});

const bookingsDB = mysql.createConnection({
  host: 'localhost',
  database: 'kayak_bookings'
});

// Option 2: Use main database with views
const db = mysql.createConnection({
  host: 'localhost',
  database: 'kayak'
});
// Then use: SELECT * FROM users_compat;
```

### MongoDB (Tier 2)
```javascript
// Search service
const searchDB = client.db('kayak_search');
const hotels = searchDB.collection('hotels');
const flights = searchDB.collection('flights');
const cars = searchDB.collection('cars');

// Analytics service
const analyticsDB = client.db('kayak_analytics');
```

---

## Data Synchronization

### MySQL → MongoDB Search Collections

Tier 2 middleware should:
1. Read from MySQL (`kayak` database)
2. Denormalize and write to MongoDB (`kayak_search`)
3. Update MongoDB when MySQL data changes (via Kafka events)

### Example Sync Script

```javascript
// Pseudo-code for syncing hotels
const mysqlHotels = await mysql.query('SELECT * FROM hotels');
const mongoHotels = mysqlHotels.map(hotel => ({
  hotelId: hotel.hotel_id,
  name: hotel.hotel_name,
  city: hotel.city,
  state: hotel.state_code,
  pricePerNight: hotel.room_types[0].base_price_usd,
  // ... denormalize
}));
await mongoSearch.hotels.insertMany(mongoHotels);
```

---

## Summary

✅ **All 5 critical issues resolved**
✅ **Backward compatible** - Original schema still works
✅ **Tier 2 compatible** - Separate databases and views created
✅ **Migration scripts provided** - Easy setup
✅ **Documentation complete** - This guide

**Tier 2 can now proceed with development!**

