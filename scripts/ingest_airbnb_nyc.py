"""
Rebuild SQLite deals tables using InsideAirbnb NYC listings only.
Purpose: remove synthetic India-mapped hotel data and load real NYC hotels.
Run from repo root:
    python scripts/ingest_airbnb_nyc.py
Requires: data/raw/listings.csv (InsideAirbnb NYC), ai models on PYTHONPATH.
"""

import os
import sys
import json
from datetime import datetime, timedelta
import pandas as pd

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(project_root, "ai"))

from sqlmodel import Session
from models.database import init_db, get_engine
from models.deals_entities import HotelDeal, FlightDeal


DATA_FILE = os.path.join(project_root, "data", "raw", "listings.csv")


def main():
    if not os.path.exists(DATA_FILE):
        raise FileNotFoundError(f"Missing InsideAirbnb file: {DATA_FILE}")

    print(f"Loading {DATA_FILE} ...")
    df = pd.read_csv(DATA_FILE)
    print(f"Rows: {len(df)}")

    # Prepare DB
    init_db()
    engine = get_engine()

    hotels = []
    for idx, row in df.iterrows():
        try:
            price = float(str(row.get("price", 0)).replace("$", "").replace(",", ""))
        except ValueError:
            continue
        if price <= 0:
            continue

        availability = int(row.get("availability_365", 0))
        available_rooms = max(1, min(20, availability // 30))
        star_rating = 4 if price > 200 else 3
        hash_val = hash(f"HTNYC{idx}") % 100
        has_promo = hash_val % 4 == 0
        promo_end_date = (datetime.utcnow() + timedelta(days=(hash_val % 7) + 1)) if has_promo else None
        discount_percent = 15
        avg_30d_price = round(price / 0.85, 2)
        deal_score = min(95, max(40, 50 + (20 if available_rooms < 5 else 0) + (10 if has_promo else 0)))

        amenities = ["wifi"]
        tags = ["refundable"]
        if available_rooms < 5:
            tags.append("limited-availability")
        near_transit = hash_val % 5 < 2
        if near_transit:
            tags.append("near-transit")

        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            name = f"NYC Listing {idx}"

        hotel = HotelDeal(
            hotel_id=f"HT_NYC_{idx:06d}",
            name=name,
            hotel_type="Hotel",
            city="New York",
            city_code="NYC",
            country="USA",
            neighbourhood=row.get("neighbourhood", "City Center") or "City Center",
            price_per_night=round(price, 2),
            avg_30d_price=avg_30d_price,
            discount_percent=discount_percent,
            available_rooms=available_rooms,
            has_promo=has_promo,
            promo_end_date=promo_end_date.isoformat() if promo_end_date else None,
            deal_score=deal_score,
            star_rating=star_rating,
            room_type=row.get("room_type", "Standard"),
            meal_plan=None,
            amenities=json.dumps(amenities),
            tags=json.dumps(tags),
            is_refundable=True,
            pet_friendly=False,
            parking_available=False,
            breakfast_included=False,
            near_transit=near_transit,
            rating=star_rating,
            total_reviews=int(row.get("number_of_reviews", 0)),
            listing_date=datetime.utcnow().strftime("%Y-%m-%d"),
        )
        hotels.append(hotel)

    with Session(engine) as session:
        # clear existing deals to avoid fake data
        session.query(FlightDeal).delete()
        session.query(HotelDeal).delete()
        session.commit()
        session.add_all(hotels)
        session.commit()
        print(f"Inserted {len(hotels)} NYC hotels, cleared flights.")


if __name__ == "__main__":
    main()
