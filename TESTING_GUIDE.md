# Complete Testing Guide - Step by Step

This guide provides all URLs and endpoints to test the entire system from beginning to end.

---

## Prerequisites Check

Before testing, ensure all services are running:

```bash
# Check services are running
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/users/health
curl http://localhost:3000/api/v1/search/health
curl http://localhost:3000/api/v1/bookings/health
curl http://localhost:8000/health
```

---

## Tier 3: Database Testing

### MySQL Database

```bash
# Check databases exist
mysql -u root -e "SHOW DATABASES LIKE 'kayak%';"

# Check tables
mysql -u root kayak -e "SHOW TABLES;"
mysql -u root kayak_users -e "SHOW TABLES;"
mysql -u root kayak_bookings -e "SHOW TABLES;"

# Check data
mysql -u root kayak -e "SELECT COUNT(*) as users FROM users; SELECT COUNT(*) as flights FROM flights;"
```

### MongoDB Database

```bash
# Check collections
mongosh kayak_doc --eval "db.getCollectionNames()"

# Check data
mongosh kayak_doc --eval "db.hotels.countDocuments(); db.flights.countDocuments(); db.cars.countDocuments();"
```

---

## Tier 2: Middleware API Testing

### Base URLs

- **API Gateway**: http://localhost:3000
- **AI Service**: http://localhost:8000
- **AI API Docs**: http://localhost:8000/docs

### 1. Health Checks

**Test in Browser or curl:**

- http://localhost:3000/health
- http://localhost:3000/api/v1/users/health
- http://localhost:3000/api/v1/search/health
- http://localhost:3000/api/v1/bookings/health
- http://localhost:8000/health

**Expected**: JSON response with `"status":"UP"`

---

### 2. User Service Testing

#### 2.1 User Registration

**Endpoint**: `POST http://localhost:3000/api/v1/users/register`

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123-45-6789",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "password": "SecurePass123!",
    "phone": "408-555-1234",
    "address": {
      "street": "123 Main St",
      "city": "San Jose",
      "state": "CA",
      "zipCode": "95123"
    }
  }'
```

**Expected**: `201 Created` with user data and JWT token

**Test in Browser**: Use Postman or browser extension to POST to the endpoint

#### 2.2 User Login

**Endpoint**: `POST http://localhost:3000/api/v1/users/login`

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected**: `200 OK` with JWT token

**Save the token** for authenticated requests:
```bash
export JWT_TOKEN="your_token_here"
```

#### 2.3 Get User Profile

**Endpoint**: `GET http://localhost:3000/api/v1/users/{userId}`

**Test with curl:**
```bash
curl -X GET http://localhost:3000/api/v1/users/123-45-6789 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected**: `200 OK` with user profile data

#### 2.4 Update User Profile

**Endpoint**: `PUT http://localhost:3000/api/v1/users/{userId}`

**Test with curl:**
```bash
curl -X PUT http://localhost:3000/api/v1/users/123-45-6789 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "firstName": "John",
    "lastName": "Smith",
    "phone": "408-555-9999"
  }'
```

---

### 3. Search Service Testing

#### 3.1 Search Hotels

**Endpoint**: `GET http://localhost:3000/api/v1/search/hotels`

**Test in Browser:**
- http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&page=1&limit=10
- http://localhost:3000/api/v1/search/hotels?city=New%20York&minStarRating=4&maxPrice=300&page=1&limit=10

**Test with curl:**
```bash
curl "http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&page=1&limit=10"
```

**Expected**: `200 OK` with array of hotels

#### 3.2 Search Flights

**Endpoint**: `GET http://localhost:3000/api/v1/search/flights`

**Test in Browser:**
- http://localhost:3000/api/v1/search/flights?origin=SFO&destination=LAX&departureDate=2025-12-01&page=1&limit=10
- http://localhost:3000/api/v1/search/flights?origin=JFK&destination=SFO&page=1&limit=10

