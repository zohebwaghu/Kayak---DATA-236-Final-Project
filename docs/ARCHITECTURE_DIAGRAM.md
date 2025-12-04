# Kayak System Architecture Diagram

## Full System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT TIER                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  React Frontend (Port 3002)                                         │    │
│  │  - Axios HTTP Client                                                 │    │
│  │  - WebSocket Client (real-time updates)                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    │ HTTP/WS                                 │
│                                    ▼                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATEWAY TIER                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  API Gateway (Node.js/Express | Port 3000)                         │    │
│  │  - JWT Authentication & Authorization                              │    │
│  │  - Request Routing                                                 │    │
│  │  - Rate Limiting                                                   │    │
│  │  - CORS Handling                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        SERVICES TIER (Microservices)                        │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ User Service │  │Search Service │  │Booking Service│  │Billing Service│ │
│  │ (Port 3001)  │  │ (Port 3003)   │  │ (Port 3004)    │  │ (Port 3005)   │ │
│  │              │  │               │  │               │  │               │ │
│  │ - Auth       │  │ - Hotel/      │  │ - Create      │  │ - Invoices    │ │
│  │ - Register   │  │   Flight      │  │   Bookings    │  │ - Payments    │ │
│  │ - Profile    │  │   Search      │  │ - Inventory   │  │ - Transactions│ │
│  │              │  │ - Redis Cache │  │   Management  │  │               │ │
│  └──────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘ │
│         │                  │                   │                   │         │
│  ┌──────┴───────┐  ┌───────┴───────┐  ┌───────┴───────┐  ┌───────┴───────┐ │
│  │ Admin Service│  │               │  │               │  │               │ │
│  │ (Port 3006)  │  │               │  │               │  │               │ │
│  │              │  │               │  │               │  │               │ │
│  │ - Analytics  │  │               │  │               │  │               │ │
│  │ - User Mgmt  │  │               │  │               │  │               │ │
│  │ - Listings   │  │               │  │               │  │               │ │
│  └──────┬───────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
│         │                                                                   │
│  ┌──────┴──────────────────────────────────────────────────────────────┐  │
│  │  AI Service (FastAPI | Port 8000)                                    │  │
│  │  - LangGraph Concierge Agent                                         │  │
│  │  - Deal Scoring Agent                                               │  │
│  │  - Semantic Cache (Redis)                                           │  │
│  │  - LLM Integration (OpenAI/Ollama)                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│         │                  │                   │                   │         │
│         │                  │                   │                   │         │
│         └──────────────────┴───────────────────┴───────────────────┘         │
│                                    │                                         │
│                                    │ Kafka Events                            │
│                                    ▼                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        MIDDLEWARE TIER                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Kafka (Port 9093 internal / 9094 host)                           │    │
│  │  - Event Streaming Platform                                        │    │
│  │  - Topics: user-events, booking-events, search-events              │    │
│  │                                                                     │    │
│  │  Zookeeper (Port 2181)                                             │    │
│  │  - Kafka Coordination                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATABASE TIER (Polyglot Persistence)                   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  MySQL (Port 3307)│  │ MongoDB (27017)  │  │ Redis (6379)     │       │
│  │                  │  │                  │  │                  │       │
│  │  kayak_users     │  │  kayak_doc       │  │  Cache Layer     │       │
│  │  - users         │  │  - flights       │  │  - Search Results│       │
│  │                  │  │  - hotels        │  │  - AI Embeddings │       │
│  │  kayak_bookings  │  │  - airports       │  │  - Session State │       │
│  │  - bookings      │  │                  │  │  - Semantic Cache│       │
│  │  - inventory     │  │  kayak_analytics │  │                  │       │
│  │                  │  │  - logs          │  │                  │       │
│  │  kayak_billing   │  │  - reviews       │  │                  │       │
│  │  - invoices      │  │                  │  │                  │       │
│  │  - payments      │  │                  │  │                  │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
│         │                  │                   │                            │
│         └──────────────────┴───────────────────┘                            │
│                                    │                                         │
│                                    ▼                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA SOURCE TIER                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Kaggle Datasets                                                    │    │
│  │  - Flights Dataset (Clean_Dataset.csv)                             │    │
│  │  - Hotels Dataset (hotel_booking.csv)                               │    │
│  │  - Airports Dataset (airports.csv)                                  │    │
│  │                                                                     │    │
│  │  → Imported via import_data.py → MySQL + MongoDB                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Connection Details

