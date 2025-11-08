"""
Schemas Module
Pydantic models for API validation
"""

from .ai_schemas import (
    SessionCreateResponse,
    QueryRequest,
    QueryResponse,
    ParsedIntent,
    BundleResponse,
    FlightInfo,
    HotelInfo,
    WatchRequest,
    WatchResponse,
    ErrorResponse,
    HealthCheckResponse
)

__all__ = [
    "SessionCreateResponse",
    "QueryRequest",
    "QueryResponse",
    "ParsedIntent",
    "BundleResponse",
    "FlightInfo",
    "HotelInfo",
    "WatchRequest",
    "WatchResponse",
    "ErrorResponse",
    "HealthCheckResponse"
]
