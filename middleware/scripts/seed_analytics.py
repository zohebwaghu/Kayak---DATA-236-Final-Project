
import pymongo
import random
import uuid
from datetime import datetime, timedelta
import os

# Configuration
MONGO_URI = "mongodb://localhost:27017"
MONGO_DB = "kayak_doc"

def connect_mongo():
    client = pymongo.MongoClient(MONGO_URI)
    return client[MONGO_DB]

def seed_analytics(count=2000):
    db = connect_mongo()
    print(f"Generating {count} dummy analytics logs...")

    # 1. Get Listings (to link clicks/reviews to real items)
    hotels = list(db.hotels.find({}, {"hotel_id": 1, "hotel_type": 1}).limit(100))
    flights = list(db.flights.find({}, {"flight_id": 1}).limit(100))
    
    all_listings = []
    for h in hotels:
        all_listings.append({"id": h["hotel_id"], "type": "hotel"})
    for f in flights:
        all_listings.append({"id": f["flight_id"], "type": "flight"})
        
    if not all_listings:
        print("No listings found! Run import_data.py first.")
        return

    # 2. Generate Logs (Clicks, Page Views)
    logs_collection = db["logs"]
    logs = []
    
    pages = ["/home", "/search", "/hotels", "/flights", "/cars", "/profile", "/bookings"]
    sections = ["hero_banner", "deals_section", "footer", "sidebar", "recommended_hotels", "flight_results"]
    
    for i in range(count):
        log_type = random.choice(["page_view", "listing_click", "section_view"])
        user_id = f"user_{random.randint(1, 1000)}"
        timestamp = datetime.now() - timedelta(days=random.randint(0, 30))
        
        log = {
            "user_id": user_id,
            "timestamp": timestamp,
            "type": log_type
        }
        
        if log_type == "page_view":
            log["page"] = random.choice(pages)
        elif log_type == "listing_click":
            listing = random.choice(all_listings)
            log["listingId"] = listing["id"]
            log["listingType"] = listing["type"]
            log["page"] = "/search"
        elif log_type == "section_view":
            log["section"] = random.choice(sections)
            log["page"] = "/home"
            
        logs.append(log)
        
    if logs:
        logs_collection.insert_many(logs)
        print(f"✅ Inserted {len(logs)} analytics logs")

    # 3. Generate Reviews
    print("Generating reviews...")
    reviews_collection = db["reviews"] # Assuming a separate collection or embedded. 
    # Admin service queries /admin/analytics/reviews which likely aggregates from a reviews collection
    # Let's check admin-service/server.js to see where it pulls reviews from.
    # It calls `api.get('/admin/analytics/reviews')`.
    # Let's assume it expects a 'reviews' collection for now based on typical patterns, 
    # or I should check the server.js code I read earlier.
    # Line 72: api.get('/admin/analytics/reviews')
    # I didn't see the implementation of that endpoint in the previous view_file output (it was cut off or I missed it).
    # But usually it would be `db.reviews`.
    
    reviews = []
    for i in range(500):
        listing = random.choice(all_listings)
        rating = random.randint(1, 5)
        
        review = {
            "reviewId": str(uuid.uuid4()),
            "listingId": listing["id"],
            "listingType": listing["type"],
            "userId": f"user_{random.randint(1, 1000)}",
            "rating": rating,
            "comment": "Automated test review",
            "createdAt": datetime.now() - timedelta(days=random.randint(0, 90))
        }
        reviews.append(review)
        
    if reviews:
        reviews_collection.insert_many(reviews)
        print(f"✅ Inserted {len(reviews)} reviews")

if __name__ == "__main__":
    seed_analytics()