**Test with curl:**
```bash
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=LAX&departureDate=2025-12-01&page=1&limit=10"
```

#### 3.3 Search Cars

**Endpoint**: `GET http://localhost:3000/api/v1/search/cars`

**Test in Browser:**
- http://localhost:3000/api/v1/search/cars?location=San%20Francisco&carType=SUV&page=1&limit=10
- http://localhost:3000/api/v1/search/cars?location=Los%20Angeles&page=1&limit=10

**Test with curl:**
```bash
curl "http://localhost:3000/api/v1/search/cars?location=San%20Francisco&page=1&limit=10"
```

---

### 4. Booking Service Testing

#### 4.1 Create Booking

**Endpoint**: `POST http://localhost:3000/api/v1/bookings`

**Test with curl:**
```bash
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
```

**Expected**: `201 Created` with booking details

**Save booking ID** for next steps:
```bash
export BOOKING_ID="booking_id_from_response"
```

#### 4.2 Get User Bookings

**Endpoint**: `GET http://localhost:3000/api/v1/bookings/user/{userId}`

**Test with curl:**
```bash
curl -X GET http://localhost:3000/api/v1/bookings/user/123-45-6789 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected**: `200 OK` with array of user's bookings

#### 4.3 Get Booking Details

**Endpoint**: `GET http://localhost:3000/api/v1/bookings/{bookingId}`

**Test with curl:**
```bash
curl -X GET http://localhost:3000/api/v1/bookings/$BOOKING_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

#### 4.4 Cancel Booking

**Endpoint**: `DELETE http://localhost:3000/api/v1/bookings/{bookingId}`

**Test with curl:**
```bash
curl -X DELETE http://localhost:3000/api/v1/bookings/$BOOKING_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 5. Billing Service Testing

#### 5.1 Create Billing Record

**Endpoint**: `POST http://localhost:3000/api/v1/billing`

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/v1/billing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "bookingId": "'$BOOKING_ID'",
    "totalAmountPaid": 300.00,
    "paymentMethod": "card",
    "transactionStatus": "succeeded"
  }'
```

---

### 6. Admin Service Testing

#### 6.1 Get All Users (Admin Only)

**Endpoint**: `GET http://localhost:3000/api/v1/admin/users`

**Test with curl:**
```bash
# First, login as admin (use admin credentials)
curl -X POST http://localhost:3000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@kayak.com",
    "password": "admin_password"
  }'

# Save admin token
export ADMIN_TOKEN="admin_jwt_token"

# Get all users
curl -X GET http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

#### 6.2 Add Listing (Admin Only)

**Endpoint**: `POST http://localhost:3000/api/v1/listings`

**Test with curl:**
```bash
curl -X POST http://localhost:3000/api/v1/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "listingType": "hotel",
    "name": "New Luxury Hotel",
    "city": "San Francisco",
    "state": "CA",
    "starRating": 5,
    "pricePerNight": 250.00
  }'
```

---

## Tier 1: Frontend Testing

### Frontend URLs

- **Home Page**: http://localhost:3002
- **Login Page**: http://localhost:3002/login
- **Sign Up Page**: http://localhost:3002/signup
- **Search Page**: http://localhost:3002/search
- **My Bookings**: http://localhost:3002/bookings
- **Profile**: http://localhost:3002/profile
- **Admin Dashboard**: http://localhost:3002/admin (admin only)

### Frontend Test Flow

1. **Open Browser**: Navigate to http://localhost:3002
2. **Sign Up**: Click "Sign Up" and create a new account
3. **Login**: Login with your credentials
4. **Search**: Search for hotels/flights/cars
5. **Filter**: Apply filters (price, rating, location)
6. **Book**: Select a listing and create a booking
7. **View Bookings**: Go to "My Bookings" to see your reservations
8. **Profile**: Update your profile information

---

## AI Service Testing

### AI Service URLs

