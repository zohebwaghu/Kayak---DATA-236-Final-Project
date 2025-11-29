# Quick Test Links - Copy & Paste

## 🌐 Browser Links (Open in Browser)

### Health Checks
- http://localhost:3000/health
- http://localhost:3000/api/v1/users/health
- http://localhost:3000/api/v1/search/health
- http://localhost:3000/api/v1/bookings/health
- http://localhost:8000/health

### Frontend (Port 3002)
- http://localhost:3002 (Home)
- http://localhost:3002/login
- http://localhost:3002/signup
- http://localhost:3002/search
- http://localhost:3002/bookings
- http://localhost:3002/profile

### AI Service
- http://localhost:8000/docs (Interactive API Docs)

### Search Endpoints (No Auth Required)
- http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&page=1&limit=10
- http://localhost:3000/api/v1/search/flights?origin=SFO&destination=LAX&page=1&limit=10
- http://localhost:3000/api/v1/search/cars?location=San%20Francisco&page=1&limit=10

---

## 📝 curl Commands (Copy & Run in Terminal)

### 1. Health Checks
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/users/health
curl http://localhost:3000/api/v1/search/health
curl http://localhost:3000/api/v1/bookings/health
curl http://localhost:8000/health
```

### 2. User Registration
```bash
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123-45-6789",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
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

### 3. User Login
```bash
curl -X POST http://localhost:3000/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

**Save token:**
```bash
export JWT_TOKEN="paste_token_here"
```

### 4. Search Hotels
```bash
curl "http://localhost:3000/api/v1/search/hotels?city=San%20Francisco&page=1&limit=10"
```

### 5. Search Flights
```bash
curl "http://localhost:3000/api/v1/search/flights?origin=SFO&destination=LAX&departureDate=2025-12-01&page=1&limit=10"
```

### 6. Search Cars
```bash
curl "http://localhost:3000/api/v1/search/cars?location=San%20Francisco&page=1&limit=10"
```

### 7. Create Booking (Requires Auth)
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

### 8. Get User Bookings (Requires Auth)
```bash
curl -X GET http://localhost:3000/api/v1/bookings/user/123-45-6789 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### 9. AI Chat
```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need a weekend trip to San Francisco, budget $500",
    "userId": "123-45-6789"
  }'
```

---

## 🧪 Automated Test Script

```bash
./scripts/test-functionality.sh
```

---

## ✅ Testing Order

1. **Health Checks** → Verify all services are running
2. **Search Endpoints** → Test public endpoints (no auth)
3. **User Registration** → Create test user
4. **User Login** → Get JWT token
5. **Authenticated Endpoints** → Test with JWT token
6. **Frontend** → Test UI in browser
7. **AI Service** → Test chat functionality

---

## 🔍 Verify Services Running

```bash
# Check ports
lsof -i :3000  # API Gateway
lsof -i :3001  # User Service
lsof -i :3003  # Search Service
lsof -i :3004  # Booking Service
lsof -i :8000  # AI Service
```

