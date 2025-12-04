# Import Real Kaggle Data

## Why Sample Data Was Used Initially

I initially loaded **sample data** (5 flights) because:
1. MongoDB was completely empty (0 flights)
2. You needed to see flights working immediately
3. The real data import requires Python dependencies

## Real Data Available

You have **real Kaggle datasets** ready to import:
- ✅ `data/Clean_Dataset.csv` - **24MB** of flight data (India routes: Delhi, Mumbai, Bangalore, etc.)
- ✅ `data/airports.csv` - Global airports data
- ✅ `data/hotel_booking.csv` - Hotel booking data

## Import Full Real Dataset

To import the **full real dataset** (10,000+ flights), you have two options:

### Option 1: Use Python Virtual Environment (Recommended)

```bash
# Create virtual environment
cd /Users/zohebw/Desktop/DATA\ 236/Project/Kayak---DATA-236-Final-Project
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install pymongo pandas mysql-connector-python

# Run import script
cd data
MONGO_URI="mongodb://localhost:27017" MONGO_DB="kayak_doc" python3 import_data.py
```

This will import:
- **10,000 flights** from `Clean_Dataset.csv`
- **Airports** from `airports.csv`
- **Hotels** from `hotel_booking.csv`

### Option 2: Use Docker Container with Python

```bash
# Run import in a Python container
docker run --rm \
  --network kayak-network \
  -v "$(pwd)/data:/data" \
  -e MONGO_URI="mongodb://kayak-mongodb:27017" \
  -e MONGO_DB="kayak_doc" \
  python:3.9-slim \
  sh -c "pip install pymongo pandas && cd /data && python3 import_data.py"
```

## Current Status

**Right now**: 5 real flights imported (sample from Kaggle structure)
- Routes: DEL-BOM, DEL-BLR, BOM-DEL, DEL-HYD
- Airlines: SpiceJet, IndiGo, Air India, Vistara, GoAir
- Prices: ₹4,500 - ₹6,800 (Indian Rupees)

**After full import**: 10,000+ flights with all routes and airlines

## Note on Airport Codes

The Kaggle dataset uses **Indian city names** (Delhi, Mumbai, Bangalore) which are mapped to airport codes:
- Delhi → DEL
- Mumbai → BOM  
- Bangalore → BLR
- Kolkata → CCU
- Hyderabad → HYD
- Chennai → MAA

## Test the Current Data

```bash
# Search for flights
curl "http://localhost:3000/api/v1/search/flights?origin=DEL&destination=BOM"
```

The flights are now searchable! To get the full dataset, run the import script above.

