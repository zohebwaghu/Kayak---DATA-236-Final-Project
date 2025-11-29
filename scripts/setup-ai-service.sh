#!/bin/bash
# Setup AI Service
# Creates virtual environment and installs dependencies

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT/ai"

echo "🤖 Setting up AI Service"
echo "========================"
echo ""

# Check Python version
echo "Checking Python..."
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Found: $PYTHON_VERSION"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
    PYTHON_VERSION=$(python --version)
    echo "✅ Found: $PYTHON_VERSION"
else
    echo "❌ Python not found. Please install Python 3.9+"
    exit 1
fi

echo ""

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

echo ""

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "⚠️  requirements.txt not found"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✅ AI Service setup complete!"
echo ""
echo "📝 To start the AI service:"
echo "   cd ai"
echo "   source venv/bin/activate"
echo "   python main.py"
echo ""
echo "   Or use: $PYTHON_CMD main.py (if venv is activated)"

