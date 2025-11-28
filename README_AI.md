# AI Recommendation Service

Intelligent travel recommendation engine with conversational AI, built for the Kayak clone project (DATA 236 Final Project).

---

## Technology Stack Overview

| Category | Technology | Purpose |
|----------|------------|---------|
| **Framework** | FastAPI | REST API + WebSocket real-time events |
| **LLM Integration** | LangChain | LLM integration, intent parsing, response generation |
| **Agent Architecture** | LangGraph | Multi-agent orchestration with StateGraph |
| **Caching** | Redis Cache | Session Store, Deals Cache, Semantic Cache |
| **Message Queue** | Apache Kafka | Event-driven streaming pipeline |
| **Multi-Agent** | Orchestrator-Workers | 6 specialized agents with supervisor routing |
| **ReAct Pattern** | Reasoning + Acting | Thought-Action-Observation reasoning loop |
| **MRKL Tools** | Modular Tools | 7 specialized tools (search_flights, search_hotels, etc.) |
| **RAG** | Ollama Embeddings | Semantic similarity search with mxbai-embed-large |
| **Memory** | Session-based | Multi-turn conversation context preservation |

---

## Architecture

### Multi-Agent System (LangGraph)

The AI service implements an **Orchestrator-Workers Pattern** using LangGraph's StateGraph (matches DATA 236 course material):

```
                ┌─────────────────┐
                │   supervisor    │  (Parse intent, route to worker)
                └────────┬────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │          │         │         │          │
    ▼          ▼         ▼         ▼          ▼
┌────────┐┌────────┐┌──────────┐┌────────┐┌──────────┐
│ policy ││ watch  ││  price   ││ quote  ││recommend │
│ agent  ││ agent  ││ analysis ││ agent  ││  agent   │
└────┬───┘└───┬────┘└────┬─────┘└───┬────┘└────┬─────┘
     └────────┴──────────┴──────────┴──────────┘
                         │
                ┌────────▼────────┐
                │   synthesizer   │  (Format final response)
                └────────┬────────┘
                         ▼
                        END
```

### Agent Descriptions

| Agent | Responsibility | Trigger Keywords |
|-------|----------------|------------------|
| **Supervisor** | Parse intent, route to appropriate worker | Entry point for all queries |
| **Policy Agent** | Answer policy questions (cancellation, pets, parking) | "cancel", "refund", "pet", "policy" |
| **Watch Agent** | Create price/inventory alerts | "watch", "alert", "notify", "track" |
| **Price Analysis Agent** | Evaluate if a deal is good | "good deal", "worth it", "compare" |
| **Quote Agent** | Generate complete booking quotes | "book", "reserve", "quote", "checkout" |
| **Recommendation Agent** | Find flight+hotel bundles | Default for travel queries |
| **Synthesizer** | Format final response | All responses pass through |

---

## Core Technologies In Detail

### 1. FastAPI (REST API + WebSocket)

```python
from fastapi import FastAPI, WebSocket

app = FastAPI(title="AI Recommendation Service")

# REST endpoints
@app.post("/api/ai/chat")
async def chat(request: ChatRequest): ...

# WebSocket for real-time events
@app.websocket("/api/ai/events")
async def websocket_events(websocket: WebSocket): ...
```

**Features:**
- Async REST API for high concurrency
- WebSocket for real-time price alerts and deal notifications
- Auto-generated OpenAPI documentation (`/docs`)

### 2. LangChain (LLM Integration)

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_openai_functions_agent

# LLM with function calling
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.7)
```

**Usage:**
- Intent parsing with structured output
- Natural language response generation
- Context-aware conversation handling

### 3. LangGraph (Multi-Agent Orchestration)

```python
from langgraph.graph import StateGraph, END

# Define shared state
class TravelState(TypedDict):
    query: str
    intent: str
    agent_output: Dict
    response: str

# Build graph
workflow = StateGraph(TravelState)
workflow.add_node("supervisor", supervisor_node)
workflow.add_node("policy_agent", policy_agent_node)
workflow.add_node("watch_agent", watch_agent_node)
workflow.add_node("price_analysis_agent", price_analysis_agent_node)
workflow.add_node("quote_agent", quote_agent_node)
workflow.add_node("recommendation_agent", recommendation_agent_node)
workflow.add_node("synthesizer", synthesizer_node)

# Conditional routing
workflow.add_conditional_edges("supervisor", route_to_agent, {
    "policy_agent": "policy_agent",
    "watch_agent": "watch_agent",
    "price_analysis_agent": "price_analysis_agent",
    "quote_agent": "quote_agent",
    "recommendation_agent": "recommendation_agent"
})

