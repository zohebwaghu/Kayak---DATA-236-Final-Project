/**
 * BOOKING SERVICE
 *
 * Purpose: Manages booking transactions
 * Responsibilities:
 *  - Create, retrieve, and cancel bookings
 *  - Inventory validation and updates
 *  - Publishing booking events to Kafka
 *
 * Databases:
 *  - Users:    MySQL (kayak_users)
 *  - Bookings: MySQL (kayak_bookings) → bookings, inventory, stats
 * Message Queue: Kafka (event publishing)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const {
  createKafkaClient,
  createProducer,
  publishEvent,
  disconnectKafka,
  TOPICS,
  EVENT_TYPES,
} = require('../../shared/kafka');

const {
  createErrorResponse,
  ValidationError,
  NotFoundError,
  ConflictError,
} = require('../../shared/errorHandler');

const { validateDate } = require('../../shared/validators');

const app = express();
const PORT = process.env.BOOKING_SERVICE_PORT || 3004;

app.use(express.json());

// ==================== DATABASE CONNECTIONS ====================
//
// Explicitly use TWO DBs:
//
//   kayak_users      → users table
//   kayak_bookings   → bookings + inventory + stats
//

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'password';

// ---- IMPORTANT FIX HERE ----
let USERS_DB = process.env.MYSQL_DB_USERS || 'kayak_users';
// If any old config sets this to "kayak", force it to the correct DB
if (USERS_DB === 'kayak') {
  USERS_DB = 'kayak_users';
}
// ----------------------------

const BOOKINGS_DB = process.env.MYSQL_DB_BOOKINGS || 'kayak_bookings';

// Pool for users DB
const usersPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: USERS_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Pool for bookings DB
const bookingsPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: BOOKINGS_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Test both connections on startup
(async () => {
  try {
    const usersConn = await usersPool.getConnection();
    console.log(`✅ MySQL users database connected: ${USERS_DB}`);
    usersConn.release();

    const bookingsConn = await bookingsPool.getConnection();
    console.log(`✅ MySQL bookings database connected: ${BOOKINGS_DB}`);
    bookingsConn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err);
    process.exit(1);
  }
})();

// ==================== KAFKA SETUP ====================

let kafkaProducer;

(async () => {
  try {
    const kafka = createKafkaClient('booking-service');
    kafkaProducer = await createProducer(kafka);
  } catch (error) {
    console.error('❌ Failed to initialize Kafka:', error);
  }
})();

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Booking Service',
    timestamp: new Date().toISOString(),
    usersDb: USERS_DB,
    bookingsDb: BOOKINGS_DB,
  });
});

// ==================== BOOKING ENDPOINTS ====================

/**
 * POST /api/v1/bookings
 * Create a new booking with transaction + inventory check
 *
 * Request Body:
 * {
 *   userId: string (SSN format),
 *   listingType: "hotel" | "flight" | "car",
 *   listingId: string,
 *   startDate: string (YYYY-MM-DD),
 *   endDate: string (YYYY-MM-DD),
 *   guests: number,
 *   totalPrice: number,
 *   additionalDetails: object (optional)
 * }
 */
