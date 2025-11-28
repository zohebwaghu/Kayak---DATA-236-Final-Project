"""
AI Recommendation Service - FastAPI Application
LLM Provider:
- If OPENAI_API_KEY is set: use OpenAI
- If no OPENAI_API_KEY: use Ollama (llama3.2)
"""

import os
import sys
import logging
import json
import httpx
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Dict, List, Any

# Add the ai directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ============================================
# Import AI Modules with Error Handling
# ============================================

# Config
try:
    from config import settings
    CONFIG_AVAILABLE = True
    logger.info("✓ Config loaded")
except ImportError as e:
    CONFIG_AVAILABLE = False
    settings = None
    logger.warning(f"✗ Config: {e}")

# Algorithms - deal_scorer
try:
    from algorithms.deal_scorer import calculate_deal_score, get_deal_quality, calculate_savings
    DEAL_SCORER_AVAILABLE = True
    logger.info("✓ DealScorer loaded")
except ImportError as e:
    DEAL_SCORER_AVAILABLE = False
    logger.warning(f"✗ DealScorer: {e}")

# Algorithms - fit_scorer
try:
    from algorithms.fit_scorer import calculate_fit_score
    FIT_SCORER_AVAILABLE = True
    logger.info("✓ FitScorer loaded")
except Exception as e:
    FIT_SCORER_AVAILABLE = False
    logger.warning(f"✗ FitScorer: {e}")

# Algorithms - bundle_matcher
try:
    from algorithms.bundle_matcher import find_best_bundles, BundleMatcher
    BUNDLE_MATCHER_AVAILABLE = True
    logger.info("✓ BundleMatcher loaded")
except Exception as e:
    BUNDLE_MATCHER_AVAILABLE = False
    logger.warning(f"✗ BundleMatcher: {e}")

# Database - direct import
try:
    import mysql.connector
    MYSQL_AVAILABLE = True
    logger.info("✓ MySQL connector loaded")
except ImportError as e:
    MYSQL_AVAILABLE = False
    logger.warning(f"✗ MySQL: {e}")

# Redis - direct import
try:
    import redis
    REDIS_AVAILABLE = True
    logger.info("✓ Redis loaded")
except ImportError as e:
    REDIS_AVAILABLE = False
    logger.warning(f"✗ Redis: {e}")


# ============================================
# Settings from environment
# ============================================

API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
API_ENV = os.getenv("API_ENV", "development")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")

# LLM Settings
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# Determine LLM provider
USE_OPENAI = bool(OPENAI_API_KEY)

# Database settings
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_NAME_USERS = os.getenv("DB_NAME_USERS", "kayak_users")
DB_NAME_BOOKINGS = os.getenv("DB_NAME_BOOKINGS", "kayak_bookings")

# Redis settings
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))


# ============================================
# LLM Clients
# ============================================

# OpenAI client (if key available)
openai_client = None
if USE_OPENAI:
    try:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
        logger.info(f"✓ LLM Provider: OpenAI ({OPENAI_MODEL})")
    except ImportError:
        logger.error("OpenAI library not installed. Run: pip install openai")
        USE_OPENAI = False
else:
    logger.info(f"✓ LLM Provider: Ollama ({OLLAMA_MODEL})")


# ============================================
# Pydantic Models
# ============================================

class ChatRequest(BaseModel):
    query: str
    user_id: str
    session_id: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    user_id: str
    recommendations: List[Dict[str, Any]] = []
    timestamp: str

class RecommendationRequest(BaseModel):
    destination: Optional[str] = None
    origin: Optional[str] = "SFO"
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    user_id: str
    preferences: Optional[Dict[str, Any]] = None
    limit: int = 10

class ScoreRequest(BaseModel):
    current_price: float
    avg_30d_price: float
    availability: int = 10
    rating: float = 4.0
    has_promotion: bool = False

class BundleRequest(BaseModel):
    flights: List[Dict[str, Any]]
    hotels: List[Dict[str, Any]]
    limit: int = 5


# ============================================
# Database Helper Functions
# ============================================

def get_mysql_connection(database: str = "users"):
    """Get MySQL connection"""
    if not MYSQL_AVAILABLE:
        return None
    
    db_name = DB_NAME_USERS if database == "users" else DB_NAME_BOOKINGS
    
    try:
        return mysql.connector.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=db_name
        )
    except Exception as e:
        logger.error(f"MySQL connection failed: {e}")
        return None


