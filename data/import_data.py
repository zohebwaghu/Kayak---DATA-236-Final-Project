"""
Data Import Script for Kayak Project
Imports flights, hotels, and airports data into MongoDB
With Deal Score fields: avg_30d_price, discount_percent, has_promo, promo_end_date
"""

import pandas as pd
from pymongo import MongoClient
import mysql.connector
import os
import sys
import random
import string
from datetime import datetime, timedelta

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "kayak_doc")

# MySQL connection
MYSQL_HOST = os.getenv("DB_HOST", "localhost")
MYSQL_PORT = int(os.getenv("DB_PORT", 3306))
MYSQL_USER = os.getenv("DB_USER", "root")
MYSQL_PASSWORD = os.getenv("DB_PASSWORD", "password")
MYSQL_DB = os.getenv("DB_NAME_USERS", "kayak_users")

# Data directory
DATA_DIR = os.getenv("DATA_DIR", "./data")

def connect_mongo():
    """Connect to MongoDB"""
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    print(f"Connected to MongoDB: {MONGO_URI}/{MONGO_DB}")
    return db

def connect_mysql():
    """Connect to MySQL"""
    try:
        conn = mysql.connector.connect(
            host=MYSQL_HOST,
            port=MYSQL_PORT,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            database=MYSQL_DB
        )
        print(f"Connected to MySQL: {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}")
        return conn
    except Exception as e:
        print(f"MySQL Connection Error: {e}")
        return None

def import_airports(db, filepath):
    """Import airports data"""
    print(f"\n=== Importing Airports from {filepath} ===")
    
    df = pd.read_csv(filepath)
    print(f"Loaded {len(df)} airports")
    
    # Clean and transform
    airports = []
    for _, row in df.iterrows():
        airport = {
            "airport_id": row.get("IATA", ""),
            "name": row.get("AirportName", ""),
            "iata": row.get("IATA", ""),
            "icao": row.get("ICAO", ""),
            "city": row.get("City_Name", ""),
            "country": row.get("Country_Name", ""),
            "country_code": row.get("Country_CodeA2", ""),
            "timezone": row.get("TimeZone", ""),
            "latitude": row.get("GeoPointLat", 0),
            "longitude": row.get("GeoPointLong", 0)
        }
        # Only add if has valid IATA code (not empty, not nan)
        if airport["iata"] and str(airport["iata"]).lower() not in ["", "nan", "none"]:
            airports.append(airport)
    
    # Insert to MongoDB
    collection = db["airports"]
    collection.drop()  # Clear existing
    if airports:
        collection.insert_many(airports)
        collection.create_index("iata", unique=True)
    
    print(f"Imported {len(airports)} airports")
    return len(airports)

