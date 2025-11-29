# Middleware Services

This directory contains the Tier 2 middleware microservices.

## Structure

```
middleware/
├── services/
│   ├── api-gateway/      # API Gateway (port 3000)
│   ├── user-service/     # User Service (port 3001)
│   ├── search-service/   # Search Service (port 3003)
│   └── booking-service/  # Booking Service (port 3004)
├── shared/               # Shared modules (kafka.js, errorHandler.js, etc.)
├── .env                  # Environment variables
└── package.json          # Root dependencies
```

## Quick Start

### 1. Install Dependencies

**IMPORTANT**: Install root dependencies first (required for shared modules):

```bash
cd middleware
npm install
```

Then install service-specific dependencies:

```bash
cd services/api-gateway && npm install && cd ../..
cd services/user-service && npm install && cd ../..
cd services/search-service && npm install && cd ../..
cd services/booking-service && npm install && cd ../..
```

Or use the automated script:
```bash
./scripts/setup-middleware-deps.sh
```

### 2. Configure Environment

Copy and edit `.env` file:

```bash
cp env.example .env
# Edit .env with your database credentials
```

Or use the setup script:
```bash
./scripts/setup-env-file.sh
```

**IMPORTANT**: The `.env` file must be in each service directory for `dotenv` to load it correctly.

### 3. Start Services

Each service must be started from its own directory:

**Terminal 1 - API Gateway:**
```bash
cd services/api-gateway
node server.js
```

**Terminal 2 - User Service:**
```bash
cd services/user-service
node server.js
```

**Terminal 3 - Search Service:**
```bash
cd services/search-service
node server.js
```

**Terminal 4 - Booking Service:**
```bash
cd services/booking-service
node server.js
```

### Using npm scripts (from middleware root):

```bash
npm run start:gateway
npm run start:user
npm run start:search
npm run start:booking
```

## Common Errors

### Error: "Cannot find module 'kafkajs'"
**Solution**: Install root dependencies first: `cd middleware && npm install`

### Error: "Cannot find module './shared/errorHandler'"
**Solution**: Use `../../shared/errorHandler` (already fixed in code)

### Error: "Access denied for user 'root'@'localhost'"
**Solution**: 
1. Create `.env` file in each service directory with `MYSQL_PASSWORD=` (empty)
2. Or update default password in code to empty string

### Error: "Cannot find module '/path/to/middleware/service.js'"
**Solution**: There is no `service.js` in middleware root. Start services from their directories:
- `cd services/api-gateway && node server.js`
- NOT: `cd middleware && node service.js`

## Service Ports

- API Gateway: 3000
- User Service: 3001
- Search Service: 3003
- Booking Service: 3004

## Health Checks

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/users/health
curl http://localhost:3000/api/v1/search/health
curl http://localhost:3000/api/v1/bookings/health
```

