# Fix "Failed to fetch flights" Error

## Problem
Frontend shows: "Failed to fetch flights. Please try again."
API returns: 500 Internal Server Error

## Root Cause
The Search Service was returning 500 errors because:
1. The `db` variable might be undefined when requests arrive (async connection issue)
2. Sample data was missing from MongoDB collections

## Fixes Applied

### 1. Added Database Connection Checks
Added checks in all search handlers to ensure `db` is connected before processing requests:
- `handleFlightsSearch`
- `handleHotelsSearch`  
- `handleCarsSearch`

### 2. Inserted Sample Data
Created and ran `db/mongodb/insert_sample_search_data.js`:
- 5 sample flights (SFO→JFK, LAX→JFK, SFO→LAX)
- 2 sample hotels (San Francisco, New York)
- 3 sample cars (San Francisco, New York)

### 3. Improved Error Logging
Added detailed error logging to help diagnose issues.

## Solution Steps

### Step 1: Restart Search Service
The Search Service needs to be restarted to apply the fixes:

```bash
# Kill existing service
lsof -ti :3003 | xargs kill -9

# Start in new terminal
cd middleware/services/search-service
node server.js
```

Wait 5-10 seconds for MongoDB connection to establish.

### Step 2: Verify Data Exists
```bash
mongosh kayak_doc --eval "db.flights.countDocuments()"
# Should return: 5

mongosh kayak_doc --eval "db.hotels.countDocuments()"
# Should return: 2

mongosh kayak_doc --eval "db.cars.countDocuments()"
# Should return: 3
```

### Step 3: Test Search Endpoint
```bash
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=JFK&page=1&limit=10"
```

Should return JSON with flight data instead of 500 error.

### Step 4: Test in Frontend
1. Open http://localhost:3002
2. Search for flights: SFO → JFK
3. Should see flight results instead of error message

## Expected Response

```json
{
  "data": [
    {
      "flightId": "FLT001",
      "origin": "SFO",
      "destination": "JFK",
      "airline": "American Airlines",
      "price": 350.00,
      ...
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

## Troubleshooting

### Still Getting 500 Error?
1. Check Search Service logs for detailed error messages
2. Verify MongoDB is running: `mongosh --eval "db.adminCommand('ping')"`
3. Verify Redis is running: `redis-cli ping`
4. Check Search Service health: `curl http://localhost:3003/health`

### Database Not Connected?
The service now returns 503 if database isn't ready. Wait a few seconds and try again.

### No Results?
- Verify sample data exists: `mongosh kayak_doc --eval "db.flights.find().pretty()"`
- Check search parameters match data (e.g., origin/destination codes)

