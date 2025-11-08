# Kafka Integration Requirements

## What AI Service Needs from Kafka Team

### 1. Connection Information

Provide these details:
```
Kafka Bootstrap Servers: localhost:9092 (or your configuration)
Zookeeper (if needed): localhost:2181
Authentication: None / SASL / SSL (specify if required)
```

---

### 2. Required Topics

Create these 5 topics:

| Topic Name | Purpose | Producer | Consumer |
|------------|---------|----------|----------|
| `raw-flights` | Raw flight deals | Backend/Kafka Team | AI Service |
| `raw-hotels` | Raw hotel deals | Backend/Kafka Team | AI Service |
| `scored-flights` | Scored flights | AI Service | Backend/Frontend |
| `scored-hotels` | Scored hotels | AI Service | Backend/Frontend |
| `travel-bundles` | Flight+hotel bundles | AI Service | Backend/Frontend |

**Recommended Settings**:
- Partitions: 3
- Replication Factor: 1-2

---

### 3. Message Formats

#### Input Messages (what AI Service will consume)

**raw-flights**:
```json
{
  "id": "flight_12345",
  "startingAirport": "SFO",
  "destinationAirport": "LAX",
  "travelDate": "2025-12-01",
  "segmentsAirlineName": "United Airlines",
  "totalFare": 250.00,
  "seatsRemaining": 15,
  "segmentsCabinCode": "coach",
  "totalTravelDistance": "337",
  "timestamp": "2025-11-08T10:30:00Z"
}
```

**raw-hotels**:
```json
{
  "id": "hotel_67890",
  "name": "Marriott Downtown",
  "city": "Los Angeles",
  "stars": 4.5,
  "price": 180.00,
  "amenities": ["pool", "gym", "wifi"],
  "rating": 4.3,
  "check_in": "2025-12-01",
  "check_out": "2025-12-05",
  "room_type": "deluxe",
  "timestamp": "2025-11-08T10:30:00Z"
}
```

#### Output Messages (what AI Service will produce)

**scored-flights**:
```json
{
  "id": "flight_12345",
  "origin": "SFO",
  "destination": "LAX",
  "departure_date": "2025-12-01",
  "airline": "United Airlines",
  "price": 250.00,
  "duration_hours": 1.5,
  "stops": 0,
  "score": 78.5,
  "tags": ["excellent_deal", "nonstop", "economy"],
  "scored_at": "2025-11-08T10:31:00Z"
}
```

**scored-hotels** and **travel-bundles**: Similar format with scoring data added.

Full specifications in `docs/KAFKA_TOPICS.md`.

---

### 4. Testing Requirements

For integration testing, please provide:

1. **Test data** in `raw-flights` and `raw-hotels` topics (at least 10 messages each)
2. **Consumer script** or method to verify AI service's output in scored topics
3. **Connection confirmation**: Let me know when Kafka is running and topics are created

---

### 5. Environment Setup

Once your Kafka setup is ready and pushed to the repo:

**What I'll do**:
```bash
git pull origin main
# Start your Kafka setup (however you configured it)
# Start AI service
```

**What you need to confirm**:
- Kafka is accessible at the connection string you provide
- All 5 topics are created and accessible
- Test messages are available for consumption

---

## Integration Test Plan (Week 2, Day 8)

1. You send test messages to `raw-flights` and `raw-hotels`
2. I start AI service and verify it consumes messages
3. AI service processes and produces to `scored-flights`, `scored-hotels`, `travel-bundles`
4. You verify receiving scored messages
5. We confirm end-to-end flow works

---

## What to Send Me

Please provide:
- [ ] Connection string (e.g., `localhost:9092`)
- [ ] Confirmation all 5 topics are created
- [ ] Any authentication credentials (if needed)
- [ ] Instructions to start Kafka (e.g., `docker-compose up` or other command)
- [ ] When ready for integration testing

---

## Contact

**AI Service**: Jane (jane@sjsu.edu)
**Questions**: Slack #kafka-integration or DM
