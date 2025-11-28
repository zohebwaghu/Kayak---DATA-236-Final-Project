# Manual Project Run Guide - Step by Step

This guide walks you through running the entire 3-tier system manually and testing all functionalities.

---

## Prerequisites Check

### Required Services
- ✅ MySQL 8.0+ (running on port 3306)
- ✅ MongoDB 6+ (running on port 27017)
- ✅ Redis (running on port 6379)
- ✅ Kafka (running on port 9092)
- ✅ Node.js 18+ (for middleware and frontend)
- ✅ Python 3.9+ (for AI service)

### Verify Prerequisites
```bash
# Check MySQL
mysql --version
mysql -u root -p -e "SELECT VERSION();"

# Check MongoDB
mongosh --version
mongosh --eval "db.adminCommand('ping')"

# Check Redis
redis-cli ping
# Should return: PONG

# Check Kafka (if using Docker)
docker ps | grep kafka

# Check Node.js
node --version
npm --version

# Check Python
python3 --version
```

---

## Step 1: Setup Tier 3 (Database Layer)

### 1.1 Create MySQL Database

```bash
cd /Users/zohebw/Desktop/DATA\ 236/Project/Kayak---DATA-236-Final-Project

# Create main database
mysql -u root -p < db/mysql/schema.sql

# Verify tables created
mysql -u root -p kayak -e "SHOW TABLES;"

# Expected output: 15 tables including users, flights, hotels, cars, bookings, billing, etc.
```

### 1.2 Create MongoDB Collections

```bash
# Create MongoDB schema
mongosh < db/mongodb/init.js

# Create search collections for Tier 2
mongosh < db/mongodb/create_search_collections_tier2.js

# Verify collections
mongosh kayak_doc --eval "db.getCollectionNames()"

# Expected: reviews, images, logs, analytics_aggregates, deal_events, watches, hotels, flights, cars
```

### 1.3 Run Tier 2 Compatibility Migration (Optional but Recommended)

```bash
# MySQL compatibility
mysql -u root -p < db/mysql/migration_tier2_compatibility.sql

# MongoDB compatibility
mongosh < db/mongodb/migration_tier2_compatibility.js

# Verify separate databases created
mysql -u root -p -e "SHOW DATABASES LIKE 'kayak%';"
# Should show: kayak, kayak_users, kayak_bookings, kayak_billing
```

### 1.4 Load Sample Data (Optional)

```bash
# Load sample data for testing
mysql -u root -p kayak < db/test_sample_data.sql

# Verify data loaded
mysql -u root -p kayak -e "SELECT COUNT(*) as users FROM users; SELECT COUNT(*) as flights FROM flights; SELECT COUNT(*) as hotels FROM hotels;"
```

### 1.5 Verification Commands

```bash
# MySQL verification
mysql -u root -p kayak <<EOF
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'Flights', COUNT(*) FROM flights
UNION ALL SELECT 'Hotels', COUNT(*) FROM hotels
UNION ALL SELECT 'Bookings', COUNT(*) FROM bookings;
EOF

# MongoDB verification
mongosh kayak_doc --eval "
print('Collections:');
db.getCollectionNames().forEach(c => print('  - ' + c));
print('\nIndexes:');
db.hotels.getIndexes().forEach(i => print('  hotels: ' + i.name));
"
```

---

## Step 2: Setup Tier 2 (Middleware Services)

### 2.1 Install Dependencies

```bash
cd middleware

# Install shared dependencies
npm install

# Install service-specific dependencies
cd services/api-gateway && npm install && cd ../..
cd services/user-service && npm install && cd ../..
cd services/search-service && npm install && cd ../..
cd services/booking-service && npm install && cd ../..
```

### 2.2 Configure Environment Variables

```bash
cd middleware

# Copy example env file
cp env.example .env

# Edit .env file with your database credentials
# Required variables:
# - MYSQL_HOST=localhost
# - MYSQL_USER=root
# - MYSQL_PASSWORD=your_password
# - MYSQL_DB_USERS=kayak_users
# - MYSQL_DB_BOOKINGS=kayak_bookings
# - MYSQL_DB_BILLING=kayak_billing
# - MONGO_URI=mongodb://localhost:27017
# - MONGO_DB_SEARCH=kayak_doc
# - REDIS_HOST=localhost
# - REDIS_PORT=6379
# - KAFKA_BROKER=localhost:9092
# - JWT_SECRET=your_secret_key
```

### 2.3 Start Services (Terminal 1: API Gateway)

```bash
cd middleware/services/api-gateway

# Start API Gateway (port 3000)
node server.js

# Expected output:
# ✅ API Gateway listening on port 3000
# ✅ Connected to Kafka
```

### 2.4 Start Services (Terminal 2: User Service)

