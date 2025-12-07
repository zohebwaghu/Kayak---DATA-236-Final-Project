#!/usr/bin/env python3
"""
Enhanced Kaggle Datasets Import Script
Imports airports, routes, airlines, and enhanced flight data from Kaggle datasets
"""

import os
import sys
import pandas as pd
from pymongo import MongoClient
from datetime import datetime, timedelta, timezone
import random
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Database connections
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "kayak_doc")

# Data directories
KAGGLE_DIR = PROJECT_ROOT / "data" / "kaggle"
ROUTES_DIR = KAGGLE_DIR / "openflights"  # Contains airports.csv, airlines.csv, routes.csv
DELAYS_DIR = KAGGLE_DIR / "flight_delays"  # Contains flights.csv (592MB)
PRICE_DIR = PROJECT_ROOT / "data"  # Clean_Dataset.csv is in data/ root

def connect_mongo():
    """Connect to MongoDB"""
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    print(f"✅ Connected to MongoDB: {MONGO_URI}/{MONGO_DB}")
    return db

def import_airports(db):
    """
    Import airports from 'Airlines, Airport, and Flight Routes/airports.csv'
    Creates comprehensive airport lookup for city→IATA conversion
    """
    print("\n" + "="*60)
    print("📊 Importing Airports")
    print("="*60)
    
    airports_file = ROUTES_DIR / "airports.csv"
    
    if not airports_file.exists():
        print(f"⚠️  File not found: {airports_file}")
        print("   Skipping airport import...")
        return 0
    
    print(f"   Reading: {airports_file}")
    df = pd.read_csv(airports_file, low_memory=False)
    print(f"   Loaded {len(df)} airport records")
    
    airports = []
    seen_iata = set()
    
    for _, row in df.iterrows():
        iata = str(row.get("IATA", "")).strip().upper()
        name = str(row.get("Name", "")).strip()
        city = str(row.get("City", "")).strip()
        country = str(row.get("Country", "")).strip()
        
        # Skip invalid IATA codes
        if not iata or len(iata) != 3 or iata == "NAN" or iata in seen_iata:
            continue
        
        seen_iata.add(iata)
        
        # Parse coordinates
        try:
            latitude = float(row.get("Latitude", 0))
            longitude = float(row.get("Longitude", 0))
        except (ValueError, TypeError):
            latitude = 0
            longitude = 0
        
        # Parse timezone
        timezone_str = str(row.get("Timezone", "")).strip()
        
        airport = {
            "airport_id": iata,
            "iata": iata,
            "icao": str(row.get("ICAO", "")).strip().upper(),
            "name": name,
            "city": city,
            "country": country,
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone_str,
            "altitude": float(row.get("Altitude", 0)) if pd.notna(row.get("Altitude")) else 0,
            "created_at": datetime.now(timezone.utc)
        }
        
        airports.append(airport)
    
    # Insert to MongoDB
    collection = db["airports"]
    collection.drop()  # Clear existing
    if airports:
        collection.insert_many(airports)
        collection.create_index("iata", unique=True)
        collection.create_index("city")
        collection.create_index("country")
        collection.create_index([("city", "text"), ("name", "text")])  # Text search
    
    print(f"   ✅ Imported {len(airports)} airports")
    return len(airports)

def import_routes(db):
    """
    Import routes from 'Airlines, Airport, and Flight Routes/routes.csv'
    Used for route validation and finding alternative routes
    """
    print("\n" + "="*60)
    print("📊 Importing Flight Routes")
    print("="*60)
    
    routes_file = ROUTES_DIR / "routes.csv"
    
    if not routes_file.exists():
        print(f"⚠️  File not found: {routes_file}")
        print("   Skipping routes import...")
        return 0
    
    print(f"   Reading: {routes_file}")
    # Read in chunks to handle large file
    chunk_size = 10000
    routes = []
    total_routes = 0
    
    try:
        for chunk in pd.read_csv(routes_file, chunksize=chunk_size, low_memory=False):
            for _, row in chunk.iterrows():
                origin = str(row.get("Source Airport", "")).strip().upper()
                dest = str(row.get("Destination Airport", "")).strip().upper()
                
                # Skip invalid routes
                if not origin or not dest or len(origin) != 3 or len(dest) != 3:
                    continue
                
                route = {
                    "origin": origin,
                    "destination": dest,
                    "airline": str(row.get("Airline", "")).strip(),
                    "airline_id": str(row.get("Airline ID", "")).strip(),
                    "stops": int(row.get("Stops", 0)) if pd.notna(row.get("Stops")) else 0,
                    "equipment": str(row.get("Equipment", "")).strip(),
                    "codeshare": str(row.get("Codeshare", "")).strip() == "Y",
                    "created_at": datetime.now(timezone.utc)
                }
                
                routes.append(route)
                total_routes += 1
                
                # Insert in batches
                if len(routes) >= 5000:
                    db["routes"].insert_many(routes)
                    routes = []
                    print(f"   Processed {total_routes} routes...")
        
        # Insert remaining
        if routes:
            db["routes"].insert_many(routes)
    
    except Exception as e:
        print(f"   ⚠️  Error reading routes: {e}")
        return 0
    
    # Create indexes
    db["routes"].create_index([("origin", 1), ("destination", 1)])
    db["routes"].create_index("origin")
    db["routes"].create_index("destination")
    
    print(f"   ✅ Imported {total_routes} routes")
    return total_routes

