const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { faker } = require('@faker-js/faker'); // Ensure faker is installed or use simple random generation

// Config
const MYSQL_CONFIG = {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: 'kayak_bookings', // We'll seed inventory here
    port: 3307
};
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';

const BATCH_SIZE = 1000;
const TARGET_COUNT = 10000;

async function seed() {
    console.log('🚀 Starting Data Seeding (Target: 10,000 records)...');

    // 1. MySQL Connection
    const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);

    // 2. Mongo Connection
    const mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db('kayak');
    const flightsColl = db.collection('flights');
    const hotelsColl = db.collection('hotels');

    try {
        // --- SEED MYSQL INVENTORY ---
        console.log('📦 Seeding MySQL Inventory...');

        // Check current count
        const [rows] = await mysqlConn.execute('SELECT COUNT(*) as count FROM inventory');
        let currentCount = rows[0].count;
        console.log(`   Current Inventory Count: ${currentCount}`);

        if (currentCount < TARGET_COUNT) {
            const needed = TARGET_COUNT - currentCount;
            console.log(`   Inserting ${needed} more records...`);

            for (let i = 0; i < needed; i += BATCH_SIZE) {
                const batch = [];
                const currentBatchSize = Math.min(BATCH_SIZE, needed - i);

                for (let j = 0; j < currentBatchSize; j++) {
                    const type = Math.random() > 0.5 ? 'flight' : 'hotel';
                    const id = `${type}_${Date.now()}_${i}_${j}`;
                    const count = Math.floor(Math.random() * 50) + 1;
                    const price = (Math.random() * 500 + 50).toFixed(2);
                    batch.push([type, id, count, price]);
                }

                const query = 'INSERT INTO inventory (listingType, listingId, availableCount, pricePerUnit) VALUES ?';
                await mysqlConn.query(query, [batch]);
                process.stdout.write('.');
            }
            console.log('\n   ✅ MySQL Inventory Seeded!');
        } else {
            console.log('   ✅ MySQL Inventory already has enough data.');
        }

        // --- SEED MONGO FLIGHTS ---
        console.log('✈️  Seeding MongoDB Flights...');
        const flightCount = await flightsColl.countDocuments();
        console.log(`   Current Flight Count: ${flightCount}`);

        if (flightCount < TARGET_COUNT) {
            const needed = TARGET_COUNT - flightCount;
            const docs = [];
            for (let i = 0; i < needed; i++) {
                docs.push({
                    airline: 'KayakAir',
                    flightNumber: `KA${Math.floor(Math.random() * 9000) + 1000}`,
                    origin: ['SFO', 'JFK', 'LHR', 'MIA', 'LAX'][Math.floor(Math.random() * 5)],
                    destination: ['SFO', 'JFK', 'LHR', 'MIA', 'LAX'][Math.floor(Math.random() * 5)],
                    price: Math.floor(Math.random() * 500) + 100,
                    date: '2025-12-01'
                });
            }
            if (docs.length > 0) await flightsColl.insertMany(docs);
            console.log('   ✅ MongoDB Flights Seeded!');
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mysqlConn.end();
        await mongoClient.close();
    }
}

seed();
