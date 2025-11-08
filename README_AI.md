# AI Recommendation Service

> Intelligent travel recommendation engine for the Kayak Clone project
> 
> **Status**: Week 1 Complete (24/24 core files implemented)

---

## Overview

The AI Recommendation Service is a distributed microservice that provides intelligent travel recommendations using LangChain, semantic caching, and Kafka stream processing. It consists of two main agents:

1. **Deals Agent** - Backend worker that processes Kafka streams of flight and hotel deals
2. **Concierge Agent** - User-facing conversational AI (Week 3)

---

## Features

### Core Capabilities
- **Real-time Deal Scoring** - Analyzes flight and hotel deals using multi-factor algorithms
- **Bundle Matching** - Intelligently pairs flights with hotels for optimal packages
- **Semantic Caching** - Redis-based cache with Ollama embeddings for fast responses
- **Natural Language Understanding** - Parses user queries using GPT-3.5 Turbo
- **Personalized Recommendations** - Learns from user history and preferences
- **Kafka Stream Processing** - Handles high-throughput message streams

### Week 1 Implementation
- ✅ Deals Agent with Kafka integration
- ✅ Deal scoring algorithms (DealScorer, FitScorer, BundleMatcher)
- ✅ LangChain integration (IntentParser, Explainer)
- ✅ Redis semantic cache with Ollama embeddings
- ✅ FastAPI REST endpoints
- ✅ Mock data interfaces for independent development

---

## Architecture

```
AI Service
│
├── agents/              # AI Agents
│   └── deals_agent.py   # Main processing agent
│
├── algorithms/          # Scoring algorithms
│   ├── deal_scorer.py   # Deal quality scoring
│   ├── fit_scorer.py    # User preference matching
│   └── bundle_matcher.py # Flight + hotel pairing
│
├── llm/                 # LangChain integration
│   ├── intent_parser.py # Query understanding
│   └── explainer.py     # Recommendation explanations
│
├── cache/               # Semantic caching
│   ├── semantic_cache.py
│   └── embeddings.py    # Ollama integration
│
├── kafka/               # Kafka abstractions
│   ├── consumer.py
│   └── producer.py
│
├── api/                 # FastAPI endpoints
│   ├── chat.py
│   ├── recommendations.py
│   └── scoring.py
│
└── interfaces/          # Data interfaces
    └── data_interface.py # Backend data access
```

---

## Installation

### Prerequisites
- Python 3.9+
- Redis (for semantic cache)
- Kafka (for stream processing)
- Ollama (for local embeddings)

### Setup

1. **Clone the repository**
```bash
git clone <repo-url>
cd Kayak---DATA-236-Final-Project/ai
```

2. **Create virtual environment**
```bash
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Install Ollama (for embeddings)**
```bash
# Mac
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull the embedding model
ollama pull mxbai-embed-large
```

5. **Start Redis**
```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or install locally
brew install redis  # Mac
redis-server
```

6. **Configure environment**
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your credentials
# Required: OPENAI_API_KEY
# Optional: KAFKA_BOOTSTRAP_SERVERS, REDIS_HOST
```

---

## Configuration

### Environment Variables

Create a `.env` file in the `ai/` directory:

```bash
# OpenAI API (Required)
OPENAI_API_KEY=sk-your-key-here

# Kafka Configuration
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_FLIGHT_TOPIC=raw-flights
KAFKA_HOTEL_TOPIC=raw-hotels
KAFKA_SCORED_FLIGHTS_TOPIC=scored-flights
KAFKA_SCORED_HOTELS_TOPIC=scored-hotels
KAFKA_BUNDLES_TOPIC=travel-bundles
KAFKA_CONSUMER_GROUP=ai-deals-agent

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large

# Database Configuration (when available)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=kayak_db
DB_USER=ai_service_readonly
DB_PASSWORD=your-password

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Performance Settings
BUNDLE_MATCHING_INTERVAL=30
CACHE_TTL=300
MAX_RECOMMENDATIONS=20
```

---

## Usage

### Starting the AI Service

**Option 1: Run with FastAPI (Recommended)**
```bash
cd ai
python -m uvicorn main:app --reload --port 8000
```

**Option 2: Run Deals Agent directly**
```bash
cd ai
python -m agents.deals_agent
```

**Option 3: Run with Docker (Future)**
```bash
docker-compose up ai-service
```

### API Endpoints

Once running, access:
- **Swagger Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/ai/health

#### Available Endpoints

```bash
# Chat with AI
POST /api/ai/chat
{
  "query": "Find cheap beach vacations in Florida",
  "user_id": 123,
  "preferences": {...}
}

# Get recommendations
POST /api/ai/recommendations
{
  "destination": "Miami",
  "user_id": 123,
  "preferences": {...}
}

# Score a deal
POST /api/ai/score
{
  "flight_id": "flight_123",
  "hotel_id": "hotel_456"
}
```

---

## Development

### Project Structure

