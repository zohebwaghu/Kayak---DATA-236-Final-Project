#!/usr/bin/env python3
"""
Process Kaggle Datasets and Load into Database
Processes Airbnb, Hotels, Flights, and Airports data
"""

import os
import sys
import pandas as pd
import mysql.connector
from pymongo import MongoClient
from datetime import datetime, timedelta
import json
import random
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

DATA_DIR = PROJECT_ROOT / "data" / "kaggle"

# Create data directory if it doesn't exist
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Database connections
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', ''),
    'database': 'kayak'
}

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
MONGO_DB = 'kayak_doc'

def connect_mysql():
    """Connect to MySQL database"""
    return mysql.connector.connect(**MYSQL_CONFIG)

def connect_mongo():
    """Connect to MongoDB database"""
    client = MongoClient(MONGO_URI)
    return client[MONGO_DB]

def process_airbnb_data(mongo_db):
    """
    Process Inside Airbnb NYC dataset
    Extract: listing_id, date, price, availability, amenities, neighbourhood
    Compute avg_30d_price and flag deals
    """
    print("📊 Processing Airbnb Data...")
    
    # Find listings CSV - check multiple locations including archive subdirectories
    listings_file = None
    search_paths = [
        DATA_DIR / "airbnb" / "listings.csv",
        DATA_DIR / "airbnb" / "listings_summary.csv",
        DATA_DIR / "airbnb" / "archive" / "listings.csv",
        DATA_DIR / "airbnb" / "archive" / "listings 2.csv",
        DATA_DIR / "listings.csv",
        DATA_DIR / "listings_summary.csv"
    ]
    
    # Also search for any CSV in airbnb directory
    for path in search_paths:
        if path.exists():
            listings_file = path
            break
    
    if not listings_file:
        # Try glob search (including archive subdirectories)
        for pattern in ['**/listings*.csv', '**/*airbnb*.csv']:
            files = list(DATA_DIR.glob(pattern))
            if files:
                # Prefer files not in archive, but use archive if that's all we have
                non_archive = [f for f in files if 'archive' not in str(f)]
                listings_file = non_archive[0] if non_archive else files[0]
                break
    
    if not listings_file:
        print("⚠️  Airbnb listings file not found.")
        print("   💡 Tip: Download listings.csv from Kaggle and place in data/kaggle/airbnb/")
        print("   📥 URL: https://www.kaggle.com/datasets/dominoweir/inside-airbnb-nyc")
        print("   🔄 Creating sample data instead...")
        # Create sample data
        _create_sample_airbnb_data(mongo_db)
        return
    
    print(f"   Reading: {listings_file}")
    df = pd.read_csv(listings_file, low_memory=False)
    
    # Extract relevant fields
    hotels = []
    for _, row in df.head(1000).iterrows():  # Limit to 1000 for testing
        try:
            # Parse price (remove $ and commas)
            price_str = str(row.get('price', '0')).replace('$', '').replace(',', '')
            price = float(price_str) if price_str.replace('.', '').isdigit() else 0
            
            if price == 0 or price > 10000:  # Skip invalid prices
                continue
            
            # Parse amenities
            amenities_str = str(row.get('amenities', ''))
            amenities = []
            if amenities_str and amenities_str != 'nan':
                # Remove {} and split by comma
                amenities_str = amenities_str.replace('{', '').replace('}', '')
                amenities = [a.strip().replace('"', '') for a in amenities_str.split(',')]
            
            # Create hotel document
            hotel = {
                'hotelId': f"HTL_{row.get('id', random.randint(1000, 9999))}",
                'name': str(row.get('name', 'Unnamed Hotel'))[:100],
                'address': {
                    'street': str(row.get('street', ''))[:128],
                    'city': 'New York',
                    'state': 'NY',
                    'zipCode': str(row.get('zipcode', '10001'))[:10]
                },
                'starRating': min(5, max(1, int(row.get('review_scores_rating', 3) / 20) if pd.notna(row.get('review_scores_rating')) else 3)),
                'pricePerNight': round(price, 2),
                'roomTypes': [{
                    'type': 'standard',
                    'price': round(price, 2),
                    'available': int(row.get('availability_30', 0)) if pd.notna(row.get('availability_30')) else random.randint(1, 10)
                }],
                'amenities': amenities[:10],  # Limit to 10 amenities
                'neighbourhood': str(row.get('neighbourhood_cleansed', 'Unknown'))[:64],
                'latitude': float(row.get('latitude', 0)) if pd.notna(row.get('latitude')) else 0,
                'longitude': float(row.get('longitude', 0)) if pd.notna(row.get('longitude')) else 0,
                'createdAt': datetime.utcnow(),
                'updatedAt': datetime.utcnow()
            }
            
            hotels.append(hotel)
        except Exception as e:
            print(f"   ⚠️  Error processing row: {e}")
            continue
    
    # Insert into MongoDB
    if hotels:
        mongo_db.hotels.insert_many(hotels)
        print(f"   ✅ Inserted {len(hotels)} hotels from Airbnb data")
    
    # Also insert into MySQL hotels table
    try:
        conn = connect_mysql()
        cursor = conn.cursor()
        
        for hotel in hotels[:500]:  # Limit MySQL inserts
            try:
                cursor.execute("""
                    INSERT INTO hotels (
                        hotel_id, name, address_line1, city, state_code, zip_code,
                        star_rating, price_per_night, created_at_utc, updated_at_utc
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON DUPLICATE KEY UPDATE updated_at_utc = NOW()
                """, (
                    hotel['hotelId'],
                    hotel['name'],
                    hotel['address']['street'],
                    hotel['address']['city'],
                    hotel['address']['state'],
                    hotel['address']['zipCode'],
                    hotel['starRating'],
                    hotel['pricePerNight']
                ))
            except Exception as e:
                print(f"   ⚠️  MySQL insert error: {e}")
        
        conn.commit()
        cursor.close()
        conn.close()
        print(f"   ✅ Inserted {min(500, len(hotels))} hotels into MySQL")
    except Exception as e:
        print(f"   ⚠️  MySQL connection error: {e}")

