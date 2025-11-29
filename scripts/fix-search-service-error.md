# Fix "Failed to fetch flights" Error

## Problem
The frontend shows "Failed to fetch flights. Please try again." when searching.

## Root Cause
The Search Service is returning 500 Internal Server Error, indicating:
1. Search Service may not be running
2. Search Service has connection issues (MongoDB/Redis)
3. Search Service has a runtime error

## Diagnosis Steps

### 1. Check if Search Service is Running
```bash
lsof -i :3003
```

If nothing is running, start it:
```bash
cd middleware/services/search-service
node server.js
```

### 2. Check MongoDB Connection
```bash
mongosh kayak_doc --eval "db.flights.countDocuments()"
```

### 3. Check Redis Connection
```bash
redis-cli ping
```

Should return: `PONG`

### 4. Test Search Service Directly
```bash
curl http://localhost:3003/health
```

### 5. Test Through API Gateway
```bash
curl http://localhost:3000/api/v1/search/health
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=JFK&page=1&limit=10"
```

## Common Fixes

### Fix 1: Start Search Service
```bash
cd middleware/services/search-service
node server.js
```

### Fix 2: Check MongoDB Collections
```bash
mongosh kayak_doc --eval "db.getCollectionNames()"
```

Ensure `flights`, `hotels`, `cars` collections exist.

### Fix 3: Check .env Configuration
Verify `middleware/services/search-service/.env` has:
```bash
MONGO_URI=mongodb://localhost:27017
MONGO_DB_SEARCH=kayak_doc
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Fix 4: Restart All Services
```bash
./scripts/kill-all-services.sh
# Then restart all services
```

## Expected Behavior

When working correctly:
- Search Service health: `{"status":"UP"}`
- Flights search: Returns JSON with `{data: [...], pagination: {...}}`
- Frontend: Shows flight results instead of error

