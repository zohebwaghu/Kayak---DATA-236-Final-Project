# agents/deals_agent_runner.py
"""
Deals Agent Background Runner
Runs the Kafka pipeline for deal processing:
1. Consume from raw_supplier_feeds
2. Normalize data
3. Score deals
4. Tag deals
5. Emit events

This implements the Deals Agent (backend worker) requirements.
"""

import os
import asyncio
import json
from datetime import datetime
from typing import Dict, Any, Optional, List
from loguru import logger

# Import existing kafka client
try:
    from kafka_client.kafka_producer import KafkaProducerWrapper
    from kafka_client.kafka_consumer import KafkaConsumerWrapper
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.warning("Kafka client not available")

# Import algorithms
try:
    from algorithms.deal_scorer import calculate_deal_score, get_deal_quality
except ImportError:
    logger.warning("deal_scorer not available, using mock")
    def calculate_deal_score(current_price, avg_30d_price, availability=10, rating=4.0, has_promotion=False):
        if avg_30d_price <= 0:
            return 50
        discount = (avg_30d_price - current_price) / avg_30d_price
        return min(100, max(0, int(discount * 100 + 50)))
    def get_deal_quality(score):
        if score >= 80: return "excellent"
        if score >= 60: return "great"
        if score >= 40: return "good"
        return "fair"

# Import cache
try:
    from interfaces.deals_cache import deals_cache, Deal
except ImportError:
    deals_cache = None
    logger.warning("deals_cache not available")

# Import price history for recording observations
try:
    from models.deals_entities import record_price_observation
    PRICE_HISTORY_AVAILABLE = True
except ImportError:
    PRICE_HISTORY_AVAILABLE = False
    record_price_observation = None

# Import watch store for triggering alerts
try:
    from api.watches import watch_store
except ImportError:
    watch_store = None

# Import events manager for WebSocket push
try:
    from api.events_websocket import events_manager
except ImportError:
    events_manager = None

# FIX 2 & 5: Import SQLModel for direct database ingestion and persistence
try:
    from sqlmodel import Session, select
    from models.database import get_engine
    from models.deals_entities import FlightDeal, HotelDeal
    SQLMODEL_AVAILABLE = True
except ImportError:
    SQLMODEL_AVAILABLE = False
    logger.warning("SQLModel not available for persistence")

import random  # For Fix 6: price mutation


# Topic names from environment
KAFKA_RAW_TOPIC = os.getenv("KAFKA_DEALS_RAW_TOPIC", "raw_supplier_feeds")
KAFKA_NORMALIZED_TOPIC = os.getenv("KAFKA_DEALS_NORMALIZED_TOPIC", "deals.normalized")
KAFKA_SCORED_TOPIC = os.getenv("KAFKA_DEALS_SCORED_TOPIC", "deals.scored")
KAFKA_TAGGED_TOPIC = os.getenv("KAFKA_DEALS_TAGGED_TOPIC", "deals.tagged")
KAFKA_EVENTS_TOPIC = os.getenv("KAFKA_DEAL_EVENTS_TOPIC", "deal.events")

# Scheduler settings
SCAN_INTERVAL_SECONDS = int(os.getenv("DEALS_SCAN_INTERVAL", "300"))  # Default: 5 minutes