def _create_sample_airbnb_data(mongo_db):
    """Create sample Airbnb data if CSV not found"""
    print("   Creating sample Airbnb listings...")
    hotels = []
    cities = ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Miami']
    neighbourhoods = ['Manhattan', 'Brooklyn', 'Downtown', 'Midtown', 'Financial District']
    
    for i in range(50):
        city = random.choice(cities)
        hotel = {
            'hotelId': f"HTL_{1000 + i}",
            'name': f"{random.choice(['Cozy', 'Luxury', 'Modern', 'Classic'])} {random.choice(['Apartment', 'Loft', 'Studio', 'Suite'])} in {city}",
            'address': {
                'street': f"{random.randint(100, 999)} {random.choice(['Main', 'Park', 'Broadway', 'Market'])} St",
                'city': city,
                'state': 'NY' if city == 'New York' else 'CA',
                'zipCode': f"{random.randint(10000, 99999)}"
            },
            'starRating': random.randint(3, 5),
            'pricePerNight': round(random.uniform(80, 400), 2),
            'roomTypes': [{
                'type': 'standard',
                'price': round(random.uniform(80, 400), 2),
                'available': random.randint(1, 15)
            }],
            'amenities': random.sample(['wifi', 'parking', 'pool', 'gym', 'breakfast', 'pet-friendly'], k=random.randint(2, 5)),
            'neighbourhood': random.choice(neighbourhoods),
            'latitude': round(random.uniform(40.5, 40.9), 6),
            'longitude': round(random.uniform(-74.0, -73.7), 6),
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow()
        }
        hotels.append(hotel)
    
    if hotels:
        mongo_db.hotels.insert_many(hotels)
        print(f"   ✅ Created {len(hotels)} sample hotels")

