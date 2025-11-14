# Middleware Overview (Tier 2)

This document summarizes the Tier 2 middleware layer we implemented for the Kayak-style distributed system. The middleware exposes REST APIs to Tier 1 clients, coordinates with Tier 3 databases, and integrates supporting infrastructure such as Kafka, Redis, MySQL, and MongoDB.

## Architecture

- **API Gateway (Node.js/Express)**  
  - Single entry point on port 3000  
  - Verifies JWT tokens, enforces rate limiting, and forwards requests to downstream services via internal service URLs.  
  - Routes: authentication, user operations, search, bookings, listings, billing, and admin endpoints.

- **User Service (Node.js/Express, MySQL)**  
  - Handles registration, login, profile retrieval, updates, and deletion.  
  - Validates SSN-format user IDs, US states, ZIP codes, emails, and passwords.  
  - Stores users in Tier 3’s `kayak` MySQL database, publishing Kafka events on user creation or updates.

- **Search Service (Node.js/Express, MongoDB, Redis)**  
  - Serves hotel/flight/car search queries using denormalized documents inside MongoDB (`kayak_doc`).  
  - Applies filter parameters (city, rating, price, amenities) and caches responses in Redis for faster repeat queries.  
  - Subscribes to Kafka topics to stay synchronized with upstream listing changes (ready for future expansion).

- **Booking Service (Node.js/Express, MySQL)**  
  - Manages creation, lookup, listing, and cancellation of bookings.  
  - Uses transactional workflows with row locks against Tier 3’s `bookings` and `inventory` tables to guarantee seat/room counts remain consistent.  
  - Publishes booking events to Kafka for analytics or notification pipelines.

- **Shared Utilities**  
  - `shared/kafka.js`: reusable Kafka producer/consumer helpers.  
  - `shared/errorHandler.js`: consistent error classes and response formatting.  
  - `shared/validators.js`: SSN, ZIP, state, email, password validation.  
  - `shared/db-adapter.js`: (placeholder) shared DB utilities for future services.

## Infrastructure

- **Docker Compose** orchestrates:
  - Zookeeper + Kafka (messaging backbone)
  - Redis (cache)  
  - MySQL (primary relational store)  
  - MongoDB (document store)  
  - Four middleware services plus API Gateway

- **Environment file (`env.example`)** documents the required configuration values (ports, secrets, DB hosts, Kafka brokers).

- **Database setup scripts (`scripts/`)**
  - `mysql-init.sql`: compatibility schema for local testing
  - `setup-databases.sh`: runs Tier 3 schema and migration scripts inside the Docker containers to ensure column naming and database selection match production expectations (`kayak` and `kayak_doc`).

## Local Development Workflow

1. `cp env.example .env` (or provide env vars directly).
2. `docker-compose up -d` from the `middleware/` directory.
3. Run CRUD flows using curl or Postman against `http://localhost:3000`.
4. For fresh databases, execute `./scripts/setup-databases.sh` after containers are running to apply Tier 3’s schema and migrations.

## Testing the Core Flow

1. **Register a user**  
   `POST /api/v1/auth/register` with SSN-format `userId`, address, and password.
2. **Log in**  
   `POST /api/v1/auth/login` to receive a JWT token.
3. **Search**  
   `GET /api/v1/search/hotels?city=San%20Francisco` (Redis caches the result).
4. **Create booking**  
   `POST /api/v1/bookings` with JWT token; service performs transactional inserts and inventory decrements.
5. **Cancel booking**  
   `PUT /api/v1/bookings/{bookingId}/cancel` to roll back inventory counts.

Kafka events are produced during user registration and booking operations, ready for future consumers (analytics, notifications, AI agents).

## Deployment Notes

- The middleware layer is independent from the Tier 3 repo but follows their schema precisely (`kayak` MySQL database, snake_case columns, `kayak_doc` MongoDB).  
- Each service ships a Dockerfile for containerized deployments on ECS/Kubernetes.  
- `middleware/.gitignore` ensures local build artifacts, logs, and node_modules directories are excluded from version control.

This README is focused solely on Tier 2 to keep the repository’s documentation aligned with the services we added.

