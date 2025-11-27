"""
AI Recommendation Service - FastAPI Application
Main entry point with Week 3 features: Concierge Agent + WebSocket
"""

import os
import sys
import logging
from contextlib import asynccontextmanager
from datetime import datetime

# Add the ai directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Get settings from environment
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
API_ENV = os.getenv("API_ENV", "development")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001")


# ============================================
# Pydantic Models for Request/Response
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
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    user_id: str
    preferences: Optional[Dict[str, Any]] = None
    limit: int = 10

class ScoreRequest(BaseModel):
    flight_id: Optional[str] = None
    hotel_id: Optional[str] = None
    user_preferences: Optional[Dict[str, Any]] = None


# ============================================
# WebSocket Connection Manager
# ============================================

class ConnectionManager:
    """Manages WebSocket connections"""
    
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
        websocket = self.active_connections.get(session_id)
        if websocket:
            await websocket.send_json(message)

manager = ConnectionManager()


# ============================================
# Simple In-Memory Conversation Store
# ============================================

class SimpleConversationStore:
    """Simple in-memory conversation storage"""
    
    def __init__(self):
        self.conversations: Dict[str, List[Dict]] = {}
    
    def add_message(self, session_id: str, role: str, content: str):
        if session_id not in self.conversations:
            self.conversations[session_id] = []
        
        self.conversations[session_id].append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def get_history(self, session_id: str, limit: int = 10) -> List[Dict]:
        messages = self.conversations.get(session_id, [])
        return messages[-limit:]
    
    def clear(self, session_id: str):
        if session_id in self.conversations:
            del self.conversations[session_id]

conversation_store = SimpleConversationStore()


# ============================================
# Simple AI Response Generator
# ============================================

def generate_ai_response(query: str, user_id: str, preferences: Dict = None) -> Dict:
    """
    Generate AI response based on query
    In production, this would use LangChain + OpenAI
    """
    query_lower = query.lower()
    
    # Simple keyword-based responses
    if "flight" in query_lower or "fly" in query_lower:
        return {
            "response": f"I found some great flight deals for you! Based on your preferences, here are the top options with competitive prices and convenient schedules.",
            "recommendations": [
                {"type": "flight", "id": "FLT001", "origin": "SFO", "destination": "MIA", "price": 299, "score": 85, "tags": ["nonstop", "good_deal"]},
                {"type": "flight", "id": "FLT002", "origin": "SFO", "destination": "MIA", "price": 249, "score": 78, "tags": ["budget_friendly", "1_stop"]},
            ]
        }
    
    elif "hotel" in query_lower or "stay" in query_lower or "room" in query_lower:
        return {
            "response": f"Here are some excellent hotel options! I've selected these based on ratings, location, and value.",
            "recommendations": [
                {"type": "hotel", "id": "HTL001", "name": "Miami Beach Resort", "location": "Miami Beach", "price": 189, "score": 88, "tags": ["beachfront", "highly_rated"]},
                {"type": "hotel", "id": "HTL002", "name": "Downtown Miami Hotel", "location": "Downtown Miami", "price": 129, "score": 75, "tags": ["budget_friendly", "central"]},
            ]
        }
    
    elif "bundle" in query_lower or "package" in query_lower:
        return {
            "response": f"Great idea to bundle! Here's a flight + hotel package that saves you money.",
            "recommendations": [
                {
                    "type": "bundle",
                    "id": "BND001",
                    "flight": {"id": "FLT001", "origin": "SFO", "destination": "MIA", "price": 299},
                    "hotel": {"id": "HTL001", "name": "Miami Beach Resort", "price": 189},
                    "total_price": 488,
                    "savings": 75,
                    "score": 90,
                    "tags": ["best_value", "recommended"]
                }
            ]
        }
    
    elif "cheap" in query_lower or "budget" in query_lower:
        return {
            "response": f"Looking for budget-friendly options? Here are the best deals I found!",
            "recommendations": [
                {"type": "flight", "id": "FLT003", "origin": "SFO", "destination": "LAX", "price": 89, "score": 72, "tags": ["budget_friendly", "short_flight"]},
                {"type": "hotel", "id": "HTL003", "name": "Budget Inn", "location": "Los Angeles", "price": 79, "score": 68, "tags": ["budget_friendly"]},
            ]
        }
    
    elif "help" in query_lower:
        return {
            "response": "I can help you with:\n- Finding flights (try: 'Find flights to Miami')\n- Searching hotels (try: 'Hotels in New York')\n- Getting bundles (try: 'Flight and hotel package to LA')\n- Budget options (try: 'Cheap flights to Chicago')\n\nJust tell me where you want to go!",
            "recommendations": []
        }
    
    else:
        return {
            "response": f"I'd be happy to help you plan your trip! You asked: '{query}'. Could you tell me more about your destination, dates, or what you're looking for (flights, hotels, or both)?",
            "recommendations": []
        }


# ============================================
# Application Lifespan
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting AI Recommendation Service (Week 3)...")
    logger.info(f"Environment: {API_ENV}")
    logger.info(f"CORS Origins: {CORS_ORIGINS}")
    logger.info("Features: Chat, Recommendations, Scoring, WebSocket")
    
    yield
    
    logger.info("Shutting down AI Service...")
    logger.info("AI Service shutdown complete")


# ============================================
# FastAPI Application
# ============================================

app = FastAPI(
    title="AI Recommendation Service",
    description="Intelligent travel recommendation engine with conversational AI and real-time WebSocket support",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
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
        "features": ["chat", "recommendations", "scoring", "websocket"],
        "docs": "/docs",
        "websocket": "/api/ai/chat/ws"
    }


