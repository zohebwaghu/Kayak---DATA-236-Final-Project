#!/usr/bin/env python3
import pandas as pd
from pymongo import MongoClient
from datetime import datetime
import random

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017")
db = client["kayak_doc"]

print("="*60)
print("Importing Car Rental Data to MongoDB...")
print("="*60)

# Import Cars from Cornell dataset
print("\nImporting Cars...")
db.cars.drop()  # Clear existing

cars_df = pd.read_csv("/home/ubuntu/Kayak---DATA-236-Final-Project/data/CarRentalDataV1.csv", low_memory=False)
print(f"  Loaded {len(cars_df)} cars")

# Rental company mapping (hash-based for consistency)
rental_companies = ["Hertz", "Enterprise", "Budget", "Avis", "National", "Alamo"]

# Seats mapping by vehicle type
seats_map = {
    "suv": 7,
    "car": 5,
    "truck": 5,
    "van": 8,
    "minivan": 8,
    "convertible": 4,
    "coupe": 4
}

cars = []
for idx, row in cars_df.iterrows():
    try:
        # Get vehicle type for various mappings
        vehicle_type = str(row.get("vehicle.type", "car")).lower().strip()
        make = str(row.get("vehicle.make", "Unknown"))

        # Map make to rental company (hash-based for consistency)
        company = rental_companies[hash(make) % len(rental_companies)]

        # Get seats based on vehicle type
        seats = seats_map.get(vehicle_type, 5)

        # Derive car_type from vehicle.type
        car_type_map = {
            "suv": "SUV",
            "car": "Sedan",
            "truck": "Truck",
            "van": "Van",
            "minivan": "Minivan",
            "convertible": "Convertible",
            "coupe": "Coupe"
        }
        car_type = car_type_map.get(vehicle_type, "Sedan")

        # Get daily rate
        daily_price = float(row.get("rate.daily", 50)) if pd.notna(row.get("rate.daily")) else 50

        car = {
            "car_id": f"CAR_{idx:05d}",
            "car_type": car_type,
            "company": company,
            "make": make,
            "model": str(row.get("vehicle.model", "")),
            "year": int(row.get("vehicle.year", 2020)) if pd.notna(row.get("vehicle.year")) else 2020,
            "transmission": "Automatic" if random.random() < 0.9 else "Manual",
            "seats": seats,
            "daily_price": round(daily_price, 2),
            "rating": float(row.get("rating", 4.0)) if pd.notna(row.get("rating")) else 4.0,
            "review_count": int(row.get("reviewCount", 0)) if pd.notna(row.get("reviewCount")) else 0,
            "fuel_type": str(row.get("fuelType", "GASOLINE")),
            "location": str(row.get("location.city", "")),
            "state": str(row.get("location.state", "")),
            "country": str(row.get("location.country", "US")),
            "latitude": float(row.get("location.latitude", 0)) if pd.notna(row.get("location.latitude")) else 0,
            "longitude": float(row.get("location.longitude", 0)) if pd.notna(row.get("location.longitude")) else 0,
            "airport_city": str(row.get("airportcity", "")),
            "availability": random.random() < 0.8,  # 80% available
            "trips_taken": int(row.get("renterTripsTaken", 0)) if pd.notna(row.get("renterTripsTaken")) else 0,
            "created_at": datetime.utcnow()
        }
        cars.append(car)
    except Exception as e:
        continue

    if len(cars) >= 1000:
        db.cars.insert_many(cars)
        print(f"    Inserted {idx+1} cars...")
        cars = []

if cars:
    db.cars.insert_many(cars)
print(f"  Done! Total cars: {db.cars.count_documents({})}")

# Create indexes
db.cars.create_index("car_id", unique=True)
db.cars.create_index("car_type")
db.cars.create_index("location")
db.cars.create_index("daily_price")
db.cars.create_index("company")
db.cars.create_index([("car_type", 1), ("location", 1)])

print("\n" + "="*60)
print("CAR IMPORT COMPLETE!")
print("="*60)
print(f"Cars: {db.cars.count_documents({})}")
