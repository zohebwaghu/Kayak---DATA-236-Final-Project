# AI Recommendation Service

Intelligent travel recommendation engine with deal scoring, real-time chat, and LLM support.

## Features

- **AI Chat**: Conversational travel assistant powered by OpenAI or Ollama
- **Deal Scoring**: Algorithm-based scoring for flights and hotels (0-100)
- **Bundle Matching**: Automatic flight + hotel package creation
- **Real-time WebSocket**: Live chat support
- **User Preferences**: Personalized recommendations based on booking history

## Tech Stack

- **Framework**: FastAPI
- **LLM**: OpenAI GPT-3.5 / Ollama (llama3.2)
- **Database**: MySQL, MongoDB
- **Cache**: Redis
- **Message Queue**: Kafka
- **Containerization**: Docker

---

## Quick Start

### Step 1: Choose Your LLM Provider

This service supports **two LLM providers**. Choose one:

| Provider | Requirement | Cost |
|----------|-------------|------|
| **OpenAI** | API Key | Paid |
| **Ollama** | Local installation | Free |

---

## Option A: Using OpenAI (Paid API)

### 1. Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

### 2. Create `.env` file

```bash
cd ai
cp .env.example .env
```

### 3. Edit `.env` - Add your OpenAI key

```bash
# .env file
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-3.5-turbo
```

### 4. Run with Docker

```bash
cd middleware

# Create .env with your OpenAI key
echo "OPENAI_API_KEY=sk-your-actual-api-key-here" > .env

# Start all services
docker-compose up -d --build

# Check logs - should show "LLM Provider: OpenAI"
docker logs kayak-ai-service
```

### 5. Verify

```bash
curl http://localhost:8000/api/ai/health
```

Should show: `"llm_provider": "OpenAI"`

---

## Option B: Using Ollama (Free Local)

### 1. Install Ollama

**Windows:**
- Download from https://ollama.ai/download
- Run installer

**Mac:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### 2. Start Ollama and Pull Model

```bash
# Start Ollama service
ollama serve

# In another terminal, pull the model
ollama pull llama3.2
```

### 3. Create `.env` file

```bash
cd ai
cp .env.example .env
```

### 4. Edit `.env` - Leave OpenAI key EMPTY

```bash
# .env file
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

**Important:** `OPENAI_API_KEY=` must be empty (nothing after `=`)

### 5. Run with Docker

```bash
cd middleware

# Create .env WITHOUT OpenAI key
echo "OPENAI_API_KEY=" > .env

# Start all services
docker-compose up -d --build

# Check logs - should show "LLM Provider: Ollama"
docker logs kayak-ai-service
```

### 6. Verify

```bash
curl http://localhost:8000/api/ai/health
```

Should show: `"llm_provider": "Ollama"`

---

## How LLM Provider is Selected

The service **automatically** chooses based on `OPENAI_API_KEY`:

```
if OPENAI_API_KEY is set and not empty:
    use OpenAI
else:
    use Ollama
```

| `.env` Setting | Provider Used |
|----------------|---------------|
| `OPENAI_API_KEY=sk-abc123...` | OpenAI |
| `OPENAI_API_KEY=` | Ollama |
| No OPENAI_API_KEY line | Ollama |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/health` | GET | Health check |
| `/api/ai/chat` | POST | AI chat |
| `/api/ai/recommendations` | POST | Get recommendations |
| `/api/ai/score` | POST | Deal scoring |
| `/api/ai/bundle` | POST | Create flight+hotel bundle |
| `/api/ai/history/{session_id}` | GET | Get conversation history |
| `/api/ai/history/{session_id}` | DELETE | Clear conversation |
| `/api/ai/user/{user_id}` | GET | Get user info & preferences |
| `/api/ai/chat/ws` | WebSocket | Real-time chat |

---

## API Examples

### Chat

```bash
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Find flights to Miami", "user_id": "123-45-6789"}'
```

### Score a Deal

```bash
curl -X POST http://localhost:8000/api/ai/score \
  -H "Content-Type: application/json" \
  -d '{"current_price": 200, "avg_30d_price": 300, "availability": 2, "rating": 4.5}'
```

### Get Recommendations

```bash
curl -X POST http://localhost:8000/api/ai/recommendations \
  -H "Content-Type: application/json" \
  -d '{"destination": "Miami", "user_id": "123-45-6789"}'
```

---

## Deal Scoring Algorithm

Scores range from 0-100 based on:

| Component | Max Points | Description |
|-----------|------------|-------------|
| Price Advantage | 40 | Discount vs 30-day average |
| Scarcity | 30 | Limited availability bonus |
| Rating | 20 | User rating (4.0+ required) |
| Promotion | 10 | Active promotion bonus |

**Score Thresholds:**
- 80+: Excellent Deal
- 60-79: Great Deal
- 40-59: Good Deal
- <40: Not a Deal

---

## Environment Variables

Full list of environment variables:

```bash
# LLM Configuration
OPENAI_API_KEY=              # Your OpenAI key (leave empty for Ollama)
OPENAI_MODEL=gpt-3.5-turbo   # OpenAI model
OLLAMA_BASE_URL=http://localhost:11434  # Ollama server URL
OLLAMA_MODEL=llama3.2        # Ollama model name

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME_USERS=kayak_users
DB_NAME_BOOKINGS=kayak_bookings

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB=kayak_doc

# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CONSUMER_GROUP=ai-deals-agent

# API
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## Project Structure

```
ai/
├── main.py                 # FastAPI application
├── config.py               # Configuration
├── requirements.txt        # Dependencies
├── Dockerfile              # Docker build
├── .env.example            # Environment template
├── algorithms/
│   ├── deal_scorer.py      # Deal scoring algorithm
│   ├── fit_scorer.py       # User fit scoring
│   └── bundle_matcher.py   # Bundle matching
├── agents/
│   ├── concierge_agent.py  # Chat agent
│   └── deals_agent.py      # Deals processing
├── cache/
│   ├── semantic_cache.py   # Semantic caching
│   └── redis_client.py     # Redis client
├── interfaces/
│   ├── data_interface.py   # Database interface
│   └── conversation_store.py # Chat history
└── kafka_client/
    ├── kafka_consumer.py   # Kafka consumer
    └── kafka_producer.py   # Kafka producer
```

---

## Troubleshooting

### Ollama Connection Error

```
Cannot connect to Ollama. Please ensure Ollama is running.
```

**Solution:**
```bash
# Make sure Ollama is running
ollama serve

# Verify it's working
curl http://localhost:11434/api/tags
```

### OpenAI API Error

```
OpenAI API error: Invalid API key
```

**Solution:**
1. Check your API key at https://platform.openai.com/api-keys
2. Make sure `.env` has correct key: `OPENAI_API_KEY=sk-...`
3. Restart the service

### Docker Network Error

```
Cannot connect to MySQL/Redis/Kafka
```

**Solution:**
```bash
# Restart all services
cd middleware
docker-compose down
docker-compose up -d --build
```

---

## Testing

```bash
# Run integration tests
cd ai
python test_integration.py

# Access Swagger docs
open http://localhost:8000/docs
```

---

## License

MIT
