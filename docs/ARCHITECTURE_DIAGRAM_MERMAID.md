# Kayak System Architecture - Mermaid Diagram

This diagram can be rendered in GitHub, VS Code (with Mermaid extension), or online at [mermaid.live](https://mermaid.live).

```mermaid
graph TB
    subgraph CLIENT["CLIENT TIER"]
        FE[React Frontend<br/>Port 3002<br/>HTTP/WebSocket]
    end

    subgraph GATEWAY["GATEWAY TIER"]
        AG[API Gateway<br/>Node.js/Express<br/>Port 3000<br/>JWT Auth, Rate Limit, Routing]
    end

    subgraph SERVICES["SERVICES TIER (Microservices)"]
        US[User Service<br/>Port 3001<br/>Auth, Register, Profile]
        SS[Search Service<br/>Port 3003<br/>Hotel/Flight Search<br/>Redis Cache]
        BS[Booking Service<br/>Port 3004<br/>Create Bookings<br/>Inventory Mgmt]
        BLS[Billing Service<br/>Port 3005<br/>Invoices, Payments]
        AS[Admin Service<br/>Port 3006<br/>Analytics, User Mgmt]
        AIS[AI Service<br/>FastAPI Port 8000<br/>LangGraph Concierge<br/>Deal Scoring]
    end

    subgraph MIDDLEWARE["MIDDLEWARE TIER"]
        KAFKA[Kafka<br/>Port 9093/9094<br/>Event Streaming]
        ZK[Zookeeper<br/>Port 2181<br/>Kafka Coordination]
    end

    subgraph DATABASE["DATABASE TIER (Polyglot Persistence)"]
        MYSQL[(MySQL<br/>Port 3307<br/>kayak_users<br/>kayak_bookings<br/>kayak_billing)]
        MONGO[(MongoDB<br/>Port 27017<br/>kayak_doc<br/>flights, hotels<br/>kayak_analytics<br/>logs, reviews)]
        REDIS[(Redis<br/>Port 6379<br/>Cache Layer<br/>Search Results<br/>AI Embeddings<br/>Session State)]
    end

    subgraph SOURCE["DATA SOURCE TIER"]
        KAGGLE[Kaggle Datasets<br/>Flights, Hotels, Airports<br/>→ import_data.py]
    end

    %% Client to Gateway
    FE -->|HTTP/WS| AG

    %% Gateway to Services
    AG -->|HTTP Proxy| US
    AG -->|HTTP Proxy| SS
    AG -->|HTTP Proxy| BS
    AG -->|HTTP Proxy| BLS
    AG -->|HTTP Proxy| AS
    AG -->|HTTP Proxy| AIS

    %% Services to Kafka (Event Flow)
    US -.->|Publish user-events| KAFKA
    BS -.->|Publish booking-events| KAFKA
    BLS -.->|Publish/Consume| KAFKA
    KAFKA -.->|Consume listing updates| SS
    KAFKA -.->|Consume events| BLS
    KAFKA -.->|Consume events| AS
    KAFKA -.->|Consume events| AIS

    %% Kafka to Zookeeper
    KAFKA --> ZK

    %% Services to Databases
    US -->|Read/Write| MYSQL
    BS -->|Read/Write| MYSQL
    BLS -->|Read/Write| MYSQL
    AS -->|Read/Write| MYSQL
    AS -->|Read| MONGO
    
    SS -->|Read| MONGO
    SS -->|Cache| REDIS
    AIS -->|Read| MONGO
    AIS -->|Semantic Cache| REDIS

    %% Data Source to Databases
    KAGGLE -.->|import_data.py| MYSQL
    KAGGLE -.->|import_data.py| MONGO

    %% Styling
    classDef clientStyle fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef gatewayStyle fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef serviceStyle fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    classDef middlewareStyle fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px
    classDef dbStyle fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef sourceStyle fill:#fff9c4,stroke:#f57f17,stroke-width:2px,stroke-dasharray: 5 5

    class FE clientStyle
    class AG gatewayStyle
    class US,SS,BS,BLS,AS,AIS serviceStyle
    class KAFKA,ZK middlewareStyle
    class MYSQL,MONGO,REDIS dbStyle
    class KAGGLE sourceStyle
```

## Legend

- **Solid arrows (→)**: Synchronous HTTP requests
- **Dashed arrows (-.->)**: Asynchronous Kafka events
- **Color coding**:
  - 🔵 Blue: Client tier
  - 🟠 Orange: Gateway tier
  - 🟢 Green: Services tier
  - 🟣 Purple: Middleware tier
  - 🔴 Red: Database tier
  - 🟡 Yellow: Data source tier

## Key Connections Explained

### Synchronous Request Flow
1. **Client → API Gateway**: All requests go through gateway for auth/routing
2. **API Gateway → Services**: Routes to appropriate microservice
3. **Services → Databases**: Direct DB connections for reads/writes

### Asynchronous Event Flow
1. **User Service** publishes user registration/login events
2. **Booking Service** publishes booking lifecycle events
3. **Search Service** consumes listing updates to refresh read model
4. **Billing Service** consumes booking events to create invoices
5. **Admin Service** consumes events for analytics aggregation
6. **AI Service** consumes events for context/real-time updates

### Cache Strategy
- **Search Service** caches query results in Redis (TTL: 300s)
- **AI Service** uses Redis for semantic cache (embeddings, TTL: 3600s)

