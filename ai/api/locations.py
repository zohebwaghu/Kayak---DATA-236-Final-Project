# api/locations.py
"""
/locations HTTP API Endpoint
Provides fuzzy location search for autocomplete functionality.

GET /api/ai/locations/search - Fuzzy search locations
GET /api/ai/locations/{code} - Get location by code
"""

from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from loguru import logger

# Import location cache
try:
    from interfaces.location_cache import location_cache
    LOCATION_CACHE_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Location cache not available: {e}")
    LOCATION_CACHE_AVAILABLE = False
    location_cache = None


# ============================================
# Response Models
# ============================================

class LocationResult(BaseModel):
    """Single location search result"""
    name: str
    code: str
    type: str  # "airport", "flight", "hotel"
    country: str = ""
    score: int = 0


class LocationSearchResponse(BaseModel):
    """Location search response"""
    query: str
    results: List[LocationResult]
    total: int


# ============================================
# Router
# ============================================

router = APIRouter(prefix="/api/ai/locations", tags=["locations"])


@router.get("/search", response_model=LocationSearchResponse)
async def search_locations(
    q: str = Query(..., min_length=1, description="Search query (e.g., 'mum', 'bombay', 'del')"),
    type: str = Query("all", description="Location type: 'flight', 'hotel', 'airport', 'all'"),
    limit: int = Query(10, ge=1, le=50, description="Max results to return")
):
    """
    Fuzzy search for locations.

    Use this endpoint for autocomplete dropdowns.
    Supports:
    - Partial matches (mum -> Mumbai)
    - Aliases (bombay -> Mumbai, nyc -> New York)
    - Typo tolerance (soorat -> Surat)
    - Airport codes (DEL, MUM, BAN)

    Returns locations sorted by match score.
    """
    if not LOCATION_CACHE_AVAILABLE or not location_cache:
        raise HTTPException(
            status_code=503,
            detail="Location search service not available"
        )

    try:
        results = location_cache.search(q, location_type=type, limit=limit)

        return LocationSearchResponse(
            query=q,
            results=[LocationResult(**r) for r in results],
            total=len(results)
        )
    except Exception as e:
        logger.error(f"Location search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/code/{code}")
async def get_location_by_code(code: str):
    """
    Get location details by airport/city code.

    Example: /api/ai/locations/code/MUM -> Mumbai details
    """
    if not LOCATION_CACHE_AVAILABLE or not location_cache:
        raise HTTPException(
            status_code=503,
            detail="Location search service not available"
        )

    # Search for exact code match
    code_upper = code.upper()
    for loc in location_cache.locations:
        if loc["code"] == code_upper:
            return LocationResult(
                name=loc["name"],
                code=loc["code"],
                type=loc["type"],
                country=loc.get("country", ""),
                score=100
            )

    raise HTTPException(status_code=404, detail=f"Location code '{code}' not found")


@router.get("/normalize")
async def normalize_location(
    q: str = Query(..., min_length=1, description="Location name to normalize")
):
    """
    Normalize a location name to its standard form.

    Example: bombay -> Mumbai, nyc -> New York

    Returns the normalized name and code if found.
    """
    if not LOCATION_CACHE_AVAILABLE or not location_cache:
        raise HTTPException(
            status_code=503,
            detail="Location search service not available"
        )

    normalized = location_cache.normalize(q)
    code = location_cache.get_code(q)

    if normalized:
        return {
            "original": q,
            "normalized": normalized,
            "code": code,
            "found": True
        }

    return {
        "original": q,
        "normalized": None,
        "code": None,
        "found": False
    }


@router.get("/stats")
async def get_location_stats():
    """
    Get statistics about loaded locations.
    """
    if not LOCATION_CACHE_AVAILABLE or not location_cache:
        return {
            "available": False,
            "total_locations": 0,
            "aliases": 0
        }

    # Count by type
    type_counts = {}
    for loc in location_cache.locations:
        loc_type = loc["type"]
        type_counts[loc_type] = type_counts.get(loc_type, 0) + 1

    return {
        "available": True,
        "total_locations": len(location_cache.locations),
        "aliases": len(location_cache.aliases),
        "by_type": type_counts
    }
