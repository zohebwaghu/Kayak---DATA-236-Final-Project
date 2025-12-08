/**
 * SEARCH SERVICE
 * 
 * Purpose: High-performance read-only API for searching travel listings
 * Responsibilities:
 *  - Search and filter hotels, flights, and cars
 *  - Redis caching for frequent queries
 *  - CQRS pattern (Query side) - reads from denormalized MongoDB
 *  - Kafka consumer to update read model from listing events
 * 
 * Database: MongoDB (denormalized read model)
 * Cache: Redis (query results)
 * Message Queue: Kafka (consuming listing events)
 */

require('dotenv').config();
const express = require('express');
const redis = require('redis');
const { MongoClient } = require('mongodb');

const {
  createKafkaClient,
  createConsumer,
  subscribeToTopics,
  disconnectKafka,
  TOPICS
} = require('../../shared/kafka');

const { createErrorResponse } = require('../../shared/errorHandler');

const app = express();
const PORT = process.env.SEARCH_SERVICE_PORT || 3003;

app.use(express.json());

// ==================== REDIS SETUP ====================

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  password: process.env.REDIS_PASSWORD || undefined
});

redisClient.on('error', (err) => console.error('❌ Redis error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected'));

(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
  }
})();

// ==================== MONGODB SETUP ====================

let db;
const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');

