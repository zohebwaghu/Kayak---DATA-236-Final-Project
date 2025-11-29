# Verified Working Commands

These commands have been tested and verified to work.

## ✅ Tier 3: Database Setup (VERIFIED)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"

# MySQL - No password needed (Homebrew)
mysql -u root < db/mysql/schema.sql
mysql -u root < db/mysql/migration_tier2_compatibility.sql

# MongoDB
mongosh < db/mongodb/init.js
mongosh < db/mongodb/create_search_collections_tier2.js
mongosh < db/mongodb/migration_tier2_compatibility.js

# Verify
mysql -u root kayak -e "SHOW TABLES;"  # Should show 16 tables
mongosh kayak_doc --eval "db.getCollectionNames()"  # Should show 9 collections
```

## ✅ Tier 2: Middleware Services (VERIFIED)

**Important**: All services must be run from their service directory, NOT from middleware root.

### Terminal 1: API Gateway
```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/api-gateway"
npm install
node server.js
```
**Expected**: `✅ API Gateway listening on port 3000`

### Terminal 2: User Service
```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/user-service"
npm install
node server.js
```
**Expected**: `✅ User Service listening on port 3001`

### Terminal 3: Search Service
```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/search-service"
npm install
node server.js
```
**Expected**: `✅ Search Service listening on port 3003`

### Terminal 4: Booking Service
```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/booking-service"
npm install
node server.js
```
**Expected**: `✅ Booking Service listening on port 3004`

## ✅ Tier 1: Frontend (VERIFIED)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/frontend"
npm install
npm start
```

## ✅ AI Service (VERIFIED)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/ai"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## ✅ Quick Verification

After starting all services, run:

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/users/health
curl http://localhost:3000/api/v1/search/health
curl http://localhost:3000/api/v1/bookings/health
curl http://localhost:8000/health
```

All should return JSON with `"status":"UP"` or similar.

## 🔧 Fixed Issues

1. ✅ MySQL connection - Use `mysql -u root` (no `-p` flag for Homebrew)
2. ✅ API Gateway module path - Fixed `./shared/` to `../../shared/`

## ⚠️ Common Issues & Solutions

### Issue: "Cannot find module './shared/errorHandler'"
**Solution**: Already fixed. All services now use `../../shared/` path.

### Issue: "Port already in use"
**Solution**: 
```bash
lsof -i :3000  # Find process
kill -9 <PID>  # Kill process
```

### Issue: "Module not found" in services
**Solution**: Make sure you're in the service directory when running `node server.js`
- ✅ Correct: `cd middleware/services/api-gateway && node server.js`
- ❌ Wrong: `cd middleware && node services/api-gateway/server.js`

