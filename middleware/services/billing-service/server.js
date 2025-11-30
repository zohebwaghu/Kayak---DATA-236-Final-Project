// BILLING SERVICE
//
// Purpose: Records invoices & payments for completed bookings.
// Databases:
//   - kayak_billing  → invoices, payments
//   - kayak_bookings → bookings (to read amount & listing info)

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');

const {
  createErrorResponse,
  ValidationError,
  NotFoundError,
} = require('../../shared/errorHandler');

const app = express();
const PORT = process.env.BILLING_SERVICE_PORT || 3005;

app.use(express.json());

// ==================== DATABASE CONNECTIONS ====================

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';

const BILLING_DB = process.env.MYSQL_DB_BILLING || 'kayak_billing';
const BOOKINGS_DB = process.env.MYSQL_DB_BOOKINGS || 'kayak_bookings';

// Pool for billing DB (invoices + payments)
const billingPool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: BILLING_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// Pool for bookings DB (to read bookings)
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
    const bConn = await billingPool.getConnection();
    console.log(`✅ MySQL billing database connected: ${BILLING_DB}`);
    bConn.release();

    const bkConn = await bookingsPool.getConnection();
    console.log(`✅ MySQL bookings database connected: ${BOOKINGS_DB}`);
    bkConn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err);
    process.exit(1);
  }
})();

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'Billing Service',
    timestamp: new Date().toISOString(),
    billingDb: BILLING_DB,
    bookingsDb: BOOKINGS_DB,
  });
});

// ==================== BILLING ENDPOINTS ====================

/**
 * POST /api/v1/billing/charge
 *
 * Body:
 * {
 *   bookingId: string,
 *   userId: string,           // SSN-style user id
 *   paymentMethod: "credit_card" | "debit_card" | "paypal" | "stripe",
 *   cardType?: string,        // "Visa", "Mastercard", etc. (for record only)
 *   cardLast4?: string        // last 4 digits for receipts
 * }
 *
 * Behaviour:
 *  - Looks up booking in kayak_bookings.bookings
 *  - Uses booking.totalPrice as amount
 *  - Inserts invoice (status = 'paid')
 *  - Inserts payment  (status = 'completed')
 */