(async () => {
  try {
    await mongoClient.connect();
    // Use Tier 3's database name: kayak_doc (they created search collections there)
    db = mongoClient.db(process.env.MONGO_DB_SEARCH || 'kayak_doc');
    console.log('✅ MongoDB connected to:', process.env.MONGO_DB_SEARCH || 'kayak_doc');

    // Create indexes for performance (if collections exist)
    try {
      await db.collection('hotels').createIndex({
        city: 1,
        city_code: 1,
        star_rating: -1,
        price_per_night: 1,
        deal_score: -1
      });
      await db.collection('flights').createIndex({ origin: 1, destination: 1, departure_time: 1, price: 1 });
      await db.collection('cars').createIndex({ location: 1, car_type: 1, price_per_day: 1 });
      console.log('✅ MongoDB indexes created');
    } catch (indexError) {
      console.warn('⚠️  Some indexes may already exist or collections not created yet:', indexError.message);
    }
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
})();

// ==================== KAFKA CONSUMER SETUP ====================

let kafkaConsumer;

(async () => {
  try {
    const kafka = createKafkaClient('search-service');
    kafkaConsumer = await createConsumer(kafka, 'search-service-group');

    // Subscribe to listing events to update read model
    await subscribeToTopics(kafkaConsumer, [TOPICS.LISTING_EVENTS], async (topic, event) => {
      const { eventType, data } = event;
      const { listingType, listingId } = data;

      console.log(`Processing ${eventType} for ${listingType} ${listingId}`);

      const collectionName = `${listingType}s`; // hotels, flights, cars

      try {
        if (eventType === 'listing.created' || eventType === 'listing.updated') {
          // Update or insert listing in denormalized read model
          await db.collection(collectionName).updateOne(
            { [`${listingType}Id`]: listingId },
            { $set: { ...data.data, lastUpdated: new Date() } },
            { upsert: true }
          );

          // Invalidate cache for this listing type
          await invalidateCache(listingType);

        } else if (eventType === 'listing.deleted') {
          // Remove listing from read model
          await db.collection(collectionName).deleteOne({ [`${listingType}Id`]: listingId });

          // Invalidate cache
          await invalidateCache(listingType);
        }

        console.log(`✅ Read model updated for ${listingType} ${listingId}`);
      } catch (error) {
        console.error(`❌ Error updating read model:`, error);
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize Kafka consumer:', error);
  }
})();

// ==================== CACHE UTILITIES ====================

/**
 * Generate cache key from query parameters
 */
const generateCacheKey = (listingType, query) => {
  const sortedQuery = Object.keys(query)
    .sort()
    .reduce((acc, key) => {
      acc[key] = query[key];
      return acc;
    }, {});
  return `search:${listingType}:${JSON.stringify(sortedQuery)}`;
};

/**
 * Invalidate all cache entries for a listing type
 * Uses SCAN instead of KEYS to avoid blocking Redis in production
 */
const invalidateCache = async (listingType) => {
  try {
    // listingType events come in singular form (hotel/flight/car)
    // but our cache keys use plural collection names (hotels/flights/cars)
    const plural = listingType.endsWith('s') ? listingType : `${listingType}s`;
    const pattern = `search:${plural}*`;
    let cursor = '0';
    let deletedCount = 0;

    // Use SCAN for non-blocking iteration instead of KEYS
    do {
      const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor.toString();
      const keys = result.keys;

      if (keys.length > 0) {
        await redisClient.del(keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    if (deletedCount > 0) {
      console.log(`🗑️  Invalidated ${deletedCount} cache entries for ${listingType}`);
    }
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
};

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Search Service',
    timestamp: new Date().toISOString(),
    cache: redisClient.isOpen ? 'Connected' : 'Disconnected',
    database: db ? 'Connected' : 'Disconnected'
  });
});

// ==================== SEARCH ENDPOINTS ====================

/**
 * Hotels search handler
 *
 * Mounted at:
 *  - GET /api/v1/search/hotels
 *  - GET /hotels
 */
const handleHotelsSearch = async (req, res) => {
  try {
    // Check if database is connected
    if (!db) {
      console.error('❌ Database not connected yet');
      return res.status(503).json(
        createErrorResponse(
          503,
          'Service Unavailable',
          'Database connection not ready. Please try again in a moment.',
          req.path
        )
      );
    }

    const {
      city,
      minStarRating,
      maxStarRating,
      minPrice,
      maxPrice,
      amenities,
      page = 1,
      limit = 20
    } = req.query;

    const cacheKey = generateCacheKey('hotels', req.query);

    // ===== CHECK CACHE =====
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        console.log('✅ Cache HIT for hotels search');
        return res.status(200).json({
          ...JSON.parse(cachedResult),
          cached: true,
          cacheKey
        });
      }
    } catch (cacheError) {
      console.warn('Cache read error:', cacheError);
      // Continue to database query
    }

    console.log('❌ Cache MISS for hotels search - querying database');

    // ===== BUILD MONGODB QUERY (MATCHES CURRENT SCHEMA) =====
    const query = {};

    // City / city_code (supports "Delhi" and "DEL")
    if (city) {
      const rawCity = city.trim();
      query.$or = [
        { city: new RegExp(`^${rawCity}$`, 'i') },        // city: "Delhi"
        { city_code: rawCity.toUpperCase() }              // city_code: "DEL"
      ];
    }

    // star_rating (NOT starRating)
    if (minStarRating || maxStarRating) {
      query.star_rating = {};
      if (minStarRating) query.star_rating.$gte = parseFloat(minStarRating);
      if (maxStarRating) query.star_rating.$lte = parseFloat(maxStarRating);
    }

    // price_per_night (NOT roomTypes.price)
    if (minPrice || maxPrice) {
      query.price_per_night = {};
      if (minPrice) query.price_per_night.$gte = parseFloat(minPrice);
      if (maxPrice) query.price_per_night.$lte = parseFloat(maxPrice);
    }

    // amenities array
    if (amenities) {
      const amenityList = amenities.split(',').map(a => a.trim());
      query.amenities = { $all: amenityList };
    }

    // ===== EXECUTE QUERY WITH PAGINATION =====
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [hotelsRaw, total] = await Promise.all([
      db.collection('hotels')
        .find(query)
        .sort({ deal_score: -1, price_per_night: 1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('hotels').countDocuments(query)
    ]);

    // ===== NORMALIZE PRICE FIELD FOR FRONTEND =====
    const hotels = hotelsRaw.map((hotel) => {
      const doc = { ...hotel };

      // Your docs already have price_per_night
      const derivedPrice = doc.price_per_night ?? doc.price;

      if (typeof derivedPrice === 'number') {
        doc.price_per_night = derivedPrice;
        if (doc.price == null) {
          doc.price = derivedPrice; // generic price field used by some components
        }
      }

      return doc;
    });

    const result = {
      data: hotels,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      query: req.query
    };

    // ===== CACHE RESULT =====
    try {
      const ttl = parseInt(process.env.REDIS_TTL) || 300; // 5 minutes default
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(result));
      console.log(`💾 Cached result for ${ttl} seconds`);
    } catch (cacheError) {
      console.warn('Cache write error:', cacheError);
    }

    res.status(200).json({ ...result, cached: false });

  } catch (error) {
    console.error('Error searching hotels:', error);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to search hotels', req.path)
    );
  }
};

app.get('/api/v1/search/hotels', handleHotelsSearch);
app.get('/hotels', handleHotelsSearch);

/**
 * Flights search handler
 *
 * Mounted at:
 *  - GET /api/v1/search/flights
 *  - GET /flights
 */
const handleFlightsSearch = async (req, res) => {
  try {
    // Check if database is connected
    if (!db) {
      console.error('❌ Database not connected yet');
      return res.status(503).json(
        createErrorResponse(503, 'Service Unavailable', 'Database connection not ready. Please try again in a moment.', req.path)
      );
    }

    // NOTE: Frontend currently sends departureTimeOfDay/arrivalTimeOfDay.
    // To keep backward compatibility, we alias those to *_Min/Max here.
    const {
      origin,
      destination,
      departureDate,
      returnDate, // was previously missing → return-date filter never applied
      minPrice,
      maxPrice,
      airline,
      maxStops,
      // SPEC REQUIREMENT: Flight time filters
      departureTimeMin,
      departureTimeMax,
      arrivalTimeMin,
      arrivalTimeMax,
      departureTimeOfDay,
      arrivalTimeOfDay,
      page = 1,
      limit = 20
    } = req.query;

    // Alias single time-of-day values to min/max if provided
    const depMin = departureTimeMin || departureTimeOfDay || req.query.departureTime || null;
    const depMax = departureTimeMax || null;
    const arrMin = arrivalTimeMin || arrivalTimeOfDay || req.query.arrivalTime || null;
    const arrMax = arrivalTimeMax || null;

    const cacheKey = generateCacheKey('flights', req.query);

    // ===== CHECK CACHE =====
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        console.log('✅ Cache HIT for flights search');
        return res.status(200).json({
          ...JSON.parse(cachedResult),
          cached: true,
          cacheKey
        });
      }
    } catch (cacheError) {
      console.warn('Cache read error:', cacheError);
    }

    console.log('❌ Cache MISS for flights search - querying database');

    // ===== BUILD MONGODB QUERY =====
    const query = {};

    if (origin) query.origin = origin.trim().toUpperCase();
    if (destination) query.destination = destination.trim().toUpperCase();

    if (departureDate) {
      // Parse the date string (YYYY-MM-DD format)
      const dateString = departureDate.split('T')[0]; // YYYY-MM-DD format
      
      // Create date range for the entire day (UTC)
      // Use UTC to avoid timezone issues
      const [year, month, day] = dateString.split('-').map(Number);
      const targetDateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const targetDateEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
      
      // Calculate days_left for backward compatibility
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(year, month - 1, day);
      targetDate.setHours(0, 0, 0, 0);
      const diffTime = targetDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const searchDays = Math.max(1, diffDays);
      
      // Query by actual date (departureDate or departure_date field) OR days_left
      // This supports both the new synthetic date columns and backward compatibility
      query.$or = [
        { departureDate: { $gte: targetDateStart, $lte: targetDateEnd } },
        { departure_date: dateString },
        { days_left: searchDays }
      ];
    }

    // Optional return-date filter (use arrivalDate/arrival_date)
    if (returnDate) {
      const returnDateString = returnDate.split('T')[0];
      const [ry, rm, rd] = returnDateString.split('-').map(Number);
      const returnStart = new Date(Date.UTC(ry, rm - 1, rd, 0, 0, 0, 0));
      const returnEnd = new Date(Date.UTC(ry, rm - 1, rd, 23, 59, 59, 999));

      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { arrivalDate: { $gte: returnStart, $lte: returnEnd } },
          { arrival_date: returnDateString }
        ]
      });
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (airline) query.airline = new RegExp(airline.trim(), 'i');
    if (maxStops !== undefined) query.stops = { $lte: parseInt(maxStops) };

    // SPEC REQUIREMENT: Time-based filters for flights
    // Time format expected: "HH:MM" (e.g., "06:00", "22:00")
    if (depMin || depMax) {
      query.departure_time = {};
      if (depMin) query.departure_time.$gte = depMin;
      if (depMax) query.departure_time.$lte = depMax;
    }
    if (arrMin || arrMax) {
      query.arrival_time = {};
      if (arrMin) query.arrival_time.$gte = arrMin;
      if (arrMax) query.arrival_time.$lte = arrMax;
    }

    // ===== EXECUTE QUERY =====
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [flights, total] = await Promise.all([
      db.collection('flights')
        .find(query)
        // Use canonical fields that ingesters populate
        .sort({ price: 1, departureDate: 1, departure_time: 1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('flights').countDocuments(query)
    ]);

    const result = {
      data: flights,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      query: req.query
    };

    // ===== CACHE RESULT =====
    try {
      const ttl = parseInt(process.env.REDIS_TTL) || 300;
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(result));
      console.log(`💾 Cached result for ${ttl} seconds`);
    } catch (cacheError) {
      console.warn('Cache write error:', cacheError);
    }

    res.status(200).json({ ...result, cached: false });

  } catch (error) {
    console.error('Error searching flights:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', `Failed to search flights: ${error.message}`, req.path)
    );
  }
};

