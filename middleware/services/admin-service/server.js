/**
 * ADMIN SERVICE
 * 
 * Purpose: Administrative operations and analytics
 * Responsibilities:
 *  - Manage listings (flights, hotels, cars) - add, edit, search
 *  - Manage user accounts - view, modify
 *  - Search and display billing information
 *  - Generate analytics and reports
 *  - Track clicks, page views, user behavior
 * 
 * Databases:
 *  - MySQL: users, admins, bookings, billing, listings
 *  - MongoDB: search collections, analytics, logs
 * Message Queue: Kafka (event publishing)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { MongoClient, ObjectId } = require('mongodb');
const { randomUUID } = require('crypto');

const {
  createKafkaClient,
  createProducer,
  publishEvent,
  disconnectKafka,
  TOPICS,
  EVENT_TYPES
} = require('../../shared/kafka');

const {
  createErrorResponse,
  ValidationError,
  NotFoundError
} = require('../../shared/errorHandler');

const {
  requireValidState,
  requireValidZip,
  normalizeState
} = require('../../shared/validators');

const app = express();
const PORT = process.env.ADMIN_SERVICE_PORT || 3006;

app.use(express.json());

// ==================== DATABASE CONNECTIONS ====================

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';

const USERS_DB = process.env.MYSQL_DB_USERS || 'kayak_users';
const BOOKINGS_DB = process.env.MYSQL_DB_BOOKINGS || 'kayak_bookings';
const BILLING_DB = process.env.MYSQL_DB_BILLING || 'kayak_billing';

// MySQL pools
const usersPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: USERS_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const bookingsPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: BOOKINGS_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const billingPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: BILLING_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// MongoDB connection
let mongoDb;
const mongoClient = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');

(async () => {
  try {
    await mongoClient.connect();
    mongoDb = mongoClient.db(process.env.MONGO_DB_SEARCH || 'kayak_doc');
    console.log('✅ MongoDB connected to:', process.env.MONGO_DB_SEARCH || 'kayak_doc');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
  }
})();

// Test MySQL connections
(async () => {
  try {
    await usersPool.getConnection().then(conn => { conn.release(); console.log(`✅ MySQL users DB connected: ${USERS_DB}`); });
    await bookingsPool.getConnection().then(conn => { conn.release(); console.log(`✅ MySQL bookings DB connected: ${BOOKINGS_DB}`); });
    await billingPool.getConnection().then(conn => { conn.release(); console.log(`✅ MySQL billing DB connected: ${BILLING_DB}`); });
  } catch (error) {
    console.error('❌ MySQL connection failed:', error);
  }
})();

// ==================== KAFKA SETUP ====================

let kafkaProducer;

(async () => {
  try {
    const kafka = createKafkaClient();
    kafkaProducer = await createProducer(kafka);
    // await kafkaProducer.connect(); // Connected inside createProducer
    console.log('✅ Kafka producer connected');
  } catch (error) {
    console.error('❌ Kafka connection failed:', error);
  }
})();

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Admin Service',
    timestamp: new Date().toISOString()
  });
});

// ==================== LISTING MANAGEMENT ====================

/**
 * GET /api/v1/admin/listings
 * Search listings (flights, hotels, cars)
 */
app.get('/listings', async (req, res) => {
  try {
    const { type, search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'Database not connected', req.path));
    }

    let collection, query = {};

    if (type === 'hotels' || !type) {
      collection = mongoDb.collection('hotels');
      if (search) {
        query = {
          $or: [
            { name: new RegExp(search, 'i') },
            { 'address.city': new RegExp(search, 'i') },
            { 'address.state': new RegExp(search, 'i') }
          ]
        };
      }
    } else if (type === 'flights') {
      collection = mongoDb.collection('flights');
      if (search) {
        query = {
          $or: [
            { airline: new RegExp(search, 'i') },
            { origin: new RegExp(search, 'i') },
            { destination: new RegExp(search, 'i') }
          ]
        };
      }
    } else if (type === 'cars') {
      collection = mongoDb.collection('cars');
      if (search) {
        query = {
          $or: [
            { name: new RegExp(search, 'i') },
            { location: new RegExp(search, 'i') },
            { carType: new RegExp(search, 'i') }
          ]
        };
      }
    } else {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Invalid listing type. Use: hotels, flights, or cars', req.path));
    }

    const [data, total] = await Promise.all([
      collection.find(query).skip(skip).limit(limitNum).toArray(),
      collection.countDocuments(query)
    ]);

    res.status(200).json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error searching listings:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to search listings', req.path));
  }
});

