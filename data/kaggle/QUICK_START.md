# Quick Start: Using Kaggle Datasets

## 🚀 Step 1: Import the Datasets

Run the import script to load all Kaggle datasets into MongoDB:

```bash
cd /Users/zohebw/Desktop/DATA\ 236/Project/Kayak---DATA-236-Final-Project/data
python import_kaggle_datasets.py
```

This will:
- ✅ Import 7,700+ airports from `airports.csv`
- ✅ Import 67,000+ flight routes from `routes.csv`
- ✅ Import 6,000+ airlines from `airlines.csv`
- ✅ Enhance flights with pricing from `economy.csv` / `business.csv`

**Expected output:**
```
🚀 Kaggle Datasets Import Script
============================================================
✅ Connected to MongoDB: mongodb://localhost:27017/kayak_doc

📊 Importing Airports
   ✅ Imported 7,700 airports

📊 Importing Flight Routes
   ✅ Imported 67,660 routes

📊 Importing Airlines
   ✅ Imported 6,163 airlines

📊 Enhancing Flights with Price Data
   ✅ Added 5,000 enhanced flights from price data

✅ Import Complete! Total records processed: 86,523
```

---

## 🎯 Step 2: Use Airport Lookup in Your Code

### Example 1: Convert City Name to IATA Code

```python
from ai.utils.airport_lookup import get_airport_lookup

lookup = get_airport_lookup()

# Convert city names to IATA codes
miami_code = lookup.city_to_iata("Miami")  # Returns "MIA"
nyc_code = lookup.city_to_iata("New York")  # Returns "JFK"
tokyo_code = lookup.city_to_iata("Tokyo")  # Returns "NRT"
```

### Example 2: Validate Flight Routes

```python
# Check if a route exists
is_valid = lookup.validate_route("SFO", "MIA")  # Returns True/False

# Find alternative routes with connections
alternatives = lookup.find_alternative_routes("SFO", "MIA", max_stops=1)
# Returns: [{"origin": "SFO", "connection": "DFW", "destination": "MIA", "stops": 1}]
```

### Example 3: Get Airport Information

```python
# Get full airport details
airport_info = lookup.get_airport_info("MIA")
# Returns: {
#   "iata": "MIA",
#   "name": "Miami International Airport",
#   "city": "Miami",
#   "country": "United States",
#   "latitude": 25.7953,
#   "longitude": -80.2901,
#   "timezone": "America/New_York"
# }
```

---

## 🔧 Step 3: Update Concierge Agent

Replace hardcoded airport mappings in `ai/agents/concierge_agent.py`:

**Before:**
```python
india_airports = ["BOM", "DEL", "BLR", "MAA", "CCU", "HYD"]
origin = "DEL" if destination in india_airports else "SFO"
```

**After:**
```python
from ai.utils.airport_lookup import get_airport_lookup

airport_lookup = get_airport_lookup()

# Convert city names to IATA codes
dest_iata = airport_lookup.city_to_iata(destination)
if not dest_iata:
    return {"error": f"Could not find airport for '{destination}'"}

# Validate route before searching
if origin and dest_iata:
    if not airport_lookup.validate_route(origin, dest_iata):
        # Suggest alternatives
        alternatives = airport_lookup.find_alternative_routes(origin, dest_iata)
        return {"error": f"No direct route found. Alternatives: {alternatives}"}
```

---

## 📊 Step 4: Use Route Reliability (Optional)

If you imported delays data, you can add reliability scores:

```python
# In ai/algorithms/deal_scorer.py
def calculate_reliability_score(origin: str, dest: str) -> float:
    """Get on-time performance from delays data"""
    reliability = mongo_db.route_reliability.find_one({
        "origin": origin,
        "destination": dest
    })
    
    if reliability:
        return reliability.get("on_time_percentage", 70.0)
    return 70.0  # Default if no data

# Add to deal_score calculation
deal_score = (
    price_score +
    scarcity_score +
    promo_score +
    reliability_score  # NEW!
)
```

---

## 🧪 Step 5: Test It

Test with real queries:

```bash
# Start your AI service
cd ai
python main.py

# Test with curl
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test123",
    "message": "Find cheap flights from Miami to Tokyo"
  }'
```

The concierge agent should now:
- ✅ Convert "Miami" → "MIA" and "Tokyo" → "NRT"
- ✅ Validate the route exists
- ✅ Search for flights using correct IATA codes
- ✅ Return realistic results

---

## 📁 Dataset Files Used

| Dataset | File | Purpose |
|---------|------|---------|
| **Airports** | `Airlines, Airport, and Flight Routes/airports.csv` | City → IATA lookup |
| **Routes** | `Airlines, Airport, and Flight Routes/routes.csv` | Route validation |
| **Airlines** | `Airlines, Airport, and Flight Routes/airlines.csv` | Airline name lookups |
| **Prices** | `Flight Price Prediction/economy.csv` | Realistic pricing |
| **Prices** | `Flight Price Prediction/business.csv` | Business class pricing |
| **Delays** | `2015 Flight Delays and Cancellations/flights.csv` | Reliability scores (optional) |

---

## 🐛 Troubleshooting

### "No airports found"
- Make sure you ran `import_kaggle_datasets.py` first
- Check MongoDB connection: `mongosh kayak_doc` → `db.airports.count()`

### "City not found"
- The city name might not match exactly. Try:
  - "New York" instead of "NYC"
  - "San Francisco" instead of "SF"
  - Full city names work best

### "Route validation always returns False"
- Make sure `routes.csv` was imported: `db.routes.count()`
- Some routes might not exist in the dataset (e.g., very small airports)

---

## 📚 Next Steps

1. **Read the full guide**: `KAGGLE_DATASETS_GUIDE.md`
2. **Integrate with deals agent**: Use routes to generate valid flight combinations
3. **Add reliability scoring**: Import delays data for on-time performance
4. **Enhance bundle builder**: Use alternative routes for multi-city trips

---

## 💡 Tips

- **Cache is built on startup**: AirportLookup builds a cache when initialized, so first call might be slower
- **Major airports preferred**: `city_to_iata()` prefers major airports (JFK over LGA for NYC)
- **Route alternatives**: Use `find_alternative_routes()` to suggest connections when direct flights aren't available
- **Delays data is large**: Only sample delays data (10K rows) unless you need full analysis

