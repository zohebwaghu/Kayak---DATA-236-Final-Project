# Database Schema Diagram

## Entity Relationship Overview

### MySQL (Relational) Schema

#### Core Entities

```
users (1) ─────< (N) bookings
users (1) ─────< (N) payment_methods
users (1) ─────< (N) billing

bookings (1) ─────< (N) booking_items
bookings (1) ─────< (N) billing
bookings (1) ─────< (N) flight_seat_holds

hotels (1) ─────< (N) hotel_room_types
hotel_room_types (1) ─────< (N) hotel_inventory

flights (1) ─────< (N) flight_seat_holds

cars (1) ─────< (N) car_availability

us_states (1) ─────< (N) users
us_states (1) ─────< (N) admins
us_states (1) ─────< (N) hotels
us_states (1) ─────< (N) airports

airports (1) ─────< (N) flights (departure)
airports (1) ─────< (N) flights (arrival)
```

#### Key Relationships

1. **User to Bookings**: One-to-Many
   - A user can have multiple bookings
   - Booking requires valid user_id (FK)

2. **Booking to Billing**: One-to-One (with payment method)
   - Each booking can have one or more billing records
   - Unique constraint on (booking_id, transaction_status)

3. **Hotel to Inventory**: One-to-Many through room_types
   - Hotel → Room Types → Inventory (by date)
   - Enables dynamic pricing and availability tracking

4. **Flight to Seat Holds**: One-to-Many
   - Tracks temporary seat reservations with expiry

5. **Booking Items**: Polymorphic relationship
   - item_type: 'flight', 'hotel', 'car'
   - item_id references different tables based on type

### MongoDB (Document) Schema

#### Collections

1. **reviews**: User reviews for flights, hotels, cars
   - Linked via entity_type + entity_id
   - Supports flexible review content

2. **images**: Image URLs for listings
   - Stores external URLs only (no binary)
   - Supports multiple images per entity

3. **logs**: Application/web event logs
   - Append-only event stream
   - TTL support for automatic cleanup

4. **analytics_aggregates**: Materialized analytics
   - Pre-computed metrics for dashboards
   - Time-windowed aggregations

5. **deal_events**: Deal detection and scoring events
   - Streamed from Kafka deals pipeline
   - Keyed by listing/route for partitioning

6. **watches**: User price/inventory watches
   - Tracks user preferences for alerts
   - Supports threshold-based notifications

## Data Flow

```
MySQL (OLTP) ─────> MongoDB (Analytics)
     │                    │
     ├─ Bookings ──────────┼─> Reviews
     ├─ Users ─────────────┼─> Logs
     └─ Listings ───────────┴─> Images, Analytics
```

## Index Strategy

### MySQL Indexes
- **Primary Keys**: All tables have auto-increment or natural PK
- **Foreign Keys**: All FKs indexed automatically
- **Search Indexes**: 
  - Flights: (departure_airport, arrival_airport, departure_ts_utc)
  - Hotels: (city, state_code), (star_rating, city)
  - Bookings: (user_id, created_at_utc), (booking_type, created_at_utc)
  - Billing: (user_id, transaction_ts_utc), (transaction_ts_utc)

### MongoDB Indexes
- **Compound Indexes**:
  - reviews: (entity_type, entity_id, created_at)
  - logs: (user_id, ts), (ts)
  - deal_events: (key, ts), (event_type, ts)
  - analytics_aggregates: (kind, window_start, window_end)

## Partitioning Strategy

**Note**: MySQL partitioning removed from tables with foreign keys (limitation).

**Alternative**: Date-based indexes provide similar query performance for time-range queries.

**MongoDB**: TTL indexes on logs collection for automatic cleanup.