app.post('/api/v1/bookings', async (req, res) => {
  const connection = await bookingsPool.getConnection();

  try {
    const {
      userId,
      listingType,
      listingId,
      startDate,
      endDate,
      guests = 1,
      totalPrice,
      additionalDetails = {},
    } = req.body;

    // ===== VALIDATION =====

    if (
      !userId ||
      !listingType ||
      !listingId ||
      !startDate ||
      !endDate ||
      totalPrice == null
    ) {
      throw new ValidationError(
        'Missing required fields: userId, listingType, listingId, startDate, endDate, totalPrice'
      );
    }

    if (!['hotel', 'flight', 'car'].includes(listingType)) {
      throw new ValidationError('listingType must be one of: hotel, flight, car');
    }

    if (!validateDate(startDate) || !validateDate(endDate)) {
      throw new ValidationError('Dates must be in YYYY-MM-DD format');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (end <= start) {
      throw new ValidationError('End date must be after start date');
    }

    if (start < today) {
      throw new ValidationError('Start date cannot be in the past');
    }

    if (guests < 1) {
      throw new ValidationError('Number of guests must be at least 1');
    }

    if (totalPrice <= 0) {
      throw new ValidationError('Total price must be greater than 0');
    }

    // ===== START TRANSACTION (bookings DB) =====

    await connection.beginTransaction();
    console.log('🔄 Transaction started for new booking');

    try {
      // STEP 1: Check if user exists in kayak_users.users
      // NOTE: users table uses snake_case: user_id
      const [users] = await usersPool.execute(
        'SELECT user_id FROM users WHERE user_id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new NotFoundError('User not found');
      }

      // STEP 2: Check inventory in kayak_bookings.inventory
      //
      // Your schema:
      //  - listingType    (enum)
      //  - listingId      (varchar)
      //  - availableCount (int)
      //  - pricePerUnit   (decimal)
      //
      const [availability] = await connection.execute(
        `SELECT availableCount, pricePerUnit
         FROM inventory
         WHERE listingType = ? AND listingId = ?
         FOR UPDATE`,
        [listingType, listingId]
      );

      if (availability.length === 0) {
        throw new NotFoundError(`${listingType} listing not found in inventory`);
      }

      const { availableCount, pricePerUnit } = availability[0];

      if (availableCount < guests) {
        throw new ConflictError(
          `Insufficient availability. Available: ${availableCount}, Requested: ${guests}`
        );
      }

      // STEP 3: Create booking record in kayak_bookings.bookings
      //
      // Your schema (camelCase):
      //   bookingId (varchar(50), PK)
      //   userId
      //   listingType
      //   listingId
      //   startDate (DATE)
      //   endDate   (DATE)
      //   guests    (INT)
      //   totalPrice (DECIMAL)
      //   status    (enum: pending/confirmed/cancelled)
      //   additionalDetails (JSON)
      //   createdAt, updatedAt (TIMESTAMP)
      //
      const bookingId = randomUUID();

      await connection.execute(
        `INSERT INTO bookings (
          bookingId, userId, listingType, listingId,
          startDate, endDate, guests,
          totalPrice, status, additionalDetails,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, NOW(), NOW())`,
        [
          bookingId,
          userId,
          listingType,
          listingId,
          startDate,
          endDate,
          guests,
          totalPrice,
          JSON.stringify(additionalDetails || {}),
        ]
      );

      // STEP 4: Update inventory (decrement availableCount)
      await connection.execute(
        `UPDATE inventory
         SET availableCount = availableCount - ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE listingType = ? AND listingId = ?`,
        [guests, listingType, listingId]
      );

      // STEP 5: Commit transaction
      await connection.commit();
      console.log('✅ Transaction committed successfully');

      // STEP 6: Publish event to Kafka (after commit)
      if (kafkaProducer) {
        await publishEvent(kafkaProducer, TOPICS.BOOKING_EVENTS, bookingId, {
          eventType: EVENT_TYPES.BOOKING_CREATED,
          data: {
            bookingId,
            userId,
            listingType,
            listingId,
            startDate,
            endDate,
            guests,
            totalPrice,
          },
        });
      }

      // STEP 7: Response
      res.status(201).json({
        bookingId,
        userId,
        listingType,
        listingId,
        startDate,
        endDate,
        guests,
        totalPrice,
        status: 'confirmed',
        additionalDetails,
        createdAt: new Date().toISOString(),
        message: 'Booking created successfully',
      });
    } catch (transactionError) {
      await connection.rollback();
      console.error('❌ Transaction rolled back:', transactionError.message);
      throw transactionError;
    }
  } catch (error) {
    console.error('Error creating booking:', error);

    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      return res
        .status(error.status)
        .json(
          createErrorResponse(
            error.status,
            error.error,
            error.message,
            req.path
          )
        );
    }

    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Booking failed. No charges were made. Please try again.',
        req.path
      )
    );
  } finally {
    connection.release();
  }
});

