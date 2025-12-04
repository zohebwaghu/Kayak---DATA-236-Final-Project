/**
 * Import Real Kaggle Data into MongoDB
 * Uses Node.js to avoid Python dependency issues
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB = process.env.MONGO_DB || 'kayak_doc';

// City to airport code mapping (India dataset)
const cityToAirport = {
  'Delhi': 'DEL',
  'Mumbai': 'BOM',
  'Bangalore': 'BLR',
  'Kolkata': 'CCU',
  'Hyderabad': 'HYD',
  'Chennai': 'MAA'
};

// Time of day to hour mapping
const timeToHour = {
  'Early_Morning': 6,
  'Morning': 9,
  'Afternoon': 14,
  'Evening': 18,
  'Night': 21,
  'Late_Night': 23
};

async function importFlights() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(MONGO_DB);
    const collection = db.collection('flights');
    
    // Clear existing flights
    await collection.deleteMany({});
    console.log('✅ Cleared existing flights');
    
    const flights = [];
    const filePath = path.join(__dirname, '../data/Clean_Dataset.csv');
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }
    
    console.log(`📖 Reading ${filePath}...`);
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const sourceCity = row.source_city || row['source_city'];
          const destCity = row.destination_city || row['destination_city'];
          const airline = row.airline || row['airline'];
          const price = parseFloat(row.price || row['price'] || 0);
          const stops = row.stops === 'zero' ? 0 : parseInt(row.stops || 0);
          const duration = parseFloat(row.duration || row['duration'] || 0);
          const flightClass = (row.class || row['class'] || 'Economy').toLowerCase();
          
          const origin = cityToAirport[sourceCity] || sourceCity;
          const destination = cityToAirport[destCity] || destCity;
          
          if (!origin || !destination || !airline || price <= 0) {
            return; // Skip invalid rows
          }
          
          // Generate departure time (days from now)
          const daysFromNow = Math.floor(Math.random() * 30) + 1;
          const departureDate = new Date();
          departureDate.setDate(departureDate.getDate() + daysFromNow);
          
          const departureTime = timeToHour[row.departure_time] || 12;
          departureDate.setHours(departureTime, 0, 0, 0);
          
          // Calculate arrival time
          const arrivalDate = new Date(departureDate);
          arrivalDate.setMinutes(arrivalDate.getMinutes() + Math.round(duration * 60));
          
          // Calculate days_left for search compatibility
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const departure = new Date(departureDate);
          departure.setHours(0, 0, 0, 0);
          const diffTime = departure - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const days_left = Math.max(1, diffDays);
          
          const flight = {
            flightId: `FLT${String(flights.length + 1).padStart(6, '0')}`,
            origin: origin,
            destination: destination,
            airline: airline,
            departureTime: departureDate,
            arrivalTime: arrivalDate,
            price: price,
            flightClass: flightClass,
            stops: stops,
            duration: Math.round(duration * 60), // Convert to minutes
            days_left: days_left,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          flights.push(flight);
          
          // Insert in batches of 1000
          if (flights.length >= 1000) {
            collection.insertMany(flights.splice(0, 1000));
            process.stdout.write(`\r📊 Processed ${flights.length} flights...`);
          }
        })
        .on('end', async () => {
          // Insert remaining flights
          if (flights.length > 0) {
            await collection.insertMany(flights);
          }
          
          const count = await collection.countDocuments();
          console.log(`\n✅ Imported ${count} flights into MongoDB`);
          
          // Create indexes
          await collection.createIndex({ origin: 1, destination: 1 });
          await collection.createIndex({ price: 1 });
          await collection.createIndex({ days_left: 1 });
          console.log('✅ Created indexes');
          
          await client.close();
          resolve();
        })
        .on('error', (error) => {
          console.error('❌ Error reading CSV:', error);
          reject(error);
        });
    });
  } catch (error) {
    console.error('❌ Import error:', error);
    await client.close();
    throw error;
  }
}

// Run import
importFlights()
  .then(() => {
    console.log('🎉 Import complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Import failed:', error);
    process.exit(1);
  });

