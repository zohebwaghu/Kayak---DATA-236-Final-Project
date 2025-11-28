# AI Recommendation Service

Intelligent travel recommendation engine with conversational search, real-time deal monitoring, and LLM-powered assistance.

## 🎯 Core Features

### 1. Refine Without Starting Over
Conversational travel search that remembers context. Users can iteratively refine their searches without repeating information.

```
User: "Weekend trip to Miami under $800"
AI: [Shows 5 bundles]
User: "Make it beachfront"
AI: [Refines to beachfront hotels, shows what changed]
```

### 2. Keep an Eye on It
Real-time price and inventory monitoring with WebSocket notifications.

- Watch specific bundles, flights, or hotels
- Get notified when prices drop below threshold
- Alerts when availability is running low

### 3. Decide with Confidence
Price analysis with historical context and AI recommendations.

- Current price vs 30-day average
- Price trend (rising/falling/stable)
- Verdict: Excellent Deal → Above Average
- Buy/wait recommendation

### 4. Book or Hand Off Cleanly
Complete pricing breakdown before booking.

- Itemized quote (base fare, taxes, fees)
- Bundle discounts applied
- Cancellation policy summary
- One-click booking initiation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ AiMode   │ │ AiResults│ │ AiBundle │ │ AiChatWidget     │   │
│  │ Panel    │ │          │ │ Card     │ │ (floating)       │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       │            │            │                 │             │
│       └────────────┴────────────┴─────────────────┘             │
│                            │                                     │
│                    ┌───────▼───────┐                            │
│                    │  aiService.js │                            │
│                    └───────┬───────┘                            │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                      AI Service (FastAPI)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      main.py                             │    │
│  │  /chat  /bundles  /watches  /analysis  /quotes  /events │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │         │         │          │         │                 │
│  ┌────▼────┐ ┌──▼───┐ ┌───▼───┐ ┌────▼────┐ ┌──▼──┐            │
│  │Concierge│ │Bundle│ │ Watch │ │  Price  │ │Quote│            │
│  │ Agent   │ │Matcher│ │Manager│ │Analyzer │ │ Gen │            │
│  └────┬────┘ └──┬───┘ └───┬───┘ └────┬────┘ └──┬──┘            │
│       │         │         │          │         │                 │
│  ┌────▼─────────▼─────────▼──────────▼─────────▼────┐           │
│  │              LLM Provider (OpenAI / Ollama)       │           │
│  └──────────────────────────────────────────────────┘           │
│       │                   │                    │                 │
│  ┌────▼────┐         ┌────▼────┐         ┌────▼────┐            │
│  │  Redis  │         │  MySQL  │         │  Kafka  │            │
│  │ (cache) │         │ (data)  │         │ (events)│            │
│  └─────────┘         └─────────┘         └─────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

### Backend (`ai/`)

```
ai/
├── main.py                    # FastAPI app with all endpoints
├── config.py                  # Environment configuration
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container build
├── .env.example               # Environment template
│
├── algorithms/
│   ├── deal_scorer.py         # Deal scoring (0-100)
│   ├── fit_scorer.py          # User preference matching
│   └── bundle_matcher.py      # Flight + Hotel bundling
│
├── agents/
│   ├── concierge_agent.py     # LLM chat agent
│   └── deals_agent.py         # Kafka deals processor
│
├── llm/
│   ├── llm_router.py          # OpenAI/Ollama router
│   ├── openai_client.py       # OpenAI integration
│   └── ollama_client.py       # Ollama integration
│
├── services/
│   ├── chat.py                # Chat service logic
│   ├── session_store.py       # Session management
│   ├── bundles.py             # Bundle operations
│   ├── watches.py             # Watch CRUD
│   ├── price_analysis.py      # Price analytics
│   └── quotes.py              # Quote generation
│
├── cache/
│   ├── semantic_cache.py      # LLM response caching
│   └── redis_client.py        # Redis connection
│
└── kafka_client/
    ├── kafka_consumer.py      # Event consumer
    └── kafka_producer.py      # Event producer
```

### Frontend (`frontend/src/`)

```
frontend/src/
├── api/
│   └── aiService.js           # AI API client
│
├── components/ai/
│   ├── ai.css                 # All AI component styles
│   ├── AiBundleCard.jsx       # Bundle display card
│   ├── AiChangeHighlight.jsx  # Refinement diff display
│   ├── AiWatchesPanel.jsx     # Watch management
│   ├── AiPriceAnalysis.jsx    # Price analysis modal
│   ├── AiQuoteModal.jsx       # Booking quote modal
│   ├── AiPolicyInfo.jsx       # Cancellation policies
│   └── AiChatWidget.jsx       # Floating chat + notifications
│
└── pages/search/
    ├── AiModePanel.jsx        # AI search input (teammate's)
    ├── AiResults.jsx          # AI results container
    └── HomeSearchPage.jsx     # Main page with AI integration
```