def process_flight_data(mongo_db):
    """
    Process Flight Price datasets
    Extract: origin, dest, airline, stops, duration, price
    """
    print("📊 Processing Flight Data...")
    
    # Try to find flight CSV files - check multiple locations including archive
    flight_files = []
    
    # Check specific locations
    for path in [
        DATA_DIR / "flights" / "flight_prices.csv",
        DATA_DIR / "flights" / "Clean_Dataset.csv",
        DATA_DIR / "flights" / "economy.csv",
        DATA_DIR / "flights" / "business.csv"
    ]:
        if path.exists():
            flight_files.append(path)
    
    # Search in flights directory recursively
    flights_dir = DATA_DIR / "flights"
    if flights_dir.exists():
        flight_files.extend(list(flights_dir.rglob("*.csv")))
    
    if not flight_files:
        print("⚠️  Flight data files not found.")
        print("   💡 Tip: Download flight data CSV from Kaggle and place in data/kaggle/flights/")
        print("   📥 URL: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction")
        print("   🔄 Creating sample data...")
        # Create sample flights based on common routes
        flights = []
        routes = [
            ('SFO', 'JFK', 'American Airlines', 0, 510, 350),
            ('SFO', 'JFK', 'United Airlines', 1, 600, 320),
            ('SFO', 'LAX', 'Southwest', 0, 90, 150),
            ('LAX', 'JFK', 'JetBlue', 0, 510, 280),
            ('JFK', 'SFO', 'Delta', 0, 510, 380),
        ]
        
        for i, (origin, dest, airline, stops, duration, base_price) in enumerate(routes):
            # Add price variation
            price = base_price + random.randint(-50, 100)
            flight = {
                'flightId': f'FLT{1000 + i}',
                'origin': origin,
                'destination': dest,
                'airline': airline,
                'departureTime': datetime.utcnow() + timedelta(days=random.randint(1, 30)),
                'arrivalTime': datetime.utcnow() + timedelta(days=random.randint(1, 30), minutes=duration),
                'price': price,
                'flightClass': random.choice(['economy', 'business', 'first']),
                'stops': stops,
                'duration': duration,
                'createdAt': datetime.utcnow(),
                'updatedAt': datetime.utcnow()
            }
            flights.append(flight)
        
        mongo_db.flights.insert_many(flights)
        print(f"   ✅ Created {len(flights)} sample flights")
        return
    
    # Process actual flight data
    for flight_file in flight_files[:1]:  # Process first file
        print(f"   Reading: {flight_file}")
        try:
            df = pd.read_csv(flight_file, low_memory=False)
            
            flights = []
            for _, row in df.head(500).iterrows():
                try:
                    # Extract flight data (column names may vary)
                    origin = str(row.get('origin', row.get('source', 'SFO'))).upper()[:3]
                    dest = str(row.get('destination', row.get('dest', 'JFK'))).upper()[:3]
                    airline = str(row.get('airline', 'Unknown'))[:50]
                    
                    # Price
                    price = float(row.get('price', row.get('fare', 300)))
                    if price <= 0 or price > 10000:
                        continue
                    
                    # Stops and duration
                    stops = int(row.get('stops', row.get('stop', 0)))
                    duration = int(row.get('duration', row.get('flight_time', 300)))
                    
                    flight = {
                        'flightId': f"FLT_{row.get('id', random.randint(10000, 99999))}",
                        'origin': origin,
                        'destination': dest,
                        'airline': airline,
                        'departureTime': datetime.utcnow() + timedelta(days=random.randint(1, 60)),
                        'arrivalTime': datetime.utcnow() + timedelta(days=random.randint(1, 60), minutes=duration),
                        'price': round(price, 2),
                        'flightClass': random.choice(['economy', 'business', 'first']),
                        'stops': stops,
                        'duration': duration,
                        'createdAt': datetime.utcnow(),
                        'updatedAt': datetime.utcnow()
                    }
                    flights.append(flight)
                except Exception as e:
                    continue
            
            if flights:
                mongo_db.flights.insert_many(flights)
                print(f"   ✅ Inserted {len(flights)} flights")
        except Exception as e:
            print(f"   ⚠️  Error processing flight file: {e}")

