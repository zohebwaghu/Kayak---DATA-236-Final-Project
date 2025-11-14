/**
 * BOOKING SERVICE
 * 
 * Purpose: Manages complex, distributed booking transactions
 * Responsibilities:
 *  - Create, retrieve, and cancel bookings
 *  - Transaction management (atomicity)
 *  - Inventory validation and updates
 *  - Publishing booking events to Kafka
 *  - Rollback handling on failures
 * 
 * Database: MySQL (transactional bookings)
 * Message Queue: Kafka (event publishing)
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');

const {
  createKafkaClient,
  createProducer,
  publishEvent,
  disconnectKafka,
  TOPICS,
  EVENT_TYPES
} = require('./shared/kafka');

const {
  createErrorResponse,
  ValidationError,
  NotFoundError,
  ConflictError
} = require('./shared/errorHandler');

const { validateDate } = require('./shared/validators');

const app = express();
const PORT = process.env.BOOKING_SERVICE_PORT || 3004;

app.use(express.json());

// ==================== DATABASE CONNECTION ====================

// Use Tier 3's database structure
// They created both 'kayak' (main) and 'kayak_bookings' (compatibility)
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'password',
  database: process.env.MYSQL_DB_BOOKINGS || 'kayak', // Use 'kayak' (Tier 3's main DB) or 'kayak_bookings' (compatibility)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL database connected');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err);
    process.exit(1);
  });

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
    timestamp: new Date().toISOString()
  });
});

// ==================== BOOKING ENDPOINTS ====================

/**
 * POST /api/v1/bookings
 * Create a new booking with transaction management
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
  const connection = await pool.getConnection();

  try {
    const {
      userId,
      listingType,
      listingId,
      startDate,
      endDate,
      guests = 1,
      totalPrice,
      additionalDetails = {}
    } = req.body;

    // ===== VALIDATION =====
    
    if (!userId || !listingType || !listingId || !startDate || !endDate || !totalPrice) {
      throw new ValidationError('Missing required fields: userId, listingType, listingId, startDate, endDate, totalPrice');
    }

    if (!['hotel', 'flight', 'car'].includes(listingType)) {
      throw new ValidationError('listingType must be one of: hotel, flight, car');
    }

    if (!validateDate(startDate) || !validateDate(endDate)) {
      throw new ValidationError('Dates must be in YYYY-MM-DD format');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      throw new ValidationError('End date must be after start date');
    }

    if (start < new Date()) {
      throw new ValidationError('Start date cannot be in the past');
    }

    if (guests < 1) {
      throw new ValidationError('Number of guests must be at least 1');
    }

    if (totalPrice <= 0) {
      throw new ValidationError('Total price must be greater than 0');
    }

    // ===== START TRANSACTION =====
    
    await connection.beginTransaction();
    console.log('🔄 Transaction started for new booking');

    try {
      // STEP 1: Check if user exists (use Tier 3's snake_case)
      const [users] = await connection.execute(
        'SELECT user_id FROM users WHERE user_id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new NotFoundError('User not found');
      }

      // STEP 2: Check availability (using Tier 3's inventory table)
      const [availability] = await connection.execute(
        `SELECT available_count, price_per_unit 
         FROM inventory 
         WHERE listing_type = ? AND listing_id = ? 
         FOR UPDATE`,
        [listingType, listingId]
      );

      if (availability.length === 0) {
        throw new NotFoundError(`${listingType} listing not found`);
      }

      if (availability[0].available_count < guests) {
        throw new ConflictError(`Insufficient availability. Available: ${availability[0].available_count}, Requested: ${guests}`);
      }

      // STEP 3: Create booking record (Tier 3 uses auto-increment booking_id)
      // Store additional data in metadata_json column
      const [insertResult] = await connection.execute(
        `INSERT INTO bookings (
          user_id, booking_type, listing_id, 
          start_date, end_date, num_guests, 
          subtotal_amount, tax_amount, total_amount,
          status, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'confirmed', NOW(), NOW())`,
        [
          userId,
          listingType,
          listingId,
          startDate,
          endDate,
          guests,
          totalPrice,
          totalPrice
        ]
      );

      // Get the auto-generated booking_id
      const bookingId = insertResult.insertId;

      // Store additional details in booking_items metadata if needed
      // (Tier 3 uses booking_items table for item details)

      // STEP 4: Update inventory (reduce available count using Tier 3's column names)
      const [updateResult] = await connection.execute(
        `UPDATE inventory 
         SET available_count = available_count - ?,
             updated_at_utc = NOW()
         WHERE listing_type = ? AND listing_id = ?`,
        [guests, listingType, listingId]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error('Failed to update inventory');
      }

      // STEP 6: Commit transaction
      await connection.commit();
      console.log('✅ Transaction committed successfully');

      // STEP 7: Publish event to Kafka (after DB commit)
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
            totalPrice
          }
        });
      }

      // STEP 8: Return success response
      res.status(201).json({
        bookingId: bookingId.toString(), // Convert BIGINT to string for API
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
        message: 'Booking created successfully'
      });

    } catch (transactionError) {
      // ROLLBACK on any error
      await connection.rollback();
      console.error('❌ Transaction rolled back:', transactionError.message);
      throw transactionError;
    }

  } catch (error) {
    console.error('Error creating booking:', error);

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof ConflictError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
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

    // Use Tier 3's snake_case column names
    const [bookings] = await pool.execute(
      `SELECT booking_id, user_id, booking_type, listing_id, 
              start_date, end_date, num_guests, total_amount, status, 
              created_at_utc, updated_at_utc 
       FROM bookings WHERE booking_id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      throw new NotFoundError('Booking not found');
    }

    const row = bookings[0];
    // Convert snake_case to camelCase for API response
    const booking = {
      bookingId: row.booking_id.toString(),
      userId: row.user_id,
      listingType: row.booking_type,
      listingId: row.listing_id,
      startDate: row.start_date,
      endDate: row.end_date,
      guests: row.num_guests,
      totalPrice: parseFloat(row.total_amount),
      status: row.status,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc
    };

    res.status(200).json(booking);

  } catch (error) {
    console.error('Error fetching booking:', error);

    if (error instanceof NotFoundError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to fetch booking', req.path)
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

    // Use Tier 3's snake_case column names
    let query = `SELECT booking_id, user_id, booking_type, listing_id, 
                        start_date, end_date, num_guests, total_amount, status,
                        created_at_utc, updated_at_utc 
                 FROM bookings WHERE user_id = ?`;
    const params = [userId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (listingType) {
      query += ' AND booking_type = ?';
      params.push(listingType);
    }

    if (timeFrame === 'past') {
      query += ' AND end_date < CURDATE()';
    } else if (timeFrame === 'current') {
      query += ' AND start_date <= CURDATE() AND end_date >= CURDATE()';
    } else if (timeFrame === 'future') {
      query += ' AND start_date > CURDATE()';
    }

    query += ' ORDER BY start_date DESC';

    const [rows] = await pool.execute(query, params);

    // Convert snake_case to camelCase for API response
    const bookings = rows.map(row => ({
      bookingId: row.booking_id.toString(),
      userId: row.user_id,
      listingType: row.booking_type,
      listingId: row.listing_id,
      startDate: row.start_date,
      endDate: row.end_date,
      guests: row.num_guests,
      totalPrice: parseFloat(row.total_amount),
      status: row.status,
      createdAt: row.created_at_utc,
      updatedAt: row.updated_at_utc
    }));

    res.status(200).json({
      userId,
      count: bookings.length,
      filters: { status, timeFrame, listingType },
      bookings
    });

  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to fetch bookings', req.path)
    );
  }
});

/**
 * PUT /api/v1/bookings/:bookingId/cancel
 * Cancel an existing booking with rollback
 */