@app.get("/api/ai/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ai-recommendation-service",
        "version": "3.0.0",
        "components": {
            "chat": "ready",
            "recommendations": "ready",
            "websocket": "ready",
            "conversation_store": "ready"
        },
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat with AI assistant
    
    Example request:
    {
        "query": "Find cheap flights to Miami",
        "user_id": "123-45-6789",
        "preferences": {"budget": "medium"}
    }
    """
    # Generate session ID if not provided
    session_id = request.session_id or f"session_{request.user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    # Store user message
    conversation_store.add_message(session_id, "user", request.query)
    
    # Generate AI response
    result = generate_ai_response(request.query, request.user_id, request.preferences)
    
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
    """
    Get travel recommendations
    
    Example request:
    {
        "destination": "Miami",
        "date_from": "2025-12-01",
        "date_to": "2025-12-05",
        "user_id": "123-45-6789"
    }
    """
    # Generate query based on destination
    query = f"Find flights and hotels to {request.destination or 'popular destinations'}"
    
    result = generate_ai_response(query, request.user_id, request.preferences)
    
    # Add mock recommendations based on destination
    recommendations = [
        {
            "type": "flight",
            "id": "FLT001",
            "origin": "SFO",
            "destination": request.destination or "MIA",
            "departure_date": request.date_from,
            "price": 350.00,
            "score": 85,
            "tags": ["nonstop", "good_deal"]
        },
        {
            "type": "hotel",
            "id": "HTL001",
            "name": f"{request.destination or 'Miami'} Beach Resort",
            "location": request.destination or "Miami",
            "check_in": request.date_from,
            "check_out": request.date_to,
            "price_per_night": 150.00,
            "score": 78,
            "tags": ["highly_rated", "free_wifi"]
        },
        {
            "type": "bundle",
            "id": "BND001",
            "flight_id": "FLT001",
            "hotel_id": "HTL001",
            "total_price": 950.00,
            "savings": 100.00,
            "score": 88,
            "tags": ["best_value"]
        }
    ]
    
    return {
        "recommendations": recommendations[:request.limit],
        "destination": request.destination,
        "dates": {"from": request.date_from, "to": request.date_to},
        "user_id": request.user_id,
        "total_count": len(recommendations),
        "generated_at": datetime.now().isoformat()
    }


@app.post("/api/ai/score")
async def score_deal(request: ScoreRequest):
    """
    Score a specific deal
    
    Example request:
    {
        "flight_id": "FLT001",
        "hotel_id": "HTL001",
        "user_preferences": {"budget": "medium"}
    }
    """
    # Mock scoring
    flight_score = 85 if request.flight_id else None
    hotel_score = 78 if request.hotel_id else None
    
    bundle_score = None
    if flight_score and hotel_score:
        bundle_score = int((flight_score + hotel_score) / 2 + 5)  # Bonus for bundling
    
    return {
        "flight_id": request.flight_id,
        "hotel_id": request.hotel_id,
        "flight_score": flight_score,
        "hotel_score": hotel_score,
        "bundle_score": bundle_score,
        "recommendation": "Great bundle deal!" if bundle_score and bundle_score > 80 else "Good option",
        "reasoning": {
            "price_factor": 0.85,
            "rating_factor": 0.78,
            "availability_factor": 0.92
        },
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/ai/history/{session_id}")
async def get_conversation_history(session_id: str, limit: int = 20):
    """Get conversation history for a session"""
    history = conversation_store.get_history(session_id, limit)
    return {
        "session_id": session_id,
        "messages": history,
        "count": len(history)
    }


@app.delete("/api/ai/history/{session_id}")
async def clear_conversation(session_id: str):
    """Clear conversation history for a session"""
    conversation_store.clear(session_id)
    return {
        "session_id": session_id,
        "status": "cleared"
    }


# ============================================
# WebSocket Endpoint
# ============================================

@app.websocket("/api/ai/chat/ws")
async def websocket_chat(websocket: WebSocket, user_id: str = "anonymous"):
    """
    WebSocket endpoint for real-time chat
    
    Connect: ws://localhost:8000/api/ai/chat/ws?user_id=123-45-6789
    
    Send: {"type": "message", "content": "Find flights to Miami"}
    Receive: {"type": "response", "content": "...", "recommendations": [...]}
    """
    session_id = f"ws_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    await manager.connect(websocket, session_id)
    
    # Send welcome message
    await manager.send_message(session_id, {
        "type": "connected",
        "content": "Connected to AI Concierge! How can I help you plan your trip today?",
        "session_id": session_id,
        "timestamp": datetime.now().isoformat()
    })
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            
            message_type = data.get("type", "message")
            content = data.get("content", "")
            
            if message_type == "message" and content:
                # Send typing indicator
                await manager.send_message(session_id, {
                    "type": "typing",
                    "timestamp": datetime.now().isoformat()
                })
                
                # Store user message
                conversation_store.add_message(session_id, "user", content)
                
                # Generate response
                result = generate_ai_response(content, user_id)
                
                # Store AI response
                conversation_store.add_message(session_id, "assistant", result["response"])
                
                # Send response
                await manager.send_message(session_id, {
                    "type": "response",
                    "content": result["response"],
                    "recommendations": result.get("recommendations", []),
                    "session_id": session_id,
                    "timestamp": datetime.now().isoformat()
                })
            
            elif message_type == "ping":
                await manager.send_message(session_id, {
                    "type": "pong",
                    "timestamp": datetime.now().isoformat()
                })
            
            elif message_type == "history":
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
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=API_HOST,
        port=API_PORT,
        reload=API_ENV == "development"
    )
