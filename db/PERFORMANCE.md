# Database Performance Guide

## Scalability Targets

As per project requirements:
- **10,000+ listings** (flights, hotels, cars)
- **10,000+ users**
- **100,000+ bookings/billing records**

## Index Usage Strategy

### Query Patterns and Indexes

#### Flight Search
```sql
-- Pattern: Search flights by route and date
SELECT * FROM flights 
WHERE departure_airport = 'SFO' 
  AND arrival_airport = 'LAX' 
  AND departure_ts_utc >= '2025-12-01'
ORDER BY departure_ts_utc;
```
**Index**: `ix_flights_route_time` covers this query efficiently.

#### Hotel Search by Location
```sql
-- Pattern: Search hotels in a city
SELECT * FROM hotels 
WHERE city = 'San Francisco' 
  AND state_code = 'CA'
  AND star_rating >= 4;
```
**Index**: `ix_hotels_city_state` + `ix_hotels_star_city` support this.

#### User Booking History
```sql
-- Pattern: Get user's bookings
SELECT * FROM bookings 
WHERE user_id = '123-45-6789' 
ORDER BY created_at_utc DESC;
```
**Index**: `ix_bookings_user_time` provides optimal performance.

#### Billing Queries
```sql
-- Pattern: Transactions by date range
SELECT * FROM billing 
WHERE transaction_ts_utc BETWEEN '2025-12-01' AND '2025-12-31'
ORDER BY transaction_ts_utc;
```
**Index**: `ix_billing_transaction_date` supports range queries.

## Caching Strategy (Redis)

### Cache Keys Pattern

```
user:{user_id}                    # TTL: 15 minutes
flight:{flight_id}                # TTL: 10 minutes
route:{dep}:{arr}:{yyyymmdd}      # TTL: 5 minutes (search results)
hotel:{hotel_id}                  # TTL: 15 minutes
hotel:inv:{hotel_id}:{date}       # TTL: 60 seconds (inventory)
car:{car_id}                      # TTL: 10 minutes
```

### Cache Invalidation

- **Write-through**: Update cache on write
- **Event-driven**: Invalidate via Kafka consumer on data changes
- **TTL-based**: Short TTL for volatile data (inventory, search)

## MongoDB Performance

### Query Optimization

1. **Reviews**: Use compound index (entity_type, entity_id, created_at)
2. **Logs**: Index on ts for time-range queries; consider TTL for cleanup
3. **Analytics**: Pre-compute aggregates; cache in Redis for dashboards
4. **Deal Events**: Partition by key; index by event_type for filtering

### Collection Stats

Monitor collection sizes and index usage:
```javascript
db.reviews.stats()
db.logs.stats()
db.analytics_aggregates.getIndexes()
```

## Connection Pooling

### MySQL Recommendations

- **Pool Size**: 10-20 connections per application instance
- **Max Connections**: Configure based on server capacity
- **Connection Timeout**: 30 seconds
- **Idle Timeout**: 10 minutes

### MongoDB Recommendations

- **Max Pool Size**: 100 connections
- **Min Pool Size**: 10 connections
- **Connection Timeout**: 10 seconds
- **Socket Timeout**: 30 seconds

## Query Optimization Tips

### MySQL

1. **Avoid SELECT \***: Select only needed columns
2. **Use EXPLAIN**: Analyze query plans before optimization
3. **Limit Results**: Always use LIMIT for pagination
4. **Batch Operations**: Use transactions for multi-row inserts
5. **Avoid Functions in WHERE**: Pre-compute values when possible

### MongoDB

1. **Project Fields**: Use projection to limit returned data
2. **Use Indexes**: Ensure queries use indexes (check with explain())
3. **Limit Results**: Always use limit() for pagination
4. **Aggregation Pipeline**: Use $match early in pipeline
5. **Sharding**: Consider for very large collections (>100GB)

## Monitoring Queries

### Slow Query Log

Enable in MySQL:
```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1; -- Log queries > 1 second
```

### MongoDB Profiler

Enable profiler:
```javascript
db.setProfilingLevel(1, { slowms: 100 }) // Profile queries > 100ms
db.system.profile.find().sort({ts: -1}).limit(10)
```

## Load Testing

Use Apache JMeter or similar to test:
- 100 concurrent users
- Base (B), + SQL Caching (S), + Kafka (K), + Other optimizations
- Measure response times and throughput

Expected improvements:
- **Base → +Caching**: 30-50% faster
- **+Caching → +Kafka**: Reduced database load
- **+Kafka → +Optimizations**: 2-3x overall improvement

