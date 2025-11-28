#!/bin/bash
# Step-by-Step Manual Run Script
# Run each step interactively

set -e

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
cd "$PROJECT_ROOT"

echo "🚀 Kayak System - Step-by-Step Manual Run"
echo "=========================================="
echo ""

# Step 1: Database Setup
echo "📊 STEP 1: Setting up Tier 3 (Databases)"
echo "----------------------------------------"
read -p "Press Enter to create MySQL database..."
mysql -u root -p < db/mysql/schema.sql
echo "✅ MySQL schema created"

read -p "Press Enter to create MongoDB collections..."
mongosh < db/mongodb/init.js
mongosh < db/mongodb/create_search_collections_tier2.js
echo "✅ MongoDB collections created"

read -p "Press Enter to run Tier 2 compatibility migration..."
mysql -u root -p < db/mysql/migration_tier2_compatibility.sql
mongosh < db/mongodb/migration_tier2_compatibility.js
echo "✅ Compatibility migration complete"

read -p "Press Enter to load sample data (optional)..."
mysql -u root -p kayak < db/test_sample_data.sql
echo "✅ Sample data loaded"

echo ""
echo "✅ Tier 3 setup complete!"
echo ""

# Step 2: Middleware Setup
echo "🔧 STEP 2: Setting up Tier 2 (Middleware)"
echo "------------------------------------------"

read -p "Press Enter to install middleware dependencies..."
cd middleware
npm install
cd services/api-gateway && npm install && cd ../..
cd services/user-service && npm install && cd ../..
cd services/search-service && npm install && cd ../..
cd services/booking-service && npm install && cd ../..
cd "$PROJECT_ROOT"
echo "✅ Middleware dependencies installed"

read -p "Press Enter to configure environment (check middleware/.env)..."
if [ ! -f middleware/.env ]; then
    cp middleware/env.example middleware/.env
    echo "⚠️  Created middleware/.env from example. Please edit with your credentials."
    read -p "Press Enter after editing middleware/.env..."
fi
echo "✅ Environment configured"

echo ""
echo "📝 Now start each service in separate terminals:"
echo ""
echo "Terminal 1 - API Gateway:"
echo "  cd middleware/services/api-gateway && node server.js"
echo ""
echo "Terminal 2 - User Service:"
echo "  cd middleware/services/user-service && node server.js"
echo ""
echo "Terminal 3 - Search Service:"
echo "  cd middleware/services/search-service && node server.js"
echo ""
echo "Terminal 4 - Booking Service:"
echo "  cd middleware/services/booking-service && node server.js"
echo ""

read -p "Press Enter after starting all middleware services..."

# Step 3: Frontend Setup
echo ""
echo "🎨 STEP 3: Setting up Tier 1 (Frontend)"
echo "---------------------------------------"

read -p "Press Enter to install frontend dependencies..."
cd frontend
npm install
cd "$PROJECT_ROOT"
echo "✅ Frontend dependencies installed"

echo ""
echo "📝 Start frontend in a new terminal:"
echo "  cd frontend && npm start"
echo ""

read -p "Press Enter after starting frontend..."

# Step 4: AI Service Setup
echo ""
echo "🤖 STEP 4: Setting up AI Service"
echo "---------------------------------"

read -p "Press Enter to setup Python virtual environment..."
cd ai
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
cd "$PROJECT_ROOT"
echo "✅ AI service dependencies installed"

if [ ! -f ai/.env ]; then
    cp ai/.env.example ai/.env
    echo "⚠️  Created ai/.env from example. Please edit with your API keys."
    read -p "Press Enter after editing ai/.env..."
fi

echo ""
echo "📝 Start AI service in a new terminal:"
echo "  cd ai && source venv/bin/activate && python main.py"
echo ""

read -p "Press Enter after starting AI service..."

# Step 5: Verification
echo ""
echo "✅ STEP 5: Verification"
echo "-----------------------"

echo "Testing endpoints..."
sleep 2

echo -n "API Gateway: "
curl -s http://localhost:3000/health > /dev/null && echo "✅" || echo "❌"

echo -n "User Service: "
curl -s http://localhost:3000/api/v1/users/health > /dev/null && echo "✅" || echo "❌"

echo -n "Search Service: "
curl -s http://localhost:3000/api/v1/search/health > /dev/null && echo "✅" || echo "❌"

echo -n "Booking Service: "
curl -s http://localhost:3000/api/v1/bookings/health > /dev/null && echo "✅" || echo "❌"

echo -n "AI Service: "
curl -s http://localhost:8000/health > /dev/null && echo "✅" || echo "❌"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📝 Access points:"
echo "   - Frontend: http://localhost:3000"
echo "   - API Gateway: http://localhost:3000"
echo "   - AI Service: http://localhost:8000"
echo "   - AI Docs: http://localhost:8000/docs"

