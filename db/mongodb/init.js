// Kayak Simulation - Document Schema (MongoDB, run with mongosh)
// Focus: reviews, images, logs, analytics, deal events (append-only / flexible)

const dbName = 'kayak_doc';
db = db.getSiblingDB(dbName);

// Reviews (flights, hotels, cars)
db.createCollection('reviews', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'user_id', 'entity_type', 'entity_id', 'rating', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        user_id: { bsonType: 'string', description: 'SSN format ###-##-####' },
        entity_type: { enum: ['flight', 'hotel', 'car'] },
        entity_id: { oneOf: [{ bsonType: 'long' }, { bsonType: 'int' }, { bsonType: 'string' }] },
        rating: { bsonType: 'int', minimum: 1, maximum: 5 },
        title: { bsonType: 'string' },
        text: { bsonType: 'string' },
        created_at: { bsonType: 'date' },
        updated_at: { bsonType: 'date' },
        tags: { bsonType: 'array', items: { bsonType: 'string' } }
      }
    }
  }
});
db.reviews.createIndex({ entity_type: 1, entity_id: 1, created_at: -1 });
db.reviews.createIndex({ user_id: 1, created_at: -1 });

// Images (rooms, properties, cars). Store URLs only.
db.createCollection('images', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'entity_type', 'entity_id', 'url', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        entity_type: { enum: ['hotel', 'hotel_room', 'car', 'flight'] },
        entity_id: { oneOf: [{ bsonType: 'long' }, { bsonType: 'int' }, { bsonType: 'string' }] },
        url: { bsonType: 'string' },
        kind: { enum: ['cover', 'gallery', 'room', 'exterior', 'interior'] },
        created_at: { bsonType: 'date' },
        alt: { bsonType: 'string' }
      }
    }
  }
});
db.images.createIndex({ entity_type: 1, entity_id: 1 });

// Web/app logs for tracking (append-only). TTL optional for raw events.
db.createCollection('logs', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'ts', 'event'],
      properties: {
        _id: { bsonType: 'objectId' },
        ts: { bsonType: 'date' },
        level: { enum: ['debug', 'info', 'warn', 'error'] },
        user_id: { bsonType: 'string' },
        session_id: { bsonType: 'string' },
        path: { bsonType: 'string' },
        event: { bsonType: 'string' },
        attrs: { bsonType: 'object' }
      }
    }
  }
});
db.logs.createIndex({ ts: -1 });
db.logs.createIndex({ user_id: 1, ts: -1 });
// Optional TTL for raw logs (e.g., 180 days)
// db.logs.createIndex({ ts: 1 }, { expireAfterSeconds: 15552000 });

// Analytics aggregates (materialized rollups)
db.createCollection('analytics_aggregates', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'kind', 'window_start', 'window_end', 'metrics'],
      properties: {
        _id: { bsonType: 'objectId' },
        kind: { enum: ['top_properties_revenue', 'city_revenue', 'provider_sales', 'listing_clicks', 'page_clicks', 'reviews_stats'] },
        window_start: { bsonType: 'date' },
        window_end: { bsonType: 'date' },
        dims: { bsonType: 'object' },
        metrics: { bsonType: 'object' },
        computed_at: { bsonType: 'date' }
      }
    }
  }
});
db.analytics_aggregates.createIndex({ kind: 1, window_start: 1, window_end: 1 });

// Deals and concierge events (for agent service + WebSocket fanout)
db.createCollection('deal_events', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'key', 'event_type', 'ts', 'payload'],
      properties: {
        _id: { bsonType: 'objectId' },
        key: { bsonType: 'string' }, // stable partition key, e.g., route or listing id
        event_type: { enum: ['deal_detected', 'deal_scored', 'deal_tagged', 'price_drop', 'inventory_low', 'watch_alert'] },
        ts: { bsonType: 'date' },
        score: { bsonType: 'int' },
        tags: { bsonType: 'array', items: { bsonType: 'string' } },
        payload: { bsonType: 'object' }
      }
    }
  }
});
db.deal_events.createIndex({ key: 1, ts: -1 });
db.deal_events.createIndex({ event_type: 1, ts: -1 });

// Price/inventory watches (optional but useful for MVP agent)
db.createCollection('watches', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'user_id', 'key', 'conditions', 'created_at'],
      properties: {
        _id: { bsonType: 'objectId' },
        user_id: { bsonType: 'string' },
        key: { bsonType: 'string' },
        conditions: {
          bsonType: 'object',
          properties: {
            price_below: { bsonType: 'double' },
            inventory_below: { bsonType: 'int' }
          }
        },
        active: { bsonType: 'bool' },
        created_at: { bsonType: 'date' },
        last_triggered_at: { bsonType: 'date' }
      }
    }
  }
});
db.watches.createIndex({ user_id: 1, key: 1 }, { unique: false });

print(`MongoDB schema created in database: ${dbName}`);


