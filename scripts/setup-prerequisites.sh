#!/bin/bash
# Setup Prerequisites Script
# Checks and sets up required services

set -e

echo "🔧 Setting up Kayak System Prerequisites"
echo ""

# Check and setup MySQL
echo "📊 Checking MySQL..."
if command -v mysql &> /dev/null; then
    echo "✅ MySQL installed: $(mysql --version)"
    
    # Check if MySQL is running
    if mysql -u root -p -e "SELECT 1;" &>/dev/null 2>&1; then
        echo "✅ MySQL is running"
    else
        echo "⚠️  MySQL is not running. Starting MySQL..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew services start mysql || mysql.server start
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo systemctl start mysql || sudo service mysql start
        fi
        sleep 3
    fi
else
    echo "❌ MySQL not found. Please install MySQL 8.0+"
    exit 1
fi

# Check and setup MongoDB
echo ""
echo "📊 Checking MongoDB..."
if command -v mongosh &> /dev/null; then
    echo "✅ MongoDB shell installed: $(mongosh --version | head -1)"
    
    # Check if MongoDB is running
    if mongosh --eval "db.adminCommand('ping')" &>/dev/null 2>&1; then
        echo "✅ MongoDB is running"
    else
        echo "⚠️  MongoDB is not running. Starting MongoDB..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew services start mongodb-community || mongod --fork --logpath /tmp/mongod.log
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo systemctl start mongod || sudo service mongod start
        fi
        sleep 3
    fi
else
    echo "❌ MongoDB not found. Please install MongoDB 6+"
    exit 1
fi

# Check and setup Redis
echo ""
echo "📊 Checking Redis..."
if command -v redis-cli &> /dev/null; then
    echo "✅ Redis CLI installed"
    
    # Check if Redis is running
    if redis-cli ping &>/dev/null 2>&1; then
        echo "✅ Redis is running"
    else
        echo "⚠️  Redis is not running. Starting Redis..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew services start redis || redis-server --daemonize yes
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo systemctl start redis || sudo service redis start || redis-server --daemonize yes
        fi
        sleep 2
    fi
else
    echo "❌ Redis not found. Please install Redis"
    exit 1
fi

# Check Kafka
echo ""
echo "📊 Checking Kafka..."
if docker ps | grep -q kafka; then
    echo "✅ Kafka is running (Docker)"
elif command -v kafka-server-start &> /dev/null; then
    echo "✅ Kafka installed (local)"
    # Check if Kafka is running
    if nc -z localhost 9092 2>/dev/null; then
        echo "✅ Kafka broker is running on port 9092"
    else
        echo "⚠️  Kafka is not running. Please start Kafka broker"
    fi
else
    echo "⚠️  Kafka not found. Install Kafka or use Docker:"
    echo "   docker-compose up -d kafka"
fi

# Check Node.js
echo ""
echo "📊 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js installed: $NODE_VERSION"
    
    # Check version (need 18+)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        echo "✅ Node.js version is compatible (18+)"
    else
        echo "⚠️  Node.js version should be 18+. Current: $NODE_VERSION"
    fi
else
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

# Check Python
echo ""
echo "📊 Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python installed: $PYTHON_VERSION"
    
    # Check version (need 3.9+)
    MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
    MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 9 ]; then
        echo "✅ Python version is compatible (3.9+)"
    else
        echo "⚠️  Python version should be 3.9+. Current: $PYTHON_VERSION"
    fi
else
    echo "❌ Python 3 not found. Please install Python 3.9+"
    exit 1
fi

echo ""
echo "✅ Prerequisites check complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Run: ./scripts/setup-databases.sh (if databases not created)"
echo "   2. Run: ./scripts/start-all-services.sh (to start all services)"
echo "   3. Run: ./scripts/test-endpoints.sh (to test endpoints)"

