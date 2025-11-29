#!/bin/bash
# Create a dedicated MySQL user for Kayak project
# This avoids root password issues

echo "🔐 Creating MySQL User for Kayak Project"
echo "========================================="
echo ""

read -p "Enter MySQL root password (or press Enter if no password): " ROOT_PASS

if [ -z "$ROOT_PASS" ]; then
    MYSQL_CMD="mysql -u root"
else
    MYSQL_CMD="mysql -u root -p$ROOT_PASS"
fi

echo ""
echo "Creating user 'kayak_user'..."

$MYSQL_CMD <<EOF
-- Create user if not exists
CREATE USER IF NOT EXISTS 'kayak_user'@'localhost' IDENTIFIED BY 'kayak_password123';

-- Grant all privileges
GRANT ALL PRIVILEGES ON *.* TO 'kayak_user'@'localhost';

-- Grant privileges on all databases
GRANT ALL PRIVILEGES ON kayak.* TO 'kayak_user'@'localhost';
GRANT ALL PRIVILEGES ON kayak_users.* TO 'kayak_user'@'localhost';
GRANT ALL PRIVILEGES ON kayak_bookings.* TO 'kayak_user'@'localhost';
GRANT ALL PRIVILEGES ON kayak_billing.* TO 'kayak_user'@'localhost';

FLUSH PRIVILEGES;

SELECT 'User kayak_user created successfully!' AS status;
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MySQL user created successfully!"
    echo ""
    echo "📝 Now you can use:"
    echo "   mysql -u kayak_user -pkayak_password123 < db/mysql/schema.sql"
    echo ""
    echo "⚠️  Update middleware/.env with:"
    echo "   MYSQL_USER=kayak_user"
    echo "   MYSQL_PASSWORD=kayak_password123"
else
    echo ""
    echo "❌ Failed to create user. Check MySQL root access."
fi

