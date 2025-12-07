#!/usr/bin/env python3
"""
Add Synthetic Date Columns to Flights Collection

This script adds departureDate and arrivalDate fields to all flights
based on their days_left value, generating dates from today to 6 months in the future.

Usage:
    python3 scripts/add_synthetic_dates_to_flights.py
"""

import os
from datetime import datetime, timedelta
from pymongo import MongoClient
from tqdm import tqdm

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "kayak_doc")

def add_synthetic_dates():
    """Add synthetic dates to all flights"""
    
    print("🚀 Starting to add synthetic dates to flights...")
    
    # Connect to MongoDB
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    flights_collection = db.flights
    
    # Get today's date
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Calculate 6 months from today
    six_months_later = today + timedelta(days=180)  # ~6 months
    
    print(f"📅 Date range: {today.strftime('%Y-%m-%d')} to {six_months_later.strftime('%Y-%m-%d')}")
    
    # Get total count
    total_flights = flights_collection.count_documents({})
    print(f"📊 Total flights to update: {total_flights:,}")
    
    if total_flights == 0:
        print("⚠️  No flights found in database!")
        return
    
    # Process all flights
    flights = list(flights_collection.find({}))
    print(f"🔄 Processing {len(flights):,} flights...\n")
    
    updated = 0
    batch_updates = []
    batch_size = 1000
    
    for flight in tqdm(flights, desc="Processing flights"):
        # Calculate departure date based on days_left
        days_left = flight.get('days_left', 1)
        
        # Ensure days_left is within valid range (1-180 days = 6 months)
        if days_left < 1:
            days_left = 1
        if days_left > 180:
            days_left = 180
        
        # Calculate departure date
        departure_date = today + timedelta(days=days_left - 1)
        departure_date = departure_date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Calculate arrival date (add duration in hours)
        duration_hours = flight.get('duration', 2.0)  # Default 2 hours if not specified
        arrival_date = departure_date + timedelta(hours=duration_hours)
        
        # Ensure dates don't exceed 6 months
        if departure_date > six_months_later:
            # If days_left would put us beyond 6 months, use a random date within 6 months
            max_days = (six_months_later - today).days
            import random
            random_days = random.randint(1, max_days)
            departure_date = today + timedelta(days=random_days - 1)
            arrival_date = departure_date + timedelta(hours=duration_hours)
        
        # Prepare update
        update_doc = {
            '$set': {
                'departureDate': departure_date,
                'arrivalDate': arrival_date,
                'departure_date': departure_date.strftime('%Y-%m-%d'),  # YYYY-MM-DD format
                'arrival_date': arrival_date.strftime('%Y-%m-%d'),
                'days_left': days_left  # Keep original days_left
            }
        }
        
        batch_updates.append({
            'filter': {'_id': flight['_id']},
            'update': update_doc
        })
        
        # Execute batch updates
        if len(batch_updates) >= batch_size:
            for update in batch_updates:
                flights_collection.update_one(update['filter'], update['update'])
            updated += len(batch_updates)
            batch_updates = []
    
    # Process remaining updates
    if batch_updates:
        for update in batch_updates:
            flights_collection.update_one(update['filter'], update['update'])
        updated += len(batch_updates)
    
    print(f"\n✅ Completed!")
    print(f"   Processed: {len(flights):,} flights")
    print(f"   Updated: {updated:,} flights")
    
    # Create indexes on the new date fields
    print(f"\n📇 Creating indexes on date fields...")
    try:
        flights_collection.create_index("departureDate")
        flights_collection.create_index("departure_date")
        flights_collection.create_index([("origin", 1), ("destination", 1), ("departureDate", 1)])
        flights_collection.create_index([("origin", 1), ("destination", 1), ("departure_date", 1)])
        print("   ✅ Indexes created successfully")
    except Exception as e:
        print(f"   ⚠️  Index creation warning: {e}")
    
    # Verify the update
    print(f"\n🔍 Verifying updates...")
    sample_flight = flights_collection.find_one({"departureDate": {"$exists": True}})
    if sample_flight:
        print(f"   Sample flight:")
        print(f"     Origin: {sample_flight.get('origin')}")
        print(f"     Destination: {sample_flight.get('destination')}")
        print(f"     Departure Date: {sample_flight.get('departureDate')}")
        print(f"     Departure Date (string): {sample_flight.get('departure_date')}")
        print(f"     Days Left: {sample_flight.get('days_left')}")
    
    flights_with_dates = flights_collection.count_documents({"departureDate": {"$exists": True}})
    print(f"\n📊 Flights with dates: {flights_with_dates:,}/{total_flights:,}")
    
    # Show date range distribution
    print(f"\n📅 Date Range Distribution:")
    date_stats = list(flights_collection.aggregate([
        {
            "$group": {
                "_id": None,
                "minDate": {"$min": "$departureDate"},
                "maxDate": {"$max": "$departureDate"},
                "avgDaysLeft": {"$avg": "$days_left"}
            }
        }
    ]))
    
    if date_stats:
        stats = date_stats[0]
        print(f"   Earliest departure: {stats.get('minDate')}")
        print(f"   Latest departure: {stats.get('maxDate')}")
        print(f"   Average days_left: {round(stats.get('avgDaysLeft', 0))}")
    
    print(f"\n✨ Done! Flights now have synthetic dates from today to 6 months in the future.")
    
    client.close()

if __name__ == "__main__":
    add_synthetic_dates()
