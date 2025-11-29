# Fix MySQL Connection - Environment Setup

## Issue
User Service shows: `Access denied for user 'root'@'localhost' (using password: YES)`

## Root Cause
1. `.env` file doesn't exist in `middleware/` directory
2. Service defaults to password `'password'` but MySQL root has no password (Homebrew)
3. Separate databases (`kayak_users`, `kayak_bookings`, `kayak_billing`) may not exist

## Solution

### Step 1: Create .env file

```bash
cd middleware
cp env.example .env
```

Then edit `.env` and set:
```bash
MYSQL_PASSWORD=  # Empty for Homebrew MySQL
```

Or use the setup script:
```bash
./scripts/setup-env-file.sh
```

### Step 2: Create Separate Databases

```bash
mysql -u root -e "
CREATE DATABASE IF NOT EXISTS kayak_users;
CREATE DATABASE IF NOT EXISTS kayak_bookings;
CREATE DATABASE IF NOT EXISTS kayak_billing;
"
```

### Step 3: Copy Tables to Separate Databases

```bash
# Copy users table
mysql -u root kayak_users -e "CREATE TABLE IF NOT EXISTS users LIKE kayak.users; INSERT IGNORE INTO users SELECT * FROM kayak.users;"

# Copy bookings table
mysql -u root kayak_bookings -e "CREATE TABLE IF NOT EXISTS bookings LIKE kayak.bookings; INSERT IGNORE INTO bookings SELECT * FROM kayak.bookings;"

# Copy billing table
mysql -u root kayak_billing -e "CREATE TABLE IF NOT EXISTS billing LIKE kayak.billing; INSERT IGNORE INTO billing SELECT * FROM kayak.billing;"
```

### Step 4: Verify

```bash
# Check databases exist
mysql -u root -e "SHOW DATABASES LIKE 'kayak%';"

# Check tables exist
mysql -u root kayak_users -e "SHOW TABLES;"
mysql -u root kayak_bookings -e "SHOW TABLES;"
mysql -u root kayak_billing -e "SHOW TABLES;"
```

### Step 5: Restart Service

```bash
cd middleware/services/user-service
node server.js
```

Should now show: `✅ MySQL database connected`

## Quick Fix Script

```bash
# Create .env with empty password
cat > middleware/.env << 'EOF'
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DB_USERS=kayak_users
MYSQL_DB_BOOKINGS=kayak_bookings
MYSQL_DB_BILLING=kayak_billing
# ... (rest of env vars)
EOF

# Create databases
mysql -u root -e "CREATE DATABASE IF NOT EXISTS kayak_users; CREATE DATABASE IF NOT EXISTS kayak_bookings; CREATE DATABASE IF NOT EXISTS kayak_billing;"

# Copy tables
mysql -u root kayak_users -e "CREATE TABLE IF NOT EXISTS users LIKE kayak.users; INSERT IGNORE INTO users SELECT * FROM kayak.users;"
mysql -u root kayak_bookings -e "CREATE TABLE IF NOT EXISTS bookings LIKE kayak.bookings; INSERT IGNORE INTO bookings SELECT * FROM kayak.bookings;"
mysql -u root kayak_billing -e "CREATE TABLE IF NOT EXISTS billing LIKE kayak.billing; INSERT IGNORE INTO billing SELECT * FROM kayak.billing;"
```