def get_redis_client():
    """Get Redis client"""
    if not REDIS_AVAILABLE:
        return None
    
    try:
        return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        return None


async def get_user_by_id(user_id: str) -> Optional[Dict]:
    """Get user from database"""
    conn = get_mysql_connection("users")
    if not conn:
        return None
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT userId, firstName, lastName, email FROM users WHERE userId = %s",
            (user_id,)
        )
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return user
    except Exception as e:
        logger.error(f"Get user failed: {e}")
        return None


async def get_user_preferences(user_id: str) -> Dict:
    """Get user preferences from booking history"""
    conn = get_mysql_connection("bookings")
    if not conn:
        return {}
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT listingType, AVG(totalPrice) as avg_price, COUNT(*) as count
            FROM bookings WHERE userId = %s
            GROUP BY listingType
        """, (user_id,))
        bookings = cursor.fetchall()
        cursor.close()
        conn.close()
        
        preferences = {"budget": "medium", "preferred_types": []}
        for b in bookings:
            preferences["preferred_types"].append(b["listingType"])
            if b["avg_price"] and b["avg_price"] < 200:
                preferences["budget"] = "budget"
            elif b["avg_price"] and b["avg_price"] > 500:
                preferences["budget"] = "luxury"
        
        return preferences
    except Exception as e:
        logger.error(f"Get preferences failed: {e}")
        return {}


# ============================================
# Conversation Store (In-Memory)
# ============================================

class ConversationStore:
    def __init__(self):
        self.conversations: Dict[str, List[Dict]] = {}
        self.redis = get_redis_client()
    
    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.conversations:
            self.conversations[session_id] = []
        
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        self.conversations[session_id].append(message)
        
        if self.redis:
            try:
                key = f"chat:{session_id}"
                self.redis.rpush(key, json.dumps(message))
                self.redis.expire(key, 86400)
            except Exception as e:
                logger.error(f"Redis store failed: {e}")
    
    def get_history(self, session_id: str, limit: int = 20) -> List[Dict]:
        return self.conversations.get(session_id, [])[-limit:]
    
    def clear(self, session_id: str):
        if session_id in self.conversations:
            del self.conversations[session_id]
        if self.redis:
            try:
                self.redis.delete(f"chat:{session_id}")
            except:
                pass

conversation_store = ConversationStore()


# ============================================
# LLM Functions
# ============================================

SYSTEM_PROMPT = """You are a helpful travel assistant for a Kayak-like travel booking platform. 
You help users find flights, hotels, and travel bundles. 
Be concise and helpful. When users ask about travel, suggest relevant options.
If they mention a destination, provide flight and hotel recommendations.
Always be friendly and professional."""


async def call_openai(query: str, history: List[Dict] = None) -> str:
    """Call OpenAI API"""
    if not openai_client:
        return "OpenAI client not available"
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add history
    if history:
        for msg in history[-6:]:  # Last 6 messages
            messages.append({"role": msg["role"], "content": msg["content"]})
    
    messages.append({"role": "user", "content": query})
    
    try:
        response = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=500,
            temperature=0.7
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        return f"Sorry, I encountered an error: {str(e)}"


async def call_ollama(query: str, history: List[Dict] = None) -> str:
    """Call Ollama API (local)"""
    
    # Build prompt with history
    prompt = f"{SYSTEM_PROMPT}\n\n"
    
    if history:
        for msg in history[-6:]:
            role = "User" if msg["role"] == "user" else "Assistant"
            prompt += f"{role}: {msg['content']}\n"
    
    prompt += f"User: {query}\nAssistant:"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 500
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "No response from Ollama")
            else:
                logger.error(f"Ollama error: {response.status_code}")
                return f"Ollama error: {response.status_code}"
                
    except httpx.ConnectError:
        logger.error("Cannot connect to Ollama. Make sure Ollama is running.")
        return "Cannot connect to Ollama. Please ensure Ollama is running (ollama serve)."
    except Exception as e:
        logger.error(f"Ollama API error: {e}")
        return f"Ollama error: {str(e)}"


async def get_llm_response(query: str, history: List[Dict] = None) -> str:
    """Get LLM response from OpenAI or Ollama"""
    if USE_OPENAI:
        return await call_openai(query, history)
    else:
        return await call_ollama(query, history)


# ============================================
# AI Response Generator
# ============================================

async def generate_ai_response(query: str, user_id: str, session_id: str = None, preferences: Dict = None) -> Dict:
    """Generate AI response using LLM and add recommendations"""
    
    # Get conversation history
    history = []
    if session_id:
        history = conversation_store.get_history(session_id)
    
    # Get LLM response
    llm_response = await get_llm_response(query, history)
    
    # Generate recommendations based on keywords
    recommendations = []
    query_lower = query.lower()
    
    try:
        if any(word in query_lower for word in ["flight", "fly", "plane", "airport"]):
            # Call search-service for flights
            async with httpx.AsyncClient() as client:
                # Extract basic entities if possible, otherwise default
                # In a real app, we'd use the intent parser here
                params = {"limit": 5}
                if "sfo" in query_lower: params["origin"] = "SFO"
                if "jfk" in query_lower: params["destination"] = "JFK"
                if "miami" in query_lower or "mia" in query_lower: params["destination"] = "MIA"
                if "london" in query_lower or "lhr" in query_lower: params["destination"] = "LHR"
                
                response = await client.get("http://search-service:3003/api/v1/search/flights", params=params, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    flights = data.get("data", [])
                    for flight in flights:
                        flight["type"] = "flight"
                        # Add score if available
                        if DEAL_SCORER_AVAILABLE:
                            try:
                                score = calculate_deal_score(
                                    current_price=flight.get("price", 0),
                                    avg_30d_price=flight.get("price", 0) * 1.2, # Mock avg
                                    availability=flight.get("seatsRemaining", 10),
                                    rating=4.5
                                )
                                flight["score"] = score.total_score
                                flight["is_deal"] = score.is_deal
                            except:
                                flight["score"] = 80
                    recommendations.extend(flights)
        
        elif any(word in query_lower for word in ["hotel", "stay", "room", "accommodation"]):
            # Call search-service for hotels
            async with httpx.AsyncClient() as client:
                params = {"limit": 5}
                if "miami" in query_lower: params["city"] = "Miami"
                if "paris" in query_lower: params["city"] = "Paris"
                
                response = await client.get("http://search-service:3003/api/v1/search/hotels", params=params, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    hotels = data.get("data", [])
                    for hotel in hotels:
                        hotel["type"] = "hotel"
                        if DEAL_SCORER_AVAILABLE:
                            try:
                                score = calculate_deal_score(
                                    current_price=hotel.get("pricePerNight", 0),
                                    avg_30d_price=hotel.get("pricePerNight", 0) * 1.1,
                                    availability=5,
                                    rating=hotel.get("rating", 4.0)
                                )
                                hotel["score"] = score.total_score
                                hotel["is_deal"] = score.is_deal
                            except:
                                hotel["score"] = 80
                    recommendations.extend(hotels)
                    
    except Exception as e:
        logger.error(f"Error fetching recommendations: {e}")
        # Fallback to empty list or error message in response
    
    return {
        "response": llm_response,
        "recommendations": recommendations
    }


# ============================================
# WebSocket Manager
# ============================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected: {session_id}")
    
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info(f"WebSocket disconnected: {session_id}")
    
    async def send_message(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)

manager = ConnectionManager()


# ============================================
# Application Lifespan
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("=" * 50)
    logger.info("Starting AI Recommendation Service")
    logger.info("=" * 50)
    logger.info(f"Environment: {API_ENV}")
    logger.info(f"LLM Provider: {'OpenAI' if USE_OPENAI else 'Ollama'}")
    if USE_OPENAI:
        logger.info(f"  Model: {OPENAI_MODEL}")
    else:
        logger.info(f"  Model: {OLLAMA_MODEL}")
        logger.info(f"  URL: {OLLAMA_BASE_URL}")
    
    # Test connections
    components = {
        "config": CONFIG_AVAILABLE,
        "deal_scorer": DEAL_SCORER_AVAILABLE,
        "fit_scorer": FIT_SCORER_AVAILABLE,
        "bundle_matcher": BUNDLE_MATCHER_AVAILABLE,
        "mysql": MYSQL_AVAILABLE,
        "redis": REDIS_AVAILABLE,
        "llm": True,  # Either OpenAI or Ollama
    }
    
    ready = sum(1 for v in components.values() if v)
    logger.info(f"Components ready: {ready}/{len(components)}")
    for name, status in components.items():
        logger.info(f"  {'✓' if status else '✗'} {name}")
    
    yield
    
    logger.info("AI Service shutdown complete")


# ============================================
# FastAPI Application
# ============================================

app = FastAPI(
    title="AI Recommendation Service",
    description="Intelligent travel recommendation engine with deal scoring and real-time chat. Supports OpenAI and Ollama.",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
cors_origins = [origin.strip() for origin in CORS_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# REST Endpoints
# ============================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Recommendation Service",
        "version": "3.0.0",
        "status": "running",
        "llm_provider": "OpenAI" if USE_OPENAI else "Ollama",
        "docs": "/docs",
        "endpoints": [
            "/api/ai/health",
            "/api/ai/chat",
            "/api/ai/recommendations",
            "/api/ai/score",
            "/api/ai/bundle",
            "/api/ai/chat/ws"
        ]
    }


@app.get("/api/ai/health")
async def health_check():
    """Detailed health check"""
    
    # Test MySQL
    mysql_status = "unavailable"
    if MYSQL_AVAILABLE:
        conn = get_mysql_connection()
        if conn:
            mysql_status = "connected"
            conn.close()
    
    # Test Redis
    redis_status = "unavailable"
    if REDIS_AVAILABLE:
        r = get_redis_client()
        if r:
            try:
                r.ping()
                redis_status = "connected"
            except:
                redis_status = "error"
    
    # Test LLM
    llm_status = "unavailable"
    if USE_OPENAI:
        llm_status = "openai"
    else:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
                if response.status_code == 200:
                    llm_status = "ollama"
        except:
            llm_status = "ollama (not responding)"
    
    return {
        "status": "healthy",
        "service": "ai-recommendation-service",
        "version": "3.0.0",
        "llm_provider": "OpenAI" if USE_OPENAI else "Ollama",
        "llm_model": OPENAI_MODEL if USE_OPENAI else OLLAMA_MODEL,
        "components": {
            "config": "ready" if CONFIG_AVAILABLE else "unavailable",
            "deal_scorer": "ready" if DEAL_SCORER_AVAILABLE else "unavailable",
            "fit_scorer": "ready" if FIT_SCORER_AVAILABLE else "unavailable",
            "bundle_matcher": "ready" if BUNDLE_MATCHER_AVAILABLE else "unavailable",
            "mysql": mysql_status,
            "redis": redis_status,
            "llm": llm_status
        },
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat with AI assistant"""
    
    session_id = request.session_id or f"session_{request.user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Get user preferences
    preferences = request.preferences or await get_user_preferences(request.user_id)
    
    # Store user message
    conversation_store.add_message(session_id, "user", request.query)
    
    # Generate response
    result = await generate_ai_response(request.query, request.user_id, session_id, preferences)
    
    # Store AI response
    conversation_store.add_message(session_id, "assistant", result["response"])
    
    return ChatResponse(
        response=result["response"],
        session_id=session_id,
        user_id=request.user_id,
        recommendations=result.get("recommendations", []),
        timestamp=datetime.now().isoformat()
    )


