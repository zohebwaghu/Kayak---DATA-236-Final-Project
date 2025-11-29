#!/bin/bash
# Restart Search Service to apply fixes

echo "🔄 Restarting Search Service"
echo "============================="
echo ""

# Kill existing search service
echo "Stopping Search Service..."
lsof -ti :3003 | xargs kill -9 2>/dev/null
sleep 2

echo "✅ Search Service stopped"
echo ""
echo "📝 Start Search Service in a new terminal:"
echo ""
echo "cd middleware/services/search-service"
echo "node server.js"
echo ""
echo "⏳ Wait 5-10 seconds for MongoDB connection"
echo ""
echo "✅ Then test:"
echo "   curl http://localhost:3000/api/v1/search/flights?origin=SFO&destination=JFK"

