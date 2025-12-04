# Correct Command to Import Real Data

## The Issue

When you ran the script from the `data/` directory, it couldn't find the CSV files because:
- Script looks for: `./data/Clean_Dataset.csv`
- But files are at: `data/Clean_Dataset.csv` (from project root)

## ✅ Correct Command (Run from Project Root)

```bash
cd "/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"

# Make sure you're in the venv
source venv/bin/activate  # or: . venv/bin/activate

# Run from project root (not from data/ directory)
DATA_DIR="./data" MONGO_URI="mongodb://localhost:27017" MONGO_DB="kayak_doc" python3 data/import_data.py
```

## What This Will Import

- ✅ **10,000 flights** from `data/Clean_Dataset.csv` (24MB)
- ✅ **Airports** from `data/airports.csv` (686KB)
- ✅ **10,000 hotels** from `data/hotel_booking.csv` (25MB)
- ✅ **Users** into MySQL from hotel booking data

## Current Status

Based on your terminal output, it looks like the script **did import data** (I can see flights and hotels in the output), but it may have used sample data generation when files weren't found.

After running the correct command above, you'll have the **full real dataset** imported.

## Verify Import

```bash
# Check MongoDB
docker exec kayak-mongodb mongosh kayak_doc --quiet --eval "print('Flights:', db.flights.countDocuments()); print('Hotels:', db.hotels.countDocuments())"

# Should show:
# Flights: 10000
# Hotels: 10000
```

