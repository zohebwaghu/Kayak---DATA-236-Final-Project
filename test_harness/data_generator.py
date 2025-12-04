"""
Data Generator for Test Harness
Generates test data for users, listings, bookings, etc.
"""

import random
import string
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from faker import Faker
import mysql.connector
from pymongo import MongoClient
from test_harness.config import TestConfig

fake = Faker()
Faker.seed(42)  # For reproducible data

class DataGenerator:
    """Generate test data for all entities"""
    
    def __init__(self):
        self.mysql_users_conn = None
        self.mysql_bookings_conn = None
        self.mongo_client = None
        self.generated_user_ids = []
        self.generated_listing_ids = {"flights": [], "hotels": [], "cars": []}
        self.generated_booking_ids = set()  # Track booking IDs to avoid duplicates
        self.booking_id_counter = 0  # Sequential counter for unique IDs
        
    def connect(self):
        """Connect to databases"""
        # MySQL Users DB
        self.mysql_users_conn = mysql.connector.connect(
            **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_USERS)
        )
        
        # MySQL Bookings DB
        self.mysql_bookings_conn = mysql.connector.connect(
            **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_BOOKINGS)
        )
        
        # MongoDB
        self.mongo_client = MongoClient(TestConfig.get_mongodb_connection_string())
        
    def disconnect(self):
        """Close database connections"""
        if self.mysql_users_conn:
            self.mysql_users_conn.close()
        if self.mysql_bookings_conn:
            self.mysql_bookings_conn.close()
        if self.mongo_client:
            self.mongo_client.close()
    
    def generate_ssn(self) -> str:
        """Generate valid SSN format: ###-##-####"""
        return f"{random.randint(100, 999)}-{random.randint(10, 99)}-{random.randint(1000, 9999)}"
    
    def generate_phone(self) -> str:
        """Generate valid US phone number"""
        return f"{random.randint(200, 999)}-{random.randint(100, 999)}-{random.randint(1000, 9999)}"
    
    def generate_zip_code(self) -> str:
        """Generate valid US ZIP code"""
        return f"{random.randint(10000, 99999)}"
    
    def generate_user(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Generate a single user with valid data"""
        if not user_id:
            user_id = self.generate_ssn()
            while user_id in self.generated_user_ids:
                user_id = self.generate_ssn()
        
        self.generated_user_ids.append(user_id)
        
        state_code = random.choice(['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'])
        
        return {
            "user_id": user_id,
            "first_name": fake.first_name(),
            "last_name": fake.last_name(),
            "address_line1": fake.street_address(),
            "address_line2": fake.secondary_address() if random.random() > 0.7 else None,
            "city": fake.city(),
            "state_code": state_code,
            "zip_code": self.generate_zip_code(),
            "phone_number": self.generate_phone(),
            "email": fake.unique.email(),
            "password_hash": "$2a$10$" + "".join(random.choices(string.ascii_letters + string.digits, k=53)),  # bcrypt hash format
            "role": "user",
            "profile_image_id": "".join(random.choices(string.hexdigits.lower(), k=24)) if random.random() > 0.5 else None  # MongoDB ObjectId format (24 hex chars)
        }
    
    def generate_users(self, count: int) -> List[Dict[str, Any]]:
        """Generate multiple users"""
        users = []
        for _ in range(count):
            users.append(self.generate_user())
        return users
    
    def insert_users(self, users: List[Dict[str, Any]]) -> int:
        """Insert users into database"""
        if not self.mysql_users_conn:
            self.connect()
        
        cursor = self.mysql_users_conn.cursor()
        inserted = 0
        
        for user in users:
            try:
                cursor.execute("""
                    INSERT INTO users (
                        user_id, first_name, last_name, address_line1, address_line2,
                        city, state_code, zip_code, phone_number, email, password_hash, role, profile_image_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    user["user_id"], user["first_name"], user["last_name"],
                    user["address_line1"], user.get("address_line2"),
                    user["city"], user["state_code"], user["zip_code"],
                    user["phone_number"], user["email"], user["password_hash"],
                    user["role"], user.get("profile_image_id")
                ))
                inserted += 1
            except mysql.connector.IntegrityError:
                # Skip duplicates
                continue
        
        self.mysql_users_conn.commit()
        cursor.close()
        return inserted
    
    def generate_flight(self, flight_id: Optional[int] = None) -> Dict[str, Any]:
        """Generate a flight listing"""
        airports = ['SFO', 'LAX', 'JFK', 'ORD', 'DFW', 'DEN', 'ATL', 'SEA', 'LAS', 'MIA']
        origin = random.choice(airports)
        destination = random.choice([a for a in airports if a != origin])
        
        departure = datetime.utcnow() + timedelta(days=random.randint(1, 365))
        duration_min = random.randint(60, 600)
        arrival = departure + timedelta(minutes=duration_min)
        
        flight_class = random.choice(['economy', 'business', 'first'])
        base_price = {'economy': 200, 'business': 600, 'first': 1200}[flight_class]
        
        return {
            "airline_name": random.choice(['American Airlines', 'Delta', 'United', 'Southwest', 'JetBlue']),
            "flight_number": f"{random.choice(['AA', 'DL', 'UA', 'SW', 'JB'])}{random.randint(100, 9999)}",
            "departure_airport": origin,
            "arrival_airport": destination,
            "departure_ts_utc": departure,
            "arrival_ts_utc": arrival,
            "duration_min": duration_min,
            "flight_class": flight_class,
            "ticket_price_usd": round(base_price * (0.8 + random.random() * 0.4), 2),
            "total_available_seats": random.randint(50, 300),
            "rating_avg": round(random.uniform(3.0, 5.0), 2) if random.random() > 0.2 else None
        }
    
    def generate_hotel(self) -> Dict[str, Any]:
        """Generate a hotel listing"""
        state_code = random.choice(['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'])
        amenities = random.sample([
            'wifi', 'pool', 'gym', 'parking', 'breakfast', 'spa', 'pet-friendly', 'near-transit'
        ], k=random.randint(2, 5))
        
        return {
            "hotel_name": f"{fake.company()} Hotel",
            "address_line1": fake.street_address(),
            "address_line2": fake.secondary_address() if random.random() > 0.7 else None,
            "city": fake.city(),
            "state_code": state_code,
            "zip_code": self.generate_zip_code(),
            "star_rating": random.randint(1, 5) if random.random() > 0.1 else None,
            "num_rooms_total": random.randint(50, 500),
            "amenities_json": amenities,
            "rating_avg": round(random.uniform(3.0, 5.0), 2) if random.random() > 0.2 else None
        }
    
    def generate_car(self) -> Dict[str, Any]:
        """Generate a car listing"""
        car_types = ['suv', 'sedan', 'compact', 'minivan', 'truck', 'convertible', 'wagon', 'luxury']
        providers = ['Hertz', 'Enterprise', 'Avis', 'Budget', 'National', 'Alamo']
        
        return {
            "car_type": random.choice(car_types),
            "provider_name": random.choice(providers),
            "model": random.choice(['Toyota Camry', 'Honda Accord', 'Ford F-150', 'Chevrolet Tahoe', 'BMW 3 Series']),
            "model_year": random.randint(2020, 2024),
            "transmission_type": random.choice(['automatic', 'manual']),
            "num_seats": random.choice([2, 4, 5, 7, 8]),
            "daily_rental_price_usd": round(random.uniform(30, 200), 2),
            "rating_avg": round(random.uniform(3.0, 5.0), 2) if random.random() > 0.2 else None,
            "availability_status": random.choice(['available', 'unavailable', 'maintenance'])
        }
    
    def insert_flights(self, count: int) -> List[str]:
        """Insert flights into inventory table and return flight IDs"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        flight_ids = []
        
        for _ in range(count):
            flight = self.generate_flight()
            flight_id = f"FLT{random.randint(1000, 9999)}"
            try:
                # Insert into inventory table (middleware schema)
                cursor.execute("""
                    INSERT INTO inventory (
                        listingType, listingId, availableCount, pricePerUnit
                    ) VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE availableCount = VALUES(availableCount), pricePerUnit = VALUES(pricePerUnit)
                """, (
                    'flight', flight_id, flight["total_available_seats"], flight["ticket_price_usd"]
                ))
                flight_ids.append(flight_id)
            except Exception as e:
                print(f"Error inserting flight: {e}")
                continue
        
        self.mysql_bookings_conn.commit()
        cursor.close()
        self.generated_listing_ids["flights"].extend(flight_ids)
        return flight_ids
    
    def insert_hotels(self, count: int) -> List[str]:
        """Insert hotels into inventory table and return hotel IDs"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        hotel_ids = []
        
        for _ in range(count):
            hotel = self.generate_hotel()
            hotel_id = f"HTL{random.randint(1000, 9999)}"
            try:
                # Calculate price per night (base on star rating)
                base_price = 80 + (hotel.get("star_rating", 3) or 3) * 30
                price_per_night = round(random.uniform(base_price * 0.8, base_price * 1.2), 2)
                
                # Insert into inventory table (middleware schema)
                cursor.execute("""
                    INSERT INTO inventory (
                        listingType, listingId, availableCount, pricePerUnit
                    ) VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE availableCount = VALUES(availableCount), pricePerUnit = VALUES(pricePerUnit)
                """, (
                    'hotel', hotel_id, hotel["num_rooms_total"], price_per_night
                ))
                hotel_ids.append(hotel_id)
                
            except Exception as e:
                print(f"Error inserting hotel: {e}")
                continue
        
        self.mysql_bookings_conn.commit()
        cursor.close()
        self.generated_listing_ids["hotels"].extend(hotel_ids)
        return hotel_ids
    
    def insert_cars(self, count: int) -> List[str]:
        """Insert cars into inventory table and return car IDs"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        car_ids = []
        
        for _ in range(count):
            car = self.generate_car()
            car_id = f"CAR{random.randint(1000, 9999)}"
            try:
                # Insert into inventory table (middleware schema)
                cursor.execute("""
                    INSERT INTO inventory (
                        listingType, listingId, availableCount, pricePerUnit
                    ) VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE availableCount = VALUES(availableCount), pricePerUnit = VALUES(pricePerUnit)
                """, (
                    'car', car_id, 
                    1 if car["availability_status"] == "available" else 0,
                    car["daily_rental_price_usd"]
                ))
                car_ids.append(car_id)
            except Exception as e:
                print(f"Error inserting car: {e}")
                continue
        
        self.mysql_bookings_conn.commit()
        cursor.close()
        self.generated_listing_ids["cars"].extend(car_ids)
        return car_ids
    
    def generate_booking(self, user_id: str, booking_type: str, listing_id: str) -> Dict[str, Any]:
        """Generate a booking (matching middleware schema) with unique booking ID"""
        start_date = datetime.utcnow() + timedelta(days=random.randint(1, 90))
        # For flights, end_date is same as start_date (same day)
        # For hotels/cars, end_date is after start_date
        if booking_type == 'flight':
            end_date = start_date
        else:
            end_date = start_date + timedelta(days=random.randint(1, 7))
        
        base_price = random.uniform(100, 1000)
        total_price = round(base_price, 2)
        
        # Generate unique booking ID using timestamp + counter + random suffix
        # Format: BK + timestamp (10 digits) + counter (6 digits) + random (4 digits)
        timestamp_part = int(datetime.utcnow().timestamp() * 1000) % 10000000000  # 10 digits
        self.booking_id_counter += 1
        counter_part = self.booking_id_counter % 1000000  # 6 digits
        random_part = random.randint(1000, 9999)  # 4 digits
        booking_id = f"BK{timestamp_part:010d}{counter_part:06d}{random_part:04d}"
        
        # Ensure uniqueness (very unlikely collision, but check anyway)
        max_attempts = 100
        attempts = 0
        while booking_id in self.generated_booking_ids and attempts < max_attempts:
            random_part = random.randint(1000, 9999)
            booking_id = f"BK{timestamp_part:010d}{counter_part:06d}{random_part:04d}"
            attempts += 1
        
        self.generated_booking_ids.add(booking_id)
        
        return {
            "bookingId": booking_id,
            "userId": user_id,
            "listingType": booking_type,
            "listingId": listing_id,
            "startDate": start_date.date(),
            "endDate": end_date.date(),
            "guests": random.randint(1, 4),
            "totalPrice": total_price,
            "status": random.choice(['pending', 'confirmed', 'cancelled'])
        }
    
    def insert_bookings(self, count: int, user_ids: List[str], listing_ids: Dict[str, List[str]]) -> int:
        """Insert bookings into database (matching middleware schema)"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        inserted = 0
        
        booking_types = ['flight', 'hotel', 'car']
        
        for _ in range(count):
            booking_type = random.choice(booking_types)
            user_id = random.choice(user_ids)
            
            if not listing_ids.get(booking_type + "s"):
                continue
            
            listing_id = random.choice(listing_ids[booking_type + "s"])
            booking = self.generate_booking(user_id, booking_type, listing_id)
            
            try:
                # Use camelCase column names matching middleware schema
                cursor.execute("""
                    INSERT INTO bookings (
                        bookingId, userId, listingType, listingId, startDate, endDate,
                        guests, totalPrice, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    booking["bookingId"], booking["userId"], booking["listingType"],
                    booking["listingId"], booking["startDate"], booking["endDate"],
                    booking["guests"], booking["totalPrice"], booking["status"]
                ))
                inserted += 1
            except Exception as e:
                print(f"Error inserting booking: {e}")
                continue
        
        self.mysql_bookings_conn.commit()
        cursor.close()
        return inserted
    
    def get_generated_data_summary(self) -> Dict[str, Any]:
        """Get summary of generated data"""
        return {
            "users": len(self.generated_user_ids),
            "flights": len(self.generated_listing_ids["flights"]),
            "hotels": len(self.generated_listing_ids["hotels"]),
            "cars": len(self.generated_listing_ids["cars"]),
            "user_ids": self.generated_user_ids[:10],  # First 10 for reference
            "listing_ids": {
                "flights": self.generated_listing_ids["flights"][:10],
                "hotels": self.generated_listing_ids["hotels"][:10],
                "cars": self.generated_listing_ids["cars"][:10]
            }
        }

