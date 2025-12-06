# AI Recommendation Service

Intelligent travel recommendation engine with LLM-powered conversational AI, built for the Kayak clone project (DATA 236 Final Project).

---

## Prerequisites

### Required CSV Files

Before starting, ensure these 3 CSV files exist in the `data/` folder:

| File | Description | Required Columns |
|------|-------------|------------------|
| `data/airports.csv` | Airport codes and cities | `iata_code`, `city`, `country` |
| `data/flights.csv` | Flight inventory | `origin`, `destination`, `price`, `airline`, `stops`, `seats_available` |
| `data/hotels.csv` | Hotel inventory | `city`, `name`, `price_per_night`, `star_rating`, `amenities`, `rooms_available` |

**Note:** The data uses Indian cities (Mumbai, Delhi, Bangalore, Chennai, Kolkata, Hyderabad).

---

## Quick Start

### Step 1: Start Docker Services

```bash
cd middleware
docker-compose up -d
```

Wait for all services to be healthy (~30 seconds).

### Step 2: Import Data to SQLite

**This step is required before testing!**

```bash
docker exec -it kayak-ai-service python /app/import_data.py
```

Expected output:
```
✅ Airports: 6372 imported
✅ Flights: 10000 imported  
✅ Hotels: 10000 imported
```

### Step 3: Verify Data Import

```bash
docker exec kayak-ai-service python -c "from models.database import get_db_stats; print(get_db_stats())"
```

Expected output:
```python
{'flights': 10000, 'hotels': 10000, 'airports': 6372, 'bundles': 0, 'quotes': 0, 'bookings': 0, 'watches': 0}
```

### Step 4: Verify Service Health

```bash
curl http://localhost:8000/api/ai/health
```

---

## LLM Configuration

The AI service uses LLM for intent parsing. Configure in `middleware/.env`:

### Option A: OpenAI (Recommended)

```bash
# middleware/.env
OPENAI_API_KEY=sk-your-api-key-here
```

In `docker-compose.yml`:
```yaml
ai-service:
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - OPENAI_MODEL=gpt-3.5-turbo
```

### Option B: Ollama (Free Local LLM)

1. Install Ollama: https://ollama.ai
2. Pull model and start:
```bash
ollama pull llama3.2
ollama serve
```

3. Leave `OPENAI_API_KEY` empty in `.env`

### Verify LLM is Working

After starting, check logs:
```bash
docker logs kayak-ai-service --tail 30
```

Should show either:
- `Using OpenAI: gpt-3.5-turbo` or
- `Using Ollama: llama3.2`

---

## Testing the 5 User Journeys

### Frontend Testing

1. Start frontend: `cd frontend && npm start`
2. Go to http://localhost:3001
3. Click "AI Mode" tab
4. Enter test queries in sequence

### Backend Testing (PowerShell)

**Journey 1: Tell me what I should book**
```powershell
$response = Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body '{"query": "Find trips from Delhi to Mumbai with breakfast", "user_id": "test123"}'
$response
$sessionId = $response.session_id
```

**Journey 2: Refine without starting over** (use session_id from Journey 1)
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body "{`"query`": `"Make it pet-friendly`", `"user_id`": `"test123`", `"session_id`": `"$sessionId`"}"
```

**Journey 3: Keep an eye on it**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body "{`"query`": `"Watch option 1, alert if price drops below 2000`", `"user_id`": `"test123`", `"session_id`": `"$sessionId`"}"
```

**Journey 4: Decide with confidence**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body "{`"query`": `"Is this a good deal?`", `"user_id`": `"test123`", `"session_id`": `"$sessionId`"}"
```

**Journey 5a: Get quote**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body "{`"query`": `"Get me a full quote for option 1`", `"user_id`": `"test123`", `"session_id`": `"$sessionId`"}"
```

