#!/bin/bash
# Restart API Gateway with updated code

echo "🔄 Restarting API Gateway"
echo "========================"
echo ""

# Kill existing process on port 3000
PID=$(lsof -ti :3000)
if [ -n "$PID" ]; then
    echo "🛑 Stopping existing API Gateway (PID: $PID)..."
    kill -9 $PID
    sleep 2
    echo "✅ Stopped"
else
    echo "ℹ️  No existing process found on port 3000"
fi

echo ""
echo "🚀 Starting API Gateway..."
echo ""

cd "$(dirname "$0")/../middleware/services/api-gateway"
node server.js