# All agents -> synthesizer -> END
workflow.add_edge("policy_agent", "synthesizer")
workflow.add_edge("synthesizer", END)
```

**Key Features:**
- **StateGraph**: Shared state across all nodes
- **Conditional Edges**: Dynamic routing based on intent
- **Orchestrator-Workers Pattern**: Supervisor delegates to specialized agents

### 4. Redis Cache (Session, Deals, Semantic)

```python
from config import settings

# Session Store - Multi-turn conversation memory
session_store = SessionStore(
    redis_host=settings.REDIS_HOST,
    redis_port=settings.REDIS_PORT
)

# Deals Cache - Scored and tagged deals
deals_cache = DealsCache(
    redis_host=settings.REDIS_HOST,
    redis_port=settings.REDIS_PORT
)
```

**Cache Types:**
| Cache | Purpose | TTL |
|-------|---------|-----|
| **Session Store** | User conversation context, search params | 24 hours |
| **Deals Cache** | Normalized, scored, tagged deals | 24 hours |
| **Policy Store** | Cached policy information per listing | 5 minutes |
| **Watch Store** | Active price/inventory watches | Persistent |
| **Semantic Cache** | Similar query results (embedding-based) | 5 minutes |

### 5. Apache Kafka (Event-Driven Pipeline)

```
┌──────────────┐     ┌─────────────┐     ┌────────────┐     ┌────────────┐
│ raw_supplier │ --> │  Normalize  │ --> │   Score    │ --> │    Tag     │
│    _feeds    │     │             │     │            │     │            │
└──────────────┘     └─────────────┘     └────────────┘     └────────────┘
                                                                   │
                                                                   ▼
                                                          ┌────────────────┐
                                                          │  deal.events   │
                                                          │ (WebSocket)    │
                                                          └────────────────┘
```

**Kafka Topics:**
| Topic | Description |
|-------|-------------|
| `raw_supplier_feeds` | Raw deal data from suppliers |
| `deals.normalized` | Standardized deal format |
| `deals.scored` | Deals with quality scores (0-100) |
| `deals.tagged` | Deals with tags (pet-friendly, refundable) |
| `deal.events` | Real-time deal notifications |

### 6. Multi-Agent (Orchestrator-Workers Pattern)

The system follows the **Orchestrator-Workers** design pattern from DATA 236:

```python
def supervisor_node(state: TravelState) -> TravelState:
    """Supervisor: Parse intent and route to worker"""
    query = state["query"].lower()
    
    # Route based on keywords
    if any(kw in query for kw in ["cancel", "refund", "pet"]):
        state["intent"] = "policy"
    elif any(kw in query for kw in ["watch", "alert", "notify"]):
        state["intent"] = "watch"
    elif any(kw in query for kw in ["good deal", "worth it"]):
        state["intent"] = "price_analysis"
    elif any(kw in query for kw in ["book", "reserve", "quote"]):
        state["intent"] = "quote"
    else:
        state["intent"] = "recommendation"
    
    return state

def route_to_agent(state: TravelState) -> str:
    """Router function for conditional edges"""
    return f"{state['intent']}_agent"
```

### 7. ReAct Pattern (Reasoning + Acting)

The agents implement ReAct-style reasoning:

```
User: "I want a pet-friendly hotel in Miami under $500"

Thought: User wants to go to Miami with pets, budget constraint $500
Action: search_deals(destination="MIA", tags=["pet-friendly"], max_price=500)
Observation: Found 3 pet-friendly hotels under $500

Thought: Should recommend the highest-scored bundle
Action: generate_response(bundles=[...])
Observation: Response generated

Final Answer: "Here are 3 pet-friendly options for Miami..."
```

### 8. MRKL-Style Tools

The system defines 7 specialized tools:

| Tool | Function | Input | Output |
|------|----------|-------|--------|
| `search_flights` | Search flight deals | origin, destination, dates | List[Flight] |
| `search_hotels` | Search hotel deals | destination, dates, tags | List[Hotel] |
| `get_recommendations` | Get bundle recommendations | destination, budget, constraints | List[Bundle] |
| `analyze_price` | Check if price is good | listing_id, current_price | PriceAnalysis |
| `create_watch` | Set price/inventory alert | listing_id, threshold, type | Watch |
| `get_policy` | Get cancellation/policy info | listing_id, question | PolicyAnswer |
| `generate_quote` | Create booking quote | bundle_id | Quote |

### 9. RAG (Retrieval-Augmented Generation)

```python
from ollama import Client

