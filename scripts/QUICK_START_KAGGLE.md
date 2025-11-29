# Quick Start: Kaggle Datasets Integration

## Prerequisites

1. **Kaggle Account**: Sign up at https://www.kaggle.com
2. **Kaggle API Token**: 
   - Go to https://www.kaggle.com/account
   - Click "Create New API Token"
   - Save `kaggle.json` to `~/.kaggle/kaggle.json`
   - Run: `chmod 600 ~/.kaggle/kaggle.json`

3. **Python Dependencies**:
   ```bash
   pip install kaggle pandas mysql-connector-python pymongo
   ```

## Quick Setup (3 Steps)

### Step 1: Download Datasets
```bash
./scripts/download_kaggle_datasets.sh
```

This downloads:
- Inside Airbnb NYC (hotels)
- Hotel Booking Demand
- Flight Price Prediction
- Global Airports
- OpenFlights Routes

### Step 2: Process and Load Data
```bash
python3 scripts/process_kaggle_data.py
```

This:
- Processes Airbnb data → MongoDB `hotels` collection
- Processes Flight data → MongoDB `flights` collection  
- Processes Airport data → MySQL `airports` table

### Step 3: Test Integration
```bash
# Test deal detection
curl -X POST http://localhost:8000/api/v1/deals/score \
  -H "Content-Type: application/json" \
  -d '{"listingType": "hotel", "listingId": "HTL_12345"}'

# Test bundle building
curl -X POST http://localhost:8000/api/v1/bundles \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "SFO",
    "destination": "JFK",
    "startDate": "2026-01-23",
    "endDate": "2026-01-30",
    "budget": 1000.00
  }'
```

## What Gets Created

### MongoDB Collections
- `hotels` - Real Airbnb listings with prices, amenities, neighbourhoods
- `flights` - Real flight routes with prices, airlines, stops

### MySQL Tables
- `airports` - Airport reference data (IATA codes, coordinates)

### AI Features Enabled
- **Deal Detection**: Real 30-day average price computation
- **Bundle Building**: Flight+hotel bundles from real data
- **Fit Scoring**: Price, amenity, location matching
- **Explanations**: "Why this" and "What to watch" from real data

## Troubleshooting

### "Kaggle credentials not found"
- Verify `~/.kaggle/kaggle.json` exists
- Check file permissions: `ls -la ~/.kaggle/`

### "Dataset not found"
- Some datasets may require acceptance of terms
- Visit dataset page on Kaggle and click "Download"

### "Database connection failed"
- Ensure MySQL and MongoDB are running
- Check connection strings in `.env` files

## Next Steps

1. **Restart AI Service** to load new modules
2. **Test endpoints** using curl or Postman
3. **Integrate with frontend** to display deals and bundles
4. **Monitor deal detection** in logs

For detailed documentation, see `KAGGLE_DATASETS_INTEGRATION.md`

