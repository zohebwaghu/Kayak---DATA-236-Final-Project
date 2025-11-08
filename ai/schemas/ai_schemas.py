"""
AI Service API Schemas
Pydantic v2 models for request/response validation
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# ============================================
# Session Management
# ============================================

class SessionCreateResponse(BaseModel):
    """Response for session creation"""
    sessionId: str = Field(..., description="Unique session identifier")
    createdAt: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "sessionId": "session-abc123",
                "createdAt": "2025-11-07T20:00:00"
            }
        }


# ============================================
# Query Requests
# ============================================

class QueryRequest(BaseModel):
    """Request for natural language query"""
    query: str = Field(..., min_length=1, max_length=500, description="Natural language query")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "Find cheap flights from SFO to Miami under $800"
            }
        }


class ParsedIntent(BaseModel):
    """Parsed user intent from LLM"""
    origin: Optional[str] = None
    destination: Optional[str] = None
    dates: Optional[List[str]] = None
    budget: Optional[float] = None
    constraints: List[str] = Field(default_factory=list)


# ============================================
# Bundle Responses
# ============================================

class FlightInfo(BaseModel):
    """Flight information in bundle"""
    listingId: str
    airline: str
    departure: str
    arrival: str
    date: Optional[str] = None
    price: float
    duration: Optional[int] = None
    stops: Optional[int] = None


class HotelInfo(BaseModel):
    """Hotel information in bundle"""
    listingId: str
    hotelName: str
    city: str
    starRating: float
    price: float
    amenities: List[str] = Field(default_factory=list)
    availability: Optional[int] = None


class BundleResponse(BaseModel):
    """Single bundle recommendation"""
    bundleId: str
    totalPrice: float
    savings: float
    dealScore: int = Field(..., ge=0, le=100)
    fitScore: float = Field(..., ge=0.0, le=1.0)
    combinedScore: float
    explanation: str = Field(..., max_length=200)
    flight: FlightInfo
    hotel: HotelInfo
    
    class Config:
        json_schema_extra = {
            "example": {
                "bundleId": "bundle-123",
                "totalPrice": 430.0,
                "savings": 120.0,
                "dealScore": 85,
                "fitScore": 0.92,
                "combinedScore": 0.89,
                "explanation": "Save $120 on Miami getaway - 4.5★ hotel with pool",
                "flight": {
                    "listingId": "flight-001",
                    "airline": "United",
                    "departure": "SFO",
                    "arrival": "Miami",
                    "price": 280.0
                },
                "hotel": {
                    "listingId": "hotel-001",
                    "hotelName": "Grand Hyatt",
                    "city": "Miami",
                    "starRating": 4.5,
                    "price": 150.0,
                    "amenities": ["wifi", "pool"]
                }
            }
        }


class QueryResponse(BaseModel):
    """Response for query request"""
    sessionId: str
    query: str
    parsedIntent: ParsedIntent
    bundles: List[BundleResponse]
    totalResults: int
    processingTime: float = Field(..., description="Processing time in seconds")
    
    class Config:
        json_schema_extra = {
            "example": {
                "sessionId": "session-abc123",
                "query": "cheap flights to Miami",
                "parsedIntent": {
                    "origin": None,
                    "destination": "Miami",
                    "budget": None,
                    "constraints": []
                },
                "bundles": [],
                "totalResults": 3,
                "processingTime": 0.45
            }
        }


# ============================================
# Watch/Alert Requests
# ============================================

class WatchRequest(BaseModel):
    """Request to watch a listing for price changes"""
    listingId: str = Field(..., description="Listing to watch")
    targetPrice: Optional[float] = Field(None, description="Alert when price drops below this")
    
    class Config:
        json_schema_extra = {
            "example": {
                "listingId": "flight-001",
                "targetPrice": 250.0
            }
        }


class WatchResponse(BaseModel):
    """Response for watch request"""
    watchId: str
    listingId: str
    targetPrice: Optional[float]
    createdAt: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "watchId": "watch-xyz789",
                "listingId": "flight-001",
                "targetPrice": 250.0,
                "createdAt": "2025-11-07T20:00:00"
            }
        }


# ============================================
# WebSocket Messages
# ============================================

class WebSocketMessage(BaseModel):
    """Base WebSocket message"""
    eventType: str
    timestamp: datetime = Field(default_factory=datetime.now)


class DealUpdateMessage(WebSocketMessage):
    """Deal update notification"""
    eventType: str = "DEAL_UPDATE"
    payload: Dict[str, Any]
    
    class Config:
        json_schema_extra = {
            "example": {
                "eventType": "DEAL_UPDATE",
                "timestamp": "2025-11-07T20:00:00",
                "payload": {
                    "listingId": "flight-001",
                    "dealScore": 85,
                    "price": 280.0
                }
            }
        }


class WatchNotificationMessage(WebSocketMessage):
    """Watch notification (price alert)"""
    eventType: str = "WATCH_NOTIFICATION"
    watchId: str
    listingId: str
    oldPrice: float
    newPrice: float
    message: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "eventType": "WATCH_NOTIFICATION",
                "timestamp": "2025-11-07T20:00:00",
                "watchId": "watch-xyz789",
                "listingId": "flight-001",
                "oldPrice": 280.0,
                "newPrice": 250.0,
                "message": "Price dropped below your target!"
            }
        }


# ============================================
# Error Responses
# ============================================

class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "ValidationError",
                "message": "Query must be between 1 and 500 characters",
                "timestamp": "2025-11-07T20:00:00"
            }
        }


# ============================================
# Health Check
# ============================================

class HealthCheckResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    version: str = Field(default="0.1.0")
    timestamp: datetime = Field(default_factory=datetime.now)
    dependencies: Dict[str, bool] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "0.1.0",
                "timestamp": "2025-11-07T20:00:00",
                "dependencies": {
                    "redis": True,
                    "ollama": True,
                    "openai": True
                }
            }
        }
