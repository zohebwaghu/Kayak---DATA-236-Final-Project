/**
 * Add Synthetic Date Columns to Flights Collection
 * 
 * This script adds departureDate and arrivalDate fields to all flights
 * based on their days_left value, generating dates from today to 6 months in the future.
 * 
 * Usage:
 *   mongosh "mongodb://localhost:27017/kayak_doc" < scripts/add_synthetic_dates_to_flights.js
 * 
 * Or run directly:
 *   node scripts/add_synthetic_dates_to_flights.js
 */

const dbName = 'kayak_doc';
const db = db.getSiblingDB(dbName);

print("🚀 Starting to add synthetic dates to flights...");
print(`📅 Date range: Today to 6 months in the future`);

// Get today's date
const today = new Date();
today.setHours(0, 0, 0, 0);

// Calculate 6 months from today
const sixMonthsLater = new Date(today);
sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
sixMonthsLater.setHours(23, 59, 59, 999);

print(`   Today: ${today.toISOString().split('T')[0]}`);
print(`   6 Months Later: ${sixMonthsLater.toISOString().split('T')[0]}`);

// Get total count
const totalFlights = db.flights.countDocuments();
print(`\n📊 Total flights to update: ${totalFlights}`);

// Process in batches
const batchSize = 1000;
let processed = 0;
let updated = 0;

// Get all flights with days_left
const flights = db.flights.find({}).toArray();
print(`\n🔄 Processing ${flights.length} flights...`);

for (let i = 0; i < flights.length; i++) {
  const flight = flights[i];
  
  // Calculate departure date based on days_left
  let daysLeft = flight.days_left || 1;
  
  // Ensure days_left is within valid range (1-180 days = 6 months)
  if (daysLeft < 1) daysLeft = 1;
  if (daysLeft > 180) daysLeft = 180;
  
  // Calculate departure date
  const departureDate = new Date(today);
  departureDate.setDate(departureDate.getDate() + daysLeft - 1);
  departureDate.setHours(0, 0, 0, 0);
  
  // Calculate arrival date (add duration in hours)
  const durationHours = flight.duration || 2.0; // Default 2 hours if not specified
  const arrivalDate = new Date(departureDate);
  arrivalDate.setHours(arrivalDate.getHours() + Math.ceil(durationHours));
  
  // Ensure dates don't exceed 6 months
  if (departureDate > sixMonthsLater) {
    // If days_left would put us beyond 6 months, use a random date within 6 months
    const maxDays = Math.floor((sixMonthsLater - today) / (1000 * 60 * 60 * 24));
    const randomDays = Math.floor(Math.random() * maxDays) + 1;
    departureDate.setTime(today.getTime() + (randomDays * 24 * 60 * 60 * 1000));
    arrivalDate.setTime(departureDate.getTime() + (durationHours * 60 * 60 * 1000));
  }
  
  // Update the flight document
  const result = db.flights.updateOne(
    { _id: flight._id },
    {
      $set: {
        departureDate: departureDate,
        arrivalDate: arrivalDate,
        departure_date: departureDate.toISOString().split('T')[0], // YYYY-MM-DD format
        arrival_date: arrivalDate.toISOString().split('T')[0],
        // Also update days_left to match the actual date difference
        days_left: daysLeft
      }
    }
  );
  
  if (result.modifiedCount > 0) {
    updated++;
  }
  
  processed++;
  
  // Progress update every 1000 flights
  if (processed % batchSize === 0) {
    print(`   Processed: ${processed}/${flights.length} (${Math.round(processed/flights.length*100)}%)`);
  }
}

print(`\n✅ Completed!`);
print(`   Processed: ${processed} flights`);
print(`   Updated: ${updated} flights`);

// Create indexes on the new date fields for better query performance
print(`\n📇 Creating indexes on date fields...`);
try {
  db.flights.createIndex({ departureDate: 1 });
  db.flights.createIndex({ departure_date: 1 });
  db.flights.createIndex({ origin: 1, destination: 1, departureDate: 1 });
  db.flights.createIndex({ origin: 1, destination: 1, departure_date: 1 });
  print("   ✅ Indexes created successfully");
} catch (e) {
  print(`   ⚠️  Index creation warning: ${e.message}`);
}

// Verify the update
print(`\n🔍 Verifying updates...`);
const sampleFlight = db.flights.findOne({ departureDate: { $exists: true } });
if (sampleFlight) {
  print(`   Sample flight:`);
  print(`     Origin: ${sampleFlight.origin}`);
  print(`     Destination: ${sampleFlight.destination}`);
  print(`     Departure Date: ${sampleFlight.departureDate}`);
  print(`     Departure Date (string): ${sampleFlight.departure_date}`);
  print(`     Days Left: ${sampleFlight.days_left}`);
}

const flightsWithDates = db.flights.countDocuments({ departureDate: { $exists: true } });
print(`\n📊 Flights with dates: ${flightsWithDates}/${totalFlights}`);

// Show date range distribution
print(`\n📅 Date Range Distribution:`);
const dateStats = db.flights.aggregate([
  {
    $group: {
      _id: null,
      minDate: { $min: "$departureDate" },
      maxDate: { $max: "$departureDate" },
      avgDaysLeft: { $avg: "$days_left" }
    }
  }
]).toArray();

if (dateStats.length > 0) {
  const stats = dateStats[0];
  print(`   Earliest departure: ${stats.minDate}`);
  print(`   Latest departure: ${stats.maxDate}`);
  print(`   Average days_left: ${Math.round(stats.avgDaysLeft)}`);
}

print(`\n✨ Done! Flights now have synthetic dates from today to 6 months in the future.`);