app.get('/api/v1/search/flights', handleFlightsSearch);
app.get('/flights', handleFlightsSearch);

/**
 * Cars search handler
 *
 * Mounted at:
 *  - GET /api/v1/search/cars
 *  - GET /cars
 */
const handleCarsSearch = async (req, res) => {
  try {
    const {
      location,
      pickupDate,
      returnDate,
      carType,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20
    } = req.query;

    const cacheKey = generateCacheKey('cars', req.query);

    // ===== CHECK CACHE =====
    try {
      const cachedResult = await redisClient.get(cacheKey);
      if (cachedResult) {
        console.log('✅ Cache HIT for cars search');
        return res.status(200).json({
          ...JSON.parse(cachedResult),
          cached: true,
          cacheKey
        });
      }
    } catch (cacheError) {
      console.warn('Cache read error:', cacheError);
    }

    console.log('❌ Cache MISS for cars search - querying database');

    // ===== BUILD MONGODB QUERY =====
    const query = {};

    if (location) query.location = new RegExp(location.trim(), 'i');
    if (carType) query.carType = new RegExp(carType.trim(), 'i');

    // Optional availability filter: include docs with matching window OR no availability fields
    if (pickupDate || returnDate) {
      const start = pickupDate ? new Date(pickupDate) : null;
      const end = returnDate ? new Date(returnDate) : null;
      const availabilityClause = {};
      if (start) availabilityClause.$and = (availabilityClause.$and || []).concat([
        { availableFrom: { $lte: start } }
      ]);
      if (end) availabilityClause.$and = (availabilityClause.$and || []).concat([
        { availableTo: { $gte: end } }
      ]);

      query.$or = [ availabilityClause ];
      // allow records without explicit availability metadata
      query.$or.push({ availableFrom: { $exists: false } });
    }

    if (minPrice || maxPrice) {
      query.pricePerDay = {};
      if (minPrice) query.pricePerDay.$gte = parseFloat(minPrice);
      if (maxPrice) query.pricePerDay.$lte = parseFloat(maxPrice);
    }

    // ===== EXECUTE QUERY =====
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [cars, total] = await Promise.all([
      db.collection('cars')
        .find(query)
        .sort({ pricePerDay: 1 })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('cars').countDocuments(query)
    ]);

    const result = {
      data: cars,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      query: req.query
    };

    // ===== CACHE RESULT =====
    try {
      const ttl = parseInt(process.env.REDIS_TTL) || 300;
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(result));
      console.log(`💾 Cached result for ${ttl} seconds`);
    } catch (cacheError) {
      console.warn('Cache write error:', cacheError);
    }

    res.status(200).json({ ...result, cached: false });

  } catch (error) {
    console.error('Error searching cars:', error);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to search cars', req.path)
    );
  }
};