---

## 🚀 Deployment Guide

### For Teammates: Quick Start

#### Prerequisites
- Docker Desktop installed and running
- Git

#### Step 1: Clone and Navigate

```bash
git clone <repo-url>
cd Kayak---DATA-236-Final-Project
```

#### Step 2: Configure LLM Provider

Choose ONE option:

**Option A: OpenAI (Recommended for demo)**
```bash
cd ai
cp .env.example .env
# Edit .env and add your OpenAI key:
# OPENAI_API_KEY=sk-your-key-here
```

**Option B: Ollama (Free, local)**
```bash
# Install Ollama from https://ollama.ai/download
ollama serve
ollama pull llama3.2

cd ai
cp .env.example .env
# Edit .env, leave OPENAI_API_KEY empty:
# OPENAI_API_KEY=
```

#### Step 3: Start All Services

```bash
cd middleware
docker-compose up -d --build
```

#### Step 4: Verify

```bash
# Check all containers are healthy
docker ps

# Test AI service
curl http://localhost:8000/api/ai/health
```

#### Step 5: Start Frontend

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000 and click **AI Mode** tab.

---

## 📡 API Reference

### Chat API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Send message, get AI response + bundles |
| `/api/ai/chat/history/{session_id}` | GET | Get conversation history |
| `/api/ai/chat/history/{session_id}` | DELETE | Clear session |

**Chat Request:**
```json
{
  "message": "Weekend trip to Miami under $800",
  "user_id": "user123",
  "session_id": "optional-session-id"
}
```

**Chat Response:**
```json
{
  "response": "I found 5 great weekend packages to Miami...",
  "bundles": [...],
  "suggestions": ["Make it beachfront", "Add car rental"],
  "changes": null,
  "session_id": "abc123"
}
```

### Bundles API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/bundles` | GET | List bundles with filters |
| `/api/ai/bundles/search` | POST | Search bundles |
| `/api/ai/bundles/{id}` | GET | Get bundle details |
| `/api/ai/bundles/popular` | GET | Popular destinations |

**Bundle Object:**
```json
{
  "bundle_id": "bun_123",
  "name": "Miami Beach Getaway",
  "destination": "Miami",
  "origin": "SFO",
  "total_price": 816,
  "savings": 82,
  "savings_percent": 9.1,
  "deal_score": 78,
  "fit_score": 85,
  "flight": {
    "airline": "Delta",
    "price": 320,
    "stops": 0
  },
  "hotel": {
    "name": "Oceanfront Resort",
    "price_per_night": 165,
    "nights": 3,
    "rating": 4.5
  },
  "why_this": "Direct flight + beachfront hotel matches your preferences",
  "what_to_watch": "Only 3 rooms left at this rate"
}
```

### Watches API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/watches` | POST | Create watch |
| `/api/ai/watches/{user_id}` | GET | List user's watches |
| `/api/ai/watches/{watch_id}` | DELETE | Delete watch |
| `/api/ai/watches/{watch_id}/toggle` | POST | Pause/resume watch |

**Create Watch:**
```json
{
  "user_id": "user123",
  "listing_type": "bundle",
  "listing_id": "bun_123",
  "listing_name": "Miami Beach Getaway",
  "watch_type": "price",
  "price_threshold": 750
}
```

### Price Analysis API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/analysis/{type}/{id}` | GET | Get price analysis |
| `/api/ai/analysis/bundle/{id}` | GET | Bundle price analysis |
| `/api/ai/analysis/verdict` | POST | Quick verdict |

**Analysis Response:**
```json
{
  "current_price": 816,
  "avg_30d_price": 892,
  "min_30d_price": 756,
  "max_30d_price": 1050,
  "price_vs_avg_percent": -8.5,
  "price_trend": "falling",
  "verdict": "GREAT_DEAL",
  "verdict_explanation": "This is 8.5% below the 30-day average",
  "recommendation": "Book now - prices typically rise closer to travel dates",
  "confidence": 0.85
}
```

### Quotes API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/quotes` | POST | Generate quote |
| `/api/ai/quotes/{id}` | GET | Get quote |
| `/api/ai/quotes/{id}/refresh` | POST | Refresh expired quote |
| `/api/ai/quotes/{id}/book` | POST | Initiate booking |
| `/api/ai/policies/{type}/{id}` | GET | Get listing policies |

**Quote Response:**
```json
{
  "quote_id": "qt_123",
  "flight_quote": {
    "base_fare": 280,
    "taxes": 42,
    "carrier_fee": 0,
    "subtotal": 322
  },
  "hotel_quote": {
    "rate_per_night": 165,
    "nights": 3,
    "room_total": 495,
    "taxes": 59,
    "subtotal": 554
  },
  "summary": {
    "subtotal": 876,
    "bundle_discount": 60,
    "grand_total": 816
  },
  "quote_valid_until": "2025-01-15T23:59:59Z",
  "cancellation_summary": "Free cancellation until Jan 10"
}
```