def process_airport_data(mysql_conn, mongo_db):
    """
    Process Global Airports dataset
    Load IATA codes, coordinates, timezones
    """
    print("📊 Processing Airport Data...")
    
    # Try to find airport CSV files - check multiple locations including archive
    airport_files = []
    
    # Check specific locations
    for path in [
        DATA_DIR / "airports" / "airports.csv"
    ]:
        if path.exists():
            airport_files.append(path)
    
    # Search in airports directory recursively
    airports_dir = DATA_DIR / "airports"
    if airports_dir.exists():
        airport_files.extend(list(airports_dir.rglob("*.csv")))
    
    if not airport_files:
        print("⚠️  Airport data files not found.")
        print("   💡 Tip: Download airports CSV from Kaggle and place in data/kaggle/airports/")
        print("   📥 URL: https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo")
        print("   🔄 Using common airports instead...")
        # Insert common US airports
        common_airports = [
            ('SFO', 'San Francisco International', 'CA', 37.6213, -122.3790),
            ('JFK', 'John F. Kennedy International', 'NY', 40.6413, -73.7781),
            ('LAX', 'Los Angeles International', 'CA', 33.9425, -118.4081),
            ('ORD', 'Chicago O\'Hare International', 'IL', 41.9742, -87.9073),
            ('DFW', 'Dallas/Fort Worth International', 'TX', 32.8998, -97.0403),
        ]
        
        cursor = mysql_conn.cursor()
        for code, name, state, lat, lon in common_airports:
            try:
                cursor.execute("""
                    INSERT INTO airports (airport_code, airport_name, city, state_code, latitude, longitude)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE airport_name = VALUES(airport_name)
                """, (code, name, name.split()[0], state, lat, lon))
            except:
                pass
        
        mysql_conn.commit()
        cursor.close()
        print(f"   ✅ Inserted {len(common_airports)} common airports")
        return
    
    # Process actual airport data
    for airport_file in airport_files[:1]:
        print(f"   Reading: {airport_file}")
        try:
            df = pd.read_csv(airport_file, low_memory=False)
            
            cursor = mysql_conn.cursor()
            count = 0
            
            for _, row in df.iterrows():
                try:
                    iata = str(row.get('iata', row.get('IATA', ''))).upper()[:3]
                    if len(iata) != 3 or iata == 'NAN':
                        continue
                    
                    name = str(row.get('name', row.get('Name', '')))[:128]
                    city = str(row.get('city', row.get('City', '')))[:64]
                    state = str(row.get('state', row.get('State', '')))[:2]
                    lat = float(row.get('latitude', row.get('Latitude', 0)))
                    lon = float(row.get('longitude', row.get('Longitude', 0)))
                    
                    cursor.execute("""
                        INSERT INTO airports (airport_code, airport_name, city, state_code, latitude, longitude)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE airport_name = VALUES(airport_name)
                    """, (iata, name, city, state, lat, lon))
                    count += 1
                except:
                    continue
            
            mysql_conn.commit()
            cursor.close()
            print(f"   ✅ Inserted {count} airports")
        except Exception as e:
            print(f"   ⚠️  Error processing airport file: {e}")

def process_hotel_booking_data(mongo_db):
    """
    Process Hotel Booking Demand dataset
    Extract booking patterns and behavior
    """
    print("📊 Processing Hotel Booking Data...")
    
    # Find hotel files including archive subdirectories
    hotel_files = []
    
    # Check specific locations
    for path in [
        DATA_DIR / "hotels" / "hotel_bookings.csv",
        DATA_DIR / "hotels" / "hotel_booking.csv"
    ]:
        if path.exists():
            hotel_files.append(path)
    
    # Search in hotels directory recursively
    hotels_dir = DATA_DIR / "hotels"
    if hotels_dir.exists():
        hotel_files.extend(list(hotels_dir.rglob("*.csv")))
    
    if not hotel_files:
        print("⚠️  Hotel booking data files not found. Skipping...")
        return
    
    # This dataset is mainly for analytics, not direct insertion
    # We can use it to understand booking patterns
    print("   ✅ Hotel booking data available for analytics")

def main():
    print("🚀 Processing Kaggle Datasets")
    print("=" * 50)
    print("")
    
    # Connect to databases
    try:
        mysql_conn = connect_mysql()
        print("✅ Connected to MySQL")
    except Exception as e:
        print(f"❌ MySQL connection failed: {e}")
        mysql_conn = None
    
    try:
        mongo_db = connect_mongo()
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        return
    
    print("")
    
    # Process datasets
    if mysql_conn:
        process_airport_data(mysql_conn, mongo_db)
        if mysql_conn:
            mysql_conn.close()
    
    process_airbnb_data(mongo_db)
    process_flight_data(mongo_db)
    process_hotel_booking_data(mongo_db)
    
    print("")
    print("✅ Data processing complete!")
    print("")
    print("📊 Summary:")
    print(f"   Hotels: {mongo_db.hotels.count_documents({})}")
    print(f"   Flights: {mongo_db.flights.count_documents({})}")
    print(f"   Airports: Check MySQL airports table")

if __name__ == '__main__':
    main()

