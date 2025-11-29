# Dataset Integration Guide

## Quick Answer: Manual Download is Better ✅

**For this project, manually downloading CSV files is recommended** because:
- ✅ Simpler (no API setup)
- ✅ More reliable (no rate limits)
- ✅ Easier to debug
- ✅ Works offline

---

## Two Options Available

### Option 1: Manual CSV Download (RECOMMENDED)

**Steps:**
1. Run setup script: `./scripts/setup_manual_datasets.sh`
2. Download CSV files from Kaggle (links provided)
3. Place files in `data/kaggle/` subdirectories
4. Run: `python3 scripts/process_kaggle_data.py`

**Pros:**
- No API credentials needed
- More reliable
- Can inspect files before processing
- Works offline

### Option 2: Kaggle API (Automated)

**Steps:**
1. Setup Kaggle credentials: `~/.kaggle/kaggle.json`
2. Run: `./scripts/download_kaggle_datasets.sh`
3. Run: `python3 scripts/process_kaggle_data.py`

**Pros:**
- Fully automated
- Always gets latest data

**Cons:**
- Requires API setup
- May hit rate limits
- More complex

---

## Recommended Workflow

```bash
# 1. Setup directories
./scripts/setup_manual_datasets.sh

# 2. Download CSV files manually from Kaggle
#    (Follow links in setup output)

# 3. Process data (creates sample if files missing)
python3 scripts/process_kaggle_data.py
```

---

## What Happens If Files Are Missing?

The processing script will **automatically create sample data** if CSV files are not found. This means:
- ✅ You can test the system immediately
- ✅ No need to download large datasets for development
- ✅ All features still work with sample data

---

## File Locations

After manual download, your structure should look like:

```
data/kaggle/
├── airbnb/
│   └── listings.csv
├── hotels/
│   └── hotel_bookings.csv
├── flights/
│   └── flight_prices.csv
├── airports/
│   └── airports.csv
└── routes/
    └── routes.csv
```

---

## Need Help?

- See `DATASET_DOWNLOAD_OPTIONS.md` for detailed comparison
- See `KAGGLE_DATASETS_INTEGRATION.md` for full documentation
- The processing script provides helpful error messages with download links

