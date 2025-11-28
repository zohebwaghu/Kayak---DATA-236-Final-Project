# Terminal Commands for Manual Run

Copy and paste these commands into separate terminal windows.

---

## Terminal 1: API Gateway (Port 3000)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/api-gateway"
npm install
node server.js
```

**Expected Output:**
```
✅ API Gateway listening on port 3000
✅ Connected to Kafka
```

---

## Terminal 2: User Service (Port 3001)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/user-service"
npm install
node server.js
```

**Expected Output:**
```
✅ User Service listening on port 3001
✅ MySQL users database connected: kayak_users
✅ Kafka producer connected
```

---

## Terminal 3: Search Service (Port 3003)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/search-service"
npm install
node server.js
```

**Expected Output:**
```
✅ Search Service listening on port 3003
✅ Redis connected
✅ MongoDB connected to: kayak_doc
✅ Kafka consumer connected
```

---

## Terminal 4: Booking Service (Port 3004)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/middleware/services/booking-service"
npm install
node server.js
```

**Expected Output:**
```
✅ Booking Service listening on port 3004
✅ MySQL users database connected: kayak_users
✅ MySQL bookings database connected: kayak_bookings
✅ Kafka producer connected
```

---

## Terminal 5: AI Service (Port 8000)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/ai"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

---

## Terminal 6: Frontend (Port 3000 or 3001)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project/frontend"
npm install
npm start
```

**Expected Output:**
```
Compiled successfully!
You can now view frontend in the browser.
Local: http://localhost:3000
```

---

## Quick Verification Commands

Run these in a new terminal to verify all services:

```bash
# Check all services are responding
curl http://localhost:3000/health && echo ""
curl http://localhost:3000/api/v1/users/health && echo ""
curl http://localhost:3000/api/v1/search/health && echo ""
curl http://localhost:3000/api/v1/bookings/health && echo ""
curl http://localhost:8000/health && echo ""

# Check databases
mysql -u root -p kayak -e "SELECT COUNT(*) as users FROM users; SELECT COUNT(*) as flights FROM flights;"
mongosh kayak_doc --eval "db.getCollectionNames()" --quiet
```

---

## Stop All Services

Press `Ctrl+C` in each terminal window to stop the services.

