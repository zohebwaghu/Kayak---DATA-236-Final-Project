#!/bin/bash
# Restart AI Service with updated Bundle Builder

echo "🔄 Restarting AI Service"
echo "========================"
echo ""

# Kill existing process on port 8000
PID=$(lsof -ti :8000)
if [ -n "$PID" ]; then
    echo "🛑 Stopping existing AI Service (PID: $PID)..."
    kill -9 $PID
    sleep 2
    echo "✅ Stopped"
else
    echo "ℹ️  No existing process found on port 8000"
fi

echo ""
echo "🚀 Starting AI Service..."
echo ""

cd "$(dirname "$0")/../ai"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "⚠️  Virtual environment not found. Creating..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies if needed
echo "📦 Checking dependencies..."
pip install -q -r requirements.txt 2>/dev/null || echo "⚠️  Some dependencies may need manual installation"

echo ""
echo "🚀 Starting AI Service..."
echo ""

python3 main.py

