# interfaces/deals_cache.py
"""
Deals Cache for storing and retrieving processed deals.
Now reads from MongoDB for real data.
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

try:
    from pymongo import MongoClient
    MONGO_AVAILABLE = True
except ImportError:
    MONGO_AVAILABLE = False


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
    Now loads data from MongoDB.
    """

    def __init__(self, redis_host: str = "localhost", redis_port: int = 6379,
                 mongo_uri: str = "mongodb://mongodb:27017", mongo_db: str = "kayak_listings",
                 ttl_hours: int = 24):
        self.ttl_seconds = ttl_hours * 3600
        self.redis_client = None
        self.mongo_client = None
        self.mongo_db = None

        # In-memory storage
        self._deals: Dict[str, Deal] = {}
        self._by_destination: Dict[str, List[str]] = {}
        self._by_type: Dict[str, List[str]] = {}
        self._by_tag: Dict[str, List[str]] = {}

        # Connect to Redis
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

        # Connect to MongoDB
        if MONGO_AVAILABLE:
            try:
                self.mongo_client = MongoClient(mongo_uri)
                self.mongo_db = self.mongo_client[mongo_db]
                # Test connection
                self.mongo_db.list_collection_names()
                logger.info(f"DealsCache connected to MongoDB: {mongo_uri}/{mongo_db}")
            except Exception as e:
                logger.warning(f"DealsCache MongoDB connection failed: {e}")
                self.mongo_client = None
                self.mongo_db = None

        # Load deals from MongoDB
        self._load_deals_from_mongo()

    def _load_deals_from_mongo(self):
        """Load flights and hotels from MongoDB and convert to deals"""
        if self.mongo_db is None:
            logger.warning("MongoDB not available, using sample deals")
            self._init_sample_deals()
            return

        try:
            # Load flights
            flights_collection = self.mongo_db["flights"]
            flights_count = flights_collection.count_documents({})
            logger.info(f"Loading {flights_count} flights from MongoDB")

            for flight in flights_collection.find():  
                deal = self._flight_to_deal(flight)
                if deal:
                    self.add_deal(deal)

            # Load hotels
            hotels_collection = self.mongo_db["hotels"]
            hotels_count = hotels_collection.count_documents({})
            logger.info(f"Loading {hotels_count} hotels from MongoDB")

            for hotel in hotels_collection.find():  
                deal = self._hotel_to_deal(hotel)
                if deal:
                    self.add_deal(deal)

            logger.info(f"Loaded {len(self._deals)} deals from MongoDB")

        except Exception as e:
            logger.error(f"Error loading deals from MongoDB: {e}")
            self._init_sample_deals()

    def _flight_to_deal(self, flight: Dict) -> Optional[Deal]:
        """Convert MongoDB flight document to Deal"""
        try:
            price = float(flight.get("price", 0))
            # Calculate deal score based on price and other factors
            avg_price = price * 1.15  # Assume current price is 15% below avg
            discount = ((avg_price - price) / avg_price * 100) if avg_price > 0 else 0
            deal_score = min(95, max(50, int(60 + discount)))

            # Build tags
            tags = []
            if flight.get("stops", 0) == 0:
                tags.append("direct-flight")
            if flight.get("class", "").lower() == "business":
                tags.append("business-class")

            return Deal(
                deal_id=f"flight_{flight.get('flight_id', '')}",
                listing_type="flight",
                listing_id=flight.get("flight_id", ""),
                name=f"{flight.get('origin', 'XXX')} → {flight.get('destination', 'XXX')} ({flight.get('airline', 'Airline')})",
                origin=flight.get("origin", ""),
                destination=flight.get("destination", ""),
                current_price=price,
                original_price=price * 1.2,
                avg_30d_price=avg_price,
                discount_percent=discount,
                availability=flight.get("available_seats", 50),
                deal_score=deal_score,
                tags=tags,
                discovered_at=datetime.utcnow().isoformat(),
                metadata={
                    "airline": flight.get("airline", ""),
                    "flight_number": flight.get("flight_number", ""),
                    "stops": flight.get("stops", 0),
                    "duration": flight.get("duration", 0),
                    "class": flight.get("class", "Economy"),
                    "origin_city": flight.get("origin_city", ""),
                    "destination_city": flight.get("destination_city", "")
                }
            )
        except Exception as e:
            logger.error(f"Error converting flight to deal: {e}")
            return None

    def _hotel_to_deal(self, hotel: Dict) -> Optional[Deal]:
        """Convert MongoDB hotel document to Deal"""
        try:
            price = float(hotel.get("price_per_night", 0))
            star_rating = hotel.get("star_rating", 3)
            
            # Calculate deal score
            avg_price = price * 1.15
            discount = ((avg_price - price) / avg_price * 100) if avg_price > 0 else 0
            deal_score = min(95, max(50, int(55 + discount + star_rating * 5)))

            # Get tags from amenities
            tags = hotel.get("tags", []) or hotel.get("amenities", [])
            if hotel.get("is_refundable"):
                if "refundable" not in tags:
                    tags.append("refundable")

            # Map city/country to airport code
            city = hotel.get("city", "")
            destination = self._city_to_airport(city)

            return Deal(
                deal_id=f"hotel_{hotel.get('hotel_id', '')}",
                listing_type="hotel",
                listing_id=hotel.get("hotel_id", ""),
                name=hotel.get("name", "Hotel"),
                origin=None,
                destination=destination,
                current_price=price,
                original_price=price * 1.2,
                avg_30d_price=avg_price,
                discount_percent=discount,
                availability=hotel.get("available_rooms", 10),
                deal_score=deal_score,
                tags=tags,
                discovered_at=datetime.utcnow().isoformat(),
                metadata={
                    "star_rating": star_rating,
                    "hotel_type": hotel.get("hotel_type", ""),
                    "room_type": hotel.get("room_type", ""),
                    "meal_plan": hotel.get("meal_plan", ""),
                    "rating": hotel.get("rating", 4.0),
                    "city": city,
                    "country": hotel.get("country", "")
                }
            )
        except Exception as e:
            logger.error(f"Error converting hotel to deal: {e}")
            return None

    def _city_to_airport(self, city: str) -> str:
        """Map city name to airport code"""
        city_map = {
            # India cities (from flight dataset)
            "Delhi": "DEL",
            "Mumbai": "BOM",
            "Bangalore": "BLR",
            "Kolkata": "CCU",
            "Hyderabad": "HYD",
            "Chennai": "MAA",
            # US cities
            "New York": "JFK",
            "Los Angeles": "LAX",
            "San Francisco": "SFO",
            "Miami": "MIA",
            "Chicago": "ORD",
            # Countries from hotel dataset
            "PRT": "LIS",  # Portugal -> Lisbon
            "GBR": "LHR",  # UK -> London
            "USA": "JFK",  # USA -> NYC
            "ESP": "MAD",  # Spain -> Madrid
            "FRA": "CDG",  # France -> Paris
            "DEU": "FRA",  # Germany -> Frankfurt
            "ITA": "FCO",  # Italy -> Rome
            "BRA": "GRU",  # Brazil -> Sao Paulo
        }
        return city_map.get(city, city[:3].upper() if city else "XXX")

    def _get_key(self, deal_id: str) -> str:
        return f"deal:{deal_id}"

    def _init_sample_deals(self):
        """Fallback: Initialize with sample deals for demo"""
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

        # If no hotels found for destination, get any available hotels (for demo)
        if not hotels:
            hotels = self.search_deals(
                listing_type="hotel",
                max_price=max_hotel_price,
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
        """Update a deal's price"""
        deal = self.get_deal(deal_id)
        if not deal:
            return None

        old_price = deal.current_price
        deal.current_price = new_price

        if deal.original_price > 0:
            deal.discount_percent = ((deal.original_price - new_price) / deal.original_price) * 100

        self.add_deal(deal)
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
    redis_port=settings.REDIS_PORT,
    mongo_uri=getattr(settings, 'MONGO_URI', 'mongodb://mongodb:27017'),
    mongo_db=getattr(settings, 'MONGO_DB', 'kayak_listings')
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
