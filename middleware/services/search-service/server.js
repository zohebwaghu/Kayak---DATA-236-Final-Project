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
      await db.collection('hotels').createIndex({ city: 1, star_rating: -1, price: 1 });
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
 */
const invalidateCache = async (listingType) => {
  try {
    const pattern = `search:${listingType}*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`🗑️  Invalidated ${keys.length} cache entries for ${listingType}`);
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

    // ===== BUILD MONGODB QUERY =====
    const query = {};
    
    if (city) {
      query['address.city'] = new RegExp(city, 'i');
    }
    
    if (minStarRating || maxStarRating) {
      query.starRating = {};
      if (minStarRating) query.starRating.$gte = parseFloat(minStarRating);
      if (maxStarRating) query.starRating.$lte = parseFloat(maxStarRating);
    }
    
    if (minPrice || maxPrice) {
      query['roomTypes.price'] = {};
      if (minPrice) query['roomTypes.price'].$gte = parseFloat(minPrice);
      if (maxPrice) query['roomTypes.price'].$lte = parseFloat(maxPrice);
    }
    
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
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('hotels').countDocuments(query)
    ]);

    // ===== DERIVE FLAT PRICE FIELD FOR FRONTEND =====
    // We keep the original docs, but add:
    //   - pricePerNight  (used by PaymentPage / cards)
    //   - price          (fallback for generic components)
    const hotels = hotelsRaw.map((hotel) => {
      const doc = { ...hotel };
      let derivedPrice = doc.pricePerNight;

      if (derivedPrice == null) {
        if (Array.isArray(doc.roomTypes) && doc.roomTypes.length > 0) {
          const prices = doc.roomTypes
            .map((rt) =>
              rt && typeof rt.price === 'number' ? rt.price : null
            )
            .filter((p) => typeof p === 'number');

          if (prices.length > 0) {
            derivedPrice = Math.min(...prices); // use the lowest room price as base
          }
        }
      }

      if (typeof derivedPrice === 'number') {
        doc.pricePerNight = derivedPrice;
        if (doc.price == null) {
          doc.price = derivedPrice;
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
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      minPrice,
      maxPrice,
      airline,
      maxStops,
      page = 1,
      limit = 20
    } = req.query;

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
    
    if (origin) query.origin = origin.toUpperCase();
    if (destination) query.destination = destination.toUpperCase();
    
    if (departureDate) {
      const date = new Date(departureDate);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      query.departureTime = { $gte: date, $lt: nextDay };
    }
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    
    if (airline) query.airline = new RegExp(airline, 'i');
    if (maxStops !== undefined) query.stops = { $lte: parseInt(maxStops) };

    // ===== EXECUTE QUERY =====
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [flights, total] = await Promise.all([
      db.collection('flights')
        .find(query)
        .sort({ price: 1, departureTime: 1 })
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
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to search flights', req.path)
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
    
    if (location) query.location = new RegExp(location, 'i');
    if (carType) query.carType = new RegExp(carType, 'i');
    
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