def import_flights(db, filepath, limit=10000):
    """Import flights data with Deal Score fields"""
    print(f"\n=== Importing Flights from {filepath} ===")
    
    df = pd.read_csv(filepath, nrows=limit)
    print(f"Loaded {len(df)} flights")
    
    # City to airport code mapping (India dataset)
    city_to_airport = {
        "Delhi": "DEL",
        "Mumbai": "BOM",
        "Bangalore": "BLR",
        "Kolkata": "CCU",
        "Hyderabad": "HYD",
        "Chennai": "MAA"
    }
    
    # Set random seed for reproducibility
    random.seed(42)
    
    # Transform
    flights = []
    for idx, row in df.iterrows():
        source = row.get("source_city", "")
        dest = row.get("destination_city", "")
        price = float(row.get("price", 0)) if pd.notna(row.get("price")) else 0
        
        # Generate Deal Score fields based on flight_id hash for consistency
        hash_val = hash(f"FL{idx:06d}") % 100
        
        # 1. Discount: 5% to 30% (作业要求: >=15% below 30-day avg)
        discount_percent = 5 + (hash_val % 26)  # 5% to 30%
        avg_30d_price = price / (1 - discount_percent / 100) if discount_percent < 100 else price * 1.2
        
        # 2. Inventory scarcity (作业要求: limited inventory)
        available_seats = 3 + (hash_val % 50)  # 3 to 52 seats
        
        # 3. Promo (作业要求: promo end date)
        has_promo = hash_val % 3 == 0  # ~33% have promo
        promo_end_date = None
        if has_promo:
            days_until_end = 1 + (hash_val % 14)  # 1 to 14 days
            promo_end_date = (datetime.now() + timedelta(days=days_until_end)).isoformat()
        
        # Calculate Deal Score (0-100)
        # - Discount: 0-30 points (1 point per %)
        # - Scarcity: 0-20 points (if seats < 10: 20pts, < 20: 10pts, else 0)
        # - Promo: 0-15 points
        # - Direct flight: 0-10 points
        discount_score = min(30, discount_percent)
        scarcity_score = 20 if available_seats < 10 else (10 if available_seats < 20 else 0)
        promo_score = 15 if has_promo else 0
        stops = 0 if row.get("stops") == "zero" else (1 if row.get("stops") == "one" else 2)
        direct_score = 10 if stops == 0 else 0
        
        deal_score = min(95, max(30, 25 + discount_score + scarcity_score + promo_score + direct_score))
        
        flight = {
            "flight_id": f"FL{idx:06d}",
            "airline": row.get("airline", "Unknown"),
            "flight_number": row.get("flight", ""),
            "origin": city_to_airport.get(source, source[:3].upper() if source else "XXX"),
            "origin_city": source,
            "destination": city_to_airport.get(dest, dest[:3].upper() if dest else "XXX"),
            "destination_city": dest,
            "departure_time": row.get("departure_time", ""),
            "arrival_time": row.get("arrival_time", ""),
            "duration": float(row.get("duration", 0)) if pd.notna(row.get("duration")) else 0,
            "stops": stops,
            "class": row.get("class", "Economy"),
            "price": price,
            "days_left": int(row.get("days_left", 30)) if pd.notna(row.get("days_left")) else 30,
            # Deal Score fields
            "avg_30d_price": round(avg_30d_price, 2),
            "discount_percent": discount_percent,
            "available_seats": available_seats,
            "has_promo": has_promo,
            "promo_end_date": promo_end_date,
            "deal_score": deal_score,
            "rating": 4.0  # Default
        }
        flights.append(flight)
    
    # Insert to MongoDB
    collection = db["flights"]
    collection.drop()
    if flights:
        collection.insert_many(flights)
        collection.create_index("flight_id", unique=True)
        collection.create_index("origin")
        collection.create_index("destination")
        collection.create_index("price")
        collection.create_index("deal_score")
    
    print(f"Imported {len(flights)} flights")
    return len(flights)