- **Health Check**: http://localhost:8000/health
- **API Documentation**: http://localhost:8000/docs (Interactive Swagger UI)
- **Chat Endpoint**: `POST http://localhost:8000/api/v1/chat`
- **WebSocket**: `ws://localhost:8000/ws`

### 1. Health Check

**Test in Browser:**
- http://localhost:8000/health

**Test with curl:**
```bash
curl http://localhost:8000/health
```

### 2. API Documentation

**Open in Browser:**
- http://localhost:8000/docs

This opens Swagger UI where you can test all AI endpoints interactively.

### 3. Chat Endpoint

**Test with curl:**
```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need a weekend trip to San Francisco, budget $500 for two people",
    "userId": "123-45-6789"
  }'
```

**Expected**: AI response with recommendations

### 4. WebSocket Chat

**Test in Browser Console:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    message: "I want to book a hotel in New York",
    userId: "123-45-6789"
  }));
};
ws.onmessage = (event) => {
  console.log('Response:', JSON.parse(event.data));
};
```

---

## Complete End-to-End Test Flow

### Test Scenario: Book a Hotel

1. **Register User**
   ```bash
   curl -X POST http://localhost:3000/api/v1/users/register \
     -H "Content-Type: application/json" \
     -d '{...user data...}'
   ```

2. **Login**
   ```bash
   curl -X POST http://localhost:3000/api/v1/users/login \
     -H "Content-Type: application/json" \
     -d '{"email": "...", "password": "..."}'
   ```

3. **Search Hotels**
   ```bash
   curl "http://localhost:3000/api/v1/search/hotels?city=San%20Francisco"
   ```

4. **Create Booking**
   ```bash
   curl -X POST http://localhost:3000/api/v1/bookings \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -d '{...booking data...}'
   ```

5. **Create Billing**
   ```bash
   curl -X POST http://localhost:3000/api/v1/billing \
     -H "Authorization: Bearer $JWT_TOKEN" \
     -d '{...billing data...}'
   ```

6. **View Booking**
   ```bash
   curl http://localhost:3000/api/v1/bookings/user/{userId} \
     -H "Authorization: Bearer $JWT_TOKEN"
   ```

---

## Quick Test Script

Run this script to test all endpoints:

```bash
./scripts/test-functionality.sh
```

Or test manually:

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:8000/health

# Search (no auth needed)
curl "http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&page=1&limit=5"

# Register user
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "999-99-9999",
    "firstName": "Test",
    "lastName": "User",
    "email": "test@test.com",
    "password": "Test123!",
    "phone": "408-555-1234",
    "address": {
      "street": "123 Test St",
      "city": "San Jose",
      "state": "CA",
      "zipCode": "95123"
    }
  }'
```

---

## Testing Checklist

- [ ] All services are running
- [ ] Health checks return 200 OK
- [ ] User registration works
- [ ] User login returns JWT token
- [ ] Search endpoints return data
- [ ] Booking creation works
- [ ] Booking retrieval works
- [ ] Frontend loads in browser
- [ ] Frontend can register/login
- [ ] Frontend can search listings
- [ ] Frontend can create bookings
- [ ] AI service responds to chat
- [ ] WebSocket connection works
- [ ] Admin endpoints require admin role
- [ ] Database persists data correctly

---

## Troubleshooting

### Service Not Responding

```bash
# Check if service is running
lsof -i :3000  # API Gateway
lsof -i :3001  # User Service
lsof -i :3003  # Search Service
lsof -i :3004  # Booking Service
lsof -i :8000  # AI Service
```

### Database Connection Issues

```bash
# Test MySQL
mysql -u root -e "SELECT 1;"

# Test MongoDB
mongosh --eval "db.adminCommand('ping')"
```

### CORS Errors

Check that `CORS_ORIGIN` in `.env` matches your frontend URL (currently `http://localhost:3002`)

---

## Next Steps

1. Start all services (see `scripts/TERMINAL_COMMANDS.md`)
2. Run health checks
3. Test user registration and login
4. Test search functionality
5. Test booking flow
6. Test frontend UI
7. Test AI service

