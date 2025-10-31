## Kayak Simulation — Tier 3 Database Schema

This repository includes runnable creation scripts for MySQL (OLTP) and MongoDB (document/analytics) with strict US-specific validations, indexes, and partitioning for scale.

### Storage split and justification
- **MySQL (authoritative, transactional)**: `users`, `admins`, `airports`, `flights`, `hotels`, `hotel_room_types`, `hotel_inventory`, `cars`, `bookings`, `booking_items`, `billing`, `payment_methods`, `flight_seat_holds`, `car_availability`.
  - Rationale: ACID transactions, multi-row consistency (booking + billing + inventory), strong FK constraints, partitioning, and mature query optimization.
- **MongoDB (append-only, variable shape, analytics-friendly)**: `reviews`, `images`, `logs`, `analytics_aggregates`, `deal_events`, `watches`.
  - Rationale: Flexible review content, event logs, streaming deal events, TTL and schema evolution without downtime.

### Creating databases
- MySQL 8.0+
  - File: `db/mysql/schema.sql`
  - Creates DB `kayak` and all tables, FKs, checks, and partitions.
  - Run: `mysql -u <user> -p < db/mysql/schema.sql`
- MongoDB 6+
  - File: `db/mongodb/init.js`
  - Creates DB `kayak_doc`, collections with `$jsonSchema` validation and indexes.
  - Run: `mongosh < db/mongodb/init.js`

### Validations (hard constraints)
- `users.user_id`: `^[0-9]{3}-[0-9]{2}-[0-9]{4}$` (SSN format)
- `zip_code`: `^[0-9]{5}(-[0-9]{4})?$`
- `state_code`: constrained by reference table `us_states` (FK).
- Datetime order checks (e.g., flights arrival > departure; bookings start/end).

### Key indexes (query paths)
- Search: flights by `(departure_airport, arrival_airport, departure_ts_utc)`.
- Hotels by `(city, state_code)`; inventory by `(hotel_id, inventory_date)`.
- Cars by `(provider_name, car_type)`.
- Bookings by `(user_id, created_at_utc)` and `(booking_type, created_at_utc)`.
- Billing by `(user_id, transaction_ts_utc)`.
- Reviews by `(entity_type, entity_id, created_at)`; logs by `(user_id, ts)`.

### Partitioning
- `bookings`, `billing`: RANGE by day on timestamp (monthly suggested in production). Supports archiving and bounded index depths.
- `hotel_inventory`: RANGE on `inventory_date`.

### Polymorphic mapping (bookings → items)
- `booking_items.item_type` ∈ {flight, hotel, car} and `item_id` maps to:
  - flight → `flights.flight_id`
  - hotel → `hotel_room_types.room_type_id` (dates on the booking)
  - car → `cars.car_id`

### Transactions and consistency
- Booking flow uses a single DB transaction:
  1) Insert `bookings` and `booking_items`.
  2) Reserve inventory (`hotel_inventory.rooms_available` decrement; `flight_seat_holds` insert with expiry; `car_availability` mark).
  3) Create `billing` on successful payment; else rollback.
- All multi-entity updates must be wrapped with `READ COMMITTED` or stricter and use `FOR UPDATE` on inventory rows.

### Redis caching policy (required by project)
- Cache frequently-read entities with write-through invalidation:
  - Keys:
    - `user:{user_id}`
    - `flight:{flight_id}` and `route:{dep}:{arr}:{yyyymmdd}` for search results
    - `hotel:{hotel_id}` and `hotel:inv:{hotel_id}:{date}`
    - `car:{car_id}`
  - TTL: 5–15 minutes for listings; 30–60 seconds for inventory/search aggregates.
  - Invalidate on row change commit; prefer event-driven invalidation via Kafka (see below).

### Kafka topic contracts (concise)
- `deals.normalized` → `{ key, kind: 'flight'|'hotel', price, currency, ts, attrs{...} }`
- `deals.scored` → `{ key, score:int, reason, ts, attrs }`
- `deals.tagged` → `{ key, tags:[...], ts, attrs }`
- `deal.events` → mirrored into Mongo `deal_events` for UI/WebSocket relay.

### Data volumes and scale posture
- Baselines: ≥10k listings, ≥10k users, ≥100k bookings.
- All hot paths indexed; partitions bound index growth; JSON fields are auxiliary (not join keys).

### Security
- No raw card data stored; `payment_methods.token_ref` only.
- PII columns restricted in exports; logs avoid sensitive payloads.

### Notes on images and amenities
- Images hosted externally; store URLs only in Mongo.
- Hotel amenities retained as JSON for fast filters; detailed user-generated commentary and tags live in Mongo reviews.