```
ai/
├── agents/              # AI Agents
├── algorithms/          # Scoring algorithms
├── api/                 # FastAPI endpoints
├── cache/               # Redis semantic cache
├── interfaces/          # Data access layer
├── kafka/               # Kafka client wrappers
├── llm/                 # LangChain integration
├── schemas/             # Pydantic models
├── utils/               # Helper functions
├── config.py            # Configuration management
├── main.py              # FastAPI application
└── requirements.txt     # Python dependencies
```

### Running Tests

```bash
# Install test dependencies
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_algorithms.py
```

### Mock Data Development

The AI service can run independently using mock data:

```python
from interfaces.ai_mock import AIMock

# Use mock data instead of real Kafka/Database
mock = AIMock()
flights = mock.get_mock_flights()
hotels = mock.get_mock_hotels()
```

Mock data location: `../data/mock/mock_data.json`

---

## Team Integration

### For Kafka Team
**Documentation**: `../docs/KAFKA_INTEGRATION_SIMPLE.md`
- AI service consumes: `raw-flights`, `raw-hotels`
- AI service produces: `scored-flights`, `scored-hotels`, `travel-bundles`
- Connection: `localhost:9092` (default)

### For Database Team
**Documentation**: `../docs/DATABASE_INTEGRATION_SIMPLE.md`
- Requires READ access to: `users`, `bookings`, `search_history`
- Uses read-only connection
- Queries in: `interfaces/data_interface.py`

### For Frontend Team
**Documentation**: `../docs/FRONTEND_API.md`
- REST API at: `http://localhost:8000/api/ai`
- Swagger docs: `http://localhost:8000/docs`
- React examples provided in documentation

---

## Performance

### Benchmarks (Target)
- Deal scoring: < 100ms per deal
- Bundle matching: < 500ms for 100 deals
- Cache hit rate: > 80%
- API response time: < 500ms
- Kafka throughput: 1000+ messages/second

### Optimization
- Semantic caching reduces API costs by 60-80%
- Local Ollama embeddings (no OpenAI embedding API costs)
- Connection pooling for database queries
- Async/await for concurrent processing

---

## Troubleshooting

### Common Issues

**1. Kafka Connection Failed**
```bash
# Check if Kafka is running
docker ps | grep kafka

# Verify topics exist
kafka-topics --list --bootstrap-server localhost:9092
```

**2. Redis Connection Failed**
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG
```

**3. Ollama Model Not Found**
```bash
# Pull the embedding model
ollama pull mxbai-embed-large

# Verify it's installed
ollama list
```

**4. Import Errors**
```bash
# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

**5. OpenAI API Errors**
```bash
# Check API key is set
echo $OPENAI_API_KEY

# Test API key
python -c "import openai; openai.api_key='your-key'; print('OK')"
```

---

## Roadmap

### Week 1 (Complete)
- ✅ Core algorithms implementation
- ✅ Deals Agent with Kafka integration
- ✅ Semantic caching system
- ✅ LangChain integration
- ✅ FastAPI endpoints skeleton

### Week 2 (In Progress)
- ⏳ Kafka integration with team
- ⏳ Database integration
- ⏳ End-to-end testing
- ⏳ Performance optimization

### Week 3 (Planned)
- 📋 Concierge Agent implementation
- 📋 Frontend API integration
- 📋 WebSocket support for real-time chat
- 📋 Advanced recommendation features

### Week 4 (Planned)
- 📋 System integration testing
- 📋 Load testing and optimization
- 📋 Documentation finalization
- 📋 Demo preparation

---

## Dependencies

### Core Libraries
- **FastAPI** - Web framework
- **LangChain** - LLM orchestration
- **OpenAI** - GPT-3.5 Turbo API
- **Redis** - Caching layer
- **Kafka-Python** - Kafka client

### AI/ML Libraries
- **Ollama** - Local embeddings
- **Numpy** - Numerical computing
- **Scikit-learn** - ML utilities (if needed)

### Database
- **MySQL Connector** - Database access
- **SQLAlchemy** - ORM (future)

See `requirements.txt` for full list with versions.

---

## Contributing

### Code Style
- Follow PEP 8 guidelines
- Use type hints where applicable
- Document all public functions
- Write tests for new features

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature

# Commit changes
git add .
git commit -m "Add: your feature description"

# Push and create PR
git push origin feature/your-feature
```

---

## Documentation

- **API Documentation**: http://localhost:8000/docs (when running)
- **Integration Docs**: `../docs/`
- **Architecture Design**: `../docs/AI_ARCHITECTURE.md` (if exists)
- **Team Integration**: `../docs/INTEGRATION_CHECKLIST.md`

---

## Contact

**Developer**: Jane Heng (jane@sjsu.edu)
**Course**: DATA 236 - Distributed Systems
**Project**: Kayak Clone - AI Recommendation Service
**Group**: Group 11

**Support Channels**:
- Slack: #ai-service
- Email: jane@sjsu.edu
- Office Hours: By appointment

---

## License

This project is developed as part of SJSU DATA 236 coursework.

---

## Acknowledgments

- **LangChain** - For excellent LLM orchestration framework
- **Ollama** - For free local embedding models
- **FastAPI** - For modern Python web framework
- **Teaching Staff** - For project guidance and support

---

**Last Updated**: November 8, 2025  
**Version**: 1.0.0 (Week 1 Complete)