def import_airlines(db):
    """
    Import airlines from 'Airlines, Airport, and Flight Routes/airlines.csv'
    Used for airline name lookups
    """
    print("\n" + "="*60)
    print("📊 Importing Airlines")
    print("="*60)
    
    airlines_file = ROUTES_DIR / "airlines.csv"
    
    if not airlines_file.exists():
        print(f"⚠️  File not found: {airlines_file}")
        print("   Skipping airlines import...")
        return 0
    
    print(f"   Reading: {airlines_file}")
    df = pd.read_csv(airlines_file, low_memory=False)
    print(f"   Loaded {len(df)} airline records")
    
    airlines = []
    
    for _, row in df.iterrows():
        name = str(row.get("Name", "")).strip()
        iata = str(row.get("IATA", "")).strip().upper()
        icao = str(row.get("ICAO", "")).strip().upper()
        country = str(row.get("Country", "")).strip()
        
        if not name or name == "NAN":
            continue
        
        airline = {
            "name": name,
            "iata": iata if iata and iata != "NAN" else None,
            "icao": icao if icao and icao != "N/A" else None,
            "country": country,
            "active": str(row.get("Active", "")).strip() == "Y",
            "created_at": datetime.now(timezone.utc)
        }
        
        airlines.append(airline)
    
    # Insert to MongoDB
    collection = db["airlines"]
    collection.drop()
    if airlines:
        collection.insert_many(airlines)
        collection.create_index("name")
        if airlines[0].get("iata"):
            collection.create_index("iata")
    
    print(f"   ✅ Imported {len(airlines)} airlines")
    return len(airlines)