**Journey 5b: Book it**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/api/ai/chat" -Method POST -ContentType "application/json" -Body "{`"query`": `"Book it`", `"user_id`": `"test123`", `"session_id`": `"$sessionId`"}"
```

### Expected Results

| Journey | Query | Expected Response |
|---------|-------|-------------------|
| 1 | "Find trips from Delhi to Mumbai with breakfast" | 3 bundles with Fit Score, neighbourhood, why_this |
| 2 | "Make it pet-friendly" | "✨ Refined with: pet-friendly" + price change |
| 3 | "Watch option 1, alert if price drops below $2000" | "✅ Watch created! ID: W-xxx" |
| 4 | "Is this a good deal?" | Price analysis vs 30-day average |
| 5a | "Get me a full quote" | Quote with fare_class, baggage, cancellation |
| 5b | "Book it" | "Booking confirmed! Reference: BKxxxxx" |

---

## Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| **Framework** | FastAPI | REST API + WebSocket |
| **LLM** | OpenAI GPT-3.5 / Ollama | Intent parsing, NLU |
| **Database** | SQLModel + SQLite | Persistent storage (Pydantic v2) |
| **Cache** | Redis | Session store, deals cache |
| **Queue** | Apache Kafka | Event streaming |
| **Agent** | MRKL Pattern | 6 specialized tools |

---

## Architecture

### LLM-Powered Intent Parsing

```
User Query: "Find trips from Delhi to Mumbai with breakfast"
                    │
                    ▼
         ┌─────────────────────┐
         │   LLM Intent Parser │  ← OpenAI / Ollama
         │   (GPT-3.5-turbo)   │
         └──────────┬──────────┘
                    │
                    ▼
         {
           "action": "search",
           "destination": "Mumbai",
           "origin": "Delhi",
           "preferences": ["breakfast"]
         }
                    │
                    ▼
         ┌─────────────────────┐
         │   MRKL Tool Router  │
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
 search         analyze          watch
 bundles         price          creator
```

### 6 MRKL Tools

| Tool | Function | Trigger |
|------|----------|---------|
| `search_bundles` | Find flight+hotel bundles | "find", "search", "trip" |
| `price_analyzer` | Compare to 30-day average | "good deal", "worth it" |
| `watch_creator` | Create price alerts | "watch", "alert", "notify" |
| `quote_generator` | Generate booking quote | "quote", "full price" |
| `policy_lookup` | Get cancellation/pet policy | "cancel", "pet", "baggage" |
| `booking_confirmer` | Confirm booking | "book it", "confirm" |

---

## Assignment Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| SQLModel + SQLite | ✅ | 7 tables: flights, hotels, airports, bundles, quotes, bookings, watches |
| Pydantic v2 | ✅ | All models use Pydantic v2 |
| `neighbourhood` field | ✅ | Lower Parel, Colaba, Andheri, etc. |
| `near-transit` tag | ✅ | 40% hash-based assignment |
| Fit Score | ✅ | price + amenity + location |
| "Why this" ≤25 words | ✅ | LLM-enhanced explanation |
| "What to watch" ≤12 words | ✅ | Scarcity indicators |
| 6 MRKL tools | ✅ | search, analyze, watch, quote, policy, confirm |
| Multi-turn conversation | ✅ | Session-based context |
| fare_class, baggage, cancellation | ✅ | In quote response |
| Max 1 clarifying question | ✅ | Only asks destination once |

---

## File Structure

```
ai/
├── agents/
│   └── concierge_agent.py    # LLM-powered Concierge Agent
├── models/
│   ├── database.py           # SQLite connection
│   └── entities.py           # SQLModel entities
├── api/
│   ├── chat.py               # Chat endpoint
│   ├── bundles.py            # Bundles API
│   └── ...
├── import_data.py            # Data import script
└── requirements.txt

data/
├── airports.csv              # Required
├── flights.csv               # Required
└── hotels.csv                # Required
```

---

## Troubleshooting

### No LLM logs showing
```bash
docker restart kayak-ai-service
docker logs kayak-ai-service --tail 50
```

### "No flights found" error
```bash
# Re-import data
docker exec -it kayak-ai-service python /app/import_data.py
```

### Check SQLite data
```bash
docker exec kayak-ai-service python -c "from models.database import get_db_stats; print(get_db_stats())"
```

### View all logs
```bash
docker logs kayak-ai-service -f
```

---

## Indian Cities Mapping

| City | IATA | Neighbourhoods |
|------|------|----------------|
| Mumbai | BOM | Lower Parel, Colaba, Andheri, Worli, Powai, Bandra |
| Delhi | DEL | Connaught Place, Karol Bagh, Saket, Dwarka |
| Bangalore | BLR | MG Road, Koramangala, Whitefield, Indiranagar |
| Chennai | MAA | T Nagar, Anna Nagar, Adyar, Velachery |
| Kolkata | CCU | Park Street, Salt Lake, Howrah, New Town |
| Hyderabad | HYD | Banjara Hills, HITEC City, Jubilee Hills |

---

## Authors

Group 3 - DATA 236 Distributed Systems (Fall 2025)
