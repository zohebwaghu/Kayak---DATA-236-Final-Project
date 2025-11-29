// Insert sample search data for testing
// This creates sample flights, hotels, and cars in MongoDB for the search service

use('kayak_doc');

// Sample Flights
db.flights.insertMany([
  {
    flightId: 'FLT001',
    origin: 'SFO',
    destination: 'JFK',
    airline: 'American Airlines',
    departureTime: new Date('2026-01-23T08:00:00Z'),
    arrivalTime: new Date('2026-01-23T16:30:00Z'),
    price: 350.00,
    flightClass: 'economy',
    stops: 0,
    duration: 510, // minutes
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    flightId: 'FLT002',
    origin: 'SFO',
    destination: 'JFK',
    airline: 'United Airlines',
    departureTime: new Date('2026-01-23T10:00:00Z'),
    arrivalTime: new Date('2026-01-23T19:00:00Z'),
    price: 320.00,
    flightClass: 'economy',
    stops: 1,
    duration: 600,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    flightId: 'FLT003',
    origin: 'SFO',
    destination: 'JFK',
    airline: 'Delta',
    departureTime: new Date('2026-01-23T14:00:00Z'),
    arrivalTime: new Date('2026-01-23T22:30:00Z'),
    price: 380.00,
    flightClass: 'business',
    stops: 0,
    duration: 510,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    flightId: 'FLT004',
    origin: 'LAX',
    destination: 'JFK',
    airline: 'JetBlue',
    departureTime: new Date('2026-01-24T06:00:00Z'),
    arrivalTime: new Date('2026-01-24T14:30:00Z'),
    price: 280.00,
    flightClass: 'economy',
    stops: 0,
    duration: 510,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    flightId: 'FLT005',
    origin: 'SFO',
    destination: 'LAX',
    airline: 'Southwest',
    departureTime: new Date('2026-01-25T09:00:00Z'),
    arrivalTime: new Date('2026-01-25T10:30:00Z'),
    price: 150.00,
    flightClass: 'economy',
    stops: 0,
    duration: 90,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

// Sample Hotels
db.hotels.insertMany([
  {
    hotelId: 'HTL001',
    name: 'Grand Hotel San Francisco',
    address: {
      street: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102'
    },
    starRating: 4,
    pricePerNight: 250.00,
    roomTypes: [
      { type: 'standard', price: 250.00, available: 5 },
      { type: 'deluxe', price: 350.00, available: 3 }
    ],
    amenities: ['wifi', 'pool', 'gym', 'parking'],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    hotelId: 'HTL002',
    name: 'Luxury Inn New York',
    address: {
      street: '456 Broadway',
      city: 'New York',
      state: 'NY',
      zipCode: '10013'
    },
    starRating: 5,
    pricePerNight: 450.00,
    roomTypes: [
      { type: 'suite', price: 450.00, available: 2 },
      { type: 'penthouse', price: 800.00, available: 1 }
    ],
    amenities: ['wifi', 'spa', 'restaurant', 'concierge'],
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

// Sample Cars
db.cars.insertMany([
  {
    carId: 'CAR001',
    make: 'Toyota',
    model: 'Camry',
    carType: 'Sedan',
    location: 'San Francisco',
    pricePerDay: 45.00,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    carId: 'CAR002',
    make: 'Honda',
    model: 'CR-V',
    carType: 'SUV',
    location: 'San Francisco',
    pricePerDay: 65.00,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    carId: 'CAR003',
    make: 'BMW',
    model: '3 Series',
    carType: 'Luxury',
    location: 'New York',
    pricePerDay: 120.00,
    available: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('✅ Sample search data inserted successfully!');
print('Flights:', db.flights.countDocuments());
print('Hotels:', db.hotels.countDocuments());
print('Cars:', db.cars.countDocuments());

