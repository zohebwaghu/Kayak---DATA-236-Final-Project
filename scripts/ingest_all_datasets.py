"""
End-to-end dataset ingest for Kayak project.

Sources (already downloaded locally):
- InsideAirbnb NYC: data/raw/listings.csv
- Hotel Booking Demand: data/hotel_booking.csv
- Expedia Flight Prices: data/kaggle/expedia_flights/itineraries.csv
- EaseMyTrip Flight Price Prediction (India): data/Clean_Dataset.csv
- Airports reference: data/airports.csv

What it does:
- Clears FlightDeal and HotelDeal tables in SQLite.
- Loads real NYC hotels (InsideAirbnb) plus Hotel Booking Demand rows (kept with real country).
- Loads flights from Expedia itineraries (US) and Clean_Dataset (India).
- Computes simple deal scores/discounts without any synthetic city remapping.

Usage (from repo root):
    PYTHONPATH=ai python scripts/ingest_all_datasets.py
"""

import os
import sys
import json
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from sqlmodel import Session

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "ai"))

from models.database import init_db, get_engine
from models.deals_entities import FlightDeal, HotelDeal


# ---------- Helpers ----------

def load_airport_lookup(airports_path: Path):
    df = pd.read_csv(airports_path)
    city_to_iata = {}
    for _, r in df.iterrows():
        iata = str(r.get("IATA", "")).strip()
        city = str(r.get("City_Name", "")).strip()
        if len(iata) == 3 and city:
            city_to_iata[city] = iata
    return city_to_iata


def make_hotel_id(prefix, idx):
    return f"{prefix}_{idx:06d}"


def make_flight_id(prefix, idx):
    return f"{prefix}_{idx:06d}"


def compute_deal_score(price, avg_price, availability, has_promo, stops=0):
    discount_percent = 0
    if avg_price and avg_price > 0:
        discount_percent = max(0, (avg_price - price) / avg_price * 100)
    scarcity = 20 if availability < 5 else 10 if availability < 10 else 0
    promo = 10 if has_promo else 0
    direct = 10 if stops == 0 else 0
    score = min(95, max(40, 50 + discount_percent * 0.5 + scarcity + promo + direct))
    return int(score), discount_percent


# ---------- Ingest functions ----------

