# Fix Bundle Builder and Search Service Issues

## Issues Found

1. **Bundle Builder not available** - Import error with config
2. **Search Service 500 error** - Flights endpoint failing

## Fixes Applied

### 1. Bundle Builder Fix ✅

**Problem:** `BundleBuilder` couldn't import `config.settings`

**Solution:** Updated `ai/agents/bundle_builder.py` and `ai/agents/deal_scorer.py` to:
- Try importing config first
- Fallback to environment variables if config not available
- Use `MONGO_URI` and `MONGO_DB_SEARCH` from env vars

**Files Updated:**
- `ai/agents/bundle_builder.py`
- `ai/agents/deal_scorer.py`

### 2. Search Service Issue 🔍

**Problem:** Flights endpoint returns 500 Internal Server Error

**Status:**
- ✅ Search service is running (port 3003)
- ✅ Health check passes
- ❌ Flights endpoint fails

**Possible Causes:**
1. MongoDB query error
2. Missing flight data
3. Date parsing issue
4. Database connection issue

## Next Steps

### Step 1: Restart AI Service

```bash
cd ai
source venv/bin/activate
python3 main.py
```

Check for:
- "✓ Bundle Builder loaded" message
- No import errors

### Step 2: Check Search Service Logs

Look at the terminal where search service is running for:
- Error messages
- Stack traces
- Database connection issues

### Step 3: Verify Data

```bash
# Check flights in MongoDB
mongosh kayak_doc --eval "db.flights.countDocuments()"

# Check hotels
mongosh kayak_doc --eval "db.hotels.countDocuments()"
```

### Step 4: Test Endpoints

```bash
# Test Bundle Builder (after restarting AI service)
curl -X POST http://localhost:8000/api/v1/bundles \
  -H 'Content-Type: application/json' \
  -d '{"origin": "SFO", "destination": "JFK", "startDate": "2026-01-23", "endDate": "2026-01-30"}'

# Test Search Service directly
curl "http://localhost:3003/flights?origin=SFO&destination=JFK&page=1&limit=5"

# Test through API Gateway
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=JFK&page=1&limit=5"
```

## Expected Results

### Bundle Builder
- Should return: `{"success": true, "bundles": [...], "count": N}`
- Should NOT return: `{"detail": "Bundle Builder not available"}`

### Search Service
- Should return: `{"data": [...], "pagination": {...}}`
- Should NOT return: `{"status": 500, "error": "Internal Server Error"}`

## Troubleshooting

### If Bundle Builder still not available:
1. Check AI service logs for import errors
2. Verify `ai/config.py` exists
3. Check Python path in `ai/main.py`

### If Search Service still returns 500:
1. Check search service terminal for error details
2. Verify MongoDB connection: `mongosh kayak_doc --eval "db.adminCommand('ping')"`
3. Check if flights collection has data
4. Try restarting search service

