"""
Deals Agent - Backend Worker Agent
Processes Kafka streams of flight and hotel deals
Performs scoring, tagging, and republishing
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

from ..config import settings
from ..interfaces.data_interface import DataInterface
from ..algorithms.deal_scorer import DealScorer
from ..algorithms.fit_scorer import FitScorer
from ..algorithms.bundle_matcher import BundleMatcher
from ..llm.intent_parser import IntentParser
from ..llm.explainer import BundleExplainer
from ..cache.semantic_cache import SemanticCache
from ..kafka.consumer import KafkaConsumerWrapper
from ..kafka.producer import KafkaProducerWrapper

logger = logging.getLogger(__name__)


class DealsAgent:
    """
    Deals Agent - Backend processing agent for travel deals
    
    Responsibilities:
    1. Consume raw deals from Kafka (flights, hotels)
    2. Normalize and validate deal data
    3. Score deals using DealScorer
    4. Match flight + hotel bundles
    5. Tag deals with metadata
    6. Publish scored deals back to Kafka
    7. Cache results for performance
    """
    
    def __init__(
        self,
        data_interface: Optional[DataInterface] = None,
        semantic_cache: Optional[SemanticCache] = None
    ):
        """
        Initialize Deals Agent
        
        Args:
            data_interface: Interface to backend data (flights, hotels, bookings)
            semantic_cache: Redis-based semantic cache
        """
        self.data_interface = data_interface or DataInterface()
        self.cache = semantic_cache or SemanticCache()
        
        # Initialize scoring algorithms
        self.deal_scorer = DealScorer()
        self.fit_scorer = FitScorer()
        self.bundle_matcher = BundleMatcher()
        
        # Initialize LLM components
        self.intent_parser = IntentParser()
        self.explainer = BundleExplainer()
        
        # Kafka consumers and producers
        self.flight_consumer: Optional[KafkaConsumerWrapper] = None
        self.hotel_consumer: Optional[KafkaConsumerWrapper] = None
        self.producer: Optional[KafkaProducerWrapper] = None
        
        # In-memory storage for processed deals (temporary)
        self.processed_flights: Dict[str, Dict] = {}
        self.processed_hotels: Dict[str, Dict] = {}
        self.bundles: List[Dict] = []
        
        logger.info("DealsAgent initialized")
    
    async def start(self):
        """
        Start the Deals Agent
        Initialize Kafka consumers and producers
        Begin processing streams
        """
        try:
            # Initialize Kafka components
            self.flight_consumer = KafkaConsumerWrapper(
                topic=settings.KAFKA_FLIGHT_TOPIC,
                group_id=f"{settings.KAFKA_CONSUMER_GROUP}_flights"
            )
            
            self.hotel_consumer = KafkaConsumerWrapper(
                topic=settings.KAFKA_HOTEL_TOPIC,
                group_id=f"{settings.KAFKA_CONSUMER_GROUP}_hotels"
            )
            
            self.producer = KafkaProducerWrapper()
            
            # Connect to Kafka
            await self.flight_consumer.connect()
            await self.hotel_consumer.connect()
            await self.producer.connect()
            
            logger.info("DealsAgent started - listening to Kafka streams")
            
            # Start processing tasks
            await asyncio.gather(
                self._process_flight_stream(),
                self._process_hotel_stream(),
                self._periodic_bundle_matching()
            )
            
        except Exception as e:
            logger.error(f"Error starting DealsAgent: {e}")
            raise
    
    async def stop(self):
        """
        Stop the Deals Agent gracefully
        Close Kafka connections
        """
        try:
            if self.flight_consumer:
                await self.flight_consumer.close()
            if self.hotel_consumer:
                await self.hotel_consumer.close()
            if self.producer:
                await self.producer.close()
            
            logger.info("DealsAgent stopped")
            
        except Exception as e:
            logger.error(f"Error stopping DealsAgent: {e}")
    
    async def _process_flight_stream(self):
        """
        Process incoming flight deals from Kafka
        """
        logger.info("Started processing flight stream")
        
        async for message in self.flight_consumer.consume():
            try:
                flight_data = json.loads(message.value)
                
                # Validate and normalize
                normalized_flight = self._normalize_flight(flight_data)
                
                if normalized_flight:
                    # Score the flight
                    scored_flight = await self._score_flight(normalized_flight)
                    
                    # Store in memory
                    flight_id = scored_flight["id"]
                    self.processed_flights[flight_id] = scored_flight
                    
                    # Publish scored flight
                    await self.producer.produce(
                        topic=settings.KAFKA_SCORED_FLIGHTS_TOPIC,
                        key=flight_id,
                        value=json.dumps(scored_flight)
                    )
                    
                    logger.debug(f"Processed flight {flight_id}, score: {scored_flight['score']}")
                
            except Exception as e:
                logger.error(f"Error processing flight message: {e}")
                continue
    
    async def _process_hotel_stream(self):
        """
        Process incoming hotel deals from Kafka
        """
        logger.info("Started processing hotel stream")
        
        async for message in self.hotel_consumer.consume():
            try:
                hotel_data = json.loads(message.value)
                
                # Validate and normalize
                normalized_hotel = self._normalize_hotel(hotel_data)
                
                if normalized_hotel:
                    # Score the hotel
                    scored_hotel = await self._score_hotel(normalized_hotel)
                    
                    # Store in memory
                    hotel_id = scored_hotel["id"]
                    self.processed_hotels[hotel_id] = scored_hotel
                    
                    # Publish scored hotel
                    await self.producer.produce(
                        topic=settings.KAFKA_SCORED_HOTELS_TOPIC,
                        key=hotel_id,
                        value=json.dumps(scored_hotel)
                    )
                    
                    logger.debug(f"Processed hotel {hotel_id}, score: {scored_hotel['score']}")
                
            except Exception as e:
                logger.error(f"Error processing hotel message: {e}")
                continue
    
    async def _periodic_bundle_matching(self):
        """
        Periodically match flights and hotels into bundles
        Runs every N seconds
        """
        logger.info("Started periodic bundle matching")
        
        while True:
            try:
                await asyncio.sleep(settings.BUNDLE_MATCHING_INTERVAL)
                
                if self.processed_flights and self.processed_hotels:
                    # Match bundles
                    new_bundles = await self._match_bundles()
                    
                    # Publish bundles
                    for bundle in new_bundles:
                        await self.producer.produce(
                            topic=settings.KAFKA_BUNDLES_TOPIC,
                            key=bundle["id"],
                            value=json.dumps(bundle)
                        )
                    
                    if new_bundles:
                        logger.info(f"Created {len(new_bundles)} new bundles")
                
            except Exception as e:
                logger.error(f"Error in bundle matching: {e}")
                await asyncio.sleep(5)  # Wait before retrying
    
    def _normalize_flight(self, raw_flight: Dict) -> Optional[Dict]:
        """
        Normalize raw flight data to standard format
        
        Args:
            raw_flight: Raw flight data from Kaggle dataset
        
        Returns:
            Normalized flight dict or None if invalid
        """
        try:
            # Extract and validate required fields
            normalized = {
                "id": raw_flight.get("id") or raw_flight.get("flight_id"),
                "origin": raw_flight.get("startingAirport", ""),
                "destination": raw_flight.get("destinationAirport", ""),
                "departure_date": raw_flight.get("travelDate", ""),
                "airline": raw_flight.get("segmentsAirlineName", ""),
                "duration_hours": self._parse_duration(raw_flight.get("totalTravelDistance")),
                "price": float(raw_flight.get("totalFare", 0)),
                "stops": raw_flight.get("segmentsCabinCode", "").count("|") + 1,
                "cabin_class": raw_flight.get("segmentsCabinCode", "coach").split("|")[0].lower(),
                "seats_available": raw_flight.get("seatsRemaining", 10),
                "raw_data": raw_flight,
                "processed_at": datetime.now().isoformat()
            }
            
            # Validation
            if not all([
                normalized["id"],
                normalized["origin"],
                normalized["destination"],
                normalized["price"] > 0
            ]):
                logger.warning(f"Invalid flight data: {raw_flight}")
                return None
            
            return normalized
            
        except Exception as e:
            logger.error(f"Error normalizing flight: {e}")
            return None
    
    def _normalize_hotel(self, raw_hotel: Dict) -> Optional[Dict]:
        """
        Normalize raw hotel data to standard format
        
        Args:
            raw_hotel: Raw hotel data from Kaggle dataset
        
        Returns:
            Normalized hotel dict or None if invalid
        """
        try:
            # Extract and validate required fields
            normalized = {
                "id": raw_hotel.get("id") or raw_hotel.get("hotel_id"),
                "name": raw_hotel.get("name", ""),
                "location": raw_hotel.get("city", ""),
                "star_rating": float(raw_hotel.get("stars", 3)),
                "price_per_night": float(raw_hotel.get("price", 0)),
                "amenities": raw_hotel.get("amenities", []),
                "guest_rating": float(raw_hotel.get("rating", 0)),
                "availability_start": raw_hotel.get("check_in", ""),
                "availability_end": raw_hotel.get("check_out", ""),
                "room_type": raw_hotel.get("room_type", "standard"),
                "raw_data": raw_hotel,
                "processed_at": datetime.now().isoformat()
            }
            
            # Validation
            if not all([
                normalized["id"],
                normalized["name"],
                normalized["location"],
                normalized["price_per_night"] > 0
            ]):
                logger.warning(f"Invalid hotel data: {raw_hotel}")
                return None
            
            return normalized
            
        except Exception as e:
            logger.error(f"Error normalizing hotel: {e}")
            return None
    
    async def _score_flight(self, flight: Dict) -> Dict:
        """
        Score a flight deal
        
        Args:
            flight: Normalized flight data
        
        Returns:
            Flight with added score and tags
        """
        try:
            # Calculate deal score
            score = self.deal_scorer.score_flight(flight)
            
            # Add tags
            tags = self._generate_flight_tags(flight, score)
            
            # Add to flight
            flight["score"] = score
            flight["tags"] = tags
            flight["scored_at"] = datetime.now().isoformat()
            
            return flight
            
        except Exception as e:
            logger.error(f"Error scoring flight: {e}")
            flight["score"] = 50.0  # Default neutral score
            flight["tags"] = []
            return flight
    
    async def _score_hotel(self, hotel: Dict) -> Dict:
        """
        Score a hotel deal
        
        Args:
            hotel: Normalized hotel data
        
        Returns:
            Hotel with added score and tags
        """
        try:
            # Calculate deal score
            score = self.deal_scorer.score_hotel(hotel)
            
            # Add tags
            tags = self._generate_hotel_tags(hotel, score)
            
            # Add to hotel
            hotel["score"] = score
            hotel["tags"] = tags
            hotel["scored_at"] = datetime.now().isoformat()
            
            return hotel
            
        except Exception as e:
            logger.error(f"Error scoring hotel: {e}")
            hotel["score"] = 50.0  # Default neutral score
            hotel["tags"] = []
            return hotel
    
    async def _match_bundles(self) -> List[Dict]:
        """
        Match flights and hotels into bundles
        
        Returns:
            List of new bundles
        """
        try:
            # Get lists of flights and hotels
            flights = list(self.processed_flights.values())
            hotels = list(self.processed_hotels.values())
            
            # Match bundles
            new_bundles = self.bundle_matcher.match_bundles(flights, hotels)
            
            # Add to stored bundles
            self.bundles.extend(new_bundles)
            
            return new_bundles
            
        except Exception as e:
            logger.error(f"Error matching bundles: {e}")
            return []
    
    def _generate_flight_tags(self, flight: Dict, score: float) -> List[str]:
        """
        Generate descriptive tags for a flight
        
        Args:
            flight: Flight data
            score: Deal score
        
        Returns:
            List of tags
        """
        tags = []
        
        # Deal quality tags
        if score >= 80:
            tags.append("excellent_deal")
        elif score >= 60:
            tags.append("good_deal")
        
        # Flight characteristics
        if flight["stops"] == 0:
            tags.append("nonstop")
        elif flight["stops"] == 1:
            tags.append("one_stop")
        else:
            tags.append("multi_stop")
        
        # Cabin class
        if "first" in flight["cabin_class"].lower():
            tags.append("first_class")
        elif "business" in flight["cabin_class"].lower():
            tags.append("business_class")
        else:
            tags.append("economy")
        
        # Duration
        if flight["duration_hours"] < 3:
            tags.append("short_flight")
        elif flight["duration_hours"] > 10:
            tags.append("long_flight")
        
        # Availability
        if flight["seats_available"] < 5:
            tags.append("limited_seats")
        
        return tags
    
    def _generate_hotel_tags(self, hotel: Dict, score: float) -> List[str]:
        """
        Generate descriptive tags for a hotel
        
        Args:
            hotel: Hotel data
            score: Deal score
        
        Returns:
            List of tags
        """
        tags = []
        
        # Deal quality tags
        if score >= 80:
            tags.append("excellent_deal")
        elif score >= 60:
            tags.append("good_deal")
        
        # Star rating
        if hotel["star_rating"] >= 4.5:
            tags.append("luxury")
        elif hotel["star_rating"] >= 3.5:
            tags.append("upscale")
        else:
            tags.append("budget_friendly")
        
        # Guest rating
        if hotel["guest_rating"] >= 4.5:
            tags.append("highly_rated")
        elif hotel["guest_rating"] < 3:
            tags.append("mixed_reviews")
        
        # Amenities
        amenities = [a.lower() for a in hotel.get("amenities", [])]
        if "pool" in amenities:
            tags.append("has_pool")
        if "gym" in amenities or "fitness" in amenities:
            tags.append("has_gym")
        if "spa" in amenities:
            tags.append("has_spa")
        if "parking" in amenities:
            tags.append("has_parking")
        
        return tags
    
    def _parse_duration(self, distance_str: str) -> float:
        """
        Parse travel distance/duration string to hours
        
        Args:
            distance_str: Distance string from dataset
        
        Returns:
            Duration in hours (estimated)
        """
        try:
            # Assuming average flight speed of 500 mph
            # Parse distance and convert to hours
            if not distance_str:
                return 2.0  # Default
            
            distance = float(distance_str.replace(",", ""))
            hours = distance / 500.0
            
            return round(hours, 1)
            
        except:
            return 2.0  # Default
    
    async def get_recommendations(
        self,
        user_query: str,
        user_preferences: Optional[Dict] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Get personalized recommendations based on user query
        This is called by the Concierge Agent or API
        
        Args:
            user_query: Natural language query
            user_preferences: User preference dict (optional)
            limit: Max number of recommendations
        
        Returns:
            Dict with recommendations
        """
        try:
            # Check cache first
            cache_key = f"recommendations:{user_query}"
            cached_result = await self.cache.get(cache_key)
            
            if cached_result:
                logger.info("Cache hit for recommendations")
                return cached_result
            
            # Parse intent from query
            intent = await self.intent_parser.parse(user_query)
            
            # Get relevant bundles
            filtered_bundles = self._filter_bundles_by_intent(intent, user_preferences)
            
            # Score bundles for fit
            scored_bundles = []
            for bundle in filtered_bundles[:limit * 2]:  # Get more, then trim
                fit_score = self.fit_scorer.score_bundle(
                    bundle,
                    user_preferences or {},
                    intent
                )
                bundle_with_fit = {**bundle, "fit_score": fit_score}
                scored_bundles.append(bundle_with_fit)
            
            # Sort by fit score and take top N
            scored_bundles.sort(key=lambda x: x["fit_score"], reverse=True)
            top_bundles = scored_bundles[:limit]
            
            # Generate explanations
            recommendations = []
            for bundle in top_bundles:
                explanation = await self.explainer.explain(bundle, user_query)
                recommendations.append({
                    "bundle": bundle,
                    "explanation": explanation,
                    "fit_score": bundle["fit_score"]
                })
            
            result = {
                "query": user_query,
                "intent": intent,
                "recommendations": recommendations,
                "count": len(recommendations),
                "generated_at": datetime.now().isoformat()
            }
            
            # Cache result
            await self.cache.set(cache_key, result)
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            return {
                "query": user_query,
                "recommendations": [],
                "error": str(e)
            }
    
    def _filter_bundles_by_intent(
        self,
        intent: Dict,
        user_preferences: Optional[Dict]
    ) -> List[Dict]:
        """
        Filter bundles based on parsed intent and preferences
        
        Args:
            intent: Parsed intent from query
            user_preferences: User preferences
        
        Returns:
            Filtered list of bundles
        """
        filtered = []
        
        for bundle in self.bundles:
            # Check destination match
            if intent.get("destination"):
                dest = intent["destination"].lower()
                flight_dest = bundle["flight"]["destination"].lower()
                hotel_loc = bundle["hotel"]["location"].lower()
                
                if dest not in flight_dest and dest not in hotel_loc:
                    continue
            
            # Check date range
            if intent.get("dates"):
                # Add date filtering logic here
                pass
            
            # Check budget
            if user_preferences and user_preferences.get("budget"):
                total_price = bundle["total_price"]
                budget_category = user_preferences["budget"]
                
                if budget_category == "budget" and total_price > 1000:
                    continue
                elif budget_category == "luxury" and total_price < 1000:
                    continue
            
            # Check score threshold
            if bundle.get("score", 0) >= 40:  # Minimum quality threshold
                filtered.append(bundle)
        
        return filtered


# Singleton instance
_deals_agent_instance: Optional[DealsAgent] = None


def get_deals_agent() -> DealsAgent:
    """
    Get singleton instance of DealsAgent
    """
    global _deals_agent_instance
    if _deals_agent_instance is None:
        _deals_agent_instance = DealsAgent()
    return _deals_agent_instance