def ingest_airbnb_nyc(session: Session, listings_path: Path, start_idx=0):
    if not listings_path.exists():
        return 0
    df = pd.read_csv(listings_path)
    count = 0
    for idx, row in df.iterrows():
        try:
            price = float(str(row.get("price", 0)).replace("$", "").replace(",", ""))
        except ValueError:
            continue
        if price <= 0:
            continue

        availability = int(row.get("availability_365", 0))
        rooms = max(1, min(20, availability // 30))
        star = 4 if price > 200 else 3
        has_promo = (hash(f"nyc{idx}") % 5 == 0)
        avg_price = round(price / 0.85, 2)
        deal_score, discount = compute_deal_score(price, avg_price, rooms, has_promo, stops=0)

        hotel = HotelDeal(
            hotel_id=make_hotel_id("HT_NYC", start_idx + idx),
            name=row.get("name") if isinstance(row.get("name"), str) and row.get("name").strip() else f"NYC Listing {idx}",
            hotel_type="Hotel",
            city="New York",
            city_code="NYC",
            country="USA",
            neighbourhood=row.get("neighbourhood", "City Center") or "City Center",
            price_per_night=round(price, 2),
            avg_30d_price=avg_price,
            discount_percent=discount,
            available_rooms=rooms,
            has_promo=has_promo,
            promo_end_date=(datetime.utcnow() + timedelta(days=5)).isoformat() if has_promo else None,
            deal_score=deal_score,
            star_rating=star,
            room_type=row.get("room_type", "Standard"),
            meal_plan=None,
            amenities=json.dumps(["wifi"]),
            tags=json.dumps(["refundable"] + (["limited-availability"] if rooms < 5 else [])),
            is_refundable=True,
            pet_friendly=False,
            parking_available=False,
            breakfast_included=False,
            near_transit=(hash(f"nt{idx}") % 5 < 2),
            rating=star,
            total_reviews=int(row.get("number_of_reviews", 0)),
            listing_date=datetime.utcnow().strftime("%Y-%m-%d"),
        )
        session.add(hotel)
        count += 1
    session.commit()
    return count


def ingest_hotel_booking(session: Session, hotel_path: Path, start_idx=0):
    if not hotel_path.exists():
        return 0
    df = pd.read_csv(hotel_path)
    count = 0
    for idx, row in df.iterrows():
        price = float(row.get("adr", 0) or 0)
        if price <= 0:
            continue
        rooms = max(1, int(row.get("required_car_parking_spaces", 1) or 1))
        star = 3
        has_promo = (hash(f"hb{idx}") % 6 == 0)
        avg_price = round(price / 0.9, 2)
        deal_score, discount = compute_deal_score(price, avg_price, rooms, has_promo, stops=0)

        hotel = HotelDeal(
            hotel_id=make_hotel_id("HT_HB", start_idx + idx),
            name=f"{row.get('hotel','Hotel')} {idx}",
            hotel_type=row.get("hotel", "Hotel"),
            city=row.get("country", "Unknown"),
            city_code=str(row.get("country", "UNK"))[:3].upper(),
            country=row.get("country", "Unknown"),
            neighbourhood="City Center",
            price_per_night=round(price, 2),
            avg_30d_price=avg_price,
            discount_percent=discount,
            available_rooms=rooms,
            has_promo=has_promo,
            promo_end_date=(datetime.utcnow() + timedelta(days=3)).isoformat() if has_promo else None,
            deal_score=deal_score,
            star_rating=star,
            room_type=row.get("reserved_room_type", "Standard"),
            meal_plan=row.get("meal"),
            amenities=json.dumps(["wifi"]),
            tags=json.dumps(["refundable"]),
            is_refundable=row.get("deposit_type", "") == "No Deposit",
            pet_friendly=False,
            parking_available=row.get("required_car_parking_spaces", 0) > 0,
            breakfast_included=row.get("meal") in ["BB", "HB", "FB"],
            near_transit=(hash(f"hbnt{idx}") % 5 < 2),
            rating=star,
            total_reviews=int(row.get("total_of_special_requests", 0) or 0),
            listing_date=datetime.utcnow().strftime("%Y-%m-%d"),
        )
        session.add(hotel)
        count += 1
    session.commit()
    return count


def ingest_expedia_flights(session: Session, expedia_path: Path, start_idx=0):
    if not expedia_path.exists():
        return 0
    df = pd.read_csv(expedia_path)
    count = 0
    for idx, row in df.iterrows():
        origin = row.get("startingAirport", "")
        dest = row.get("destinationAirport", "")
        if not (isinstance(origin, str) and isinstance(dest, str) and len(origin) == 3 and len(dest) == 3):
            continue
        price = float(row.get("totalFare", 0) or 0)
        if price <= 0:
            continue
        seats = int(row.get("seatsRemaining", 10) or 10)
        stops = 0 if bool(row.get("isNonStop", False)) else 1
        duration = int(row.get("travelDuration", 0) or 0)
        has_promo = (hash(f"exp{idx}") % 7 == 0)
        avg_price = round(price / 0.9, 2)
        deal_score, discount = compute_deal_score(price, avg_price, seats, has_promo, stops)

        flight = FlightDeal(
            flight_id=make_flight_id("FL_US", start_idx + idx),
            origin=origin,
            origin_city=origin,
            destination=dest,
            destination_city=dest,
            airline=row.get("segmentsAirlineCode", "") or row.get("fareBasisCode", "Airline"),
            flight_number=None,
            departure_time=row.get("segmentsDepartureTimeRaw", ""),
            arrival_time=row.get("segmentsArrivalTimeRaw", ""),
            duration=float(duration / 60) if duration else 0,
            stops=stops,
            flight_class=row.get("segmentsCabinCode", "Economy"),
            price=price,
            avg_30d_price=avg_price,
            discount_percent=discount,
            available_seats=seats,
            has_promo=has_promo,
            promo_end_date=(datetime.utcnow() + timedelta(days=4)).isoformat() if has_promo else None,
            deal_score=deal_score,
            tags=json.dumps(["direct-flight"] if stops == 0 else []),
            rating=4.0,
            days_left=14,
        )
        session.add(flight)
        count += 1
    session.commit()
    return count


def ingest_india_flights(session: Session, ease_path: Path, city_to_iata, start_idx=0):
    if not ease_path.exists():
        return 0
    df = pd.read_csv(ease_path)
    count = 0
    for idx, row in df.iterrows():
        source = row.get("source_city", "")
        dest = row.get("destination_city", "")
        if source not in city_to_iata or dest not in city_to_iata:
            continue
        origin = city_to_iata[source]
        destination = city_to_iata[dest]
        price = float(row.get("price", 0) or 0)
        if price <= 0:
            continue
        stops = int(row.get("stops", 0) or 0)
        seats = 20  # dataset lacks seats, assume plenty
        has_promo = (hash(f"in{idx}") % 6 == 0)
        avg_price = round(price / 0.9, 2)
        deal_score, discount = compute_deal_score(price, avg_price, seats, has_promo, stops)

        flight = FlightDeal(
            flight_id=make_flight_id("FL_IN", start_idx + idx),
            origin=origin,
            origin_city=source,
            destination=destination,
            destination_city=dest,
            airline=row.get("airline", "Airline"),
            flight_number=None,
            departure_time=row.get("departure_time", ""),
            arrival_time=row.get("arrival_time", ""),
            duration=float(row.get("duration", 0) or 0),
            stops=stops,
            flight_class=row.get("class", "Economy"),
            price=price,
            avg_30d_price=avg_price,
            discount_percent=discount,
            available_seats=seats,
            has_promo=has_promo,
            promo_end_date=(datetime.utcnow() + timedelta(days=3)).isoformat() if has_promo else None,
            deal_score=deal_score,
            tags=json.dumps(["direct-flight"] if stops == 0 else []),
            rating=4.0,
            days_left=20,
        )
        session.add(flight)
        count += 1
    session.commit()
    return count


# ---------- Main ----------

def main():
    data_dir = project_root / "data"
    airbnb_path = data_dir / "raw" / "listings.csv"
    hotel_booking_path = data_dir / "hotel_booking.csv"
    ease_path = data_dir / "Clean_Dataset.csv"
    expedia_path = data_dir / "kaggle" / "expedia_flights" / "itineraries.csv"
    airports_path = data_dir / "airports.csv"

    if not airports_path.exists():
        raise FileNotFoundError("airports.csv is required for mapping cities to IATA codes")

    city_to_iata = load_airport_lookup(airports_path)
    print(f"Loaded {len(city_to_iata)} city->IATA entries")

    init_db()
    engine = get_engine()
    with Session(engine) as session:
        # Clear existing
        session.query(FlightDeal).delete()
        session.query(HotelDeal).delete()
        session.commit()

        h1 = ingest_airbnb_nyc(session, airbnb_path, start_idx=0)
        h2 = ingest_hotel_booking(session, hotel_booking_path, start_idx=100000)
        f1 = ingest_expedia_flights(session, expedia_path, start_idx=0)
        f2 = ingest_india_flights(session, ease_path, city_to_iata, start_idx=500000)

    print("=== Ingest complete ===")
    print(f"Hotels: Airbnb NYC {h1}, Hotel Booking {h2}")
    print(f"Flights: Expedia {f1}, India {f2}")


if __name__ == "__main__":
    main()
