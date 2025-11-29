# MySQL Connection Troubleshooting

## Common Issue: Access Denied Error

If you see: `ERROR 1045 (28000): Access denied for user 'root'@'localhost'`

### Quick Fixes

#### Option 1: Try Without Password (macOS Homebrew)
```bash
# Homebrew MySQL often has no root password by default
mysql -u root < db/mysql/schema.sql
```

#### Option 2: Use Socket Authentication
```bash
# Find MySQL socket
ls -la /tmp/mysql.sock /var/run/mysqld/mysqld.sock /usr/local/var/mysql/mysql.sock

# Use socket connection
mysql -u root --socket=/tmp/mysql.sock < db/mysql/schema.sql
```

#### Option 3: Create Dedicated User (Recommended)
```bash
# Run the setup script
./scripts/setup-mysql-user.sh

# Then use the new user
mysql -u kayak_user -pkayak_password123 < db/mysql/schema.sql
```

#### Option 4: Reset Root Password

**macOS:**
```bash
# Stop MySQL
brew services stop mysql

# Start in safe mode
mysqld_safe --skip-grant-tables &

# Connect without password
mysql -u root

# In MySQL prompt:
ALTER USER 'root'@'localhost' IDENTIFIED BY 'newpassword';
FLUSH PRIVILEGES;
exit;

# Restart MySQL normally
brew services restart mysql
```

**Linux:**
```bash
sudo systemctl stop mysql
sudo mysqld_safe --skip-grant-tables &
mysql -u root
# Then same ALTER USER command
sudo systemctl restart mysql
```

#### Option 5: Use Environment Variable
```bash
export MYSQL_PWD=your_password
mysql -u root < db/mysql/schema.sql
```

#### Option 6: Interactive Password Prompt
```bash
# This will prompt for password securely
mysql -u root -p < db/mysql/schema.sql
# Then enter password when prompted
```

### Verify Connection

```bash
# Test connection
mysql -u root -e "SELECT VERSION();"

# Or with password
mysql -u root -p -e "SELECT VERSION();"
```

### Update Middleware Configuration

After fixing MySQL access, update `middleware/.env`:

```bash
# If using root
MYSQL_USER=root
MYSQL_PASSWORD=your_root_password

# If using dedicated user (recommended)
MYSQL_USER=kayak_user
MYSQL_PASSWORD=kayak_password123
```

### Alternative: Use MySQL Workbench

1. Open MySQL Workbench
2. Connect to local MySQL instance
3. File → Open SQL Script
4. Select `db/mysql/schema.sql`
5. Execute script

