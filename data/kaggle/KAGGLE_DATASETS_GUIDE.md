# Kaggle Datasets Integration Guide

This guide explains how to use the Kaggle datasets you've downloaded to enhance your Kayak AI travel assistant.

## 📊 Available Datasets

### 1. **Airlines, Airport, and Flight Routes**
- **Files**: `airlines.csv`, `airports.csv`, `routes.csv`
- **Purpose**: Airport lookups, route validation, airline info
- **Use Cases**:
  - Convert city names → IATA codes (e.g., "Miami" → "MIA")
  - Validate flight routes exist
  - Get airport coordinates for distance calculations
  - Look up airline names from codes

### 2. **2015 Flight Delays and Cancellations**
- **Files**: `flights.csv` (565MB), `airlines.csv`, `airports.csv`
- **Purpose**: Historical reliability data
- **Use Cases**:
  - Calculate on-time performance by route/airline
  - Add reliability scores to flight recommendations
  - Warn users about historically delayed routes

### 3. **Flight Price Prediction**
- **Files**: `business.csv`, `economy.csv`, `Clean_Dataset.csv`
- **Purpose**: Realistic pricing data
- **Use Cases**:
  - Generate realistic flight prices by route/class
  - Calculate price trends (avg_30d_price)
  - Create deal scores based on price drops

### 4. **Global Airports Dataset** (if available)
- **Purpose**: Comprehensive airport metadata
- **Use Cases**: Same as #1, but potentially more complete

---

## 🎯 Integration Strategy

### Phase 1: Airport Lookup Service (High Priority)

**Problem**: Your concierge agent has hardcoded city→airport mappings:
```python
india_airports = ["BOM", "DEL", "BLR", "MAA", "CCU", "HYD"]
origin = "DEL" if destination in india_airports else "SFO"
```

**Solution**: Build a dynamic lookup using `airports.csv`:

```python
# ai/utils/airport_lookup.py
class AirportLookup:
    def city_to_iata(self, city_name: str) -> str:
        """Convert 'Miami' → 'MIA', 'New York' → 'JFK'"""
        
    def validate_route(self, origin: str, dest: str) -> bool:
        """Check if route exists in routes.csv"""
        
    def get_airport_info(self, iata: str) -> dict:
        """Get full airport metadata (lat/lon, timezone, etc.)"""
```

**Benefits**:
- ✅ Supports 7,700+ airports (not just 6 Indian ones)
- ✅ Handles city name variations ("NYC" → "JFK", "New York" → "JFK")
- ✅ Validates routes before searching

---

### Phase 2: Enhanced Flight Data Import

**Current**: `import_data.py` uses `Clean_Dataset.csv` (India routes only)

**Enhancement**: Merge multiple flight datasets:

1. **Use `routes.csv`** to generate valid route combinations
2. **Use `economy.csv` / `business.csv`** for realistic US pricing
3. **Use `Clean_Dataset.csv`** for India routes (keep existing)
4. **Use `flights.csv` (delays)** to add reliability scores

**New Import Script**: `data/import_kaggle_flights.py`

```python
def import_enhanced_flights():
    # 1. Load routes.csv → get all valid origin/dest pairs
    # 2. For each route, generate flights using:
    #    - economy.csv for economy prices
    #    - business.csv for business prices
    #    - delays.csv for on-time % (if route matches)
    # 3. Calculate deal_score with:
    #    - Price vs avg (from price prediction data)
    #    - Reliability score (from delays data)
    #    - Route popularity (from routes.csv frequency)
```

---

### Phase 3: Reliability Scoring

**Use `2015 Flight Delays and Cancellations/flights.csv`**:

```python
def calculate_reliability_score(origin: str, dest: str, airline: str) -> float:
    """
    Calculate on-time performance (0-100)
    Based on historical delays data
    """
    # Query delays.csv for:
    # - Same route (ORIGIN, DEST)
    # - Same airline (if available)
    # Calculate: (on_time_count / total_flights) * 100
    return score
```

**Integration**: Add to `deal_scorer.py`:
```python
deal_score = (
    price_score +      # Existing
    scarcity_score +   # Existing
    promo_score +      # Existing
    reliability_score  # NEW from delays data
)
```

---

### Phase 4: Route Validation

**Use `routes.csv`** to validate routes before searching:

```python
# In concierge_agent.py, before _fetch_deals():
def validate_route(self, origin: str, dest: str) -> bool:
    """Check if route exists in routes.csv"""
    route_exists = self.routes_db.find_one({
        'Source Airport': origin,
        'Destination Airport': dest
    })
    return route_exists is not None
```

**Benefits**:
- ✅ Prevents searching for non-existent routes
- ✅ Suggests alternatives if route doesn't exist
- ✅ Uses real airline route data

---

## 🚀 Quick Start: Import Script

I'll create `data/import_kaggle_datasets.py` that:

1. **Imports airports** from `airports.csv` → MongoDB `airports` collection
2. **Imports routes** from `routes.csv` → MongoDB `routes` collection (for validation)
3. **Imports airlines** from `airlines.csv` → MongoDB `airlines` collection
4. **Enhances flights** by:
   - Using `routes.csv` to generate valid routes
   - Using `economy.csv` / `business.csv` for pricing
   - Using `delays.csv` for reliability (sample, since it's 565MB)
5. **Creates airport lookup cache** in Redis for fast city→IATA conversion

---

## 📝 Implementation Steps

### Step 1: Create Airport Lookup Utility

**File**: `ai/utils/airport_lookup.py`

```python
"""
Airport Lookup Service
Uses airports.csv to convert city names → IATA codes
"""
from pymongo import MongoClient
import os

class AirportLookup:
    def __init__(self):
        mongo = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        self.db = mongo[os.getenv("MONGO_DB", "kayak_doc")]
        self._build_cache()
    
    def _build_cache(self):
        """Build city→IATA mapping cache"""
        airports = self.db.airports.find({})
        self.city_cache = {}
        for apt in airports:
            city = apt.get("city", "").lower()
            iata = apt.get("iata", "")
            if city and iata:
                self.city_cache[city] = iata
    
    def city_to_iata(self, city_name: str) -> str:
        """Convert city name to IATA code"""
        city_lower = city_name.lower()
        # Direct match
        if city_lower in self.city_cache:
            return self.city_cache[city_lower]
        # Partial match
        for city, iata in self.city_cache.items():
            if city_lower in city or city in city_lower:
                return iata
        return None
```

### Step 2: Update Concierge Agent

**File**: `ai/agents/concierge_agent.py`

Replace hardcoded mapping:
```python
# OLD:
india_airports = ["BOM", "DEL", "BLR", "MAA", "CCU", "HYD"]
origin = "DEL" if destination in india_airports else "SFO"

# NEW:
from utils.airport_lookup import AirportLookup
airport_lookup = AirportLookup()

if not origin:
    # Try to infer from user's location (if available)
    # Otherwise, use smart default based on destination
    dest_iata = airport_lookup.city_to_iata(destination)
    if dest_iata:
        # Use common origin for that region
        origin = self._get_default_origin(dest_iata)
```

### Step 3: Import Routes for Validation

**File**: `data/import_kaggle_routes.py`

```python
def import_routes(db):
    """Import routes.csv for route validation"""
    routes_df = pd.read_csv("data/kaggle/Airlines, Airport, and Flight Routes/routes.csv")
    
    routes = []
    for _, row in routes_df.iterrows():
        route = {
            "origin": row.get("Source Airport"),
            "destination": row.get("Destination Airport"),
            "airline": row.get("Airline"),
            "stops": int(row.get("Stops", 0)),
            "equipment": row.get("Equipment", "")
        }
        routes.append(route)
    
    db.routes.insert_many(routes)
    db.routes.create_index([("origin", 1), ("destination", 1)])
```

### Step 4: Add Reliability to Deal Scorer

**File**: `ai/algorithms/deal_scorer.py`

```python
def calculate_reliability_score(origin: str, dest: str, airline: str = None) -> float:
    """Calculate on-time performance from delays.csv"""
    # Query delays data (sample, since full file is 565MB)
    delays = mongo_db.flight_delays.find({
        "ORIGIN": origin,
        "DEST": dest,
        "AIRLINE": airline  # Optional
    })
    
    on_time = 0
    total = 0
    for delay in delays:
        total += 1
        if delay.get("ARR_DELAY", 0) <= 15:  # On-time = <=15 min delay
            on_time += 1
    
    if total == 0:
        return 70.0  # Default if no data
    
    reliability = (on_time / total) * 100
    return min(100, max(0, reliability))
```

---

## 🎯 Recommended Usage by Component

| Component | Dataset | How to Use |
|-----------|---------|------------|
| **Concierge Agent** | `airports.csv` | City → IATA lookup |
| **Concierge Agent** | `routes.csv` | Validate routes before searching |
| **Deals Agent** | `economy.csv` / `business.csv` | Generate realistic prices |
| **Deal Scorer** | `delays.csv` | Add reliability to deal_score |
| **Bundle Builder** | `routes.csv` | Suggest alternative routes |
| **Price Analyzer** | `economy.csv` / `business.csv` | Compare prices vs historical |

---

## 📦 Next Steps

1. **Run the import script** (I'll create it):
   ```bash
   cd data
   python import_kaggle_datasets.py
   ```

2. **Update concierge agent** to use `AirportLookup` instead of hardcoded mappings

3. **Add route validation** before `_fetch_deals()` in `concierge_agent.py`

4. **Enhance deal scorer** with reliability from delays data

5. **Test with real queries**: "Find flights from Miami to Tokyo" (should use airports.csv to resolve codes)

---

## ⚠️ Notes

- **`flights.csv` (delays) is 565MB**: Consider sampling or pre-aggregating by route
- **Routes may not match exactly**: Some routes in `routes.csv` might not have flights in your price data
- **City name variations**: "New York" vs "NYC" vs "New York City" - handle fuzzy matching
- **Timezone handling**: Use `airports.csv` timezone field for accurate departure/arrival times

---

## 🔗 Related Files

- `data/import_data.py` - Current import script (uses Clean_Dataset.csv)
- `ai/agents/concierge_agent.py` - Needs airport lookup
- `ai/algorithms/deal_scorer.py` - Can use reliability scores
- `ai/agents/bundle_builder.py` - Can use routes for validation