@app.post("/api/ai/recommendations")
async def get_recommendations(request: RecommendationRequest):
    """Get personalized travel recommendations"""
    
    preferences = request.preferences or await get_user_preferences(request.user_id)
    
    query = f"Find flights and hotels to {request.destination or 'popular destinations'}"
    result = await generate_ai_response(query, request.user_id, preferences=preferences)
    
    return {
        "recommendations": result.get("recommendations", [])[:request.limit],
        "destination": request.destination,
        "dates": {"from": request.date_from, "to": request.date_to},
        "user_id": request.user_id,
        "generated_at": datetime.now().isoformat()
    }


@app.post("/api/ai/score")
async def score_deal(request: ScoreRequest):
    """Score a deal using the deal scoring algorithm"""
    
    if not DEAL_SCORER_AVAILABLE:
        return {
            "error": "Deal scorer not available",
            "score": 70,
            "message": "Using default score"
        }
    
    try:
        score = calculate_deal_score(
            current_price=request.current_price,
            avg_30d_price=request.avg_30d_price,
            availability=request.availability,
            rating=request.rating,
            has_promotion=request.has_promotion
        )
        
        savings_amount, savings_pct = calculate_savings(
            request.current_price, request.avg_30d_price
        )
        
        return {
            "score": score.total_score,
            "is_deal": score.is_deal,
            "quality": get_deal_quality(score.total_score),
            "breakdown": {
                "price_advantage": score.price_advantage_score,
                "scarcity": score.scarcity_score,
                "rating": score.rating_score,
                "promotion": score.promotion_score
            },
            "savings": {
                "amount": savings_amount,
                "percentage": savings_pct
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Score calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/bundle")
async def create_bundle(request: BundleRequest):
    """Create flight + hotel bundles"""
    
    bundles = []
    
    for flight in request.flights[:request.limit]:
        for hotel in request.hotels[:request.limit]:
            flight_price = flight.get("price", 0)
            hotel_price = hotel.get("price", 0) * hotel.get("nights", 3)
            total = flight_price + hotel_price
            savings = total * 0.1
            
            bundle = {
                "id": f"BND_{flight.get('id')}_{hotel.get('id')}",
                "flight": flight,
                "hotel": hotel,
                "total_price": round(total - savings, 2),
                "original_price": total,
                "savings": round(savings, 2),
                "score": 80
            }
            
            if DEAL_SCORER_AVAILABLE:
                try:
                    score = calculate_deal_score(
                        current_price=bundle["total_price"],
                        avg_30d_price=bundle["original_price"],
                        availability=5,
                        rating=4.5
                    )
                    bundle["score"] = score.total_score
                    bundle["is_deal"] = score.is_deal
                except:
                    pass
            
            bundles.append(bundle)
    
    bundles.sort(key=lambda x: x.get("score", 0), reverse=True)
    
    return {
        "bundles": bundles[:request.limit],
        "count": len(bundles[:request.limit]),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/ai/history/{session_id}")
async def get_conversation_history(session_id: str, limit: int = 20):
    """Get conversation history"""
    history = conversation_store.get_history(session_id, limit)
    return {
        "session_id": session_id,
        "messages": history,
        "count": len(history)
    }


@app.delete("/api/ai/history/{session_id}")
async def clear_conversation(session_id: str):
    """Clear conversation history"""
    conversation_store.clear(session_id)
    return {"session_id": session_id, "status": "cleared"}


@app.get("/api/ai/user/{user_id}")
async def get_user_info(user_id: str):
    """Get user info and preferences"""
    user = await get_user_by_id(user_id)
    preferences = await get_user_preferences(user_id)
    
    return {
        "user": user,
        "preferences": preferences,
        "timestamp": datetime.now().isoformat()
    }


# ============================================
# WebSocket Endpoint
# ============================================

@app.websocket("/api/ai/chat/ws")
async def websocket_chat(websocket: WebSocket, user_id: str = "anonymous"):
    """Real-time WebSocket chat"""
    
    session_id = f"ws_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    await manager.connect(websocket, session_id)
    
    await manager.send_message(session_id, {
        "type": "connected",
        "content": f"Connected to AI Travel Concierge! (Using {'OpenAI' if USE_OPENAI else 'Ollama'})",
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    })
    
    try:
        while True:
            data = await websocket.receive_json()
            
            msg_type = data.get("type", "message")
            content = data.get("content", "")
            
            if msg_type == "message" and content:
                await manager.send_message(session_id, {
                    "type": "typing",
                    "timestamp": datetime.now().isoformat()
                })
                
                conversation_store.add_message(session_id, "user", content)
                result = await generate_ai_response(content, user_id, session_id)
                conversation_store.add_message(session_id, "assistant", result["response"])
                
                await manager.send_message(session_id, {
                    "type": "response",
                    "content": result["response"],
                    "recommendations": result.get("recommendations", []),
                    "timestamp": datetime.now().isoformat()
                })
            
            elif msg_type == "ping":
                await manager.send_message(session_id, {
                    "type": "pong",
                    "timestamp": datetime.now().isoformat()
                })
            
            elif msg_type == "history":
                history = conversation_store.get_history(session_id)
                await manager.send_message(session_id, {
                    "type": "history",
                    "messages": history,
                    "timestamp": datetime.now().isoformat()
                })
    
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(session_id)


# ============================================
# Main
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=API_ENV == "development"
    )
