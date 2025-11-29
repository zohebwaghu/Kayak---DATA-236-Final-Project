#!/bin/bash
# Fix AI Service Dependencies
# Installs dependencies with workarounds for Python 3.14 compatibility

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT/ai"

echo "🔧 Fixing AI Service Dependencies"
echo "=================================="
echo ""

# Activate virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "Upgrading pip, setuptools, wheel..."
pip install --upgrade pip setuptools wheel

echo ""
echo "Installing core dependencies first..."
pip install httpx fastapi uvicorn websockets python-dotenv redis kafka-python

echo ""
echo "Installing pydantic with workaround..."
pip install pydantic==2.5.3 --no-build-isolation || pip install pydantic

echo ""
echo "Installing remaining dependencies (skipping problematic ones)..."
pip install langchain langchain-openai langchain-community openai ollama pandas numpy loguru python-dateutil pytest pytest-asyncio pytest-cov 2>&1 | grep -E "(Successfully|ERROR)" | tail -10

echo ""
echo "✅ Dependencies installation complete!"
echo ""
echo "📝 Test installation:"
echo "   source venv/bin/activate"
echo "   python3 -c 'import httpx, fastapi; print(\"✅ Core deps OK\")'"
echo ""
echo "📝 Start service:"
echo "   source venv/bin/activate"
echo "   python3 main.py"