/**
 * GET /api/v1/bookings/:bookingId
 * Retrieve booking details by ID
 */
app.get('/api/v1/bookings/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;

    const [bookings] = await bookingsPool.execute(
      `SELECT bookingId, userId, listingType, listingId,
              startDate, endDate, guests, totalPrice, status,
              additionalDetails, createdAt, updatedAt
       FROM bookings
       WHERE bookingId = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      throw new NotFoundError('Booking not found');
    }

    const row = bookings[0];

    const booking = {
      bookingId: row.bookingId,
      userId: row.userId,
      listingType: row.listingType,
      listingId: row.listingId,
      startDate: row.startDate,
      endDate: row.endDate,
      guests: row.guests,
      totalPrice: parseFloat(row.totalPrice),
      status: row.status,
      additionalDetails: row.additionalDetails,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    res.status(200).json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);

    if (error instanceof NotFoundError) {
      return res
        .status(error.status)
        .json(
          createErrorResponse(
            error.status,
            error.error,
            error.message,
            req.path
          )
        );
    }

    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to fetch booking',
        req.path
      )
    );
  }
});

/**
 * GET /api/v1/users/:userId/bookings
 * Retrieve all bookings for a user with optional filters
 *
 * Query Parameters:
 *  - status: pending | confirmed | cancelled
 *  - timeFrame: past | current | future
 *  - listingType: hotel | flight | car
 */
app.get('/api/v1/users/:userId/bookings', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, timeFrame, listingType } = req.query;

    let query = `SELECT bookingId, userId, listingType, listingId,
                        startDate, endDate, guests, totalPrice, status,
                        additionalDetails, createdAt, updatedAt
                 FROM bookings
                 WHERE userId = ?`;
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (listingType) {
      query += ' AND listingType = ?';
      params.push(listingType);
    }

    if (timeFrame === 'past') {
      query += ' AND endDate < CURDATE()';
    } else if (timeFrame === 'current') {
      query += ' AND startDate <= CURDATE() AND endDate >= CURDATE()';
    } else if (timeFrame === 'future') {
      query += ' AND startDate > CURDATE()';
    }

    query += ' ORDER BY startDate DESC';

    const [rows] = await bookingsPool.execute(query, params);

    const bookings = rows.map((row) => ({
      bookingId: row.bookingId,
      userId: row.userId,
      listingType: row.listingType,
      listingId: row.listingId,
      startDate: row.startDate,
      endDate: row.endDate,
      guests: row.guests,
      totalPrice: parseFloat(row.totalPrice),
      status: row.status,
      additionalDetails: row.additionalDetails,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.status(200).json({
      userId,
      count: bookings.length,
      filters: { status, timeFrame, listingType },
      bookings,
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to fetch bookings',
        req.path
      )
    );
  }
});

/**
 * GET /api/v1/bookings/user/:userId
 * Convenience endpoint to match frontend/gateway pattern.
 * Internally uses the same query logic as /api/v1/users/:userId/bookings
 */
app.get('/api/v1/bookings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, timeFrame, listingType } = req.query;

    let query = `SELECT bookingId, userId, listingType, listingId,
                        startDate, endDate, guests, totalPrice, status,
                        additionalDetails, createdAt, updatedAt
                 FROM bookings
                 WHERE userId = ?`;
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (listingType) {
      query += ' AND listingType = ?';
      params.push(listingType);
    }

    if (timeFrame === 'past') {
      query += ' AND endDate < CURDATE()';
    } else if (timeFrame === 'current') {
      query += ' AND startDate <= CURDATE() AND endDate >= CURDATE()';
    } else if (timeFrame === 'future') {
      query += ' AND startDate > CURDATE()';
    }

    query += ' ORDER BY startDate DESC';

    const [rows] = await bookingsPool.execute(query, params);

    const bookings = rows.map((row) => ({
      bookingId: row.bookingId,
      userId: row.userId,
      listingType: row.listingType,
      listingId: row.listingId,
      startDate: row.startDate,
      endDate: row.endDate,
      guests: row.guests,
      totalPrice: parseFloat(row.totalPrice),
      status: row.status,
      additionalDetails: row.additionalDetails,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.status(200).json({
      userId,
      count: bookings.length,
      filters: { status, timeFrame, listingType },
      bookings,
    });
  } catch (error) {
    console.error('Error fetching user bookings (bookings/user route):', error);
    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to fetch bookings',
        req.path
      )
    );
  }
});

/**
 * PUT /api/v1/bookings/:bookingId/cancel
 * Cancel an existing booking with inventory rollback
 */
app.put('/api/v1/bookings/:bookingId/cancel', async (req, res) => {
  const connection = await bookingsPool.getConnection();

  try {
    const { bookingId } = req.params;
    const { reason = 'User requested cancellation' } = req.body;

    await connection.beginTransaction();
    console.log('🔄 Transaction started for booking cancellation');

    try {
      // STEP 1: Get booking details (lock row)
      const [bookings] = await connection.execute(
        `SELECT bookingId, userId, listingType, listingId, guests, status
         FROM bookings
         WHERE bookingId = ?
         FOR UPDATE`,
        [bookingId]
      );

      if (bookings.length === 0) {
        throw new NotFoundError('Booking not found');
      }

      const booking = bookings[0];

      if (booking.status === 'cancelled') {
        throw new ConflictError('Booking is already cancelled');
      }

      // STEP 2: Update booking status
      await connection.execute(
        `UPDATE bookings
         SET status = 'cancelled',
             updatedAt = CURRENT_TIMESTAMP
         WHERE bookingId = ?`,
        [bookingId]
      );

      // STEP 3: Restore inventory (increment availableCount)
      await connection.execute(
        `UPDATE inventory
         SET availableCount = availableCount + ?,
             updatedAt = CURRENT_TIMESTAMP
         WHERE listingType = ? AND listingId = ?`,
        [booking.guests, booking.listingType, booking.listingId]
      );

      // STEP 4: Commit
      await connection.commit();
      console.log('✅ Cancellation transaction committed');

      // STEP 5: Publish event
      if (kafkaProducer) {
        await publishEvent(kafkaProducer, TOPICS.BOOKING_EVENTS, bookingId, {
          eventType: EVENT_TYPES.BOOKING_CANCELLED,
          data: {
            bookingId,
            userId: booking.userId,
            reason,
          },
        });
      }

      res.status(200).json({
        bookingId,
        status: 'cancelled',
        reason,
        cancelledAt: new Date().toISOString(),
        message: 'Booking cancelled successfully. Refund will be processed.',
      });
    } catch (transactionError) {
      await connection.rollback();
      console.error(
        '❌ Cancellation transaction rolled back:',
        transactionError.message
      );
      throw transactionError;
    }
  } catch (error) {
    console.error('Error cancelling booking:', error);

    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return res
        .status(error.status)
        .json(
          createErrorResponse(
            error.status,
            error.error,
            error.message,
            req.path
          )
        );
    }

    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to cancel booking',
        req.path
      )
    );
  } finally {
    connection.release();
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res
    .status(404)
    .json(
      createErrorResponse(
        404,
        'Not Found',
        `Endpoint ${req.method} ${req.path} not found`,
        req.path
      )
    );
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json(
    createErrorResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred',
      req.path
    )
  );
});

// ==================== SERVER STARTUP ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          📦 BOOKING SERVICE STARTED                   ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                ║
║  Users DB:     MySQL (${USERS_DB})                    ║
║  Bookings DB:  MySQL (${BOOKINGS_DB})                 ║
║  Kafka:        ${kafkaProducer ? '✅ Connected' : '❌ Not Connected'}   ║
║  Time:         ${new Date().toISOString()}           ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await usersPool.end();
  await bookingsPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await usersPool.end();
  await bookingsPool.end();
  process.exit(0);
});
