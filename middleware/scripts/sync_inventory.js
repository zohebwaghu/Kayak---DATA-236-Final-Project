const { MongoClient } = require('mongodb');
const mysql = require('mysql2/promise');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const mongoDbName = process.env.MONGO_DB_SEARCH || 'kayak_doc';

const mysqlConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3307, // Default to external port for local run
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DB_BOOKINGS || 'kayak_bookings'
};

async function syncInventory() {
    const mongoClient = new MongoClient(mongoUri);
    let mysqlConn;

    try {
        // 1. Connect to MongoDB
        await mongoClient.connect();
        console.log('✅ Connected to MongoDB');
        const db = mongoClient.db(mongoDbName);

        // 2. Connect to MySQL
        mysqlConn = await mysql.createConnection(mysqlConfig);
        console.log('✅ Connected to MySQL');

        // 3. Fetch all listings from MongoDB
        const flights = await db.collection('flights').find({}).toArray();
        const hotels = await db.collection('hotels').find({}).toArray();
        const cars = await db.collection('cars').find({}).toArray();

        console.log(`Found ${flights.length} flights, ${hotels.length} hotels, ${cars.length} cars in MongoDB`);

        // 4. Sync to MySQL Inventory
        const syncItem = async (type, item) => {
            const listingId = item._id.toString();
            const price = item.price || item.pricePerNight || item.pricePerDay || 0;

            // Check if exists
            const [rows] = await mysqlConn.execute(
                'SELECT inventoryId FROM inventory WHERE listingType = ? AND listingId = ?',
                [type, listingId]
            );

            if (rows.length === 0) {
                // Insert
                await mysqlConn.execute(
                    'INSERT INTO inventory (listingType, listingId, availableCount, pricePerUnit) VALUES (?, ?, ?, ?)',
                    [type, listingId, 50, price] // Default 50 available
                );
                process.stdout.write('+'); // Progress indicator
            } else {
                process.stdout.write('.'); // Skip indicator
            }
        };

        console.log('\nSyncing Flights...');
        for (const f of flights) await syncItem('flight', f);

        console.log('\nSyncing Hotels...');
        for (const h of hotels) await syncItem('hotel', h);

        console.log('\nSyncing Cars...');
        for (const c of cars) await syncItem('car', c);

        console.log('\n\n✅ Inventory Sync Completed!');

    } catch (err) {
        console.error('\n❌ Error syncing inventory:', err);
    } finally {
        if (mongoClient) await mongoClient.close();
        if (mysqlConn) await mysqlConn.end();
    }
}

syncInventory();