class DealsAgentRunner:
    """
    Background runner for the Deals Agent pipeline.
    Processes deals through: normalize -> score -> tag -> emit
    """
    
    def __init__(self):
        self.producer: Optional[KafkaProducerWrapper] = None
        self.consumer: Optional[KafkaConsumerWrapper] = None
        self.running = False
        self._tasks: List[asyncio.Task] = []
        
        # Deal detection rules
        self.rules = {
            "price_drop_threshold": 0.15,  # 15% below average
            "low_inventory_threshold": 5,   # Less than 5 available
            "high_score_threshold": 70      # Score >= 70 is a deal
        }
        
        # Tag mappings from amenities
        self.amenity_tags = {
            "pet": "pet-friendly",
            "dog": "pet-friendly",
            "cat": "pet-friendly",
            "parking": "parking",
            "wifi": "wifi",
            "breakfast": "breakfast",
            "pool": "pool",
            "gym": "gym",
            "spa": "spa",
            "beach": "beach",
            "refund": "refundable",
            "cancel": "refundable",
            # Near transit keywords (Assignment requirement)
            "transit": "near-transit",
            "subway": "near-transit",
            "metro": "near-transit",
            "train": "near-transit",
            "bus": "near-transit",
            "station": "near-transit",
            "airport shuttle": "near-transit"
        }
    
    async def start(self):
        """Start the Deals Agent"""
        # FIX 7: Graceful degradation when Kafka unavailable
        if not KAFKA_AVAILABLE:
            logger.warning("Kafka not available - Deals Agent running in SQLite-only mode")
            logger.warning("Deals will be processed from database only, no real-time Kafka feeds")
            self.running = True
            # Only run scheduled scan loop (no Kafka consumer)
            self._tasks.append(asyncio.create_task(self._scheduled_scan_loop()))
            logger.info(f"Deals Agent started in fallback mode (scan interval: {SCAN_INTERVAL_SECONDS}s)")
            return

        try:
            # Initialize producer
            self.producer = KafkaProducerWrapper(client_id="deals-agent-producer")
            await self.producer.start()

            # Initialize consumer for raw feeds
            self.consumer = KafkaConsumerWrapper(
                topics=[KAFKA_RAW_TOPIC],
                group_id="deals-agent-processor"
            )
            await self.consumer.start()

            self.running = True

            # Start processing loop (reactive - Kafka messages)
            self._tasks.append(asyncio.create_task(self._process_loop()))

            # Start scheduled scan loop (proactive - periodic scans)
            self._tasks.append(asyncio.create_task(self._scheduled_scan_loop()))

            logger.info(f"Deals Agent started (scan interval: {SCAN_INTERVAL_SECONDS}s)")

        except Exception as e:
            logger.error(f"Failed to start Deals Agent: {e}")
            self.running = False
    
    async def stop(self):
        """Stop the Deals Agent"""
        self.running = False
        
        # Cancel tasks
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        self._tasks = []
        
        # Stop producer/consumer
        if self.producer:
            await self.producer.stop()
        if self.consumer:
            await self.consumer.stop()
        
        logger.info("Deals Agent stopped")
    
    async def _process_loop(self):
        """Main processing loop"""
        logger.info("Deals Agent processing loop started")
        
        while self.running:
            try:
                if self.consumer:
                    # Consume messages
                    messages = await self.consumer.consume_batch(max_records=10, timeout_ms=1000)
                    
                    for message in messages:
                        await self._process_message(message)
                else:
                    # Mock mode - just wait
                    await asyncio.sleep(5)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                await asyncio.sleep(1)
    
    async def _scheduled_scan_loop(self):
        """
        Scheduled scan loop for proactive deal discovery.
        Runs periodically to re-score existing deals and discover new ones.
        FIX 2: Also ingests data from SQLite directly.
        """
        logger.info(f"Scheduled scan loop started (interval: {SCAN_INTERVAL_SECONDS}s)")

        # Initial delay to let system stabilize
        await asyncio.sleep(10)

        while self.running:
            try:
                # FIX 2: Ingest data from SQLite (replaces missing Kafka CSV feed)
                logger.info("Ingesting data from SQLite...")
                await self._ingest_sqlite_data()

                logger.info("Running scheduled deal scan...")
                await self._run_scheduled_scan()
                logger.info(f"Scheduled scan complete. Next scan in {SCAN_INTERVAL_SECONDS}s")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduled scan: {e}")

            # Wait for next scan interval
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)

    async def _run_scheduled_scan(self):
        """
        Run a scheduled scan of deals in the database.
        Re-scores existing deals and checks for price changes.
        """
        if not deals_cache:
            logger.warning("Deals cache not available for scheduled scan")
            return

        try:
            # Get all deals from cache
            all_deals = deals_cache.get_all_deals()
            logger.info(f"Scanning {len(all_deals)} deals in cache")

            rescore_count = 0
            price_change_count = 0

            for deal in all_deals:
                # FIX 6: Simulate minor price fluctuations to trigger watches
                # This simulates real market behavior where prices change slightly
                price_variation = random.uniform(-0.05, 0.05)  # +/- 5%
                old_price = deal.current_price
                new_price = old_price * (1 + price_variation)

                # Only apply if there's a meaningful change (>1%)
                if abs(price_variation) > 0.01:
                    deal.current_price = round(new_price, 2)
                    price_change_count += 1
                    logger.debug(f"Price mutation: {deal.deal_id} ${old_price:.2f} -> ${deal.current_price:.2f}")

                # Re-score each deal
                normalized = {
                    "deal_id": deal.deal_id,
                    "listing_type": deal.listing_type,
                    "listing_id": deal.listing_id,
                    "name": deal.name,
                    "destination": deal.destination,
                    "origin": deal.origin,
                    "current_price": deal.current_price,
                    "avg_30d_price": deal.avg_30d_price,
                    "original_price": deal.original_price,
                    "availability": deal.availability,
                    "rating": deal.metadata.get("rating", 4.0) if deal.metadata else 4.0,
                    "amenities": deal.metadata.get("amenities", []) if deal.metadata else [],
                    "metadata": deal.metadata or {}
                }

                # Re-score
                scored = self._score(normalized)
                tagged = self._tag(scored)

                # Check if score changed significantly
                if abs(tagged["deal_score"] - deal.deal_score) >= 5:
                    rescore_count += 1
                    logger.debug(f"Deal {deal.deal_id}: score {deal.deal_score} -> {tagged['deal_score']}")

                    # Update cache
                    deal.deal_score = tagged["deal_score"]
                    deal.tags = tagged["tags"]
                    deals_cache.add_deal(deal)

                    # Check watches for this deal
                    await self._check_watches(tagged)

                    # Emit event if now a high-score deal
                    if tagged["deal_score"] >= self.rules["high_score_threshold"]:
                        await self._emit_deal_event(tagged)

            logger.info(f"Scheduled scan: {rescore_count} deals rescored, {price_change_count} price changes")

        except Exception as e:
            logger.error(f"Error running scheduled scan: {e}")

    async def _ingest_sqlite_data(self):
        """
        FIX 2: Ingest data from SQLite tables directly.
        This replaces the missing Kafka CSV feed functionality.
        Reads FlightDeal and HotelDeal tables and processes them as if from Kafka.
        """
        if not SQLMODEL_AVAILABLE:
            logger.debug("SQLModel not available, skipping SQLite ingestion")
            return

        try:
            engine = get_engine()
            ingested_count = 0

            with Session(engine) as session:
                # Ingest flights (limit to avoid overwhelming on first run)
                flights = session.exec(select(FlightDeal).limit(500)).all()
                for flight in flights:
                    # Check if already in cache
                    if deals_cache and deals_cache.get_deal(flight.flight_id):
                        continue  # Already processed

                    message = {
                        "listing_type": "flight",
                        "source": "sqlite",
                        "data": {
                            "id": flight.flight_id,
                            "flight_id": flight.flight_id,
                            "origin": flight.origin,
                            "destination": flight.destination,
                            "airline": flight.airline,
                            "price": flight.price,
                            "avg_30d_price": flight.avg_30d_price,
                            "availability": flight.available_seats,
                            "rating": flight.rating,
                            "stops": flight.stops,
                            "duration": flight.duration,
                            "flight_class": flight.flight_class,
                            "name": f"{flight.airline} {flight.origin}->{flight.destination}"
                        }
                    }
                    await self._process_message(message)
                    ingested_count += 1

                # Ingest hotels (limit to avoid overwhelming on first run)
                hotels = session.exec(select(HotelDeal).limit(500)).all()
                for hotel in hotels:
                    # Check if already in cache
                    if deals_cache and deals_cache.get_deal(hotel.hotel_id):
                        continue  # Already processed

                    message = {
                        "listing_type": "hotel",
                        "source": "sqlite",
                        "data": {
                            "id": hotel.hotel_id,
                            "hotel_id": hotel.hotel_id,
                            "name": hotel.name,
                            "city": hotel.city,
                            "price": hotel.price_per_night,
                            "avg_30d_price": hotel.avg_30d_price,
                            "availability": hotel.available_rooms,
                            "rating": hotel.rating,
                            "star_rating": hotel.star_rating,
                            "neighbourhood": hotel.neighbourhood,
                            "pet_friendly": hotel.pet_friendly,
                            "near_transit": hotel.near_transit,
                            "breakfast_included": hotel.breakfast_included,
                            "is_refundable": hotel.is_refundable,
                            "parking_available": hotel.parking_available
                        }
                    }
                    await self._process_message(message)
                    ingested_count += 1

            if ingested_count > 0:
                logger.info(f"Ingested {ingested_count} new records from SQLite")

        except Exception as e:
            logger.error(f"Error ingesting SQLite data: {e}")

    def _persist_deal_to_sqlite(self, tagged: Dict[str, Any]):
        """
        FIX 5: Persist processed deal back to SQLite.
        Updates the deal score and tags in the original FlightDeal/HotelDeal tables.
        """
        if not SQLMODEL_AVAILABLE:
            return

        try:
            engine = get_engine()
            listing_type = tagged.get("listing_type")
            listing_id = tagged.get("listing_id", tagged["deal_id"])

            with Session(engine) as session:
                if listing_type == "flight":
                    flight = session.exec(
                        select(FlightDeal).where(FlightDeal.flight_id == listing_id)
                    ).first()
                    if flight:
                        flight.deal_score = tagged["deal_score"]
                        flight.tags = str(tagged["tags"])
                        flight.updated_at = datetime.utcnow()
                        session.add(flight)
                        session.commit()
                elif listing_type == "hotel":
                    hotel = session.exec(
                        select(HotelDeal).where(HotelDeal.hotel_id == listing_id)
                    ).first()
                    if hotel:
                        hotel.deal_score = tagged["deal_score"]
                        hotel.tags = str(tagged["tags"])
                        hotel.updated_at = datetime.utcnow()
                        session.add(hotel)
                        session.commit()
        except Exception as e:
            logger.debug(f"Failed to persist deal to SQLite: {e}")

    async def _process_message(self, message: Dict[str, Any]):
        """Process a single raw feed message"""
        try:
            # Step 1: Normalize
            normalized = self._normalize(message)
            if not normalized:
                return
            
            # Send to normalized topic
            if self.producer:
                await self.producer.send(KAFKA_NORMALIZED_TOPIC, normalized, key=normalized.get("deal_id"))
            
            # Step 2: Score
            scored = self._score(normalized)
            
            # Send to scored topic
            if self.producer:
                await self.producer.send_scored_deal(
                    key=scored["deal_id"],
                    score=scored["deal_score"],
                    reason=scored.get("score_reason", ""),
                    attrs=scored
                )
            
            # Step 3: Tag
            tagged = self._tag(scored)
            
            # Send to tagged topic
            if self.producer:
                await self.producer.send_tagged_deal(
                    key=tagged["deal_id"],
                    tags=tagged["tags"],
                    attrs=tagged
                )
            
            # Step 4: Check if it's a deal and emit event
            if tagged["deal_score"] >= self.rules["high_score_threshold"]:
                await self._emit_deal_event(tagged)
            
            # Step 5: Update cache
            if deals_cache:
                deal = Deal(
                    deal_id=tagged["deal_id"],
                    listing_type=tagged["listing_type"],
                    listing_id=tagged.get("listing_id", tagged["deal_id"]),
                    name=tagged["name"],
                    destination=tagged.get("destination", ""),
                    origin=tagged.get("origin"),
                    current_price=tagged["current_price"],
                    original_price=tagged.get("original_price", tagged["current_price"]),
                    avg_30d_price=tagged.get("avg_30d_price", tagged["current_price"]),
                    discount_percent=tagged.get("discount_percent", 0),
                    availability=tagged.get("availability", 10),
                    deal_score=tagged["deal_score"],
                    tags=tagged["tags"],
                    discovered_at=datetime.utcnow().isoformat(),
                    metadata=tagged.get("metadata", {})
                )
                deals_cache.add_deal(deal)

            # FIX 5: Persist deal back to SQLite
            self._persist_deal_to_sqlite(tagged)

            # Step 6: Check watches and trigger alerts
            await self._check_watches(tagged)

            # Step 7: Record price observation for historical tracking
            if PRICE_HISTORY_AVAILABLE and record_price_observation:
                try:
                    record_price_observation(
                        listing_id=tagged["deal_id"],
                        listing_type=tagged["listing_type"],
                        price=tagged["current_price"],
                        source="deals_agent"
                    )
                except Exception as e:
                    logger.debug(f"Failed to record price observation: {e}")

            logger.debug(f"Processed deal: {tagged['deal_id']} score={tagged['deal_score']}")
            
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    def _normalize(self, raw_message: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Normalize raw feed data.
        Standardizes currency, dates, field names.
        """
        try:
            data = raw_message.get("data", raw_message)
            listing_type = raw_message.get("listing_type", "hotel")
            
            # Generate deal ID
            deal_id = data.get("id") or data.get("listing_id") or data.get("flight_id") or data.get("hotel_id")
            if not deal_id:
                deal_id = f"{listing_type}_{datetime.utcnow().timestamp()}"
            
            normalized = {
                "deal_id": str(deal_id),
                "listing_type": listing_type,
                "listing_id": str(deal_id),
                "source": raw_message.get("source", "unknown"),
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Normalize price fields
            price_fields = ["price", "current_price", "pricePerNight", "price_per_night", "ticketPrice"]
            for field in price_fields:
                if field in data:
                    normalized["current_price"] = float(data[field])
                    break
            else:
                normalized["current_price"] = 0
            
            # Average price
            avg_fields = ["avg_30d_price", "average_price", "avgPrice"]
            for field in avg_fields:
                if field in data:
                    normalized["avg_30d_price"] = float(data[field])
                    break
            else:
                normalized["avg_30d_price"] = normalized["current_price"] * 1.15  # Assume 15% higher
            
            # Original price
            orig_fields = ["original_price", "originalPrice", "listPrice"]
            for field in orig_fields:
                if field in data:
                    normalized["original_price"] = float(data[field])
                    break
            else:
                normalized["original_price"] = normalized["avg_30d_price"]
            
            # Availability
            avail_fields = ["availability", "rooms_left", "seats_left", "stock"]
            for field in avail_fields:
                if field in data:
                    normalized["availability"] = int(data[field])
                    break
            else:
                normalized["availability"] = 10
            
            # Name
            name_fields = ["name", "hotelName", "hotel_name", "airline", "title"]
            for field in name_fields:
                if field in data:
                    normalized["name"] = data[field]
                    break
            else:
                normalized["name"] = f"Deal {deal_id}"
            
            # Location
            if listing_type == "flight":
                normalized["origin"] = data.get("origin", data.get("departure_airport", ""))
                normalized["destination"] = data.get("destination", data.get("arrival_airport", ""))
            else:
                normalized["destination"] = data.get("city", data.get("location", ""))
                normalized["origin"] = None
            
            # Rating
            rating_fields = ["rating", "starRating", "star_rating", "score"]
            for field in rating_fields:
                if field in data:
                    normalized["rating"] = float(data[field])
                    break
            else:
                normalized["rating"] = 4.0
            
            # Amenities (for tagging)
            normalized["amenities"] = data.get("amenities", [])
            if isinstance(normalized["amenities"], str):
                normalized["amenities"] = [a.strip() for a in normalized["amenities"].split(",")]
            
            # Keep original metadata
            normalized["metadata"] = {
                k: v for k, v in data.items() 
                if k not in ["id", "price", "name"]
            }
            
            return normalized
            
        except Exception as e:
            logger.error(f"Error normalizing message: {e}")
            return None
    
    def _score(self, normalized: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score a normalized deal.
        Applies scoring rules: price drop, scarcity, rating, promotion.
        """
        current_price = normalized.get("current_price", 0)
        avg_price = normalized.get("avg_30d_price", current_price)
        availability = normalized.get("availability", 10)
        rating = normalized.get("rating", 4.0)
        
        # Check for promotion (price significantly below original)
        original_price = normalized.get("original_price", avg_price)
        has_promotion = current_price < original_price * 0.9
        
        # Calculate score
        score_result = calculate_deal_score(
            current_price=current_price,
            avg_30d_price=avg_price,
            availability=availability,
            rating=rating,
            has_promotion=has_promotion
        )
        
        # Handle both int (mock) and DealScoreBreakdown (real)
        if hasattr(score_result, "total_score"):
            score = score_result.total_score
        else:
            score = score_result
        
        # Calculate discount percent
        discount_percent = 0
        if original_price > 0:
            discount_percent = ((original_price - current_price) / original_price) * 100
        
        # Build score reason
        reasons = []
        if avg_price > 0 and current_price < avg_price * 0.85:
            reasons.append(f"{int((1 - current_price/avg_price) * 100)}% below average")
        if availability <= self.rules["low_inventory_threshold"]:
            reasons.append(f"Only {availability} left")
        if rating >= 4.5:
            reasons.append(f"{rating} rating")
        if has_promotion:
            reasons.append("Limited-time offer")
        
        scored = {
            **normalized,
            "deal_score": score,
            "deal_quality": get_deal_quality(score),
            "discount_percent": discount_percent,
            "is_deal": score >= self.rules["high_score_threshold"],
            "score_reason": ", ".join(reasons) if reasons else "Standard pricing"
        }
        
        return scored
    
    def _tag(self, scored: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tag a scored deal.
        Adds tags based on amenities and deal characteristics.
        """
        tags = []
        
        # Tag based on amenities
        amenities = scored.get("amenities", [])
        amenities_lower = " ".join(amenities).lower() if amenities else ""
        
        for keyword, tag in self.amenity_tags.items():
            if keyword in amenities_lower and tag not in tags:
                tags.append(tag)
        
        # Tag based on deal quality
        if scored["deal_score"] >= 80:
            tags.append("excellent-deal")
        elif scored["deal_score"] >= 60:
            tags.append("great-deal")
        
        # Tag based on availability
        if scored.get("availability", 10) <= self.rules["low_inventory_threshold"]:
            tags.append("limited-availability")
        
        # Tag based on listing type specifics
        if scored.get("listing_type") == "flight":
            if scored.get("metadata", {}).get("stops", 1) == 0:
                tags.append("direct-flight")
            if scored.get("metadata", {}).get("flight_class") == "Business":
                tags.append("business-class")

        # Hotel-specific tagging (Assignment requirement: near-transit)
        if scored.get("listing_type") == "hotel":
            metadata = scored.get("metadata", {})

            # Check for explicit near_transit flag (from SQLModel)
            if metadata.get("near_transit") and "near-transit" not in tags:
                tags.append("near-transit")

            # Check for pet-friendly flag
            if metadata.get("pet_friendly") and "pet-friendly" not in tags:
                tags.append("pet-friendly")

            # Check for breakfast
            if metadata.get("breakfast_included") and "breakfast" not in tags:
                tags.append("breakfast")

            # Check for refundable
            if metadata.get("is_refundable") and "refundable" not in tags:
                tags.append("refundable")

            # Check for parking
            if metadata.get("parking_available") and "parking" not in tags:
                tags.append("parking")

        tagged = {
            **scored,
            "tags": tags
        }

        return tagged
    
    async def _emit_deal_event(self, tagged: Dict[str, Any]):
        """Emit a deal event for downstream consumers"""
        event = {
            "event_type": "deal_found",
            "deal_id": tagged["deal_id"],
            "listing_type": tagged["listing_type"],
            "name": tagged["name"],
            "destination": tagged.get("destination", ""),
            "current_price": tagged["current_price"],
            "deal_score": tagged["deal_score"],
            "tags": tagged["tags"],
            "message": f"New deal: {tagged['name']} - Score {tagged['deal_score']}",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        if self.producer:
            await self.producer.send_deal_event(
                key=tagged["deal_id"],
                event_type="deal_found",
                payload=event,
                score=tagged["deal_score"],
                tags=tagged["tags"]
            )
        
        # Also broadcast via WebSocket if available
        if events_manager:
            await events_manager.broadcast_deal(event)
    
    async def _check_watches(self, tagged: Dict[str, Any]):
        """Check if any watches should be triggered"""
        if not watch_store:
            return
        
        listing_id = tagged.get("listing_id", tagged["deal_id"])
        new_price = tagged.get("current_price")
        new_inventory = tagged.get("availability")
        
        # Check and trigger watches
        triggered = watch_store.check_and_trigger(
            listing_id=listing_id,
            new_price=new_price,
            new_inventory=new_inventory
        )
        
        # Push notifications for triggered watches
        if triggered and events_manager:
            for event in triggered:
                await events_manager.send_watch_triggered(
                    user_id=event.user_id,
                    watch_event=event.model_dump()
                )
    
    async def process_csv_feed(self, csv_data: List[Dict[str, Any]], 
                               listing_type: str, source: str = "csv"):
        """
        Process a CSV feed directly (for scheduled scans).
        Called by scheduler or API endpoint.
        """
        logger.info(f"Processing CSV feed: {len(csv_data)} records, type={listing_type}")
        
        for row in csv_data:
            message = {
                "feed_id": f"csv_{datetime.utcnow().timestamp()}",
                "source": source,
                "listing_type": listing_type,
                "data": row,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            await self._process_message(message)
        
        logger.info(f"Processed {len(csv_data)} records from CSV feed")


# ============================================
# Global Instance
# ============================================

deals_agent = DealsAgentRunner()


# ============================================
# Lifecycle Functions
# ============================================

async def start_deals_agent():
    """Start the deals agent (call on app startup)"""
    await deals_agent.start()


async def stop_deals_agent():
    """Stop the deals agent (call on app shutdown)"""
    await deals_agent.stop()
