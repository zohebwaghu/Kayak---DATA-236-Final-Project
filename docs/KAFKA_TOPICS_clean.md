# Kafka Topics Specification - AI Service

## Overview
This document specifies all Kafka topics used by the AI Recommendation Service.

---

## Topics List

### 1. Input Topics (AI Service Consumes)

#### `raw-flights`
**Purpose**: Raw flight deals from scrapers/data ingestion
**Producer**: Backend Data Ingestion Service
**Consumer**: AI Deals Agent
**Partition**: 3
**Replication Factor**: 2

**Message Format**:
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

---

#### `raw-hotels`
**Purpose**: Raw hotel deals from scrapers/data ingestion
**Producer**: Backend Data Ingestion Service
**Consumer**: AI Deals Agent
**Partition**: 3
**Replication Factor**: 2

**Message Format**:
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

---

### 2. Output Topics (AI Service Produces)

#### `scored-flights`
**Purpose**: Scored and tagged flight deals
**Producer**: AI Deals Agent
**Consumer**: Backend Service, Frontend Service
**Partition**: 3
**Replication Factor**: 2

**Message Format**:
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
  "cabin_class": "economy",
  "seats_available": 15,
  "score": 78.5,
  "tags": ["excellent_deal", "nonstop", "economy", "short_flight"],
  "scored_at": "2025-11-08T10:31:00Z",
  "processed_at": "2025-11-08T10:30:30Z"
}
```

---

#### `scored-hotels`
**Purpose**: Scored and tagged hotel deals
**Producer**: AI Deals Agent
**Consumer**: Backend Service, Frontend Service
**Partition**: 3
**Replication Factor**: 2

**Message Format**:
```json
{
  "id": "hotel_67890",
  "name": "Marriott Downtown",
  "location": "Los Angeles",
  "star_rating": 4.5,
  "price_per_night": 180.00,
  "guest_rating": 4.3,
  "amenities": ["pool", "gym", "wifi"],
  "availability_start": "2025-12-01",
  "availability_end": "2025-12-05",
  "room_type": "deluxe",
  "score": 82.0,
  "tags": ["excellent_deal", "upscale", "highly_rated", "has_pool", "has_gym"],
  "scored_at": "2025-11-08T10:31:00Z",
  "processed_at": "2025-11-08T10:30:30Z"
}
```

---

#### `travel-bundles`
**Purpose**: Matched flight + hotel bundles with recommendations
**Producer**: AI Deals Agent
**Consumer**: Backend Service, Frontend Service
**Partition**: 3
**Replication Factor**: 2

**Message Format**:
```json
{
  "id": "bundle_abc123",
  "flight": {
    "id": "flight_12345",
    "origin": "SFO",
    "destination": "LAX",
    "departure_date": "2025-12-01",
    "price": 250.00,
    "score": 78.5
  },
  "hotel": {
    "id": "hotel_67890",
    "name": "Marriott Downtown",
    "location": "Los Angeles",
    "price_per_night": 180.00,
    "nights": 4,
    "total_price": 720.00,
    "score": 82.0
  },
  "total_price": 970.00,
  "combined_score": 80.25,
  "savings_percentage": 15.5,
  "tags": ["weekend_getaway", "business_travel", "value_bundle"],
  "created_at": "2025-11-08T10:32:00Z"
}
```

---

## Configuration

### Kafka Broker Settings
```properties
bootstrap.servers=localhost:9092
# Or your cluster IPs:
# bootstrap.servers=kafka1:9092,kafka2:9092,kafka3:9092
```

### Consumer Group IDs
- AI Deals Agent (Flights): `ai-deals-agent-flights`
- AI Deals Agent (Hotels): `ai-deals-agent-hotels`

### Topic Creation Commands

```bash
# Create input topics
kafka-topics --create --topic raw-flights \
  --partitions 3 --replication-factor 2 \
  --bootstrap-server localhost:9092

kafka-topics --create --topic raw-hotels \
  --partitions 3 --replication-factor 2 \
  --bootstrap-server localhost:9092

# Create output topics
kafka-topics --create --topic scored-flights \
  --partitions 3 --replication-factor 2 \
  --bootstrap-server localhost:9092

kafka-topics --create --topic scored-hotels \
  --partitions 3 --replication-factor 2 \
  --bootstrap-server localhost:9092

kafka-topics --create --topic travel-bundles \
  --partitions 3 --replication-factor 2 \
  --bootstrap-server localhost:9092
```

---

## Testing

### Produce Test Message to raw-flights
```bash
kafka-console-producer --topic raw-flights \
  --bootstrap-server localhost:9092

# Paste this JSON:
{"id":"flight_test_1","startingAirport":"SFO","destinationAirport":"LAX","travelDate":"2025-12-01","segmentsAirlineName":"United","totalFare":250.00,"seatsRemaining":15,"segmentsCabinCode":"coach","totalTravelDistance":"337","timestamp":"2025-11-08T10:30:00Z"}
```

### Consume from scored-flights
```bash
kafka-console-consumer --topic scored-flights \
  --from-beginning \
  --bootstrap-server localhost:9092
```

---

## Performance Requirements

- **Throughput**: 1000 messages/second per topic
- **Latency**: < 100ms processing time
- **Retention**: 7 days
- **Max Message Size**: 1MB

---

## Error Handling

All messages must include:
- Valid JSON format
- Required fields (id, timestamp)
- Proper data types

Invalid messages will be logged but not processed.

---

## Contact
**AI Service Owner**: Jane (jane@sjsu.edu)
**Integration Questions**: Contact via Slack #ai-service channel
