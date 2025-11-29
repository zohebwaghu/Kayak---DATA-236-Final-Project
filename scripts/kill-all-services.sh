#!/bin/bash
# Kill All Services on Their Ports
# Kills processes running on ports 3000, 3001, 3003, 3004, 8000

echo "🛑 Killing All Services"
echo "======================"
echo ""

PORTS=(3000 3001 3003 3004 8000)
SERVICES=("API Gateway" "User Service" "Search Service" "Booking Service" "AI Service")

for i in "${!PORTS[@]}"; do
    PORT=${PORTS[$i]}
    SERVICE=${SERVICES[$i]}
    
    echo -n "Killing $SERVICE on port $PORT... "
    
    # Find and kill process on port
    PID=$(lsof -ti :$PORT 2>/dev/null)
    
    if [ -n "$PID" ]; then
        kill -9 $PID 2>/dev/null
        echo "✅ Killed (PID: $PID)"
    else
        echo "ℹ️  No process found"
    fi
done

echo ""
echo "✅ All services stopped"
echo ""

# Also kill any node processes that might be running the services
echo "Checking for remaining Node.js processes..."
NODE_PIDS=$(pgrep -f "node.*server.js" 2>/dev/null)

if [ -n "$NODE_PIDS" ]; then
    echo "Found Node.js server processes: $NODE_PIDS"
    read -p "Kill these Node.js processes? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pkill -f "node.*server.js"
        echo "✅ Killed Node.js server processes"
    fi
else
    echo "✅ No Node.js server processes found"
fi

echo ""
echo "🔍 Verifying ports are free..."

for PORT in "${PORTS[@]}"; do
    PID=$(lsof -ti :$PORT 2>/dev/null)
    if [ -z "$PID" ]; then
        echo "✅ Port $PORT is free"
    else
        echo "⚠️  Port $PORT still in use (PID: $PID)"
    fi
done

echo ""
echo "✅ Done! You can now start services again."