app.get('/api/v1/search/cars', handleCarsSearch);
app.get('/cars', handleCarsSearch);

// ==================== CACHE MANAGEMENT ENDPOINTS ====================

/**
 * DELETE /api/v1/search/cache
 * Clear all cache (admin only - called through API gateway)
 */
app.delete('/api/v1/search/cache', async (req, res) => {
  try {
    await redisClient.flushDb();
    res.status(200).json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to clear cache', req.path)
    );
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json(
    createErrorResponse(404, 'Not Found', `Endpoint ${req.method} ${req.path} not found`, req.path)
  );
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json(
    createErrorResponse(500, 'Internal Server Error', 'An unexpected error occurred', req.path)
  );
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          🔍 SEARCH SERVICE STARTED                    ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                   ║
║  Database:     MongoDB (${process.env.MONGO_DB_SEARCH || 'kayak_search'})        ║
║  Cache:        Redis (${redisClient.isOpen ? '✅ Connected' : '❌ Not Connected'})                  ║
║  Kafka:        ${kafkaConsumer ? '✅ Connected' : '❌ Not Connected'}                       ║
║  Time:         ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectKafka(null, kafkaConsumer);
  await redisClient.quit();
  await mongoClient.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectKafka(null, kafkaConsumer);
  await redisClient.quit();
  await mongoClient.close();
  process.exit(0);
});
