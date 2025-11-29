#!/bin/bash
# Fix MySQL Connection Issues
# Helps troubleshoot and fix MySQL authentication problems

echo "🔧 MySQL Connection Troubleshooting"
echo "===================================="
echo ""

# Check if MySQL is running
echo "1. Checking if MySQL is running..."
if pgrep -x mysqld > /dev/null || pgrep -x mysqld_safe > /dev/null; then
    echo "✅ MySQL process is running"
else
    echo "❌ MySQL is not running"
    echo ""
    echo "Starting MySQL..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start mysql || mysql.server start
        sleep 3
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo systemctl start mysql || sudo service mysql start
        sleep 3
    fi
fi

echo ""

# Try different connection methods
echo "2. Testing connection methods..."
echo ""

# Method 1: No password (if configured)
echo "Method 1: Trying without password..."
if mysql -u root -e "SELECT 1;" 2>/dev/null; then
    echo "✅ Success! MySQL allows root access without password"
    echo "   You can run: mysql -u root < db/mysql/schema.sql"
    exit 0
fi

# Method 2: Check for socket authentication
echo "Method 2: Checking socket authentication..."
if mysql -u root --socket=/tmp/mysql.sock -e "SELECT 1;" 2>/dev/null; then
    echo "✅ Success with socket authentication"
    echo "   You can run: mysql -u root --socket=/tmp/mysql.sock < db/mysql/schema.sql"
    exit 0
fi

# Method 3: Check for different socket location
echo "Method 3: Trying common socket locations..."
for socket in /tmp/mysql.sock /var/run/mysqld/mysqld.sock /usr/local/var/mysql/mysql.sock; do
    if [ -S "$socket" ]; then
        echo "   Found socket at: $socket"
        if mysql -u root --socket="$socket" -e "SELECT 1;" 2>/dev/null; then
            echo "✅ Success with socket: $socket"
            echo "   You can run: mysql -u root --socket=$socket < db/mysql/schema.sql"
            exit 0
        fi
    fi
done

echo ""
echo "⚠️  Could not connect without password"
echo ""
echo "📝 Solutions:"
echo ""
echo "Option 1: Reset MySQL root password"
echo "  1. Stop MySQL: brew services stop mysql (macOS) or sudo systemctl stop mysql (Linux)"
echo "  2. Start MySQL in safe mode: mysqld_safe --skip-grant-tables &"
echo "  3. Connect: mysql -u root"
echo "  4. Reset password: ALTER USER 'root'@'localhost' IDENTIFIED BY 'newpassword';"
echo "  5. Restart MySQL normally"
echo ""
echo "Option 2: Use MySQL Workbench or phpMyAdmin"
echo "  - Connect using GUI tool"
echo "  - Import db/mysql/schema.sql through the interface"
echo ""
echo "Option 3: Create a new MySQL user"
echo "  mysql -u root -p"
echo "  CREATE USER 'kayak_user'@'localhost' IDENTIFIED BY 'kayak_password';"
echo "  GRANT ALL PRIVILEGES ON *.* TO 'kayak_user'@'localhost';"
echo "  FLUSH PRIVILEGES;"
echo "  Then use: mysql -u kayak_user -p < db/mysql/schema.sql"
echo ""
echo "Option 4: Check your MySQL password"
echo "  - Try common passwords or check your password manager"
echo "  - On macOS with Homebrew: password might be empty or 'root'"
echo ""
echo "Option 5: Use environment variable"
echo "  export MYSQL_PWD=your_password"
echo "  mysql -u root < db/mysql/schema.sql"

