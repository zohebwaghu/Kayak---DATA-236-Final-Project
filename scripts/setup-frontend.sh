#!/bin/bash
# Setup Frontend Dependencies
# Installs all React dependencies

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT/frontend"

echo "📦 Setting up Frontend Dependencies"
echo "===================================="
echo ""

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (this may take a few minutes)..."
    npm install
    echo ""
    echo "✅ Dependencies installed"
else
    echo "✅ node_modules directory exists"
    echo "Checking if react-scripts is installed..."
    
    if [ -f "node_modules/.bin/react-scripts" ]; then
        echo "✅ react-scripts is installed"
    else
        echo "⚠️  react-scripts not found, reinstalling..."
        npm install
    fi
fi

echo ""
echo "🔍 Verifying installation..."

if [ -f "node_modules/.bin/react-scripts" ]; then
    echo "✅ react-scripts found"
    echo "✅ Frontend ready to start"
    echo ""
    echo "📝 To start frontend:"
    echo "   cd frontend"
    echo "   npm start"
else
    echo "❌ react-scripts still not found"
    echo "   Try: cd frontend && rm -rf node_modules package-lock.json && npm install"
    exit 1
fi