def enhance_flights_with_price_data(db):
    """
    Import flights from Clean_Dataset.csv (Flight Price Prediction India dataset)
    Adds realistic pricing and expands route coverage
    """
    print("\n" + "="*60)
    print("📊 Importing Flights from Clean_Dataset.csv")
    print("="*60)

    clean_dataset = PRICE_DIR / "Clean_Dataset.csv"

    if not clean_dataset.exists():
        print(f"⚠️  Clean_Dataset.csv not found at {clean_dataset}")
        print("   Skipping flight import...")
        return 0

    # City to airport mapping (for India dataset)
    city_to_airport = {
        "Delhi": "DEL",
        "Mumbai": "BOM",
        "Bangalore": "BLR",
        "Kolkata": "CCU",
        "Hyderabad": "HYD",
        "Chennai": "MAA"
    }

    flights = []
    random.seed(42)

    print(f"   Reading: {clean_dataset}")
    try:
        df = pd.read_csv(clean_dataset, low_memory=False)
        print(f"   Loaded {len(df)} flight records")

        for idx, row in df.iterrows():
            source_city = str(row.get("source_city", "")).strip()
            dest_city = str(row.get("destination_city", "")).strip()

            origin = city_to_airport.get(source_city, source_city[:3].upper() if source_city else "XXX")
            destination = city_to_airport.get(dest_city, dest_city[:3].upper() if dest_city else "XXX")

            # Parse price (already in INR, convert to USD)
            try:
                price = float(row.get("price", 0))
                # Convert INR to USD (rough conversion)
                price_usd = price * 0.012
            except (ValueError, TypeError):
                continue

            if price_usd <= 0 or price_usd > 10000:
                continue

            # Generate deal score fields
            hash_val = hash(f"KAGGLE_FLIGHT_{idx}") % 100
            discount_percent = 5 + (hash_val % 26)  # 5% to 30%
            avg_30d_price = price_usd / (1 - discount_percent / 100) if discount_percent < 100 else price_usd * 1.2
            available_seats = 3 + (hash_val % 50)
            has_promo = hash_val % 3 == 0
            promo_end_date = None
            if has_promo:
                days_until_end = 1 + (hash_val % 14)
                promo_end_date = (datetime.now() + timedelta(days=days_until_end)).isoformat()

            # Parse stops (could be "zero", "one", "two_or_more")
            stops_str = str(row.get("stops", "zero")).lower()
            if "zero" in stops_str:
                stops = 0
            elif "one" in stops_str:
                stops = 1
            else:
                stops = 2

            # Calculate deal score
            discount_score = min(30, discount_percent)
            scarcity_score = 20 if available_seats < 10 else (10 if available_seats < 20 else 0)
            promo_score = 15 if has_promo else 0
            direct_score = 10 if stops == 0 else 0
            deal_score = min(95, max(30, 25 + discount_score + scarcity_score + promo_score + direct_score))

            # Parse days_left
            try:
                days_left = int(row.get("days_left", 15))
            except (ValueError, TypeError):
                days_left = 15

            flight = {
                "flight_id": f"KAGGLE_FLIGHT_{idx:06d}",
                "airline": str(row.get("airline", "Unknown")).strip(),
                "flight_number": str(row.get("flight", "")).strip(),
                "origin": origin,
                "origin_city": source_city,
                "destination": destination,
                "destination_city": dest_city,
                "departure_time": str(row.get("departure_time", "")).strip(),
                "arrival_time": str(row.get("arrival_time", "")).strip(),
                "duration": _parse_duration(str(row.get("duration", ""))),
                "stops": stops,
                "class": str(row.get("class", "Economy")).strip(),
                "price": round(price_usd, 2),
                "days_left": days_left,
                "avg_30d_price": round(avg_30d_price, 2),
                "discount_percent": discount_percent,
                "available_seats": available_seats,
                "has_promo": has_promo,
                "promo_end_date": promo_end_date,
                "deal_score": deal_score,
                "rating": 4.0,
                "source": "kaggle_india_flights",
                "created_at": datetime.now(timezone.utc)
            }

            flights.append(flight)

    except Exception as e:
        print(f"   ⚠️  Error processing Clean_Dataset.csv: {e}")
    
    # Insert enhanced flights (append, don't drop)
    if flights:
        collection = db["flights"]
        # Create indexes if they don't exist
        collection.create_index("flight_id", unique=True)
        collection.create_index("origin")
        collection.create_index("destination")
        collection.create_index("deal_score")

        # Use ordered=False to continue on duplicate key errors
        from pymongo.errors import BulkWriteError
        try:
            result = collection.insert_many(flights, ordered=False)
            print(f"   ✅ Added {len(result.inserted_ids)} flights from Clean_Dataset.csv")
        except BulkWriteError as e:
            # Handle partial success (some duplicates, some inserted)
            inserted = e.details.get('nInserted', 0)
            errors = len(e.details.get('writeErrors', []))
            print(f"   ✅ Added {inserted} enhanced flights from price data (skipped {errors} duplicates)")
        except Exception as e:
            # Fallback: Try inserting one by one to skip duplicates
            inserted = 0
            for flight in flights:
                try:
                    collection.insert_one(flight)
                    inserted += 1
                except Exception:
                    pass  # Skip duplicates
            print(f"   ✅ Added {inserted} enhanced flights from price data (skipped {len(flights) - inserted} duplicates)")
    
    return len(flights)

def _parse_duration(duration_str):
    """Parse duration string like '02h 10m' to minutes"""
    try:
        hours = 0
        minutes = 0
        if "h" in duration_str:
            hours = int(duration_str.split("h")[0])
        if "m" in duration_str:
            mins_part = duration_str.split("h")[1] if "h" in duration_str else duration_str
            minutes = int(mins_part.split("m")[0].strip())
        return hours * 60 + minutes
    except:
        return 0

