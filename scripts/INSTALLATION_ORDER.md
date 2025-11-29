# Installation Order - Critical!

## ⚠️ IMPORTANT: Install Dependencies in This Order

The middleware services share modules from `middleware/shared/` which require dependencies to be installed at the **middleware root** first.

### Step 1: Install Middleware Root Dependencies (REQUIRED FIRST)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware"
npm install
```

**Why?** The shared modules (`shared/kafka.js`, `shared/db-adapter.js`, etc.) require:
- `kafkajs` - for Kafka messaging
- `mysql2` - for MySQL database
- `mongodb` - for MongoDB database
- `redis` - for caching
- Other shared dependencies

These must be installed at the middleware root so all services can access them.

### Step 2: Install Service-Specific Dependencies

After root dependencies are installed, install each service's dependencies:

```bash
# API Gateway
cd middleware/services/api-gateway
npm install

# User Service
cd middleware/services/user-service
npm install

# Search Service
cd middleware/services/search-service
npm install

# Booking Service
cd middleware/services/booking-service
npm install
```

### Quick Setup Script

Or use the automated script:

```bash
./scripts/setup-middleware-deps.sh
```

This script installs all dependencies in the correct order.

## Common Error

If you see:
```
Error: Cannot find module 'kafkajs'
```

**Solution**: Run `npm install` in the `middleware/` directory first, then in each service directory.

## Verification

After installation, verify:

```bash
# Check kafkajs is installed
ls middleware/node_modules/kafkajs

# Test that shared modules work
cd middleware/services/user-service
node -e "const { createKafkaClient } = require('../../shared/kafka'); console.log('✅ Works!');"
```

If you see `✅ Works!`, you're ready to start the services!

