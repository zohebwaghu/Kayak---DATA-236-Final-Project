// Migration script to align Tier 3 MongoDB schema with Tier 2 middleware expectations
// Run this AFTER init.js to add missing search collections

const dbSearch = db.getSiblingDB('kayak_search');
const dbAnalytics = db.getSiblingDB('kayak_analytics');
const dbDoc = db.getSiblingDB('kayak_doc');

print('=== Creating Tier 2 Compatible MongoDB Collections ===\n');

// ============================================================================
// ISSUE 5: Create search collections in kayak_search database
// ============================================================================

// Hotels collection for search (denormalized from MySQL)
dbSearch.createCollection('hotels', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'hotelId', 'name', 'city', 'state', 'price'],
      properties: {
        _id: { bsonType: 'objectId' },
        hotelId: { bsonType: 'long' },
        name: { bsonType: 'string' },
        address: { bsonType: 'object' },
        city: { bsonType: 'string' },
        state: { bsonType: 'string' },
        zipCode: { bsonType: 'string' },
        starRating: { bsonType: 'int', minimum: 1, maximum: 5 },
        pricePerNight: { bsonType: 'double' },
        amenities: { bsonType: 'array', items: { bsonType: 'string' } },
        rating: { bsonType: 'double', minimum: 0, maximum: 5 },
        images: { bsonType: 'array', items: { bsonType: 'string' } },
        availableRooms: { bsonType: 'int' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

dbSearch.hotels.createIndex({ hotelId: 1 }, { unique: true });
dbSearch.hotels.createIndex({ city: 1, state: 1 });
dbSearch.hotels.createIndex({ starRating: 1, pricePerNight: 1 });
dbSearch.hotels.createIndex({ 'address.city': 1, 'address.state': 1 });

// Flights collection for search
dbSearch.createCollection('flights', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'flightId', 'airline', 'departure', 'arrival', 'price'],
      properties: {
        _id: { bsonType: 'objectId' },
        flightId: { bsonType: 'long' },
        airline: { bsonType: 'string' },
        flightNumber: { bsonType: 'string' },
        departure: {
          bsonType: 'object',
          properties: {
            airport: { bsonType: 'string' },
            city: { bsonType: 'string' },
            time: { bsonType: 'date' }
          }
        },
        arrival: {
          bsonType: 'object',
          properties: {
            airport: { bsonType: 'string' },
            city: { bsonType: 'string' },
            time: { bsonType: 'date' }
          }
        },
        duration: { bsonType: 'int' }, // minutes
        price: { bsonType: 'double' },
        availableSeats: { bsonType: 'int' },
        class: { bsonType: 'string' },
        rating: { bsonType: 'double' },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

dbSearch.flights.createIndex({ flightId: 1 }, { unique: true });
dbSearch.flights.createIndex({ 'departure.airport': 1, 'arrival.airport': 1, 'departure.time': 1 });
dbSearch.flights.createIndex({ 'departure.city': 1, 'arrival.city': 1 });
dbSearch.flights.createIndex({ price: 1 });

// Cars collection for search
dbSearch.createCollection('cars', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['_id', 'carId', 'provider', 'type', 'price'],
      properties: {
        _id: { bsonType: 'objectId' },
        carId: { bsonType: 'long' },
        provider: { bsonType: 'string' },
        type: { bsonType: 'string' },
        model: { bsonType: 'string' },
        year: { bsonType: 'int' },
        transmission: { bsonType: 'string' },
        seats: { bsonType: 'int' },
        pricePerDay: { bsonType: 'double' },
        rating: { bsonType: 'double' },
        available: { bsonType: 'bool' },
        location: {
          bsonType: 'object',
          properties: {
            city: { bsonType: 'string' },
            state: { bsonType: 'string' },
            address: { bsonType: 'string' }
          }
        },
        images: { bsonType: 'array', items: { bsonType: 'string' } },
        updatedAt: { bsonType: 'date' }
      }
    }
  }
});

dbSearch.cars.createIndex({ carId: 1 }, { unique: true });
dbSearch.cars.createIndex({ provider: 1, type: 1 });
dbSearch.cars.createIndex({ 'location.city': 1, 'location.state': 1 });
dbSearch.cars.createIndex({ pricePerDay: 1 });
dbSearch.cars.createIndex({ available: 1 });

// ============================================================================
// Create kayak_analytics database (alias for kayak_doc analytics collections)
// ============================================================================

// Copy analytics collections to kayak_analytics
dbAnalytics.createCollection('analytics_aggregates');
dbAnalytics.createCollection('logs');
dbAnalytics.createCollection('deal_events');

// Create indexes
dbAnalytics.analytics_aggregates.createIndex({ kind: 1, window_start: 1, window_end: 1 });
dbAnalytics.logs.createIndex({ ts: -1 });
dbAnalytics.logs.createIndex({ user_id: 1, ts: -1 });
dbAnalytics.deal_events.createIndex({ key: 1, ts: -1 });
dbAnalytics.deal_events.createIndex({ event_type: 1, ts: -1 });

print('\n=== MongoDB Migration Complete ===');
print('Created databases: kayak_search, kayak_analytics');
print('Created collections: hotels, flights, cars (in kayak_search)');
print('Created indexes for all search collections');

