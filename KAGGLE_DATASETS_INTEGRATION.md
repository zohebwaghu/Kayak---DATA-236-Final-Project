# Kaggle Datasets Integration Guide

This guide explains how to integrate real Kaggle datasets into the Kayak system for the Deals Agent and Concierge Agent.

## Datasets Used

### 1. Inside Airbnb NYC
- **URL**: https://www.kaggle.com/datasets/dominoweir/inside-airbnb-nyc
- **Alt**: https://www.kaggle.com/datasets/ahmedmagdee/inside-airbnb
- **Fields Used**:
  - `listing_id`, `date`, `price`, `availability`, `amenities`, `neighbourhood`
- **Purpose**: Hotel listings with real prices, amenities, and availability

### 2. Hotel Booking Demand
- **URL**: https://www.kaggle.com/datasets/mojtaba142/hotel-booking
- **Purpose**: Booking patterns and behavior analytics

### 3. Flight Price Prediction
- **URL**: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction
- **Alt**: https://www.kaggle.com/datasets/dilwong/flightprices
- **Fields Used**: `origin`, `dest`, `airline`, `stops`, `duration`, `price`
- **Purpose**: Real flight prices and routes

### 4. Global Airports
- **URL**: https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo
- **Fields Used**: IATA codes, coordinates, timezones
- **Purpose**: Airport reference data

### 5. OpenFlights Routes
- **URL**: https://www.kaggle.com/datasets/elmoallistair/airlines-airport-and-routes
- **Purpose**: Route validation and location logic

## Setup Instructions

### Step 1: Install Kaggle CLI

```bash
pip install kaggle
```

### Step 2: Setup Kaggle Credentials

1. Go to https://www.kaggle.com/account
2. Scroll to "API" section
3. Click "Create New API Token" (downloads `kaggle.json`)
4. Place it in `~/.kaggle/kaggle.json`
5. Set permissions: `chmod 600 ~/.kaggle/kaggle.json`

### Step 3: Download Datasets

```bash
./scripts/download_kaggle_datasets.sh
```

This will download all datasets to `data/kaggle/` directory.

### Step 4: Process and Load Data

```bash
# Install Python dependencies
pip install pandas mysql-connector-python pymongo

# Process datasets
python3 scripts/process_kaggle_data.py
```

This will:
- Process Airbnb data → MongoDB `hotels` collection
- Process Flight data → MongoDB `flights` collection
- Process Airport data → MySQL `airports` table
- Compute averages and prepare for deal detection

## Deals Agent Implementation

### Features

1. **Average Price Computation**
   - Computes 30-day average price from similar listings
   - Uses neighbourhood/city grouping for hotels
   - Uses route grouping for flights

2. **Deal Detection**
   - Flags deals when: `price ≤ 0.85 × avg_30d_price`
   - Marks "Limited availability" when `< 5` rooms/seats
   - Adds tags: "Pet-friendly", "Near transit", "Breakfast", etc.

3. **Deal Scoring**
   - Score 0-100 based on discount percentage
   - Bonus for limited availability
   - Penalty for high availability

### Usage

```python
from ai.agents.deal_scorer import DealScorer

scorer = DealScorer()

# Process a listing
deal_info = scorer.process_listing_for_deals('hotel', 'HTL_12345')

if deal_info and deal_info['is_deal']:
    print(f"Deal found! {deal_info['explanation']}")
    print(f"Tags: {deal_info['tags']}")
```

## Concierge Agent Implementation

### Features

1. **Bundle Building**
   - Builds flight+hotel bundles from cached deals
   - Matches flights and hotels by destination
   - Uses real data from MongoDB

2. **Fit Score Computation**
   - Price vs budget/median (40%)
   - Amenity/policy match (30%)
   - Location tag relevance (30%)

3. **Explanations**
   - "Why this" (≤25 words): price_vs_median, tags, neighbourhood
   - "What to watch": refund cutoff, limited rooms

4. **Policy Q&A**
   - Quotes cancellation/pet/parking from listing fields
   - Uses Inside Airbnb data for policy information