### Request Flow (Synchronous)
1. **Client → API Gateway**: HTTP/WebSocket requests on port 3000
2. **API Gateway → Services**: HTTP proxy to services (3001-3006, 8000)
3. **Services → Databases**: Direct connections
   - User/Booking/Billing/Admin → MySQL (port 3307)
   - Search/Admin/AI → MongoDB (port 27017)
   - Search/AI → Redis (port 6379)

### Event Flow (Asynchronous via Kafka)
1. **User Service** → Kafka: Publishes `user-events` (registration, login)
2. **Booking Service** → Kafka: Publishes `booking-events` (booking created, confirmed, cancelled)
3. **Search Service** ← Kafka: Consumes listing updates
4. **Billing Service** ← Kafka: Consumes booking events to create invoices
5. **Admin Service** ← Kafka: Consumes events for analytics
6. **AI Service** ← Kafka: Consumes events for context/updates

### Cache Strategy
- **Redis Cache Keys**:
  - `search:hotels:{origin}:{destination}:{dates}` → TTL 300s
  - `search:flights:{route}:{dates}` → TTL 300s
  - `ai:embedding:{query_hash}` → TTL 3600s
  - `ai:session:{session_id}` → TTL 1800s

### Database Responsibilities
- **MySQL**: ACID transactions, user data, bookings, billing (strict consistency)
- **MongoDB**: Denormalized read model, search listings, analytics logs (eventual consistency OK)
- **Redis**: Fast read cache, session state, AI semantic cache (ephemeral)

## Service-to-Database Mapping

| Service        | MySQL              | MongoDB            | Redis    | Kafka        |
|----------------|--------------------|--------------------|----------|--------------|
| User Service   | kayak_users        | -                  | -        | Producer     |
| Search Service | -                  | kayak_doc          | Cache    | Consumer     |
| Booking Service| kayak_users,       | -                  | -        | Producer     |
|                | kayak_bookings     |                    |          |              |
| Billing Service| kayak_billing      | -                  | -        | Consumer/    |
|                |                    |                    |          | Producer     |
| Admin Service  | All 3 DBs          | kayak_doc,          | -        | Consumer     |
|                |                    | kayak_analytics    |          |              |
| AI Service     | -                  | kayak_doc           | Semantic | Consumer     |
|                |                    |                    | Cache    |              |

## Port Summary

| Component      | Port (Host) | Port (Container) | Protocol |
|----------------|-------------|------------------|----------|
| Frontend       | 3002        | -                | HTTP/WS  |
| API Gateway    | 3000        | 3000             | HTTP     |
| User Service   | 3001        | 3001             | HTTP     |
| Search Service | 3003        | 3003             | HTTP     |
| Booking Service| 3004        | 3004             | HTTP     |
| Billing Service| 3005        | 3005             | HTTP     |
| Admin Service  | 3006        | 3006             | HTTP     |
| AI Service     | 8000        | 8000             | HTTP     |
| MySQL          | 3307        | 3306             | TCP      |
| MongoDB        | 27017       | 27017            | TCP      |
| Redis          | 6379        | 6379             | TCP      |
| Kafka          | 9094        | 9093             | TCP      |
| Zookeeper      | 2181        | 2181             | TCP      |
| Kafka UI       | 8080        | 8080             | HTTP     |

