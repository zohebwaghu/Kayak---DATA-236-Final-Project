# Dataset Download Options Comparison

## Option 1: Manual CSV Download (RECOMMENDED) ✅

### Pros:
- ✅ **Simpler setup** - No API credentials needed
- ✅ **More reliable** - No rate limits or API connection issues
- ✅ **Easier debugging** - Can inspect files directly
- ✅ **Works offline** - Once downloaded, no internet needed
- ✅ **Pre-processing** - Can clean/transform files before loading
- ✅ **No dependencies** - Don't need Kaggle CLI installed
- ✅ **Faster for one-time setup** - Just download and place files

### Cons:
- ❌ Manual step required
- ❌ Need to remember to update if datasets change
- ❌ Files need to be placed in correct location

### Steps:
1. Download CSV files from Kaggle (or any source)
2. Place them in `data/kaggle/` directory
3. Run processing script

---

## Option 2: Kaggle API (Automated)

### Pros:
- ✅ **Automated** - Script handles everything
- ✅ **Always latest** - Gets updated datasets automatically
- ✅ **CI/CD friendly** - Can be part of deployment pipeline

### Cons:
- ❌ **Complex setup** - Requires Kaggle account + API token
- ❌ **Rate limits** - API may throttle downloads
- ❌ **Terms acceptance** - Some datasets require manual acceptance first
- ❌ **Dependency** - Requires Kaggle CLI and credentials
- ❌ **Connection issues** - May fail if Kaggle API is down

### Steps:
1. Create Kaggle account
2. Generate API token
3. Place `kaggle.json` in `~/.kaggle/`
4. Run download script

---

## Recommendation: Manual Download

For a **final project**, manual download is better because:

1. **Simplicity** - One less thing to configure
2. **Reliability** - No API dependencies
3. **Control** - You can inspect and clean data before loading
4. **Portability** - Works on any machine without setup
5. **Debugging** - Easier to troubleshoot with local files

---

## Quick Start: Manual Download

### Step 1: Create Data Directory
```bash
mkdir -p data/kaggle/{airbnb,hotels,flights,airports,routes}
```

### Step 2: Download Files

**Inside Airbnb NYC:**
- Go to: https://www.kaggle.com/datasets/dominoweir/inside-airbnb-nyc
- Download: `listings.csv` or `listings_summary.csv`
- Place in: `data/kaggle/airbnb/listings.csv`

**Hotel Booking:**
- Go to: https://www.kaggle.com/datasets/mojtaba142/hotel-booking
- Download: `hotel_bookings.csv`
- Place in: `data/kaggle/hotels/hotel_bookings.csv`

**Flight Prices:**
- Go to: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction
- Download: Main CSV file
- Place in: `data/kaggle/flights/flight_prices.csv`

**Global Airports:**
- Go to: https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo
- Download: Main CSV file
- Place in: `data/kaggle/airports/airports.csv`

**OpenFlights Routes:**
- Go to: https://www.kaggle.com/datasets/elmoallistair/airlines-airport-and-routes
- Download: Routes CSV
- Place in: `data/kaggle/routes/routes.csv`

### Step 3: Process Data
```bash
python3 scripts/process_kaggle_data.py
```

The script will automatically detect files in the `data/kaggle/` directory structure.

---

## File Structure Expected

```
data/
└── kaggle/
    ├── airbnb/
    │   └── listings.csv (or listings_summary.csv)
    ├── hotels/
    │   └── hotel_bookings.csv
    ├── flights/
    │   └── flight_prices.csv (or any CSV with flight data)
    ├── airports/
    │   └── airports.csv
    └── routes/
        └── routes.csv
```

---

## Alternative: Use Sample Data

If you don't want to download large datasets, the processing script will:
- Create sample data if files not found
- Use minimal realistic data for testing
- Still demonstrate all functionality

This is perfect for development and testing!