### Usage

```python
from ai.agents.bundle_builder import BundleBuilder
from datetime import datetime, timedelta

builder = BundleBuilder()

bundles = builder.build_bundles(
    origin='SFO',
    destination='JFK',
    start_date=datetime(2026, 1, 23),
    end_date=datetime(2026, 1, 30),
    user_budget=1000.00,
    user_preferences={
        'amenities': ['wifi', 'parking'],
        'location': 'Manhattan'
    }
)

for bundle in bundles:
    print(f"Bundle: {bundle['fit_score']}/100")
    print(f"Explanation: {bundle['explanation']}")
    print(f"Watch: {bundle['watch_items']}")
```

## API Endpoints

### Bundles Endpoint

```bash
POST /api/v1/bundles
{
  "origin": "SFO",
  "destination": "JFK",
  "startDate": "2026-01-23",
  "endDate": "2026-01-30",
  "budget": 1000.00,
  "preferences": {
    "amenities": ["wifi", "parking"],
    "location": "Manhattan"
  }
}
```

### WebSocket Events

```javascript
const ws = new WebSocket('ws://localhost:8000/ws');
ws.send(JSON.stringify({
  type: 'bundle_request',
  origin: 'SFO',
  destination: 'JFK',
  ...
}));
```

## Data Processing Details

### Airbnb Data Processing

1. **Extract Fields**:
   - `id` → `hotelId`
   - `name` → `name`
   - `price` → `pricePerNight` (cleaned, remove $)
   - `amenities` → `amenities` (parsed JSON array)
   - `neighbourhood_cleansed` → `neighbourhood`
   - `latitude`, `longitude` → coordinates

2. **Compute Averages**:
   - Group by `neighbourhood` and `city`
   - Compute average `pricePerNight` for similar listings
   - Store in MongoDB for quick lookup

3. **Deal Detection**:
   - Compare current price to 30-day average
   - Flag if `price ≤ 0.85 × avg_price`
   - Add tags based on amenities

### Flight Data Processing

1. **Extract Fields**:
   - `origin`, `destination` → uppercase IATA codes
   - `airline` → airline name
   - `price` → flight price
   - `stops` → number of stops
   - `duration` → flight duration in minutes

2. **Price Simulation**:
   - Use mean-reverting price model
   - Add random promo dips (-10% to -25%)
   - Simulate `seats_left` scarcity

3. **Route Validation**:
   - Join with airports dataset
   - Validate IATA codes
   - Add coordinates for location logic

## Testing

### Test Deal Detection

```bash
# Test hotel deal detection
python3 -c "
from ai.agents.deal_scorer import DealScorer
scorer = DealScorer()
deal = scorer.process_listing_for_deals('hotel', 'HTL_12345')
print(deal)
"
```

### Test Bundle Building

```bash
# Test bundle building
python3 -c "
from ai.agents.bundle_builder import BundleBuilder
from datetime import datetime, timedelta
builder = BundleBuilder()
bundles = builder.build_bundles('SFO', 'JFK', datetime(2026,1,23), datetime(2026,1,30), 1000)
print(f'Found {len(bundles)} bundles')
"
```

## Troubleshooting

### Datasets Not Found

If datasets aren't downloaded:
1. Check Kaggle credentials: `cat ~/.kaggle/kaggle.json`
2. Verify datasets are public/accessible
3. Try downloading manually from Kaggle website

### Data Processing Errors

If processing fails:
1. Check CSV file formats match expected structure
2. Verify column names in datasets
3. Check database connections (MySQL, MongoDB)

### No Deals Detected

If no deals are found:
1. Verify data was loaded: `mongosh kayak_doc --eval "db.hotels.countDocuments()"`
2. Check average price computation logic
3. Adjust deal threshold (currently 15% discount)

## Next Steps

1. **Download datasets** using the script
2. **Process data** into databases
3. **Test deal detection** with sample listings
4. **Test bundle building** with sample queries
5. **Integrate with AI service** endpoints
6. **Update frontend** to display deals and bundles