app.post('/api/v1/billing/charge', async (req, res) => {
  const billingConn = await billingPool.getConnection();

  try {
    const {
      bookingId,
      userId,
      paymentMethod,
      cardType,
      cardLast4,
    } = req.body;

    // ===== BASIC VALIDATION =====
    if (!bookingId || !userId || !paymentMethod) {
      throw new ValidationError(
        'Missing required fields: bookingId, userId, paymentMethod'
      );
    }

    if (!['credit_card', 'debit_card', 'paypal', 'stripe'].includes(paymentMethod)) {
      throw new ValidationError(
        "paymentMethod must be one of: 'credit_card', 'debit_card', 'paypal', 'stripe'"
      );
    }

    // ===== LOOK UP BOOKING (read-only, from bookings DB) =====
    const [bookings] = await bookingsPool.execute(
      `SELECT bookingId, userId, listingType, listingId,
              startDate, endDate, guests, totalPrice, status
       FROM bookings
       WHERE bookingId = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      throw new NotFoundError('Booking not found');
    }

    const booking = bookings[0];

    if (booking.userId !== userId) {
      throw new ValidationError('Booking does not belong to this user');
    }

    if (booking.status === 'cancelled') {
      throw new ValidationError('Cannot charge a cancelled booking');
    }

    const amount = parseFloat(booking.totalPrice);
    const currency = 'USD';

    // ===== START TRANSACTION ON BILLING DB =====
    await billingConn.beginTransaction();
    console.log('💳 Billing transaction started');

    const invoiceId = randomUUID();
    const paymentId = randomUUID();
    const now = new Date();

    const lineItems = JSON.stringify([
      {
        bookingId: booking.bookingId,
        listingType: booking.listingType,
        listingId: booking.listingId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        guests: booking.guests,
        amount,
      },
    ]);

    // Simulated processor response
    const transactionId = `SIM-${Date.now()}`;
    const processorResponse = JSON.stringify({
      simulated: true,
      message: 'Payment approved',
      cardType: cardType || null,
      cardLast4: cardLast4 || null,
    });

    // ----- Insert invoice -----
    await billingConn.execute(
      `INSERT INTO invoices (
        invoiceId, bookingId, userId,
        amount, currency, status,
        issuedAt, paidAt, dueAt, lineItems
      ) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
      [
        invoiceId,
        bookingId,
        userId,
        amount,
        currency,
        now,
        now,
        now,         // dueAt (for this lab, same as paidAt)
        lineItems,
      ]
    );

    // ----- Insert payment -----
    await billingConn.execute(
      `INSERT INTO payments (
        paymentId, bookingId, userId,
        amount, currency, paymentMethod,
        status, transactionId, processorResponse
      ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
      [
        paymentId,
        bookingId,
        userId,
        amount,
        currency,
        paymentMethod,
        transactionId,
        processorResponse,
      ]
    );

    await billingConn.commit();
    console.log('✅ Billing transaction committed');

    res.status(201).json({
      invoiceId,
      paymentId,
      bookingId,
      userId,
      amount,
      currency,
      status: 'completed',
      transactionId,
      cardLast4: cardLast4 || null,
      cardType: cardType || null,
      message: 'Payment processed and invoice created',
    });
  } catch (error) {
    console.error('Error in /billing/charge:', error);

    try {
      await billingConn.rollback();
      console.log('↩️ Billing transaction rolled back');
    } catch (rollbackErr) {
      console.error('Error during rollback:', rollbackErr);
    }

    if (error instanceof ValidationError || error instanceof NotFoundError) {
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

    return res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Payment processing failed',
        req.path
      )
    );
  } finally {
    billingConn.release();
  }
});

/**
 * GET /api/v1/billing/users/:userId/invoices
 * List all invoices for a given user
 */
app.get('/api/v1/billing/users/:userId/invoices', async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await billingPool.execute(
      `SELECT invoiceId, bookingId, userId,
              amount, currency, status,
              issuedAt, paidAt, dueAt, lineItems,
              createdAt, updatedAt
       FROM invoices
       WHERE userId = ?
       ORDER BY issuedAt DESC`,
      [userId]
    );

    const invoices = rows.map((row) => ({
      invoiceId: row.invoiceId,
      bookingId: row.bookingId,
      userId: row.userId,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status,
      issuedAt: row.issuedAt,
      paidAt: row.paidAt,
      dueAt: row.dueAt,
      lineItems: row.lineItems,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.status(200).json({ userId, count: invoices.length, invoices });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to fetch invoices',
        req.path
      )
    );
  }
});

/**
 * GET /api/v1/billing/users/:userId/payments
 * List all payments for a given user
 */
app.get('/api/v1/billing/users/:userId/payments', async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await billingPool.execute(
      `SELECT paymentId, bookingId, userId,
              amount, currency, paymentMethod,
              status, transactionId, processorResponse,
              createdAt, updatedAt
       FROM payments
       WHERE userId = ?
       ORDER BY createdAt DESC`,
      [userId]
    );

    const payments = rows.map((row) => ({
      paymentId: row.paymentId,
      bookingId: row.bookingId,
      userId: row.userId,
      amount: parseFloat(row.amount),
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      status: row.status,
      transactionId: row.transactionId,
      processorResponse: row.processorResponse,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.status(200).json({ userId, count: payments.length, payments });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json(
      createErrorResponse(
        500,
        'Internal Server Error',
        'Failed to fetch payments',
        req.path
      )
    );
  }
});

// ==================== FALLBACKS & STARTUP ====================

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
  console.error('Unhandled error in Billing Service:', err);
  res.status(500).json(
    createErrorResponse(
      500,
      'Internal Server Error',
      'An unexpected error occurred',
      req.path
    )
  );
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║          💳 BILLING SERVICE STARTED                   ║
╠═══════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                 
║  Billing DB:  MySQL (${BILLING_DB})
║  Bookings DB: MySQL (${BOOKINGS_DB})
║  Time:        ${new Date().toISOString()}
╚═══════════════════════════════════════════════════════╝
  `);
});
