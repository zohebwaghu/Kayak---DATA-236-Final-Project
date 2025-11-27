"""
Deals Agent - Backend Worker for Processing Kafka Streams
Adapted for middleware Kafka topics and message formats
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import json

from ..config import settings
from ..kafka_client.consumer import KafkaConsumerWrapper
from ..kafka_client.producer import KafkaProducerWrapper
from ..algorithms.deal_scorer import DealScorer
from ..algorithms.fit_scorer import FitScorer
from ..algorithms.bundle_matcher import BundleMatcher
from ..cache.semantic_cache import SemanticCache
from ..interfaces.data_interface import get_data_interface

logger = logging.getLogger(__name__)


class DealsAgent:
    """
    Deals Agent - Processes deal streams from Kafka
    
    Responsibilities:
    1. Consume deals from deals.normalized topic
    2. Score deals using DealScorer algorithm
    3. Match flights with hotels to create bundles
    4. Publish scored deals to deals.scored topic
    5. Publish tagged deals to deals.tagged topic
    6. Publish events to deal.events topic
    """
    
    def __init__(self):
        """Initialize Deals Agent"""
        # Kafka consumers and producers
        self.consumer: Optional[KafkaConsumerWrapper] = None
        self.producer: Optional[KafkaProducerWrapper] = None
        
        # Processing components
        self.deal_scorer = DealScorer()
        self.fit_scorer = FitScorer()
        self.bundle_matcher = BundleMatcher()
        self.cache = SemanticCache()
        self.data_interface = get_data_interface()
        
        # In-memory storage for processed deals
        self.processed_flights: Dict[str, Dict] = {}
        self.processed_hotels: Dict[str, Dict] = {}
        self.processed_cars: Dict[str, Dict] = {}
        self.bundles: Dict[str, Dict] = {}
        
        # State
        self._running = False
        self._tasks: List[asyncio.Task] = []
        
        logger.info("DealsAgent initialized")
    
    async def start(self):
        """Start the Deals Agent"""
        if self._running:
            logger.warning("DealsAgent already running")
            return
        
        logger.info("Starting DealsAgent...")
        
        # Initialize Kafka consumer
        self.consumer = KafkaConsumerWrapper(
            topics=[
                settings.KAFKA_DEALS_NORMALIZED_TOPIC,
                settings.KAFKA_DEALS_RAW_TOPIC
            ],
            group_id=settings.KAFKA_CONSUMER_GROUP,
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS
        )
        
        # Initialize Kafka producer
        self.producer = KafkaProducerWrapper(
            bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS
        )
        
        await self.consumer.start()
        await self.producer.start()
        
        self._running = True
        
        # Start processing tasks
        self._tasks = [
            asyncio.create_task(self._process_deals_stream()),
            asyncio.create_task(self._periodic_bundle_matching())
        ]
        
        logger.info("DealsAgent started successfully")
    
    async def stop(self):
        """Stop the Deals Agent"""
        if not self._running:
            return
        
        logger.info("Stopping DealsAgent...")
        
        self._running = False
        
        # Cancel tasks
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        # Close Kafka connections
        if self.consumer:
            await self.consumer.stop()
        if self.producer:
            await self.producer.stop()
        
        logger.info("DealsAgent stopped")
    
    async def _process_deals_stream(self):
        """Process incoming deals from Kafka"""
        logger.info(f"Starting deals stream processor for topics: {settings.KAFKA_DEALS_NORMALIZED_TOPIC}")
        
        try:
            async for message in self.consumer:
                if not self._running:
                    break
                
                try:
                    await self._process_deal_message(message)
                except Exception as e:
                    logger.error(f"Error processing deal message: {e}")
                    continue
        
        except asyncio.CancelledError:
            logger.info("Deals stream processor cancelled")
        except Exception as e:
            logger.error(f"Deals stream processor error: {e}")
    
    async def _process_deal_message(self, message: Dict):
        """Process a single deal message"""
        # Extract deal data (middleware format)
        key = message.get("key")
        kind = message.get("kind")  # "flight", "hotel", or "car"
        price = message.get("price")
        currency = message.get("currency", "USD")
        timestamp = message.get("ts") or message.get("timestamp")
        attrs = message.get("attrs", {})
        
        if not key or not kind:
            logger.warning(f"Invalid deal message: missing key or kind")
            return
        
        # Normalize deal data
        deal = self._normalize_deal(key, kind, price, currency, timestamp, attrs)
        
        # Score the deal
        score_result = self.deal_scorer.score(deal)
        deal["score"] = score_result["score"]
        deal["score_breakdown"] = score_result.get("breakdown", {})
        
        # Generate tags
        tags = self._generate_tags(deal, score_result)
        deal["tags"] = tags
        
        # Generate reason/explanation
        reason = self._generate_reason(deal, score_result, tags)
        
        # Store processed deal
        if kind == "flight":
            self.processed_flights[key] = deal
        elif kind == "hotel":
            self.processed_hotels[key] = deal
        elif kind == "car":
            self.processed_cars[key] = deal
        
        # Publish scored deal
        await self._publish_scored_deal(key, deal, score_result["score"], reason)
        
        # Publish tagged deal
        await self._publish_tagged_deal(key, deal, tags)
        
        # Publish event
        await self._publish_deal_event(key, "deal_scored", deal)
        
        logger.debug(f"Processed {kind} deal: {key}, score: {score_result['score']}")
    
    def _normalize_deal(
        self,
        key: str,
        kind: str,
        price: float,
        currency: str,
        timestamp: str,
        attrs: Dict
    ) -> Dict:
        """Normalize deal data to internal format"""
        deal = {
            "id": key,
            "kind": kind,
            "price": float(price) if price else 0,
            "currency": currency,
            "timestamp": timestamp or datetime.now().isoformat(),
            "processed_at": datetime.now().isoformat()
        }
        
        if kind == "flight":
            deal.update({
                "origin": attrs.get("origin") or attrs.get("departure_airport") or attrs.get("startingAirport"),
                "destination": attrs.get("destination") or attrs.get("arrival_airport") or attrs.get("destinationAirport"),
                "departure_date": attrs.get("departure_date") or attrs.get("travelDate"),
                "airline": attrs.get("airline") or attrs.get("segmentsAirlineName"),
                "duration_hours": attrs.get("duration_hours") or attrs.get("duration"),
                "stops": attrs.get("stops", 0),
                "cabin_class": attrs.get("cabin_class") or attrs.get("segmentsCabinCode", "economy"),
                "seats_remaining": attrs.get("seats_remaining") or attrs.get("seatsRemaining"),
                "distance": attrs.get("distance") or attrs.get("totalTravelDistance")
            })
        
        elif kind == "hotel":
            deal.update({
                "name": attrs.get("name"),
                "location": attrs.get("city") or attrs.get("location"),
                "star_rating": attrs.get("stars") or attrs.get("star_rating"),
                "user_rating": attrs.get("rating") or attrs.get("user_rating"),
                "amenities": attrs.get("amenities", []),
                "room_type": attrs.get("room_type"),
                "check_in": attrs.get("check_in"),
                "check_out": attrs.get("check_out"),
                "price_per_night": attrs.get("price_per_night") or price
            })
        
        elif kind == "car":
            deal.update({
                "provider": attrs.get("provider") or attrs.get("provider_name"),
                "car_type": attrs.get("car_type"),
                "pickup_location": attrs.get("pickup_location"),
                "dropoff_location": attrs.get("dropoff_location"),
                "pickup_date": attrs.get("pickup_date"),
                "dropoff_date": attrs.get("dropoff_date")
            })
        
        # Keep original attrs for reference
        deal["original_attrs"] = attrs
        
        return deal
    
    def _generate_tags(self, deal: Dict, score_result: Dict) -> List[str]:
        """Generate tags for a deal based on its attributes and score"""
        tags = []
        score = score_result.get("score", 0)
        kind = deal.get("kind")
        
        # Score-based tags
        if score >= 80:
            tags.append("excellent_deal")
        elif score >= 60:
            tags.append("good_deal")
        
        # Price-based tags
        price = deal.get("price", 0)
        if kind == "flight":
            if price < 150:
                tags.append("budget_friendly")
            elif price > 500:
                tags.append("premium")
        elif kind == "hotel":
            if price < 100:
                tags.append("budget_friendly")
            elif price > 300:
                tags.append("luxury")
        
        # Flight-specific tags
        if kind == "flight":
            if deal.get("stops", 0) == 0:
                tags.append("nonstop")
            
            cabin = deal.get("cabin_class", "").lower()
            if "business" in cabin:
                tags.append("business_class")
            elif "first" in cabin:
                tags.append("first_class")
            
            seats = deal.get("seats_remaining", 999)
            if seats and seats < 5:
                tags.append("limited_seats")
        
        # Hotel-specific tags
        elif kind == "hotel":
            star_rating = deal.get("star_rating", 0)
            if star_rating and star_rating >= 4.5:
                tags.append("highly_rated")
            
            amenities = deal.get("amenities", [])
            if "pool" in amenities:
                tags.append("has_pool")
            if "wifi" in amenities or "free_wifi" in amenities:
                tags.append("free_wifi")
            if "breakfast" in amenities:
                tags.append("breakfast_included")
        
        return tags
    
    def _generate_reason(self, deal: Dict, score_result: Dict, tags: List[str]) -> str:
        """Generate a human-readable reason for the score"""
        reasons = []
        kind = deal.get("kind")
        score = score_result.get("score", 0)
        
        if score >= 80:
            reasons.append("Excellent value")
        elif score >= 60:
            reasons.append("Good deal")
        
        if kind == "flight":
            if "nonstop" in tags:
                reasons.append("direct flight")
            if "limited_seats" in tags:
                reasons.append("limited availability")
            if deal.get("airline"):
                reasons.append(f"on {deal['airline']}")
        
        elif kind == "hotel":
            if deal.get("star_rating") and deal["star_rating"] >= 4:
                reasons.append(f"{deal['star_rating']}-star property")
            if "highly_rated" in tags:
                reasons.append("top-rated by guests")
            if deal.get("location"):
                reasons.append(f"in {deal['location']}")
        
        return " - ".join(reasons) if reasons else "Standard deal"
    
    async def _publish_scored_deal(self, key: str, deal: Dict, score: int, reason: str):
        """Publish scored deal to deals.scored topic"""
        message = {
            "key": key,
            "score": score,
            "reason": reason,
            "ts": datetime.now().isoformat(),
            "attrs": deal.get("original_attrs", {})
        }
        
        await self.producer.send(
            topic=settings.KAFKA_DEALS_SCORED_TOPIC,
            key=key,
            value=message
        )
    
    async def _publish_tagged_deal(self, key: str, deal: Dict, tags: List[str]):
        """Publish tagged deal to deals.tagged topic"""
        message = {
            "key": key,
            "tags": tags,
            "ts": datetime.now().isoformat(),
            "attrs": deal.get("original_attrs", {})
        }
        
        await self.producer.send(
            topic=settings.KAFKA_DEALS_TAGGED_TOPIC,
            key=key,
            value=message
        )
    
    async def _publish_deal_event(self, key: str, event_type: str, deal: Dict):
        """Publish deal event to deal.events topic"""
        message = {
            "key": key,
            "event_type": event_type,
            "ts": datetime.now().isoformat(),
            "score": deal.get("score"),
            "tags": deal.get("tags", []),
            "payload": {
                "kind": deal.get("kind"),
                "price": deal.get("price"),
                "currency": deal.get("currency")
            }
        }
        
        await self.producer.send(
            topic=settings.KAFKA_DEAL_EVENTS_TOPIC,
            key=key,
            value=message
        )
    
    async def _periodic_bundle_matching(self):
        """Periodically match flights with hotels to create bundles"""
        logger.info("Starting periodic bundle matching")
        
        try:
            while self._running:
                await asyncio.sleep(settings.BUNDLE_MATCHING_INTERVAL)
                
                if not self._running:
                    break
                
                try:
                    await self._match_bundles()
                except Exception as e:
                    logger.error(f"Error in bundle matching: {e}")
        
        except asyncio.CancelledError:
            logger.info("Bundle matching cancelled")
    
    async def _match_bundles(self):
        """Match flights with hotels to create bundles"""
        flights = list(self.processed_flights.values())
        hotels = list(self.processed_hotels.values())
        
        if not flights or not hotels:
            return
        
        # Use bundle matcher
        bundles = self.bundle_matcher.match(flights, hotels)
        
        for bundle in bundles:
            bundle_id = f"bundle_{bundle['flight']['id']}_{bundle['hotel']['id']}"
            bundle["id"] = bundle_id
            bundle["created_at"] = datetime.now().isoformat()
            
            self.bundles[bundle_id] = bundle
            
            # Publish bundle event
            await self._publish_deal_event(bundle_id, "bundle_created", {
                "kind": "bundle",
                "price": bundle.get("total_price"),
                "score": bundle.get("combined_score"),
                "tags": bundle.get("tags", [])
            })
        
        logger.info(f"Created {len(bundles)} new bundles")
    
    async def get_recommendations(
        self,
        user_query: Optional[str] = None,
        user_preferences: Optional[Dict] = None,
        user_id: Optional[str] = None,
        limit: int = 10
    ) -> Dict:
        """Get personalized recommendations"""
        # Get user preferences if user_id provided
        if user_id and not user_preferences:
            user_data = await self.data_interface.get_user_preferences(user_id)
            user_preferences = user_data.get("preferences", {}) if user_data else {}
        
        # Get top deals
        all_deals = []
        
        for deal in self.processed_flights.values():
            all_deals.append(deal)
        
        for deal in self.processed_hotels.values():
            all_deals.append(deal)
        
        # Score deals for user fit
        if user_preferences:
            for deal in all_deals:
                fit_score = self.fit_scorer.score(deal, user_preferences)
                deal["fit_score"] = fit_score
        
        # Sort by combined score
        all_deals.sort(
            key=lambda x: (x.get("fit_score", 0) + x.get("score", 0)) / 2,
            reverse=True
        )
        
        # Get top bundles
        top_bundles = sorted(
            self.bundles.values(),
            key=lambda x: x.get("combined_score", 0),
            reverse=True
        )[:limit]
        
        return {
            "recommendations": all_deals[:limit],
            "bundles": top_bundles,
            "total_flights": len(self.processed_flights),
            "total_hotels": len(self.processed_hotels),
            "total_bundles": len(self.bundles),
            "generated_at": datetime.now().isoformat()
        }


# Singleton instance
_deals_agent_instance: Optional[DealsAgent] = None


def get_deals_agent() -> DealsAgent:
    """Get singleton instance of DealsAgent"""
    global _deals_agent_instance
    if _deals_agent_instance is None:
        _deals_agent_instance = DealsAgent()
    return _deals_agent_instance
