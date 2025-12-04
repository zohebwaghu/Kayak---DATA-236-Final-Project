const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB_SEARCH || 'kayak_doc';

const cars = [
    {
        name: 'Toyota Camry',
        carType: 'Sedan',
        location: 'San Francisco',
        pricePerDay: 55,
        seats: 5,
        transmission: 'Automatic',
        image: 'https://example.com/camry.jpg'
    },
    {
        name: 'Ford Mustang',
        carType: 'Convertible',
        location: 'Los Angeles',
        pricePerDay: 120,
        seats: 4,
        transmission: 'Automatic',
        image: 'https://example.com/mustang.jpg'
    },
    {
        name: 'Tesla Model 3',
        carType: 'Electric',
        location: 'San Francisco',
        pricePerDay: 95,
        seats: 5,
        transmission: 'Automatic',
        image: 'https://example.com/tesla.jpg'
    },
    {
        name: 'Honda CR-V',
        carType: 'SUV',
        location: 'New York',
        pricePerDay: 75,
        seats: 5,
        transmission: 'Automatic',
        image: 'https://example.com/crv.jpg'
    },
    {
        name: 'Chevrolet Tahoe',
        carType: 'SUV',
        location: 'Miami',
        pricePerDay: 110,
        seats: 7,
        transmission: 'Automatic',
        image: 'https://example.com/tahoe.jpg'
    }
];

async function seedCars() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(dbName);
        const collection = db.collection('cars');

        // Clear existing cars
        await collection.deleteMany({});
        console.log('Cleared existing cars');

        // Insert new cars
        const result = await collection.insertMany(cars);
        console.log(`Inserted ${result.insertedCount} cars`);

    } catch (err) {
        console.error('Error seeding cars:', err);
    } finally {
        await client.close();
    }
}

seedCars();
