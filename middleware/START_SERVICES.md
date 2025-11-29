# How to Start Middleware Services

## ❌ WRONG Way
```bash
cd middleware
node service.js  # This file doesn't exist!
```

## ✅ CORRECT Way

Each service has its own `server.js` file in its directory.

### Option 1: Start from Service Directory

**Terminal 1:**
```bash
cd middleware/services/api-gateway
node server.js
```

**Terminal 2:**
```bash
cd middleware/services/user-service
node server.js
```

**Terminal 3:**
```bash
cd middleware/services/search-service
node server.js
```

**Terminal 4:**
```bash
cd middleware/services/booking-service
node server.js
```

### Option 2: Use npm Scripts (from middleware root)

```bash
cd middleware
npm run start:gateway    # Starts API Gateway
npm run start:user       # Starts User Service
npm run start:search     # Starts Search Service
npm run start:booking    # Starts Booking Service
```

### Option 3: Use Automated Script

```bash
./scripts/start-all-services.sh
```

## Service Files

- `services/api-gateway/server.js` ✅
- `services/user-service/server.js` ✅
- `services/search-service/server.js` ✅
- `services/booking-service/server.js` ✅
- `middleware/service.js` ❌ (doesn't exist)