/**
 * POST /api/v1/admin/listings
 * Add a new listing (hotel/flight/car)
 */
app.post('/listings', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'Database not connected', req.path));
    }

    let collection;
    if (type === 'hotels') {
      collection = mongoDb.collection('hotels');
      // Validate required fields
      if (!data.name || !data.address || !data.address.city) {
        return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Missing required hotel fields', req.path));
      }
    } else if (type === 'flights') {
      collection = mongoDb.collection('flights');
      if (!data.airline || !data.origin || !data.destination || !data.price || !data.departureTime || !data.arrivalTime || !data.duration) {
        return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Missing required flight fields (airline, origin, destination, price, departureTime, arrivalTime, duration)', req.path));
      }

      // Normalize data for search compatibility
      data.origin = data.origin.trim().toUpperCase();
      data.destination = data.destination.trim().toUpperCase();
      data.price = parseFloat(data.price);
      data.stops = parseInt(data.stops || 0);

      // Calculate days_left for search filtering
      const today = new Date();
      const departure = new Date(data.departureTime);
      today.setHours(0, 0, 0, 0);
      departure.setHours(0, 0, 0, 0);
      const diffTime = departure - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      data.days_left = Math.max(1, diffDays);
    } else if (type === 'cars') {
      collection = mongoDb.collection('cars');
      if (!data.name || !data.location) {
        return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Missing required car fields', req.path));
      }
    } else {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Invalid listing type', req.path));
    }

    // Add metadata
    data.created_at = new Date();
    data.updated_at = new Date();
    data.admin_created = true;

    const result = await collection.insertOne(data);

    // Publish event - format matches search-service expectations
    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.LISTING_EVENTS, result.insertedId.toString(), {
        eventType: EVENT_TYPES.LISTING_CREATED,
        data: {
          listingType: type.replace(/s$/, ''),  // 'hotels' -> 'hotel'
          listingId: result.insertedId.toString(),
          data: { ...data }
        }
      });
    }

    res.status(201).json({
      id: result.insertedId,
      type,
      message: 'Listing created successfully',
      data
    });
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to create listing', req.path));
  }
});

/**
 * PUT /api/v1/admin/listings/:id
 * Update a listing
 */
app.put('/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, data } = req.body;

    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'Database not connected', req.path));
    }

    let collection;
    if (type === 'hotels') collection = mongoDb.collection('hotels');
    else if (type === 'flights') collection = mongoDb.collection('flights');
    else if (type === 'cars') collection = mongoDb.collection('cars');
    else {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Invalid listing type', req.path));
    }

    // Remove _id from data if present to avoid immutable field error
    delete data._id;
    data.updated_at = new Date();

    // Normalize data for flights
    if (type === 'flights') {
      if (data.origin) data.origin = data.origin.trim().toUpperCase();
      if (data.destination) data.destination = data.destination.trim().toUpperCase();
      if (data.price) data.price = parseFloat(data.price);
      if (data.stops) data.stops = parseInt(data.stops);

      // Recalculate days_left if departureTime is present
      if (data.departureTime) {
        const today = new Date();
        const departure = new Date(data.departureTime);
        today.setHours(0, 0, 0, 0);
        departure.setHours(0, 0, 0, 0);
        const diffTime = departure - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        data.days_left = Math.max(1, diffDays);
      }
    }

    const cleanId = id.trim();
    let query = { _id: cleanId };
    try {
      console.log(`[DEBUG] ObjectId type: ${typeof ObjectId}`);
      query = { _id: new ObjectId(cleanId) };
    } catch (e) {
      // If id is not a valid ObjectId, try as string (for legacy/seeded data)
      console.log(`ID ${cleanId} is not a valid ObjectId, trying as string. Error:`, e.message);
    }

    console.log(`[DEBUG] Updating listing. ID: ${id}, Type: ${type}, Query:`, query);

    const result = await collection.updateOne(
      query,
      { $set: data }
    );

    console.log(`[DEBUG] Update result:`, result);

    if (result.matchedCount === 0) {
      return res.status(404).json(createErrorResponse(404, 'Not Found', 'Listing not found', req.path));
    }

    // Publish event - format matches search-service expectations
    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.LISTING_EVENTS, id, {
        eventType: EVENT_TYPES.LISTING_UPDATED,
        data: {
          listingType: type.replace(/s$/, ''),  // 'hotels' -> 'hotel'
          listingId: id,
          data: { ...data }
        }
      });
    }

    res.status(200).json({
      id,
      type,
      message: 'Listing updated successfully'
    });
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to update listing', req.path));
  }
});