# Generate embeddings for semantic similarity
ollama_client = Client(host=settings.OLLAMA_BASE_URL)
embedding = ollama_client.embeddings(
    model=settings.OLLAMA_EMBEDDING_MODEL,  # mxbai-embed-large
    prompt=query
)

# Semantic cache: find similar past queries
similarity = cosine_similarity(query_embedding, cached_embedding)
if similarity > SEMANTIC_SIMILARITY_THRESHOLD:  # 0.85
    return cached_response
```

**RAG Components:**
- **Embedding Model**: Ollama mxbai-embed-large (local, free)
- **Similarity Threshold**: 0.85 for semantic cache hits
- **Vector Storage**: Redis-based (extensible to ChromaDB/Pinecone)

### 10. Memory (Session-based Context)

```python
class SessionStore:
    def get_or_create_session(user_id, session_id) -> str
    def get_search_params(session_id) -> Dict
    def merge_intent(session_id, new_intent) -> Dict
    def save_recommendations(session_id, bundles) -> None
    def get_previous_recommendations(session_id) -> List[Dict]
```

**Memory Features:**
- **Conversation Context**: Preserves search parameters across turns
- **Intent Merging**: "Make it pet-friendly" updates existing search
- **Recommendation History**: Track what was shown to user
- **Change Detection**: Highlight what changed after refinement

---

## API Endpoints

### Chat API
```http
POST /api/ai/chat
Content-Type: application/json

{
  "query": "I want to go to Miami next week with pets",
  "user_id": "user123",
  "session_id": "optional-session-id"
}
```

### Bundles API
```http
GET /api/ai/bundles?destination=MIA&budget=1500&tags=pet-friendly
```

### Watches API
```http
POST /api/ai/watches
{
  "user_id": "user123",
  "listing_id": "bundle_001",
  "watch_type": "price",
  "threshold": 800
}
```

### Price Analysis API
```http
GET /api/ai/price-analysis/bundle/bundle_001
```

### WebSocket Events
```javascript
const ws = new WebSocket('ws://localhost:8000/api/ai/events?user_id=user123');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle: price_alert, inventory_alert, deal_found, watch_triggered
};
```

---

## User Journeys

The AI service supports 5 key user journeys:

| Journey | Description | Example |
|---------|-------------|---------|
| **1. Tell me what to book** | Get personalized bundle recommendations | "I want a beach vacation under $1500" |
| **2. Refine without starting over** | Update search without losing context | "Make it pet-friendly" |
| **3. Keep an eye on it** | Set price/availability alerts | "Watch this and alert me if it drops below $500" |
| **4. Decide with confidence** | Get price analysis and comparison | "Is this actually a good deal?" |
| **5. Book or hand off cleanly** | Generate complete booking quote | "Book option 1" |

---

## Project Structure

```
ai/
├── agents/
│   ├── langgraph_concierge.py   # LangGraph multi-agent implementation
│   ├── concierge_agent_v2.py    # Original agent (fallback)
│   └── deals_agent_runner.py    # Kafka pipeline processor
├── api/
│   ├── bundles.py               # Bundle recommendations API
│   ├── watches.py               # Price alert API
│   ├── price_analysis.py        # Deal analysis API
│   ├── quotes.py                # Booking quotes API
│   ├── chat.py                  # Chat API
│   └── events_websocket.py      # WebSocket events
├── interfaces/
│   ├── session_store.py         # Redis session management
│   ├── deals_cache.py           # Redis deals cache
│   └── policy_store.py          # Policy information store
├── kafka_client/
│   ├── kafka_producer.py        # Async Kafka producer
│   ├── kafka_consumer.py        # Async Kafka consumer
│   └── message_schemas.py       # Event schemas
├── llm/
│   ├── intent_parser.py         # NLU intent extraction
│   ├── explainer.py             # "Why this deal" explanations
│   └── quote_generator.py       # Quote generation
├── algorithms/
│   └── deal_scorer.py           # Deal scoring algorithm
├── config.py                    # Configuration management
├── main.py                      # FastAPI application
├── requirements.txt             # Python dependencies
└── Dockerfile                   # Container definition
```

---

## Configuration

Environment variables (set in docker-compose.yml):

```bash
# OpenAI (optional - can use Ollama instead)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9093
KAFKA_CONSUMER_GROUP=ai-deals-agent

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_DB=0

# Ollama (local LLM - free alternative to OpenAI)
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_EMBEDDING_MODEL=mxbai-embed-large

