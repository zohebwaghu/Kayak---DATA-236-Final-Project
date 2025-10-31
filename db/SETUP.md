# Database Setup Guide

## Quick Start

### Prerequisites
- MySQL 8.0+ installed and running
- MongoDB 6+ installed and running
- Command-line access to both databases

### Step 1: Create MySQL Schema

```bash
mysql -u root -p < db/mysql/schema.sql
```

This creates:
- Database: `kayak`
- 15 tables with constraints, indexes, and foreign keys
- Reference data (US states)

### Step 2: Create MongoDB Schema

```bash
mongosh < db/mongodb/init.js
```

This creates:
- Database: `kayak_doc`
- 6 collections with validators and indexes

### Step 3: Verify Installation

```bash
# MySQL
mysql -u root -p kayak -e "SHOW TABLES;"

# MongoDB
mongosh kayak_doc --eval "db.getCollectionNames()"
```

### Step 4: Load Sample Data (Optional)

```bash
mysql -u root -p kayak < db/test_sample_data.sql
```

## Environment Setup

### MySQL Configuration

For production, consider:
- Creating dedicated database user
- Setting up proper permissions
- Configuring connection pooling
- Enabling query logging

### MongoDB Configuration

- Configure authentication (if needed)
- Set up replica sets (for production)
- Configure TTL indexes for log cleanup
- Enable sharding for scale (if needed)

## Verification Checklist

- [ ] MySQL database `kayak` created
- [ ] All 15 MySQL tables created
- [ ] MongoDB database `kayak_doc` created
- [ ] All 6 MongoDB collections created
- [ ] Foreign key constraints working
- [ ] Check constraints validated
- [ ] Sample data loads successfully