```bash
cd middleware/services/user-service

# Start User Service (port 3001)
node server.js

# Expected output:
# ✅ User Service listening on port 3001
# ✅ MySQL users database connected: kayak_users
# ✅ Kafka producer connected
```

### 2.5 Start Services (Terminal 3: Search Service)

```bash
cd middleware/services/search-service

# Start Search Service (port 3003)
node server.js

# Expected output:
# ✅ Search Service listening on port 3003
# ✅ Redis connected
# ✅ MongoDB connected to: kayak_doc
# ✅ Kafka consumer connected
```

### 2.6 Start Services (Terminal 4: Booking Service)

```bash
cd middleware/services/booking-service

# Start Booking Service (port 3004)
node server.js

# Expected output:
# ✅ Booking Service listening on port 3004
# ✅ MySQL users database connected: kayak_users
# ✅ MySQL bookings database connected: kayak_bookings
# ✅ Kafka producer connected
```

### 2.7 Verification - Test Middleware Endpoints

```bash
# Test API Gateway health
curl http://localhost:3000/health

# Test User Service (through gateway)
curl http://localhost:3000/api/v1/users/health

# Test Search Service
curl http://localhost:3000/api/v1/search/health

# Test Booking Service
curl http://localhost:3000/api/v1/bookings/health
```

---

## Step 3: Setup Tier 1 (Frontend)

### 3.1 Install Dependencies

```bash
cd frontend

# Install React dependencies
npm install

# This will install:
# - react, react-dom
# - react-router-dom
# - axios
# - redux toolkit
# - etc.
```

### 3.2 Configure API Endpoint

```bash
# Check frontend/src/api/axios.js
# Should point to: http://localhost:3000/api/v1
# (API Gateway endpoint)
```

### 3.3 Start Frontend Development Server

```bash
cd frontend

# Start React app (port 3000 - may conflict with API Gateway)
# If conflict, React will suggest port 3001
npm start

# Expected output:
# Compiled successfully!
# You can now view frontend in the browser.
# Local: http://localhost:3000
```

### 3.4 Access Frontend

Open browser: `http://localhost:3000`

---

## Step 4: Setup AI Service (FastAPI)

### 4.1 Install Python Dependencies

```bash
cd ai

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# OR
venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt
```

### 4.2 Configure AI Service

```bash
cd ai

# Copy example env
cp .env.example .env

# Edit .env with:
# - OPENAI_API_KEY=your_key
# - REDIS_HOST=localhost
# - REDIS_PORT=6379
# - KAFKA_BROKER=localhost:9092
# - MONGO_URI=mongodb://localhost:27017
```

### 4.3 Start AI Service

```bash
cd ai

# Activate virtual environment if not already
source venv/bin/activate

# Start FastAPI server
python main.py

# OR using uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Expected output:
# INFO:     Uvicorn running on http://0.0.0.0:8000
# INFO:     Application startup complete.
```

### 4.4 Verify AI Service

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test API docs
# Open browser: http://localhost:8000/docs
```

---

## Step 5: Functional Testing

### 5.1 Test User Registration

```bash
# Register a new user
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "111-22-3333",
    "firstName": "Test",
    "lastName": "User",
    "email": "test@example.com",
    "password": "Test123!",
    "phone": "408-555-1234",
    "address": {
      "street": "123 Test St",
      "city": "San Jose",
      "state": "CA",
      "zipCode": "95123"
    }
  }'

# Expected: 201 Created with user data and JWT token
```

### 5.2 Test User Login

```bash
# Login
curl -X POST http://localhost:3000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Expected: 200 OK with JWT token
# Save the token for subsequent requests
```

### 5.3 Test Search Functionality

```bash
# Search hotels
curl "http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&minStarRating=4&page=1&limit=10"

# Search flights
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=LAX&departureDate=2025-12-01&page=1&limit=10"

# Search cars
curl "http://localhost:3000/api/v1/search/cars?location=San%20Francisco&carType=SUV&page=1&limit=10"
```

### 5.4 Test Booking Flow

```bash
# Set your JWT token from login
export JWT_TOKEN="your_jwt_token_here"

# Create a booking
curl -X POST http://localhost:3000/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "listingType": "hotel",
    "listingId": "HTL001",
    "startDate": "2025-12-01",
    "endDate": "2025-12-03",
    "guests": 2,
    "totalPrice": 300.00
  }'

# Expected: 201 Created with booking details
```

### 5.5 Test Payment

```bash
# Create billing record
curl -X POST http://localhost:3000/api/v1/billing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "bookingId": "booking_id_from_previous_step",
    "totalAmountPaid": 300.00,
    "paymentMethod": "card",
    "transactionStatus": "succeeded"
  }'
```

### 5.6 Test Admin Functions

```bash
# Login as admin (use admin credentials from sample data)
# Then test admin endpoints
curl -X GET http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $ADMIN_JWT_TOKEN"