# Database
MONGO_URI=mongodb://mongodb:27017
MONGO_DB=kayak_doc
```

---

## Running Without OpenAI API Key (Using Ollama)

If you don't have an OpenAI API key, you can run the AI service using **Ollama** for local LLM inference.

### Step 1: Install Ollama

**Windows:**
```bash
# Download from https://ollama.ai/download
# Or use winget:
winget install Ollama.Ollama
```

**Mac:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 2: Pull Required Models

```bash
# Start Ollama service
ollama serve

# Pull embedding model (required for semantic search)
ollama pull mxbai-embed-large

# Pull LLM model (for chat/intent parsing)
ollama pull llama3.1:8b
# Or smaller model for less RAM:
ollama pull llama3.2:3b
```

### Step 3: Update Configuration

Edit `ai/.env` or `middleware/docker-compose.yml`:

```bash
# Leave OpenAI empty or remove
OPENAI_API_KEY=

# Ollama configuration
OLLAMA_BASE_URL=http://host.docker.internal:11434  # Docker
# Or for local development:
OLLAMA_BASE_URL=http://localhost:11434

OLLAMA_EMBEDDING_MODEL=mxbai-embed-large
OLLAMA_CHAT_MODEL=llama3.1:8b
```

### Step 4: Modify Code for Ollama LLM (Optional)

If you want to use Ollama for chat (not just embeddings), update `agents/langgraph_concierge.py`:

```python
from ollama import Client

ollama_client = Client(host=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"))

def get_llm_response(prompt: str, system_prompt: str = None) -> str:
    """Get response from Ollama instead of OpenAI"""
    try:
        response = ollama_client.chat(
            model=os.getenv("OLLAMA_CHAT_MODEL", "llama3.1:8b"),
            messages=[
                {"role": "system", "content": system_prompt or "You are a helpful travel assistant."},
                {"role": "user", "content": prompt}
            ]
        )
        return response['message']['content']
    except Exception as e:
        logger.error(f"Ollama error: {e}")
        return "I'd be happy to help you find great travel deals."
```

### Step 5: Verify Ollama is Running

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Test embedding
curl http://localhost:11434/api/embeddings -d '{
  "model": "mxbai-embed-large",
  "prompt": "Hello world"
}'

# Test chat
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1:8b",
  "messages": [{"role": "user", "content": "Hello"}]
}'
```

### Resource Requirements for Ollama

| Model | RAM Required | Disk Space |
|-------|--------------|------------|
| mxbai-embed-large | ~1GB | ~700MB |
| llama3.2:3b | ~4GB | ~2GB |
| llama3.1:8b | ~8GB | ~5GB |
| llama3.1:70b | ~48GB | ~40GB |

**Recommended minimum**: 8GB RAM for embedding + llama3.2:3b

---

## Dependencies

```txt
# FastAPI
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.0
websockets>=12.0

# LangChain + LangGraph
langchain>=0.1.0
langchain-openai>=0.0.2
langchain-community>=0.0.10
langgraph>=0.0.30

# Kafka
kafka-python>=2.0.2

# OpenAI (optional)
openai>=1.6.1

# Redis
redis>=5.0.0

# Ollama (local LLM)
ollama>=0.1.7

# Data Processing
pandas>=2.1.0
numpy>=1.24.0
```

---

## Running the Service

### With Docker Compose (Recommended)

```bash
cd middleware
docker-compose up -d
docker-compose logs -f ai-service
```

### Local Development

```bash
cd ai
pip install -r requirements.txt
python main.py
```

---

## Testing

```bash
# Test chat endpoint
curl -X POST http://localhost:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "I want to go to Miami", "user_id": "test123"}'

# Check health
curl http://localhost:8000/api/ai/health

# Check status
curl http://localhost:8000/api/ai/status
```

---

## Course Alignment (DATA 236)

This implementation demonstrates:

| Course Topic | Implementation |
|--------------|----------------|
| **Multi-Agent Systems** | LangGraph Orchestrator-Workers pattern with 6 agents |
| **LangGraph** | StateGraph with conditional routing |
| **ReAct Pattern** | Thought-Action-Observation reasoning loop |
| **MRKL Architecture** | 7 specialized tools for each capability |
| **RAG** | Semantic embeddings with Ollama mxbai-embed-large |
| **Kafka Streaming** | Event-driven deal processing pipeline (5 topics) |
| **Redis Caching** | Session, deals, policy, and semantic cache |
| **Memory** | Session-based multi-turn conversation context |
| **DevOps** | Docker containerization, environment-based config |

---

## Authors

Group 3 - DATA 236 Distributed Systems (Fall 2025)