/**
 * DELETE /api/v1/admin/listings/:id
 * Delete a listing
 */
app.delete('/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'Database not connected', req.path));
    }

    let collection;
    if (type === 'hotels') collection = mongoDb.collection('hotels');
    else if (type === 'flights') collection = mongoDb.collection('flights');
    else if (type === 'cars') collection = mongoDb.collection('cars');
    else {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Invalid listing type', req.path));
    }

    let query = { _id: id };
    try {
      query = { _id: new ObjectId(id) };
    } catch (e) {
      // If id is not a valid ObjectId, try as string
    }

    const result = await collection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json(createErrorResponse(404, 'Not Found', 'Listing not found', req.path));
    }

    // Publish event - format matches search-service expectations
    if (kafkaProducer) {
      await publishEvent(kafkaProducer, TOPICS.LISTING_EVENTS, id, {
        eventType: EVENT_TYPES.LISTING_DELETED,
        data: {
          listingType: type.replace(/s$/, ''),  // 'hotels' -> 'hotel'
          listingId: id
        }
      });
    }

    res.status(200).json({
      id,
      message: 'Listing deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to delete listing', req.path));
  }
});

// ==================== USER MANAGEMENT ====================

/**
 * GET /api/v1/admin/users
 * Get all users with pagination
 */
