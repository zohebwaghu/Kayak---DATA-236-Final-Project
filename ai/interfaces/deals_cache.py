# interfaces/deals_cache.py
"""
Deals Cache for storing and retrieving processed deals.
Used by:
- Deals Agent: stores scored/tagged deals
- Concierge Agent: retrieves deals for recommendations
"""

import json
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict
from loguru import logger

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


@dataclass
class Deal:
    """A scored and tagged deal"""
    deal_id: str
    listing_type: str  # "flight", "hotel"
    listing_id: str
    
    # Basic info
    name: str
    origin: Optional[str] = None  # For flights
    destination: str = ""
    
    # Pricing
    current_price: float = 0
    original_price: float = 0
    avg_30d_price: float = 0
    discount_percent: float = 0
    
    # Availability
    availability: int = 0  # Rooms/seats left
    
    # Scores
    deal_score: int = 0  # 0-100
    
    # Tags
    tags: List[str] = field(default_factory=list)  # ["pet-friendly", "refundable", etc.]
    
    # Timestamps
    discovered_at: str = ""
    expires_at: Optional[str] = None
    
    # Additional data
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Deal':
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


class DealsCache:
    """
    Cache for storing and querying deals.
    Supports filtering by destination, price, tags, etc.
    """
    
    def __init__(self, redis_host: str = "localhost", redis_port: int = 6379, 
                 ttl_hours: int = 24):
        self.ttl_seconds = ttl_hours * 3600
        self.redis_client = None
        
        # In-memory storage
        self._deals: Dict[str, Deal] = {}
        self._by_destination: Dict[str, List[str]] = {}  # destination -> deal_ids
        self._by_type: Dict[str, List[str]] = {}  # listing_type -> deal_ids
        self._by_tag: Dict[str, List[str]] = {}  # tag -> deal_ids
        
        if REDIS_AVAILABLE:
            try:
                self.redis_client = redis.Redis(
                    host=redis_host,
                    port=redis_port,
                    decode_responses=True
                )
                self.redis_client.ping()
                logger.info(f"DealsCache connected to Redis")
            except Exception as e:
                logger.warning(f"DealsCache Redis connection failed: {e}")
                self.redis_client = None
        
        # Initialize with sample deals
        self._init_sample_deals()
    
    def _get_key(self, deal_id: str) -> str:
        return f"deal:{deal_id}"
    
    def _init_sample_deals(self):
        """Initialize with sample deals for demo"""
        sample_deals = [
            Deal(
                deal_id="deal_mia_001",
                listing_type="hotel",
                listing_id="hotel_miami_beach",
                name="Miami Beach Resort",
                destination="MIA",
                current_price=189,
                original_price=249,
                avg_30d_price=233,
                discount_percent=24,
                availability=3,
                deal_score=85,
                tags=["pet-friendly", "refundable", "beach", "pool"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"star_rating": 4, "neighborhood": "South Beach"}
            ),
            Deal(
                deal_id="deal_mia_002",
                listing_type="flight",
                listing_id="flight_aa_mia",
                name="SFO → MIA (American)",
                origin="SFO",
                destination="MIA",
                current_price=249,
                original_price=329,
                avg_30d_price=299,
                discount_percent=17,
                availability=8,
                deal_score=78,
                tags=["direct-flight"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"airline": "American", "stops": 0, "duration_minutes": 330}
            ),
            Deal(
                deal_id="deal_nyc_001",
                listing_type="hotel",
                listing_id="hotel_nyc_times",
                name="Times Square Hotel",
                destination="JFK",
                current_price=159,
                original_price=199,
                avg_30d_price=185,
                discount_percent=14,
                availability=5,
                deal_score=72,
                tags=["refundable", "wifi", "gym"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"star_rating": 3, "neighborhood": "Midtown"}
            ),
            Deal(
                deal_id="deal_nyc_002",
                listing_type="flight",
                listing_id="flight_ua_nyc",
                name="SFO → JFK (United)",
                origin="SFO",
                destination="JFK",
                current_price=199,
                original_price=279,
                avg_30d_price=245,
                discount_percent=19,
                availability=12,
                deal_score=82,
                tags=["direct-flight"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"airline": "United", "stops": 0, "duration_minutes": 320}
            ),
            Deal(
                deal_id="deal_hnl_001",
                listing_type="hotel",
                listing_id="hotel_honolulu_beach",
                name="Waikiki Beach Resort",
                destination="HNL",
                current_price=279,
                original_price=359,
                avg_30d_price=320,
                discount_percent=22,
                availability=2,
                deal_score=88,
                tags=["beach", "pool", "pet-friendly", "breakfast"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"star_rating": 4, "neighborhood": "Waikiki"}
            ),
            Deal(
                deal_id="deal_cun_001",
                listing_type="hotel",
                listing_id="hotel_cancun_resort",
                name="Cancun All-Inclusive",
                destination="CUN",
                current_price=199,
                original_price=299,
                avg_30d_price=259,
                discount_percent=33,
                availability=4,
                deal_score=91,
                tags=["beach", "pool", "all-inclusive", "refundable"],
                discovered_at=datetime.utcnow().isoformat(),
                metadata={"star_rating": 5, "neighborhood": "Hotel Zone"}
            ),
        ]
        
        for deal in sample_deals:
            self.add_deal(deal)
        
        logger.info(f"Initialized DealsCache with {len(sample_deals)} sample deals")
    
    def add_deal(self, deal: Deal):
        """Add a deal to the cache"""
        # Store in Redis if available
        if self.redis_client:
            try:
                key = self._get_key(deal.deal_id)
                self.redis_client.setex(key, self.ttl_seconds, json.dumps(deal.to_dict()))
                
                # Add to indexes
                self.redis_client.sadd(f"deals:dest:{deal.destination}", deal.deal_id)
                self.redis_client.sadd(f"deals:type:{deal.listing_type}", deal.deal_id)
                for tag in deal.tags:
                    self.redis_client.sadd(f"deals:tag:{tag}", deal.deal_id)
            except Exception as e:
                logger.error(f"Redis add deal error: {e}")
        
        # Always store in memory
        self._deals[deal.deal_id] = deal
        
        # Update indexes
        if deal.destination not in self._by_destination:
            self._by_destination[deal.destination] = []
        if deal.deal_id not in self._by_destination[deal.destination]:
            self._by_destination[deal.destination].append(deal.deal_id)
        
        if deal.listing_type not in self._by_type:
            self._by_type[deal.listing_type] = []
        if deal.deal_id not in self._by_type[deal.listing_type]:
            self._by_type[deal.listing_type].append(deal.deal_id)
        
        for tag in deal.tags:
            if tag not in self._by_tag:
                self._by_tag[tag] = []
            if deal.deal_id not in self._by_tag[tag]:
                self._by_tag[tag].append(deal.deal_id)
    
    def get_deal(self, deal_id: str) -> Optional[Deal]:
        """Get a specific deal"""
        # Try Redis first
        if self.redis_client:
            try:
                key = self._get_key(deal_id)
                data = self.redis_client.get(key)
                if data:
                    return Deal.from_dict(json.loads(data))
            except Exception as e:
                logger.error(f"Redis get deal error: {e}")
        
        return self._deals.get(deal_id)
    
    def get_deals_by_destination(self, destination: str) -> List[Deal]:
        """Get all deals for a destination"""
        deal_ids = self._by_destination.get(destination.upper(), [])
        return [self._deals[did] for did in deal_ids if did in self._deals]
    
    def get_deals_by_type(self, listing_type: str) -> List[Deal]:
        """Get all deals of a type (flight/hotel)"""
        deal_ids = self._by_type.get(listing_type, [])
        return [self._deals[did] for did in deal_ids if did in self._deals]
    
    def get_deals_by_tag(self, tag: str) -> List[Deal]:
        """Get all deals with a specific tag"""
        deal_ids = self._by_tag.get(tag, [])
        return [self._deals[did] for did in deal_ids if did in self._deals]
    
    def search_deals(
        self,
        destination: Optional[str] = None,
        origin: Optional[str] = None,
        listing_type: Optional[str] = None,
        max_price: Optional[float] = None,
        min_score: int = 0,
        tags: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Deal]:
        """
        Search deals with multiple filters.
        Used by Concierge Agent to find matching deals.
        """
        results = []
        
        for deal in self._deals.values():
            # Filter by destination
            if destination and deal.destination.upper() != destination.upper():
                continue
            
            # Filter by origin (for flights)
            if origin and deal.origin and deal.origin.upper() != origin.upper():
                continue
            
            # Filter by type
            if listing_type and deal.listing_type != listing_type:
                continue
            
            # Filter by price
            if max_price and deal.current_price > max_price:
                continue
            
            # Filter by score
            if deal.deal_score < min_score:
                continue
            
            # Filter by tags (all must match)
            if tags:
                if not all(tag in deal.tags for tag in tags):
                    continue
            
            results.append(deal)
        
        # Sort by deal score (descending)
        results.sort(key=lambda d: d.deal_score, reverse=True)
        
        return results[:limit]
    
    def get_best_deals(self, limit: int = 10) -> List[Deal]:
        """Get top deals by score"""
        deals = list(self._deals.values())
        deals.sort(key=lambda d: d.deal_score, reverse=True)
        return deals[:limit]
    
    def get_deals_for_bundle(
        self,
        destination: str,
        origin: Optional[str] = None,
        max_flight_price: Optional[float] = None,
        max_hotel_price: Optional[float] = None,
        tags: Optional[List[str]] = None
    ) -> Dict[str, List[Deal]]:
        """
        Get matching flights and hotels for bundle creation.
        Returns {"flights": [...], "hotels": [...]}
        """
        flights = self.search_deals(
            destination=destination,
            origin=origin,
            listing_type="flight",
            max_price=max_flight_price,
            tags=[t for t in (tags or []) if t in ["direct-flight", "no-redeye"]],
            limit=5
        )
        
        hotels = self.search_deals(
            destination=destination,
            listing_type="hotel",
            max_price=max_hotel_price,
            tags=[t for t in (tags or []) if t not in ["direct-flight", "no-redeye"]],
            limit=5
        )
        
        return {"flights": flights, "hotels": hotels}
    
    def remove_deal(self, deal_id: str):
        """Remove a deal from cache"""
        deal = self._deals.get(deal_id)
        if not deal:
            return
        
        # Remove from Redis
        if self.redis_client:
            try:
                self.redis_client.delete(self._get_key(deal_id))
                self.redis_client.srem(f"deals:dest:{deal.destination}", deal_id)
                self.redis_client.srem(f"deals:type:{deal.listing_type}", deal_id)
                for tag in deal.tags:
                    self.redis_client.srem(f"deals:tag:{tag}", deal_id)
            except Exception as e:
                logger.error(f"Redis remove deal error: {e}")
        
        # Remove from memory
        if deal_id in self._deals:
            del self._deals[deal_id]
        
        if deal.destination in self._by_destination:
            if deal_id in self._by_destination[deal.destination]:
                self._by_destination[deal.destination].remove(deal_id)
        
        if deal.listing_type in self._by_type:
            if deal_id in self._by_type[deal.listing_type]:
                self._by_type[deal.listing_type].remove(deal_id)
        
        for tag in deal.tags:
            if tag in self._by_tag and deal_id in self._by_tag[tag]:
                self._by_tag[tag].remove(deal_id)
    
    def update_deal_price(self, deal_id: str, new_price: float) -> Optional[Deal]:
        """Update a deal's price (called when prices change)"""
        deal = self.get_deal(deal_id)
        if not deal:
            return None
        
        old_price = deal.current_price
        deal.current_price = new_price
        
        # Recalculate discount
        if deal.original_price > 0:
            deal.discount_percent = ((deal.original_price - new_price) / deal.original_price) * 100
        
        self.add_deal(deal)  # Re-add to update
        
        logger.info(f"Updated deal {deal_id} price: ${old_price} -> ${new_price}")
        return deal
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            "total_deals": len(self._deals),
            "by_type": {k: len(v) for k, v in self._by_type.items()},
            "by_destination": {k: len(v) for k, v in self._by_destination.items()},
            "top_tags": {k: len(v) for k, v in sorted(self._by_tag.items(), key=lambda x: -len(x[1]))[:10]}
        }