### WebSocket Events

| Endpoint | Description |
|----------|-------------|
| `/api/ai/events?user_id=xxx` | Real-time event stream |

**Event Types:**
```json
{"event_type": "price_alert", "title": "Price Drop!", "message": "Miami bundle dropped to $756"}
{"event_type": "inventory_alert", "title": "Low Availability", "message": "Only 2 rooms left"}
{"event_type": "deal_found", "title": "New Deal", "message": "85-score deal to NYC"}
{"event_type": "watch_triggered", "title": "Watch Alert", "message": "Your Miami watch triggered"}
```

---

## 🧮 Deal Scoring Algorithm

Scores range from 0-100:

| Component | Max Points | Calculation |
|-----------|------------|-------------|
| Price Advantage | 40 | `min(40, discount_percent * 2)` |
| Scarcity | 30 | `30 if avail <= 3 else 20 if avail <= 5 else 10` |
| Rating | 20 | `(rating - 3.0) * 10` for rating >= 3.0 |
| Promotion | 10 | `10` if active promo else `0` |

**Verdicts:**
- 80+: `EXCELLENT_DEAL` 🏆
- 70-79: `GREAT_DEAL` 👍
- 60-69: `GOOD_DEAL` ✓
- 50-59: `FAIR_PRICE` —
- <50: `ABOVE_AVERAGE` ⚠️

---

## 🔧 Environment Variables

```bash
# LLM Configuration
OPENAI_API_KEY=                    # Leave empty for Ollama
OPENAI_MODEL=gpt-3.5-turbo
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2

# Database
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME_USERS=kayak_users
DB_NAME_BOOKINGS=kayak_bookings

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# MongoDB
MONGO_URI=mongodb://mongo:27017
MONGO_DB=kayak_doc

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:29092
KAFKA_CONSUMER_GROUP=ai-deals-agent

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000
```

---

## 🧪 Testing

### Test Chat API
```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Weekend trip to Miami under $800", "user_id": "test123"}'
```

### Test Bundles API
```bash
curl "http://localhost:8000/api/ai/bundles?destination=Miami&max_price=1000"
```

### Test WebSocket (using websocat)
```bash
websocat "ws://localhost:8000/api/ai/events?user_id=test123"
```

### Health Check
```bash
curl http://localhost:8000/api/ai/health
```

Expected response:
```json
{
  "status": "healthy",
  "llm_provider": "OpenAI",
  "services": {
    "redis": "connected",
    "mysql": "connected",
    "kafka": "connected"
  }
}
```

---

## 🐛 Troubleshooting

### "Cannot connect to Ollama"
```bash
# Ensure Ollama is running
ollama serve

# For Docker, use host.docker.internal
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

### "OpenAI API error: Invalid API key"
1. Verify key at https://platform.openai.com/api-keys
2. Check `.env` has correct format: `OPENAI_API_KEY=sk-...`
3. Restart: `docker-compose restart ai-service`

### "CORS error in browser"
```bash
# Check CORS_ORIGINS in .env includes your frontend URL
CORS_ORIGINS=http://localhost:3000
```

### "WebSocket connection failed"
```bash
# Check AI service is running
docker logs kayak-ai-service

# Verify WebSocket endpoint
curl http://localhost:8000/api/ai/health
```

### "Bundles returning empty"
```bash
# Check database has data
docker exec -it kayak-mysql mysql -u root -p -e "SELECT COUNT(*) FROM kayak_bookings.flights;"

# Check logs for errors
docker logs kayak-ai-service --tail 50
```

---

## 📊 Frontend Components

### AiModePanel
Input panel with suggestion chips. Created by teammate.

### AiResults
Main results container showing:
- AI response text
- Change highlights (when refining)
- Bundle cards list
- Follow-up suggestions

### AiBundleCard
Individual bundle display:
- Rank badge (🏆, 🥈, 🥉)
- Deal score with color coding
- Why This (green) / What to Watch (yellow)
- Price with savings
- Expandable flight/hotel details
- Action buttons (Watch, Analyze, Quote, Book)

### AiWatchesPanel
Watch management:
- List active watches
- Create new watches
- Pause/resume/delete

### AiPriceAnalysis
Modal showing:
- Verdict badge
- Price comparison (current vs avg)
- 30-day price range slider
- Trend indicator
- Recommendation

### AiQuoteModal
Booking quote modal:
- Flight breakdown
- Hotel breakdown
- Bundle discount
- Grand total
- Cancellation summary
- Book now button

### AiChatWidget
Floating widget (bottom-right):
- Chat button with conversation
- Notification bell with badge
- Real-time WebSocket events

---

## 📝 License

MIT