def sample_delays_for_reliability(db):
    """
    Sample delays data to calculate route reliability scores
    Since delays.csv is 565MB, we'll sample and aggregate
    """
    print("\n" + "="*60)
    print("📊 Sampling Flight Delays for Reliability")
    print("="*60)

    delays_file = DELAYS_DIR / "flights.csv"

    if not delays_file.exists():
        print(f"⚠️  File not found: {delays_file}")
        print("   Skipping delays import...")
        return 0

    print(f"   Reading sample from: {delays_file} (this may take a while...)")

    # Sample 10,000 rows for performance
    try:
        df = pd.read_csv(delays_file, nrows=10000, low_memory=False)
        print(f"   Loaded {len(df)} delay records (sample)")

        # Aggregate by route
        reliability_scores = {}

        for _, row in df.iterrows():
            origin = str(row.get("ORIGIN_AIRPORT", "")).strip().upper()
            dest = str(row.get("DESTINATION_AIRPORT", "")).strip().upper()
            airline = str(row.get("AIRLINE", "")).strip()
            
            if not origin or not dest or len(origin) != 3 or len(dest) != 3:
                continue
            
            route_key = f"{origin}_{dest}"
            
            if route_key not in reliability_scores:
                reliability_scores[route_key] = {
                    "on_time": 0,
                    "total": 0,
                    "airlines": {}
                }
            
            reliability_scores[route_key]["total"] += 1

            # On-time = delay <= 15 minutes
            arr_delay = float(row.get("ARRIVAL_DELAY", 999)) if pd.notna(row.get("ARRIVAL_DELAY")) else 999
            if arr_delay <= 15:
                reliability_scores[route_key]["on_time"] += 1
            
            # Track by airline
            if airline:
                if airline not in reliability_scores[route_key]["airlines"]:
                    reliability_scores[route_key]["airlines"][airline] = {"on_time": 0, "total": 0}
                reliability_scores[route_key]["airlines"][airline]["total"] += 1
                if arr_delay <= 15:
                    reliability_scores[route_key]["airlines"][airline]["on_time"] += 1
        
        # Store reliability scores
        reliability_docs = []
        for route_key, stats in reliability_scores.items():
            origin, dest = route_key.split("_")
            on_time_pct = (stats["on_time"] / stats["total"] * 100) if stats["total"] > 0 else 70.0
            
            doc = {
                "origin": origin,
                "destination": dest,
                "on_time_percentage": round(on_time_pct, 2),
                "total_flights": stats["total"],
                "on_time_flights": stats["on_time"],
                "airline_scores": {
                    airline: {
                        "on_time_pct": round((airline_stats["on_time"] / airline_stats["total"] * 100), 2),
                        "total": airline_stats["total"]
                    }
                    for airline, airline_stats in stats["airlines"].items()
                },
                "created_at": datetime.now(timezone.utc)
            }
            reliability_docs.append(doc)
        
        # Insert to MongoDB
        collection = db["route_reliability"]
        collection.drop()
        if reliability_docs:
            collection.insert_many(reliability_docs)
            collection.create_index([("origin", 1), ("destination", 1)])
            print(f"   ✅ Calculated reliability for {len(reliability_docs)} routes")
        
        return len(reliability_docs)
    
    except Exception as e:
        print(f"   ⚠️  Error processing delays: {e}")
        return 0

def main():
    """Main import function"""
    print("="*60)
    print("🚀 Kaggle Datasets Import Script")
    print("="*60)
    print(f"📁 Kaggle data directory: {KAGGLE_DIR}")
    print()
    
    # Connect to MongoDB
    db = connect_mongo()
    
    # Import datasets
    total = 0
    
    # 1. Airports (highest priority - needed for city→IATA lookup)
    total += import_airports(db)
    
    # 2. Routes (for validation)
    total += import_routes(db)
    
    # 3. Airlines (for airline name lookups)
    total += import_airlines(db)
    
    # 4. Enhance flights with price data
    total += enhance_flights_with_price_data(db)
    
    # 5. Sample delays for reliability (optional, can be slow)
    print("\n   ⚠️  Delays import is optional and can be slow.")
    print("   💡 Tip: Run separately if needed: python import_kaggle_datasets.py --delays-only")
    # total += sample_delays_for_reliability(db)
    
    print("\n" + "="*60)
    print(f"✅ Import Complete! Total records processed: {total}")
    print("="*60)
    
    # Show summary
    print("\n📊 Database Summary:")
    print(f"   Airports: {db['airports'].count_documents({})}")
    print(f"   Routes: {db['routes'].count_documents({})}")
    print(f"   Airlines: {db['airlines'].count_documents({})}")
    print(f"   Flights: {db['flights'].count_documents({})}")
    if db['route_reliability'].count_documents({}) > 0:
        print(f"   Route Reliability: {db['route_reliability'].count_documents({})}")
    
    print("\n💡 Next Steps:")
    print("   1. Update concierge_agent.py to use AirportLookup utility")
    print("   2. Add route validation before searching")
    print("   3. Integrate reliability scores into deal_scorer.py")
    print("   4. Test with queries like 'Find flights from Miami to Tokyo'")

if __name__ == "__main__":
    import sys
    if "--delays-only" in sys.argv:
        db = connect_mongo()
        sample_delays_for_reliability(db)
    else:
        main()