# Add a listing (admin only)
curl -X POST http://localhost:3000/api/v1/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_JWT_TOKEN" \
  -d '{
    "listingType": "hotel",
    "name": "New Hotel",
    "city": "San Francisco",
    "state": "CA",
    "starRating": 4,
    "pricePerNight": 200.00
  }'
```

---

## Step 6: Test AI Service

### 6.1 Test Deals Agent

```bash
# Check if deals agent is processing Kafka messages
# Monitor Kafka topics
# (Requires Kafka tools or admin UI)

# Test deal scoring endpoint
curl http://localhost:8000/api/v1/deals/score \
  -H "Content-Type: application/json" \
  -d '{
    "dealType": "hotel",
    "price": 150.00,
    "averagePrice": 200.00,
    "availableRooms": 3
  }'
```

### 6.2 Test Concierge Agent

```bash
# Test chat endpoint
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need a weekend trip to San Francisco, budget $500 for two people",
    "userId": "111-22-3333"
  }'

# Test WebSocket connection
# Use a WebSocket client or browser console:
# const ws = new WebSocket('ws://localhost:8000/ws');
# ws.onmessage = (event) => console.log(event.data);
```

---

## Step 7: Integration Testing

### 7.1 End-to-End User Flow

```bash
# 1. Register user
# 2. Login
# 3. Search for hotels
# 4. Select a hotel
# 5. Create booking
# 6. Make payment
# 7. View booking history

# Use the curl commands from Step 5 in sequence
```

### 7.2 Frontend Integration

1. Open `http://localhost:3000` in browser
2. Click "Sign Up" and create account
3. Search for flights/hotels/cars
4. Apply filters
5. Book a listing
6. Complete payment
7. View "My Bookings"

### 7.3 Check for Errors

```bash
# Monitor service logs for errors
# Check:
# - Database connection errors
# - Kafka connection errors
# - Redis connection errors
# - API endpoint errors
# - CORS errors (frontend to backend)
```

---

## Troubleshooting Common Issues

### Issue: Port Already in Use

```bash
# Find process using port
lsof -i :3000  # For port 3000
lsof -i :3001  # For port 3001
# etc.

# Kill process
kill -9 <PID>
```

### Issue: Database Connection Failed

```bash
# Check MySQL is running
mysql -u root -p -e "SELECT 1;"

# Check MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Verify credentials in .env files
```

### Issue: Kafka Connection Failed

```bash
# Check Kafka is running
# If using Docker:
docker ps | grep kafka

# If using local installation:
# Check Kafka broker is running on port 9092
```

### Issue: CORS Errors in Frontend

```bash
# Verify API Gateway CORS settings
# Check middleware/services/api-gateway/server.js
# Should allow origin: http://localhost:3000 (or your frontend port)
```

### Issue: JWT Token Invalid

```bash
# Verify JWT_SECRET is same across all services
# Check middleware/.env file
# Token expires after set time - login again to get new token
```

---

## Quick Start Script

Create a script to start all services:

```bash
#!/bin/bash
# save as: start-all.sh

echo "Starting Kayak System..."

# Terminal 1: API Gateway
gnome-terminal -- bash -c "cd middleware/services/api-gateway && node server.js; exec bash"

# Terminal 2: User Service
gnome-terminal -- bash -c "cd middleware/services/user-service && node server.js; exec bash"

# Terminal 3: Search Service
gnome-terminal -- bash -c "cd middleware/services/search-service && node server.js; exec bash"

# Terminal 4: Booking Service
gnome-terminal -- bash -c "cd middleware/services/booking-service && node server.js; exec bash"

# Terminal 5: AI Service
gnome-terminal -- bash -c "cd ai && source venv/bin/activate && python main.py; exec bash"

# Terminal 6: Frontend
gnome-terminal -- bash -c "cd frontend && npm start; exec bash"

echo "All services starting in separate terminals..."
echo "Wait 10-15 seconds for services to initialize"
```

---

## Verification Checklist

After starting all services, verify:

- [ ] MySQL database `kayak` has 15 tables
- [ ] MongoDB database `kayak_doc` has 9 collections
- [ ] API Gateway responds on port 3000
- [ ] User Service responds on port 3001
- [ ] Search Service responds on port 3003
- [ ] Booking Service responds on port 3004
- [ ] AI Service responds on port 8000
- [ ] Frontend loads on port 3000 (or 3001 if conflict)
- [ ] Can register a new user
- [ ] Can login and get JWT token
- [ ] Can search for listings
- [ ] Can create a booking
- [ ] Can make payment
- [ ] Can view bookings

---

## Next Steps

Once all services are running:
1. Test each functionality through frontend UI
2. Monitor service logs for errors
3. Check database for data persistence
4. Verify Kafka messages are being produced/consumed
5. Test error scenarios (invalid inputs, network failures)

