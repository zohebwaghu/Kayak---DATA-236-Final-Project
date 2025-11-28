# Quick Start Commands

## One-Line Commands to Run Each Tier

### Tier 3: Database Setup
```bash
# MySQL
mysql -u root -p < db/mysql/schema.sql && \
mysql -u root -p < db/mysql/migration_tier2_compatibility.sql && \
mysql -u root -p kayak < db/test_sample_data.sql

# MongoDB
mongosh < db/mongodb/init.js && \
mongosh < db/mongodb/create_search_collections_tier2.js && \
mongosh < db/mongodb/migration_tier2_compatibility.js
```

### Tier 2: Middleware Services

**Terminal 1 - API Gateway:**
```bash
cd middleware/services/api-gateway && npm install && node server.js
```

**Terminal 2 - User Service:**
```bash
cd middleware/services/user-service && npm install && node server.js
```

**Terminal 3 - Search Service:**
```bash
cd middleware/services/search-service && npm install && node server.js
```

**Terminal 4 - Booking Service:**
```bash
cd middleware/services/booking-service && npm install && node server.js
```

### Tier 1: Frontend
```bash
cd frontend && npm install && npm start
```

### AI Service
```bash
cd ai && python3 -m venv venv && source venv/bin/activate && \
pip install -r requirements.txt && python main.py
```

---

## Verification Commands

```bash
# Check all services are running
curl http://localhost:3000/health && \
curl http://localhost:3000/api/v1/users/health && \
curl http://localhost:3000/api/v1/search/health && \
curl http://localhost:3000/api/v1/bookings/health && \
curl http://localhost:8000/health

# Check databases
mysql -u root -p kayak -e "SHOW TABLES;" && \
mongosh kayak_doc --eval "db.getCollectionNames()"
```

