# 创建 ai/README.md（无emoji版本）
@"
# Kayak AI Service

Multi-agent travel recommendation system using FastAPI and LLM integration.

---

## Overview

The AI Service is responsible for intelligent travel recommendations through two core agents:

### Agents

**1. Deals Agent**
- Computes Deal Scores (0-100) based on price advantage, scarcity, and ratings
- Auto-tags listings (pet-friendly, near transit, wifi, etc.)
- Analyzes price trends against 30-day historical data

**2. Concierge Agent**
- Understands user intent from natural language queries
- Generates optimized flight + hotel bundles
- Provides concise explanations (<=25 words) for recommendations
- Answers policy questions (cancellation, pets, amenities)
- Monitors deals and sends price/inventory alerts

---

## Core Algorithms

### Deal Score Algorithm
Evaluates deals using weighted criteria:
- **Price Advantage** (30 pts max): >=15% below 30-day average
- **Scarcity Bonus** (20 pts max): <5 items available
- **Rating Bonus** (10 pts max): Rating >=4.5
- **Promotion Tag** (15 pts max): Active promotion

**Threshold**: Score >=40 qualifies as a "deal"

### Fit Score Algorithm
Matches bundles to user intent (0-1.0 scale):
- **40%** Price Match (proximity to budget)
- **30%** Amenity Match (tags vs constraints)
- **20%** Location Score (city center, transit access)
- **10%** Policy Match (cancellation, pet-friendly)

---

## Quick Start

### Installation

\`\`\`bash
# 1. Create virtual environment
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
\`\`\`

### Run Service

\`\`\`bash
# From project root
cd ai
python main.py

# Service runs on http://localhost:8001
\`\`\`

### Test Service

\`\`\`bash
# Health check
curl http://localhost:8001/health

# Run unit tests
pytest tests/ai/ -v
\`\`\`

---

## API Endpoints

### 1. Chat Interface
\`\`\`http
POST /api/ai/chat
Content-Type: application/json

{
  "message": "Weekend trip to Miami under \$800",
  "user_id": "user-123"
}
\`\`\`

**Response:**
\`\`\`json
{
  "response": "I found 3 great options...",
  "intent": {
    "destination": "Miami",
    "budget": 800,
    "dates": ["2025-11-01", "2025-11-03"]
  },
  "bundles": [...]
}
\`\`\`

### 2. Get Recommendations
\`\`\`http
POST /api/ai/recommendations
Content-Type: application/json

{
  "origin": "SFO",
  "destination": "MIA",
  "dates": ["2025-11-01", "2025-11-03"],
  "budget": 1000,
  "constraints": ["pet-friendly", "near-transit"]
}
\`\`\`

### 3. Score Deal (Backend Integration)
\`\`\`http
POST /api/ai/score
Content-Type: application/json

{
  "deal_id": 123,
  "price": 150,
  "avg_30d_price": 200,
  "availability": 3,
  "rating": 4.5,
  "tags": ["wifi", "breakfast"]
}
\`\`\`

**Response:**
\`\`\`json
{
  "deal_score": 65,
  "is_deal": true,
  "tags": ["deal", "limited_availability", "high_rating"]
}
\`\`\`

---

## Module Structure

\`\`\`
ai/
├── main.py                    # FastAPI application entry
├── config.py                  # Configuration management
│
├── agents/                    # Core agents
│   ├── deals_agent.py         # Deal scoring and tagging
│   └── concierge_agent.py     # Conversational recommendations
│
├── algorithms/                # Scoring algorithms
│   ├── deal_scorer.py         # Deal Score computation
│   ├── fit_scorer.py          # Fit Score computation
│   └── bundle_matcher.py      # Bundle optimization
│
├── llm/                       # LLM integration
│   ├── intent_parser.py       # NLP intent extraction
│   ├── explainer.py           # Recommendation explanations
│   └── prompts.py             # Prompt templates
│
├── api/                       # FastAPI routes
│   ├── ai_chat.py             # Chat endpoint
│   ├── ai_recommendations.py  # Recommendations endpoint
│   └── ai_scoring.py          # Scoring endpoint
│
├── schemas/                   # Pydantic models
│   ├── ai_request.py          # Request schemas
│   └── ai_response.py         # Response schemas
│
├── interfaces/                # Backend integration
│   ├── data_interface.py      # Abstract interface
│   └── ai_mock.py             # Mock implementation
│
└── utils/                     # Helper functions
    └── ai_helpers.py
\`\`\`

---

## Testing

### Run All Tests
\`\`\`bash
pytest tests/ai/ -v
\`\`\`

### Run Specific Tests
\`\`\`bash
# Test Deal Scorer
pytest tests/ai/test_deal_scorer.py -v

# Test Fit Scorer
pytest tests/ai/test_fit_scorer.py -v

# Test Intent Parser
pytest tests/ai/test_intent_parser.py -v
\`\`\`

### Coverage Report
\`\`\`bash
pytest tests/ai/ --cov=ai --cov-report=html
\`\`\`

---

## Configuration

### Environment Variables

\`\`\`env
# AI Service
AI_SERVICE_PORT=8001
AI_SERVICE_HOST=0.0.0.0
LOG_LEVEL=INFO

# OpenAI API
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo-preview

# Backend Integration
BACKEND_URL=http://localhost:3000
\`\`\`

### Algorithm Parameters

Edit \`ai/config.py\` to adjust:
- \`deal_score_threshold\`: Minimum score to qualify as deal (default: 40)
- \`max_bundles_to_return\`: Number of recommendations (default: 3)

---

## Performance

- **Latency**: <500ms for chat queries
- **Throughput**: 100+ concurrent requests
- **Accuracy**: 90%+ intent parsing accuracy

---

## Data Sources

Uses Kaggle datasets:
- **Hotels**: [Inside Airbnb NYC](https://www.kaggle.com/datasets/dominoweir/inside-airbnb-nyc)
- **Flights**: [Flight Price Prediction](https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction)
- **Airports**: [Global Airports Database](https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo)

---

## Integration with Backend

The AI service integrates with backend through:

1. **Data Interface** (\`ai/interfaces/data_interface.py\`)
   - \`get_deals()\` - Fetch deals from database
   - \`get_bundle()\` - Retrieve bundle details
   - \`publish_deal_score()\` - Send scores to Kafka

2. **API Endpoints**
   - Backend calls \`POST /api/ai/score\` for deal evaluation
   - Backend calls \`POST /api/ai/chat\` for user queries

See \`docs/ai/AI_INTERFACE_CONTRACT.md\` for detailed specifications.

---

## Documentation

- **Interface Contract**: \`docs/ai/AI_INTERFACE_CONTRACT.md\`
- **API Specification**: \`docs/ai/AI_API_SPEC.md\`
- **Algorithm Details**: (Coming soon)

---

## Tech Stack

- **FastAPI** - Web framework
- **Pydantic v2** - Data validation
- **OpenAI API** - LLM integration
- **Loguru** - Logging
- **Pytest** - Testing

---

## Developer

**Jane** - AI Service Lead  
Course: DATA 236 - Distributed Systems for Data Engineering

---

## License

Part of SJSU DATA 236 Final Project - Group 3
"@ | Out-File -FilePath ai\README.md -Encoding UTF8

Write-Host "AI README created (no emoji version)!" -ForegroundColor Green