#!/bin/bash
# Start All Services Script
# This script starts all services in separate terminal windows

set -e

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"

echo "🚀 Starting Kayak System Services..."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check MySQL
if ! mysql -u root -p -e "SELECT 1;" &>/dev/null; then
    echo "⚠️  MySQL not accessible. Please start MySQL first."
    exit 1
fi

# Check MongoDB
if ! mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
    echo "⚠️  MongoDB not accessible. Please start MongoDB first."
    exit 1
fi

# Check Redis
if ! redis-cli ping &>/dev/null; then
    echo "⚠️  Redis not accessible. Please start Redis first."
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Function to start service in new terminal
start_service() {
    local service_name=$1
    local service_path=$2
    local command=$3
    
    echo "Starting $service_name..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_ROOT/$service_path' && $command\""
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        gnome-terminal -- bash -c "cd '$PROJECT_ROOT/$service_path' && $command; exec bash" 2>/dev/null || \
        xterm -e "cd '$PROJECT_ROOT/$service_path' && $command" &
    else
        echo "⚠️  Unsupported OS. Please start services manually."
        return 1
    fi
    
    sleep 2
}

# Start services
start_service "API Gateway" "middleware/services/api-gateway" "node server.js"
start_service "User Service" "middleware/services/user-service" "node server.js"
start_service "Search Service" "middleware/services/search-service" "node server.js"
start_service "Booking Service" "middleware/services/booking-service" "node server.js"
start_service "AI Service" "ai" "source venv/bin/activate && python main.py"
start_service "Frontend" "frontend" "npm start"

echo ""
echo "✅ All services started in separate terminals"
echo ""
echo "⏳ Wait 10-15 seconds for services to initialize"
echo ""
echo "📝 Service URLs:"
echo "   - API Gateway: http://localhost:3000"
echo "   - Frontend: http://localhost:3000 (or 3001 if conflict)"
echo "   - AI Service: http://localhost:8000"
echo "   - AI Docs: http://localhost:8000/docs"
echo ""
echo "🔍 To verify services are running:"
echo "   curl http://localhost:3000/health"
echo "   curl http://localhost:8000/health"