app.put('/api/v1/bookings/:bookingId/cancel', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { bookingId } = req.params;
    const { reason = 'User requested cancellation' } = req.body;

    // ===== START TRANSACTION =====
    
    await connection.beginTransaction();
    console.log('🔄 Transaction started for booking cancellation');

    try {
      // STEP 1: Get booking details (with lock) - Use Tier 3's snake_case
      const [bookings] = await connection.execute(
        `SELECT booking_id, user_id, booking_type, listing_id, num_guests, status 
         FROM bookings 
         WHERE booking_id = ? 
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

      // STEP 2: Update booking status - Use Tier 3's snake_case
      await connection.execute(
        `UPDATE bookings 
         SET status = 'cancelled', 
             updated_at_utc = NOW()
         WHERE booking_id = ?`,
        [bookingId]
      );

      // STEP 3: Restore inventory - Use Tier 3's snake_case
      await connection.execute(
        `UPDATE inventory 
         SET available_count = available_count + ?,
             updated_at_utc = NOW()
         WHERE listing_type = ? AND listing_id = ?`,
        [booking.num_guests, booking.booking_type, booking.listing_id]
      );

      // STEP 4: Commit transaction
      await connection.commit();
      console.log('✅ Cancellation transaction committed');

      // STEP 5: Publish event to Kafka
      if (kafkaProducer) {
        await publishEvent(kafkaProducer, TOPICS.BOOKING_EVENTS, bookingId, {
          eventType: EVENT_TYPES.BOOKING_CANCELLED,
          data: {
            bookingId,
            userId: booking.userId,
            reason
          }
        });
      }

      res.status(200).json({
        bookingId,
        status: 'cancelled',
        reason,
        cancelledAt: new Date().toISOString(),
        message: 'Booking cancelled successfully. Refund will be processed.'
      });

    } catch (transactionError) {
      await connection.rollback();
      console.error('❌ Cancellation transaction rolled back:', transactionError.message);
      throw transactionError;
    }

  } catch (error) {
    console.error('Error cancelling booking:', error);

    if (error instanceof NotFoundError || error instanceof ConflictError) {
      return res.status(error.status).json(
        createErrorResponse(error.status, error.error, error.message, req.path)
      );
    }

    res.status(500).json(
      createErrorResponse(500, 'Internal Server Error', 'Failed to cancel booking', req.path)
    );
  } finally {
    connection.release();
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
║          📦 BOOKING SERVICE STARTED                   ║
╠═══════════════════════════════════════════════════════╣
║  Port:         ${PORT}                                   ║
║  Database:     MySQL (${process.env.MYSQL_DB_BOOKINGS || 'kayak_bookings'})      ║
║  Kafka:        ${kafkaProducer ? '✅ Connected' : '❌ Not Connected'}                       ║
║  Time:         ${new Date().toISOString()}  ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectKafka(kafkaProducer, null);
  await pool.end();
  process.exit(0);
});

