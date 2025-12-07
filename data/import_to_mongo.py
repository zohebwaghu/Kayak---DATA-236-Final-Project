#!/usr/bin/env python3
import pandas as pd
from pymongo import MongoClient
from datetime import datetime

# Connect to MongoDB
client = MongoClient("mongodb://localhost:27017")
db = client["kayak_doc"]

print("="*60)
print("Importing data to MongoDB...")
print("="*60)

# 1. Import Flights (500K from Expedia)
print("\n[1/3] Importing Flights...")
db.flights.drop()  # Clear existing
flights_df = pd.read_csv("/home/ubuntu/Kayak---DATA-236-Final-Project/data/flights_500k.csv", low_memory=False)
print(f"  Loaded {len(flights_df)} flights")

flights = []
for idx, row in flights_df.iterrows():
    try:
        flight = {
            "flight_id": str(row.get("legId", f"FL_{idx}"))[:20],
            "origin": str(row.get("startingAirport", "")).strip().upper(),
            "destination": str(row.get("destinationAirport", "")).strip().upper(),
            "flight_date": str(row.get("flightDate", "")),
            "airline": str(row.get("segmentsAirlineName", "Unknown")).split("||")[0],
            "airline_code": str(row.get("segmentsAirlineCode", "")).split("||")[0],
            "departure_time": str(row.get("segmentsDepartureTimeRaw", "")).split("||")[0],
            "arrival_time": str(row.get("segmentsArrivalTimeRaw", "")).split("||")[0],
            "duration": str(row.get("travelDuration", "")),
            "price": float(row.get("totalFare", 0)) if pd.notna(row.get("totalFare")) else 0,
            "base_fare": float(row.get("baseFare", 0)) if pd.notna(row.get("baseFare")) else 0,
            "seats_remaining": int(row.get("seatsRemaining", 0)) if pd.notna(row.get("seatsRemaining")) else 0,
            "is_nonstop": row.get("isNonStop") == True or row.get("isNonStop") == "True",
            "is_refundable": row.get("isRefundable") == True or row.get("isRefundable") == "True",
            "cabin_class": str(row.get("segmentsCabinCode", "coach")).split("||")[0],
            "distance": float(row.get("totalTravelDistance", 0)) if pd.notna(row.get("totalTravelDistance")) else 0,
            "created_at": datetime.utcnow()
        }
        flights.append(flight)
    except Exception as e:
        continue

    if len(flights) >= 10000:
        db.flights.insert_many(flights)
        print(f"    Inserted {idx+1} flights...")
        flights = []

if flights:
    db.flights.insert_many(flights)
print(f"  Done! Total flights: {db.flights.count_documents({})}")

db.flights.create_index("origin")
db.flights.create_index("destination")
db.flights.create_index([("origin", 1), ("destination", 1)])

# 2. Import Hotels
print("\n[2/3] Importing Hotels...")
db.hotels.drop()
hotels_df = pd.read_csv("/home/ubuntu/Kayak---DATA-236-Final-Project/data/hotel_booking.csv", low_memory=False)
print(f"  Loaded {len(hotels_df)} hotels")

hotels = []
for idx, row in hotels_df.iterrows():
    try:
        adr = float(row.get("adr", 100)) if pd.notna(row.get("adr")) else 100
        price = max(50, min(1000, adr))

        hotel = {
            "hotel_id": f"HTL_{idx}",
            "name": str(row.get("hotel", "Hotel")),
            "country": str(row.get("country", "USA")),
            "price_per_night": round(price, 2),
            "meal_plan": str(row.get("meal", "BB")),
            "room_type": str(row.get("reserved_room_type", "A")),
            "adults_capacity": int(row.get("adults", 2)) if pd.notna(row.get("adults")) else 2,
            "market_segment": str(row.get("market_segment", "Online")),
            "created_at": datetime.utcnow()
        }
        hotels.append(hotel)
    except:
        continue

    if len(hotels) >= 10000:
        db.hotels.insert_many(hotels)
        print(f"    Inserted {idx+1} hotels...")
        hotels = []

if hotels:
    db.hotels.insert_many(hotels)
print(f"  Done! Total hotels: {db.hotels.count_documents({})}")

db.hotels.create_index("country")
db.hotels.create_index("price_per_night")

# 3. Import Airports
print("\n[3/3] Importing Airports...")
db.airports.drop()
airports_df = pd.read_csv("/home/ubuntu/Kayak---DATA-236-Final-Project/data/airports.csv", low_memory=False)
print(f"  Loaded {len(airports_df)} airports")

airports = []
for idx, row in airports_df.iterrows():
    try:
        iata = str(row.get("IATA", "")).strip().upper()
        if not iata or len(iata) != 3 or iata == "\\N":
            continue
        airport = {
            "iata": iata,
            "name": str(row.get("Name", "")),
            "city": str(row.get("City", "")),
            "country": str(row.get("Country", "")),
            "latitude": float(row.get("Latitude", 0)) if pd.notna(row.get("Latitude")) else 0,
            "longitude": float(row.get("Longitude", 0)) if pd.notna(row.get("Longitude")) else 0,
        }
        airports.append(airport)
    except:
        continue

if airports:
    db.airports.insert_many(airports)
print(f"  Done! Total airports: {db.airports.count_documents({})}")

db.airports.create_index("iata", unique=True)
db.airports.create_index("city")

print("\n" + "="*60)
print("IMPORT COMPLETE!")
print("="*60)
print(f"Flights: {db.flights.count_documents({})}")
print(f"Hotels: {db.hotels.count_documents({})}")
print(f"Airports: {db.airports.count_documents({})}")
