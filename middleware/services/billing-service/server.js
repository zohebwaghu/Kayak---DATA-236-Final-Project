/**
 * BILLING SERVICE
 *
 * Purpose: Manages invoices and payments
 * Responsibilities:
 *  - Listen to booking events (Created/Cancelled)
 *  - Generate Invoices
 *  - Process Refunds
 *  - Serve invoice data to frontend
 */

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');
const redis = require('redis');

const app = express();
const PORT = process.env.BILLING_SERVICE_PORT || 3005;

app.use(express.json());

// ==================== DATABASE CONNECTION ====================

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DB = process.env.MYSQL_DB_BILLING || 'kayak_billing';

const pool = mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// Test DB connection
(async () => {
    try {
        const conn = await pool.getConnection();
        console.log(`✅ MySQL billing database connected: ${MYSQL_DB}`);
        conn.release();
    } catch (err) {
        console.error('❌ MySQL connection failed:', err);
        process.exit(1);
    }
})();

// ==================== REDIS CACHE SETUP ====================

const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('❌ Redis error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected'));

// Connect Redis
(async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
    }
})();

// Cache TTL in seconds (5 minutes for billing data)
const CACHE_TTL = 300;

/**
 * Get invoice from cache or null
 */
async function getCachedInvoice(bookingId) {
    if (!redisClient.isOpen) return null;
    try {
        const cached = await redisClient.get(`invoice:${bookingId}`);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.warn('Cache read error:', error);
        return null;
    }
}

/**
 * Get user invoices from cache or null
 */
async function getCachedUserInvoices(userId) {
    if (!redisClient.isOpen) return null;
    try {
        const cached = await redisClient.get(`invoices:user:${userId}`);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.warn('Cache read error:', error);
        return null;
    }
}

/**
 * Cache invoice data
 */
async function cacheInvoice(bookingId, invoiceData) {
    if (!redisClient.isOpen) return;
    try {
        await redisClient.setEx(`invoice:${bookingId}`, CACHE_TTL, JSON.stringify(invoiceData));
    } catch (error) {
        console.warn('Cache write error:', error);
    }
}

/**
 * Cache user invoices list
 */
async function cacheUserInvoices(userId, invoicesData) {
    if (!redisClient.isOpen) return;
    try {
        await redisClient.setEx(`invoices:user:${userId}`, CACHE_TTL, JSON.stringify(invoicesData));
    } catch (error) {
        console.warn('Cache write error:', error);
    }
}

/**
 * Invalidate invoice cache
 */
async function invalidateInvoiceCache(bookingId, userId) {
    if (!redisClient.isOpen) return;
    try {
        await redisClient.del(`invoice:${bookingId}`);
        if (userId) {
            await redisClient.del(`invoices:user:${userId}`);
        }
    } catch (error) {
        console.warn('Cache invalidation error:', error);
    }
}

// ==================== KAFKA SETUP ====================

const kafka = new Kafka({
    clientId: 'billing-service',
    brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(','),
    retry: {
        initialRetryTime: 100,
        retries: 8,
    },
});

const consumer = kafka.consumer({ groupId: 'billing-service-group' });

const TOPICS = {
    BOOKING_EVENTS: 'booking.events',
};

const EVENT_TYPES = {
    BOOKING_CREATED: 'booking.created',
    BOOKING_CANCELLED: 'booking.cancelled',
};

// Idempotency tracking to prevent duplicate message processing
const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 10000;

const connectKafka = async () => {
    try {
        await consumer.connect();
        console.log('✅ Kafka Consumer connected');

        await consumer.subscribe({ topic: TOPICS.BOOKING_EVENTS, fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    // Generate unique message ID for idempotency
                    const messageId = `${topic}-${partition}-${message.offset}`;

                    // Skip if already processed (idempotency check)
                    if (processedMessages.has(messageId)) {
                        console.log(`⏭️  Skipping duplicate message: ${messageId}`);
                        return;
                    }

                    const value = JSON.parse(message.value.toString());
                    const { eventType, data } = value;

                    console.log(`📥 Received event: ${eventType}`, data.bookingId);

                    if (eventType === EVENT_TYPES.BOOKING_CREATED) {
                        await handleBookingCreated(data);
                    } else if (eventType === EVENT_TYPES.BOOKING_CANCELLED) {
                        await handleBookingCancelled(data);
                    }

                    // Mark message as processed
                    processedMessages.add(messageId);

                    // Cleanup old entries to prevent memory leak
                    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
                        const iterator = processedMessages.values();
                        processedMessages.delete(iterator.next().value);
                    }
                } catch (err) {
                    console.error('❌ Error processing Kafka message:', err);
                }
            },
        });
    } catch (err) {
        console.error('❌ Failed to connect to Kafka:', err);
        // Retry logic could go here
    }
};

connectKafka();

// ==================== EVENT HANDLERS ====================

