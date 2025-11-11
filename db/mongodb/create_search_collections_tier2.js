// Simple script to create search collections in kayak_doc as per Tier 2 requirements
// Run with: mongosh < db/mongodb/create_search_collections_tier2.js

use kayak_doc;

// Create collections for search (Tier 2 requirement)
db.createCollection('hotels');
db.createCollection('flights');
db.createCollection('cars');

// Add indexes for performance (as per Tier 2 requirements)
db.hotels.createIndex({ city: 1, star_rating: -1, price: 1 });
db.flights.createIndex({ origin: 1, destination: 1, departure_time: 1 });
db.cars.createIndex({ location: 1, car_type: 1, price_per_day: 1 });

print("Search collections created successfully in kayak_doc!");
print("Collections: hotels, flights, cars");
print("Indexes created for all collections");