# ============================================
# Global Instance
# ============================================

from config import settings
deals_cache = DealsCache(
    redis_host=settings.REDIS_HOST,
    redis_port=settings.REDIS_PORT
)


# ============================================
# Convenience Functions
# ============================================

def search_deals(
    destination: Optional[str] = None,
    origin: Optional[str] = None,
    listing_type: Optional[str] = None,
    max_price: Optional[float] = None,
    min_score: int = 0,
    tags: Optional[List[str]] = None,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Search deals and return as dicts"""
    deals = deals_cache.search_deals(
        destination=destination,
        origin=origin,
        listing_type=listing_type,
        max_price=max_price,
        min_score=min_score,
        tags=tags,
        limit=limit
    )
    return [d.to_dict() for d in deals]


def get_deals_for_bundle(destination: str, **kwargs) -> Dict[str, List[Dict]]:
    """Get deals for bundle creation"""
    result = deals_cache.get_deals_for_bundle(destination, **kwargs)
    return {
        "flights": [d.to_dict() for d in result["flights"]],
        "hotels": [d.to_dict() for d in result["hotels"]]
    }


def get_best_deals(limit: int = 10) -> List[Dict[str, Any]]:
    """Get best deals as dicts"""
    deals = deals_cache.get_best_deals(limit)
    return [d.to_dict() for d in deals]