async function handleBookingCreated(bookingData) {
    console.log('👉 handleBookingCreated called with:', bookingData);
    const { bookingId, userId, totalPrice } = bookingData;
    const invoiceId = uuidv4();

    try {
        console.log('👉 Attempting to insert invoice:', invoiceId);

        // Create a simple line item from the total price
        const lineItems = JSON.stringify([{ description: 'Booking Charge', amount: totalPrice }]);

        // Create Invoice record
        await pool.execute(
            `INSERT INTO invoices (
        invoiceId, bookingId, userId, amount, status, issuedAt, paidAt, lineItems, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, 'paid', NOW(), NOW(), ?, NOW(), NOW())`,
            [invoiceId, bookingId, userId, totalPrice, lineItems]
        );
        console.log(`💰 Invoice created for booking ${bookingId}: ${invoiceId}`);

        // SPEC REQUIREMENT: Invalidate cache after invoice creation
        await invalidateInvoiceCache(bookingId, userId);
    } catch (err) {
        console.error(`❌ Failed to create invoice for booking ${bookingId}:`, err);
    }
}

async function handleBookingCancelled(bookingData) {
    const { bookingId } = bookingData;

    try {
        // Get the userId from the invoice before updating (for cache invalidation)
        const [invoices] = await pool.execute(
            'SELECT userId FROM invoices WHERE bookingId = ?',
            [bookingId]
        );
        const userId = invoices.length > 0 ? invoices[0].userId : null;

        // Find the invoice and mark as refunded
        // In a real system, we'd trigger a refund via Stripe/PayPal here
        const [result] = await pool.execute(
            `UPDATE invoices
       SET status = 'cancelled', updatedAt = NOW()
       WHERE bookingId = ?`,
            [bookingId]
        );

        if (result.affectedRows > 0) {
            console.log(`💸 Refund processed for booking ${bookingId}`);

            // SPEC REQUIREMENT: Invalidate cache after invoice cancellation
            await invalidateInvoiceCache(bookingId, userId);
        } else {
            console.warn(`⚠️ No invoice found to refund for booking ${bookingId}`);
        }
    } catch (err) {
        console.error(`❌ Failed to process refund for booking ${bookingId}:`, err);
    }
}

// ==================== API ENDPOINTS ====================

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'Billing Service' });
});

// Get invoice by Booking ID (with Redis caching)
app.get('/api/v1/billing/invoices/:bookingId', async (req, res) => {
    try {
        const { bookingId } = req.params;

        // Check cache first
        const cachedInvoice = await getCachedInvoice(bookingId);
        if (cachedInvoice) {
            return res.json({ ...cachedInvoice, cached: true });
        }

        const [rows] = await pool.execute(
            'SELECT * FROM invoices WHERE bookingId = ?',
            [bookingId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Cache the invoice
        await cacheInvoice(bookingId, rows[0]);

        res.json({ ...rows[0], cached: false });
    } catch (err) {
        console.error('Error fetching invoice:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get all invoices for a User (with Redis caching)
app.get('/api/v1/billing/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Check cache first
        const cachedInvoices = await getCachedUserInvoices(userId);
        if (cachedInvoices) {
            return res.json({ invoices: cachedInvoices, cached: true });
        }

        const [rows] = await pool.execute(
            'SELECT * FROM invoices WHERE userId = ? ORDER BY createdAt DESC',
            [userId]
        );

        // Cache the user invoices
        await cacheUserInvoices(userId, rows);

        res.json({ invoices: rows, cached: false });
    } catch (err) {
        console.error('Error fetching user invoices:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/v1/billing/charge - Process payment
app.post('/api/v1/billing/charge', async (req, res) => {
    const { bookingId, userId, amount, paymentMethod, cardType, cardLast4 } = req.body;

    if (!bookingId || !userId) {
        return res.status(400).json({ error: 'Missing required fields: bookingId, userId' });
    }

    let connection;
    try {
        connection = await pool.getConnection();

        // Get amount from invoice if not provided
        let chargeAmount = amount;
        if (!chargeAmount) {
            const [invoices] = await connection.execute(
                'SELECT amount FROM invoices WHERE bookingId = ?',
                [bookingId]
            );
            if (invoices.length > 0) {
                chargeAmount = invoices[0].amount;
            }
        }

        if (!chargeAmount || chargeAmount <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        // Create payment record
        const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await connection.execute(
            `INSERT INTO payments (paymentId, bookingId, userId, amount, paymentMethod, status, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, 'completed', NOW(), NOW())`,
            [paymentId, bookingId, userId, chargeAmount, paymentMethod || 'credit_card']
        );

        // Update invoice status if exists
        await connection.execute(
            `UPDATE invoices SET status = 'paid', paidAt = NOW(), updatedAt = NOW() WHERE bookingId = ?`,
            [bookingId]
        );

        console.log(`💳 Payment processed: ${paymentId} for booking ${bookingId}`);

        res.json({
            success: true,
            paymentId,
            bookingId,
            amount: chargeAmount,
            status: 'completed',
            cardType: cardType || 'Card',
            cardLast4: cardLast4 || '****'
        });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: 'Payment processing failed' });
    } finally {
        if (connection) connection.release();
    }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
    console.log(`📦 Billing Service running on port ${PORT}`);
});
