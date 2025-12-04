#!/usr/bin/env python3
"""
Seed Cars Collection from Kaggle CSV

Reads `data/kaggle/Cars/Cars.csv` and inserts synthetic car rental
listings into MongoDB `kayak_doc.cars` in the shape expected by the
Search Service:

- location      (string, used for text search)
- carType       (string, e.g. SUV, Sedan)
- pricePerDay   (number, used for price filters)

The rest of the fields are helpful metadata for the UI / future features.
"""

import os
from pathlib import Path
from datetime import datetime
import random

import pandas as pd
from pymongo import MongoClient


PROJECT_ROOT = Path(__file__).parent.parent
DATA_FILE = PROJECT_ROOT / "data" / "kaggle" / "Cars" / "Cars.csv"

# Mongo configuration – match other data scripts
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "kayak_doc")


def connect_mongo():
  client = MongoClient(MONGO_URI)
  db = client[MONGO_DB]
  print(f"✅ Connected to MongoDB: {MONGO_URI}/{MONGO_DB}")
  return db


def pick_car_type(brand: str) -> str:
  """
  Rough heuristic mapping brands to car types so filters feel realistic.
  """
  brand = (brand or "").upper()
  if any(b in brand for b in ["SUV", "JEEP"]):
    return "SUV"
  if any(b in brand for b in ["VAN"]):
    return "Van"
  if any(b in brand for b in ["LUX", "PREMIUM"]):
    return "Luxury"
  # Default mix of common types
  return random.choice(["SUV", "Sedan", "Compact"])


def synth_price(brand: str) -> float:
  """
  Generate a synthetic daily price with light brand-based variation.
  """
  brand = (brand or "").upper()
  base_min, base_max = 35, 140
  if "ALAMO" in brand or "BUDGET" in brand:
    base_min, base_max = 30, 100
  elif "NATIONAL" in brand or "AVIS" in brand:
    base_min, base_max = 45, 160
  price = random.uniform(base_min, base_max)
  return round(price, 2)


def seed_cars(limit: int | None = 2000):
  if not DATA_FILE.exists():
    raise FileNotFoundError(f"Cars CSV not found at {DATA_FILE}")

  db = connect_mongo()
  collection = db["cars"]

  print(f"📊 Loading cars from {DATA_FILE}")
  df = pd.read_csv(DATA_FILE)

  if limit is not None:
    df = df.head(limit)

  docs = []
  seen_ids = set()

  for _, row in df.iterrows():
    try:
      tid = str(row.get("tid", "")).strip()
      loc_name = str(row.get("loc_name", "")).strip()
      city = str(row.get("city", "")).strip()
      state = str(row.get("state", "")).strip()
      country = str(row.get("country", "")).strip()
      brand = str(row.get("brand", "")).strip()

      if not city and not loc_name:
        continue

      car_id = f"CAR_{tid or row.get('index', '')}"
      if car_id in seen_ids:
        continue
      seen_ids.add(car_id)

      location_str = ", ".join(
        [part for part in [city or loc_name, state or None] if part]
      )

      car_type = pick_car_type(brand)
      price_per_day = synth_price(brand)

      doc = {
        "carId": car_id,
        "location": location_str or loc_name or city,
        "city": city,
        "state": state,
        "country": country,
        "providerName": brand or "Enterprise",
        "locName": loc_name,
        "carType": car_type,
        "pricePerDay": price_per_day,
        "latitude": float(row.get("latitude", 0)) if not pd.isna(row.get("latitude")) else None,
        "longitude": float(row.get("longitude", 0)) if not pd.isna(row.get("longitude")) else None,
        "address": {
          "line1": str(row.get("address_1", "")).strip(),
          "postalCode": str(row.get("postal_code", "")).strip(),
          "phone": str(row.get("phone", "")).strip(),
        },
        "locType": str(row.get("loc_type", "")).strip(),
        "groupBranchNumber": str(row.get("group_branch_number", "")).strip(),
        "updatedAt": datetime.utcnow(),
        "createdAt": datetime.utcnow(),
      }

      docs.append(doc)
    except Exception as e:
      print(f"⚠️  Skipping row due to error: {e}")
      continue

  if not docs:
    print("⚠️  No valid car documents generated; nothing to insert.")
    return

  print(f"🧹 Dropping existing 'cars' collection (if any)...")
  collection.drop()

  print(f"🚗 Inserting {len(docs)} car listings...")
  collection.insert_many(docs)
  collection.create_index("location")
  collection.create_index("carType")
  collection.create_index("pricePerDay")

  print("✅ Cars seeding complete.")
  print(f"   Total cars in collection: {collection.count_documents({})}")


if __name__ == "__main__":
  seed_cars()