def import_hotels(db, filepath, limit=10000):
    """Import hotels data with Deal Score fields"""
    print(f"\n=== Importing Hotels from {filepath} ===")
    
    df = pd.read_csv(filepath, nrows=limit)
    print(f"Loaded {len(df)} hotel bookings")
    
    # Set random seed for reproducibility
    random.seed(123)
    
    # Transform booking data into hotel listings
    hotels = []
    seen_hotels = set()
    
    for idx, row in df.iterrows():
        hotel_type = row.get("hotel", "Hotel")
        country = row.get("country", "Unknown")
        
        # Create unique hotel ID
        hotel_key = f"{hotel_type}_{country}_{idx}"
        if hotel_key in seen_hotels:
            continue
        seen_hotels.add(hotel_key)
        
        # Base price
        adr = float(row.get("adr", 100)) if pd.notna(row.get("adr")) else 100
        
        # Generate Deal Score fields based on hotel_id hash for consistency
        hash_val = hash(f"HT{idx:06d}") % 100
        
        # 1. Discount: 5% to 35% (作业要求: >=15% below 30-day avg)
        discount_percent = 5 + (hash_val % 31)  # 5% to 35%
        avg_30d_price = adr / (1 - discount_percent / 100) if discount_percent < 100 else adr * 1.2
        
        # 2. Inventory scarcity (作业要求: limited inventory)
        available_rooms = 2 + (hash_val % 20)  # 2 to 21 rooms
        
        # 3. Promo (作业要求: promo end date)
        has_promo = hash_val % 4 == 0  # ~25% have promo
        promo_end_date = None
        if has_promo:
            days_until_end = 1 + (hash_val % 10)  # 1 to 10 days
            promo_end_date = (datetime.now() + timedelta(days=days_until_end)).isoformat()
        
        # Determine star rating based on hotel type and ADR
        if hotel_type == "Resort Hotel":
            star_rating = 4 if adr > 150 else 3
        else:
            star_rating = 3 if adr > 100 else 2
        
        # Determine amenities based on meal and other fields
        amenities = []
        meal = row.get("meal", "")
        if meal in ["BB", "HB", "FB"]:
            amenities.append("breakfast")
        if row.get("required_car_parking_spaces", 0) > 0:
            amenities.append("parking")
        if hotel_type == "Resort Hotel":
            amenities.extend(["pool", "spa"])
        amenities.append("wifi")  # Assume all have wifi
        
        is_refundable = row.get("deposit_type", "") == "No Deposit"
        
        # Calculate Deal Score (0-100)
        # - Discount: 0-35 points (1 point per %)
        # - Scarcity: 0-20 points (if rooms < 5: 20pts, < 10: 10pts, else 0)
        # - Promo: 0-15 points
        # - Star rating: 0-12 points (3 per star)
        # - Refundable: 0-5 points
        discount_score = min(35, discount_percent)
        scarcity_score = 20 if available_rooms < 5 else (10 if available_rooms < 10 else 0)
        promo_score = 15 if has_promo else 0
        star_score = star_rating * 3
        refund_score = 5 if is_refundable else 0
        
        deal_score = min(95, max(30, 15 + discount_score + scarcity_score + promo_score + star_score + refund_score))
        
        hotel = {
            "hotel_id": f"HT{idx:06d}",
            "name": f"{hotel_type} - {country}",
            "hotel_type": hotel_type,
            "city": country,  # Using country as city for this dataset
            "country": country,
            "star_rating": star_rating,
            "price_per_night": round(adr, 2),
            "amenities": amenities,
            "room_type": row.get("reserved_room_type", "Standard"),
            "meal_plan": meal,
            "is_refundable": is_refundable,
            # Deal Score fields
            "avg_30d_price": round(avg_30d_price, 2),
            "discount_percent": discount_percent,
            "available_rooms": available_rooms,
            "has_promo": has_promo,
            "promo_end_date": promo_end_date,
            "deal_score": deal_score,
            "rating": round(3.5 + (star_rating * 0.3), 1),
            "total_reviews": 100,  # Default
            "tags": amenities + (["refundable"] if is_refundable else [])
        }
        hotels.append(hotel)
        
        if len(hotels) >= limit:
            break
    
    # Insert to MongoDB
    collection = db["hotels"]
    collection.drop()
    if hotels:
        collection.insert_many(hotels)
        collection.create_index("hotel_id", unique=True)
        collection.create_index("city")
        collection.create_index("price_per_night")
        collection.create_index("star_rating")
        collection.create_index("deal_score")
    
    print(f"Imported {len(hotels)} hotels")
    return len(hotels)

def generate_ssn():
    """Generate fake SSN"""
    return f"{random.randint(100,999)}-{random.randint(10,99)}-{random.randint(1000,9999)}"

