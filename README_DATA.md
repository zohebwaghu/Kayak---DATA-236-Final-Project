# Data Import Guide

This guide explains how to import the Kaggle datasets into MongoDB for the AI recommendation service.

## Datasets

The following datasets are included in the `data/` directory:

| File | Description | Size | Source |
|------|-------------|------|--------|
| `airports.csv` | Global airports with IATA codes | ~700KB | [Kaggle - Global Airports](https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo) |
| `Clean_Dataset.csv` | Flight prices (India routes) | ~25MB | [Kaggle - Flight Price Prediction](https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction) |
| `hotel_booking.csv` | Hotel booking data | ~25MB | [Kaggle - Hotel Booking Demand](https://www.kaggle.com/datasets/mojtaba142/hotel-booking) |

## Prerequisites

1. **MongoDB** running (via Docker or locally)
2. **Python 3.8+** with required packages:
   ```bash
   pip install pandas pymongo
   ```

## Import Steps

### 1. Start MongoDB (if using Docker)

```bash
cd middleware
docker-compose up -d mongodb
```

### 2. Run the Import Script

```bash
cd data
python import_data.py
```

By default, this imports data to:
- **MongoDB URI**: `mongodb://localhost:27017`
- **Database**: `kayak_doc`

### 3. Custom Configuration (Optional)

You can customize the import using environment variables:

```bash
# Windows PowerShell
$env:MONGO_URI="mongodb://localhost:27017"
$env:MONGO_DB="kayak_doc"
$env:DATA_DIR="."
python import_data.py

# Linux/Mac
MONGO_URI="mongodb://localhost:27017" MONGO_DB="kayak_doc" DATA_DIR="." python import_data.py
```

## Imported Collections

The script creates the following collections in MongoDB:

### `airports`
- ~6,300 global airports
- Fields: `airport_id`, `name`, `iata`, `icao`, `city`, `country`, `timezone`, `latitude`, `longitude`
- Index: `iata` (unique)

### `flights`
- 10,000 flight records (India domestic routes)
- Routes: DEL (Delhi) → BOM (Mumbai), DEL → BLR (Bangalore), etc.
- Fields: `flight_id`, `airline`, `flight_number`, `origin`, `destination`, `departure_time`, `arrival_time`, `duration`, `stops`, `class`, `price`, `available_seats`, `rating`
- Indexes: `flight_id` (unique), `origin`, `destination`, `price`

### `hotels`
- 10,000 hotel records (primarily European)
- Fields: `hotel_id`, `name`, `hotel_type`, `city`, `country`, `star_rating`, `price_per_night`, `amenities`, `room_type`, `meal_plan`, `is_refundable`, `available_rooms`, `rating`, `tags`
- Indexes: `hotel_id` (unique), `city`, `price_per_night`, `star_rating`

## Verification

After import, verify the data:

```bash
# Check collection counts
docker exec kayak-mongodb mongosh kayak_doc --eval "
  print('Airports:', db.airports.countDocuments({}));
  print('Flights:', db.flights.countDocuments({}));
  print('Hotels:', db.hotels.countDocuments({}));
"

# Sample flight query
docker exec kayak-mongodb mongosh kayak_doc --eval "db.flights.findOne()"

# Sample hotel query
docker exec kayak-mongodb mongosh kayak_doc --eval "db.hotels.findOne()"
```

Expected output:
```
Airports: 6372
Flights: 10000
Hotels: 10000
```

## Troubleshooting

### Connection Refused
If you see `Connection refused`, make sure MongoDB is running:
```bash
docker-compose ps  # Check if kayak-mongodb is running
docker-compose up -d mongodb  # Start if needed
```

### Port Conflict
If port 27017 is in use, check which MongoDB instance is running:
```bash
# Windows
netstat -ano | findstr :27017

# Linux/Mac
lsof -i :27017
```

### Data Already Exists
The import script drops existing collections before importing. To preserve existing data, comment out the `collection.drop()` lines in `import_data.py`.

## AI Service Integration

The AI service (`ai/`) automatically loads this data on startup. After importing:

1. Restart the AI service:
   ```bash
   cd middleware
   docker-compose restart ai-service
   ```

2. Test the AI chat:
   ```bash
   curl -X POST http://localhost:8000/api/ai/chat \
     -H "Content-Type: application/json" \
     -d '{"query": "I want to go to Mumbai", "user_id": "test"}'
   ```

You should see flight recommendations like:
- **DEL → BOM** (Delhi to Mumbai)
- **DEL → BLR** (Delhi to Bangalore)
