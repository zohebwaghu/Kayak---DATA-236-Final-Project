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

const connectKafka = async () => {
    try {
        await consumer.connect();
        console.log('✅ Kafka Consumer connected');

        await consumer.subscribe({ topic: TOPICS.BOOKING_EVENTS, fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const value = JSON.parse(message.value.toString());
                    const { eventType, data } = value;

                    console.log(`📥 Received event: ${eventType}`, data.bookingId);

                    if (eventType === EVENT_TYPES.BOOKING_CREATED) {
                        await handleBookingCreated(data);
                    } else if (eventType === EVENT_TYPES.BOOKING_CANCELLED) {
                        await handleBookingCancelled(data);
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
    } catch (err) {
        console.error(`❌ Failed to create invoice for booking ${bookingId}:`, err);
    }
}

async function handleBookingCancelled(bookingData) {
    const { bookingId } = bookingData;

    try {
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

// Get invoice by Booking ID
app.get('/api/v1/billing/invoices/:bookingId', async (req, res) => {
    try {
        const { bookingId } = req.params;
        const [rows] = await pool.execute(
            'SELECT * FROM invoices WHERE bookingId = ?',
            [bookingId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching invoice:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get all invoices for a User
app.get('/api/v1/billing/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.execute(
            'SELECT * FROM invoices WHERE userId = ? ORDER BY createdAt DESC',
            [userId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching user invoices:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==================== SERVER START ====================

app.listen(PORT, () => {
    console.log(`📦 Billing Service running on port ${PORT}`);
});