app.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let query = 'SELECT user_id, first_name, last_name, email, phone_number, role, created_at_utc FROM users';
    const params = [];

    if (search) {
      query += ' WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR user_id LIKE ?';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY created_at_utc DESC LIMIT ${limitNum} OFFSET ${skip}`;
    // params.push(limitNum, skip); // Removed params for LIMIT/OFFSET

    const [rows] = await usersPool.execute(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    if (search) {
      countQuery += ' WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR user_id LIKE ?';
    }
    const [countRows] = await usersPool.execute(
      countQuery,
      search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : []
    );
    const total = countRows[0].total;

    res.status(200).json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch users', req.path));
  }
});

/**
 * GET /api/v1/admin/users/:userId
 * Get user details
 */
app.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await usersPool.execute(
      'SELECT * FROM users WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(createErrorResponse(404, 'Not Found', 'User not found', req.path));
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch user', req.path));
  }
});

/**
 * PUT /api/v1/admin/users/:userId
 * Update user account
 */
app.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, phone, address, role } = req.body;

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone_number = ?'); params.push(phone); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (address) {
      if (address.line1 !== undefined) { updates.push('address_line1 = ?'); params.push(address.line1); }
      if (address.line2 !== undefined) { updates.push('address_line2 = ?'); params.push(address.line2); }
      if (address.city !== undefined) { updates.push('city = ?'); params.push(address.city); }
      if (address.state !== undefined) {
        // SPEC REQUIREMENT: State validation with 'malformed_state' error code
        requireValidState(address.state);
        const normalizedState = normalizeState(address.state);
        updates.push('state_code = ?');
        params.push(normalizedState);
      }
      if (address.zipCode !== undefined) {
        // SPEC REQUIREMENT: ZIP validation with 'malformed_zip' error code
        requireValidZip(address.zipCode);
        updates.push('zip_code = ?');
        params.push(address.zipCode);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'No fields to update', req.path));
    }

    updates.push('updated_at_utc = NOW()');
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;

    const [result] = await usersPool.execute(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json(createErrorResponse(404, 'Not Found', 'User not found', req.path));
    }

    res.status(200).json({
      userId,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);

    // Handle spec-required error codes (malformed_state, malformed_zip)
    if (error.code && ['malformed_state', 'malformed_zip'].includes(error.code)) {
      return res.status(error.status || 400).json({
        status: error.status || 400,
        error: error.code,
        message: error.message,
        path: req.path,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to update user', req.path));
  }
});

// ==================== BILLING MANAGEMENT ====================

/**
 * GET /api/v1/admin/billing
 * Search bills by date, month, user, etc.
 */
app.get('/billing', async (req, res) => {
  try {
    const { date, month, year, userId, status, page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let query = `
      SELECT b.*, u.first_name, u.last_name, u.email, bk.listingType as booking_type, bk.status as booking_status
      FROM invoices b
      JOIN kayak_users.users u ON b.userId = u.user_id
      JOIN kayak_bookings.bookings bk ON b.bookingId = bk.bookingId
      WHERE 1=1
    `;
    const params = [];

    if (date) {
      query += ' AND DATE(b.createdAt) = ?';
      params.push(date);
    }

    if (month && year) {
      query += ' AND YEAR(b.createdAt) = ? AND MONTH(b.createdAt) = ?';
      params.push(year, month);
    } else if (year) {
      query += ' AND YEAR(b.createdAt) = ?';
      params.push(year);
    }

    if (userId) {
      query += ' AND b.userId = ?';
      params.push(userId);
    }

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    query += ` ORDER BY b.createdAt DESC LIMIT ${limitNum} OFFSET ${skip}`;
    // params.push(limitNum, skip); // Removed params for LIMIT/OFFSET

    const [rows] = await billingPool.execute(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM invoices b WHERE 1=1';
    const countParams = [];
    if (date) { countQuery += ' AND DATE(b.createdAt) = ?'; countParams.push(date); }
    if (month && year) { countQuery += ' AND YEAR(b.createdAt) = ? AND MONTH(b.createdAt) = ?'; countParams.push(year, month); }
    else if (year) { countQuery += ' AND YEAR(b.createdAt) = ?'; countParams.push(year); }
    if (userId) { countQuery += ' AND b.userId = ?'; countParams.push(userId); }
    if (status) { countQuery += ' AND b.status = ?'; countParams.push(status); }

    const [countRows] = await billingPool.execute(countQuery, countParams);
    const total = countRows[0].total;

    res.status(200).json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error searching bills:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to search bills', req.path));
  }
});

/**
 * GET /api/v1/admin/billing/:billingId
 * Get bill details
 */
app.get('/billing/:billingId', async (req, res) => {
  try {
    const { billingId } = req.params;

    const [rows] = await billingPool.execute(
      `SELECT b.*, u.first_name, u.last_name, u.email, u.phone_number,
              bk.listingType as booking_type, bk.status as booking_status, bk.createdAt as booking_created
       FROM invoices b
       JOIN kayak_users.users u ON b.userId = u.user_id
       JOIN kayak_bookings.bookings bk ON b.bookingId = bk.bookingId
       WHERE b.invoiceId = ?`,
      [billingId]
    );

    if (rows.length === 0) {
      return res.status(404).json(createErrorResponse(404, 'Not Found', 'Bill not found', req.path));
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch bill', req.path));
  }
});

// ==================== ANALYTICS ENDPOINTS ====================

/**
 * GET /api/v1/admin/analytics/revenue/top-properties
 * Top 10 properties with revenue per year
 */
app.get('/analytics/revenue/top-properties', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    const [rows] = await billingPool.execute(
      `SELECT 
         bk.listingId as listing_id,
         bk.listingType as booking_type,
         COUNT(*) as booking_count,
         SUM(b.amount) as total_revenue
        FROM invoices b
        JOIN kayak_bookings.bookings bk ON b.bookingId = bk.bookingId
        WHERE YEAR(b.createdAt) = ? 
          AND b.status = 'paid'
        GROUP BY bk.listingId, bk.listingType
       ORDER BY total_revenue DESC
       LIMIT 10`,
      [year]
    );

    res.status(200).json({
      year: parseInt(year),
      data: rows
    });
  } catch (error) {
    console.error('Error fetching top properties:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/revenue/city-wise
 * City-wise revenue per year
 */
app.get('/analytics/revenue/city-wise', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;

    // This would need to join with listings to get city info
    // For now, using a simplified version
    const [rows] = await billingPool.execute(
      `SELECT 
         u.city,
         COUNT(*) as transaction_count,
         SUM(b.amount) as total_revenue
        FROM invoices b
        JOIN kayak_users.users u ON b.userId = u.user_id
        WHERE YEAR(b.createdAt) = ? 
          AND b.status = 'paid'
        GROUP BY u.city
       ORDER BY total_revenue DESC`,
      [year]
    );

    res.status(200).json({
      year: parseInt(year),
      data: rows
    });
  } catch (error) {
    console.error('Error fetching city-wise revenue:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/providers/top-sellers
 * Top 10 hosts/providers with maximum properties sold last month
 */
app.get('/analytics/providers/top-sellers', async (req, res) => {
  try {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const [rows] = await billingPool.execute(
      `SELECT 
         bk.listingId as listing_id,
         bk.listingType as booking_type,
         COUNT(*) as properties_sold,
         SUM(b.amount) as revenue
        FROM invoices b
        JOIN kayak_bookings.bookings bk ON b.bookingId = bk.bookingId
        WHERE MONTH(b.createdAt) = MONTH(?)
          AND YEAR(b.createdAt) = YEAR(?)
          AND b.status = 'paid'
        GROUP BY bk.listingId, bk.listingType
       ORDER BY properties_sold DESC, revenue DESC
       LIMIT 10`,
      [lastMonth, lastMonth]
    );

    res.status(200).json({
      period: {
        month: lastMonth.getMonth() + 1,
        year: lastMonth.getFullYear()
      },
      data: rows
    });
  } catch (error) {
    console.error('Error fetching top sellers:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/clicks/page
 * Clicks per page analytics
 */
app.get('/analytics/clicks/page', async (req, res) => {
  try {
    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const logsCollection = mongoDb.collection('logs');

    // Aggregate clicks by page
    const pipeline = [
      { $match: { type: 'page_view' } },
      {
        $group: {
          _id: '$page',
          clicks: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user_id' }
        }
      },
      {
        $project: {
          page: '$_id',
          clicks: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { clicks: -1 } }
    ];

    const results = await logsCollection.aggregate(pipeline).toArray();

    res.status(200).json({
      data: results
    });
  } catch (error) {
    console.error('Error fetching page clicks:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/clicks/listings
 * Property/listing clicks analytics
 */
app.get('/analytics/clicks/listings', async (req, res) => {
  try {
    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const logsCollection = mongoDb.collection('logs');

    const pipeline = [
      { $match: { type: 'listing_click', listingId: { $exists: true } } },
      {
        $group: {
          _id: '$listingId',
          clicks: { $sum: 1 },
          listingType: { $first: '$listingType' }
        }
      },
      {
        $project: {
          listingId: '$_id',
          listingType: 1,
          clicks: 1
        }
      },
      { $sort: { clicks: -1 } },
      { $limit: 20 }
    ];

    const results = await logsCollection.aggregate(pipeline).toArray();

    res.status(200).json({
      data: results
    });
  } catch (error) {
    console.error('Error fetching listing clicks:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/least-seen
 * Capture area/section which is least seen
 */
app.get('/analytics/least-seen', async (req, res) => {
  try {
    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const logsCollection = mongoDb.collection('logs');

    const pipeline = [
      { $match: { type: 'page_view' } },
      {
        $group: {
          _id: '$section',
          views: { $sum: 1 }
        }
      },
      {
        $project: {
          section: '$_id',
          views: 1
        }
      },
      { $sort: { views: 1 } },
      { $limit: 10 }
    ];

    const results = await logsCollection.aggregate(pipeline).toArray();

    res.status(200).json({
      data: results
    });
  } catch (error) {
    console.error('Error fetching least seen sections:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/reviews
 * Reviews on properties analytics
 */
app.get('/analytics/reviews', async (req, res) => {
  try {
    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const reviewsCollection = mongoDb.collection('reviews');

    const pipeline = [
      {
        $group: {
          _id: '$listingId',
          reviewCount: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          listingType: { $first: '$listingType' }
        }
      },
      {
        $project: {
          listingId: '$_id',
          listingType: 1,
          reviewCount: 1,
          avgRating: { $round: ['$avgRating', 2] }
        }
      },
      { $sort: { reviewCount: -1 } },
      { $limit: 20 }
    ];

    const results = await reviewsCollection.aggregate(pipeline).toArray();

    res.status(200).json({
      data: results
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch analytics', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/trace/user
 * Trace diagram for tracking a user or cohort
 */
app.get('/analytics/trace/user', async (req, res) => {
  try {
    const { userId, city, state } = req.query;

    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const logsCollection = mongoDb.collection('logs');
    let query = {};

    if (userId) {
      query.user_id = userId;
    } else if (city && state) {
      // Get users from that city/state first
      const [users] = await usersPool.execute(
        'SELECT user_id FROM users WHERE city = ? AND state_code = ?',
        [city, state]
      );
      const userIds = users.map(u => u.user_id);
      query.user_id = { $in: userIds };
    } else {
      return res.status(400).json(createErrorResponse(400, 'Bad Request', 'Provide userId or city+state', req.path));
    }

    const trace = await logsCollection.find(query)
      .sort({ timestamp: 1 })
      .limit(100)
      .toArray();

    res.status(200).json({
      query: { userId, city, state },
      trace: trace.map(t => ({
        timestamp: t.timestamp,
        type: t.type,
        page: t.page,
        action: t.action,
        listingId: t.listingId
      }))
    });
  } catch (error) {
    console.error('Error fetching user trace:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch trace', req.path));
  }
});

// ==================== MISSING ANALYTICS ENDPOINTS ====================
// These are required by the frontend dashboard (AdminDashboardPage.jsx)

/**
 * GET /api/v1/admin/analytics/user-journey
 * User journey analytics - tracks page flow
 */
app.get('/analytics/user-journey', async (req, res) => {
  try {
    if (!mongoDb) {
      return res.status(503).json(createErrorResponse(503, 'Service Unavailable', 'MongoDB not connected', req.path));
    }

    const logsCollection = mongoDb.collection('logs');

    // Aggregate user journeys from page views
    const pipeline = [
      { $match: { type: { $in: ['page_view', 'navigation', 'click'] } } },
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id: '$user_id',
          journey: {
            $push: {
              page: '$page',
              action: '$action',
              timestamp: '$timestamp'
            }
          },
          totalActions: { $sum: 1 }
        }
      },
      { $limit: 100 }
    ];

    const journeys = await logsCollection.aggregate(pipeline).toArray();

    // Calculate journey stats
    const journeyStats = {
      totalUsers: journeys.length,
      avgActionsPerUser: journeys.length > 0
        ? Math.round(journeys.reduce((sum, j) => sum + j.totalActions, 0) / journeys.length)
        : 0,
      journeys: journeys.map(j => ({
        userId: j._id,
        steps: j.journey.slice(0, 10),  // First 10 steps
        totalActions: j.totalActions
      }))
    };

    res.status(200).json(journeyStats);
  } catch (error) {
    console.error('Error fetching user journeys:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch user journeys', req.path));
  }
});

/**
 * GET /api/v1/admin/analytics/cohorts
 * Cohort analysis - users grouped by location
 */
app.get('/analytics/cohorts', async (req, res) => {
  try {
    // Get user cohorts by city/state from MySQL
    const [cityCohorts] = await usersPool.execute(`
      SELECT
        city,
        state_code as state,
        COUNT(*) as userCount,
        MIN(created_at_utc) as firstUser,
        MAX(created_at_utc) as lastUser
      FROM users
      WHERE city IS NOT NULL AND city != ''
      GROUP BY city, state_code
      ORDER BY userCount DESC
      LIMIT 20
    `);

    // Get activity from MongoDB for these cohorts
    let cohortActivity = [];
    if (mongoDb) {
      const logsCollection = mongoDb.collection('logs');
      cohortActivity = await logsCollection.aggregate([
        { $match: { type: { $in: ['page_view', 'booking', 'search'] } } },
        {
          $group: {
            _id: '$city',
            totalActions: { $sum: 1 },
            searches: { $sum: { $cond: [{ $eq: ['$type', 'search'] }, 1, 0] } },
            bookings: { $sum: { $cond: [{ $eq: ['$type', 'booking'] }, 1, 0] } }
          }
        }
      ]).toArray();
    }

    // Merge data
    const cohorts = cityCohorts.map(cohort => {
      const activity = cohortActivity.find(a => a._id === cohort.city) || {};
      return {
        city: cohort.city,
        state: cohort.state,
        userCount: cohort.userCount,
        firstUser: cohort.firstUser,
        lastUser: cohort.lastUser,
        totalActions: activity.totalActions || 0,
        searches: activity.searches || 0,
        bookings: activity.bookings || 0
      };
    });

    res.status(200).json({ cohorts });
  } catch (error) {
    console.error('Error fetching cohorts:', error);
    res.status(500).json(createErrorResponse(500, 'Internal Server Error', 'Failed to fetch cohorts', req.path));
  }
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          🚀 ADMIN SERVICE STARTED                     ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                   ║
║  Environment:  ${process.env.NODE_ENV || 'development'}                    ║
║  Health Check: http://localhost:${PORT}/health         ║
║  Time:         ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (kafkaProducer) await disconnectKafka(kafkaProducer);
  if (mongoClient) await mongoClient.close();
  await usersPool.end();
  await bookingsPool.end();
  await billingPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  if (kafkaProducer) await disconnectKafka(kafkaProducer);
  if (mongoClient) await mongoClient.close();
  await usersPool.end();
  await bookingsPool.end();
  await billingPool.end();
  process.exit(0);
});