def import_users(mysql_conn, filepath, limit=10000):
    """Import users from hotel bookings CSV"""
    print(f"\n=== Importing Users from {filepath} ===")
    
    if not mysql_conn:
        print("Skipping user import (No MySQL connection)")
        return 0
        
    df = pd.read_csv(filepath, nrows=limit)
    print(f"Loaded {len(df)} rows for user extraction")
    
    cursor = mysql_conn.cursor()
    
    # Clear existing users (optional, but good for clean state)
    # cursor.execute("DELETE FROM users WHERE role='user'")
    # mysql_conn.commit()
    
    count = 0
    seen_emails = set()
    
    sql = """
    INSERT IGNORE INTO users (
        user_id, first_name, last_name, 
        address_line1, city, state_code, zip_code,
        phone_number, email, password_hash, role,
        created_at_utc, updated_at_utc
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'user', NOW(), NOW())
    """
    
    for _, row in df.iterrows():
        name = row.get("name", "")
        email = row.get("email", "")
        phone = row.get("phone-number", "")
        
        if not name or not email or email in seen_emails:
            continue
            
        seen_emails.add(email)
        
        # Split name
        parts = name.split(" ")
        first_name = parts[0]
        last_name = " ".join(parts[1:]) if len(parts) > 1 else "Doe"
        
        # Fake SSN
        user_id = generate_ssn()
        
        # Fake Address (based on country code if possible, but defaulting to US for validation)
        country = row.get("country", "USA")
        
        # Default password hash (bcrypt for 'password')
        # $2b$10$X7.
        password_hash = "$2b$10$X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7.X7." # Dummy hash
        
        values = (
            user_id, first_name, last_name,
            "123 Main St", "San Francisco", "CA", "94105",
            phone, email, password_hash
        )
        
        try:
            cursor.execute(sql, values)
            count += 1
        except Exception as e:
            print(f"Error inserting user {email}: {e}")
            
        if count >= limit:
            break
            
    mysql_conn.commit()
    cursor.close()
    
    print(f"Imported {count} users into MySQL")
    return count

def main():
    """Main import function"""
    print("=" * 60)
    print("Kayak Data Import Script")
    print("=" * 60)
    
    # Connect to Databases
    mongo_db = connect_mongo()
    mysql_conn = connect_mysql()
    
    # File paths
    airports_file = os.path.join(DATA_DIR, "airports.csv")
    flights_file = os.path.join(DATA_DIR, "Clean_Dataset.csv")
    hotels_file = os.path.join(DATA_DIR, "hotel_booking.csv")
    
    # Import data
    total = 0
    
    if os.path.exists(airports_file):
        total += import_airports(mongo_db, airports_file)
    else:
        print(f"Warning: {airports_file} not found")
    
    if os.path.exists(flights_file):
        total += import_flights(mongo_db, flights_file, limit=10000)
    else:
        print(f"Warning: {flights_file} not found")
    
    if os.path.exists(hotels_file):
        total += import_hotels(mongo_db, hotels_file, limit=10000)
        # Import users from same file
        total += import_users(mysql_conn, hotels_file, limit=10000)
    else:
        print(f"Warning: {hotels_file} not found")
    
    if mysql_conn:
        mysql_conn.close()
    
    print("\n" + "=" * 60)
    print(f"Import Complete! Total records processed: {total}")
    print("=" * 60)
    
    # Show sample data
    print("\n=== Sample Data ===")
    
    print("\nAirports (first 3):")
    for doc in mongo_db["airports"].find().limit(3):
        print(f"  {doc.get('iata')}: {doc.get('name')} - {doc.get('city')}, {doc.get('country')}")
    
    print("\nFlights (first 5):")
    for doc in mongo_db["flights"].find().limit(5):
        print(f"  {doc.get('flight_id')}: {doc.get('origin')} -> {doc.get('destination')} | ${doc.get('price')} | {doc.get('discount_percent')}% off | Score: {doc.get('deal_score')} | Promo: {doc.get('has_promo')}")
    
    print("\nHotels (first 5):")
    for doc in mongo_db["hotels"].find().limit(5):
        print(f"  {doc.get('hotel_id')}: {doc.get('name')} | ${doc.get('price_per_night')}/night | {doc.get('discount_percent')}% off | Score: {doc.get('deal_score')} | Rooms: {doc.get('available_rooms')}")

if __name__ == "__main__":
    main()
