# agents/concierge_agent.py
"""
Concierge Agent - AI Travel Assistant

Multi-agent travel concierge that:
- Understands intent & constraints via LLM tool calling
- Finds flight+hotel bundles from cached deals
- Explains recommendations with facts
- Sets price/inventory watches
- Answers policy questions

Supports both OpenAI and Ollama with unified tool definitions.
"""

import os
import json
import uuid
import httpx
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from loguru import logger

# ============================================
# LLM Configuration
# ============================================

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

# Try to import OpenAI
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

# Try to import Ollama
try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False

# Prefer OpenAI, fallback to Ollama
USE_OPENAI = OPENAI_AVAILABLE and OPENAI_API_KEY

# ============================================
# Import internal modules
# ============================================

try:
    from interfaces.session_store import session_store
except ImportError:
    session_store = None

try:
    from interfaces.deals_cache import deals_cache
except ImportError:
    deals_cache = None

try:
    from api.watches import watch_store
except ImportError:
    watch_store = None

try:
    from interfaces.policy_store import answer_policy_question, policy_store
except ImportError:
    answer_policy_question = None
    policy_store = None

# Import AirportLookup utility (direct import to avoid utils.__init__ issues)
try:
    import importlib.util
    import os
    # Direct import without going through utils.__init__.py
    airport_lookup_path = os.path.join(os.path.dirname(__file__), '..', 'utils', 'airport_lookup.py')
    spec = importlib.util.spec_from_file_location("airport_lookup", airport_lookup_path)
    airport_lookup_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(airport_lookup_module)
    get_airport_lookup = airport_lookup_module.get_airport_lookup
    AIRPORT_LOOKUP_AVAILABLE = True
except (ImportError, Exception) as e:
    AIRPORT_LOOKUP_AVAILABLE = False
    logger.warning(f"AirportLookup not available - using hardcoded mappings: {e}")


# ============================================
# Tool Definitions (shared by OpenAI & Ollama)
# ============================================

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_bundles",
            "description": "Search for flight+hotel travel bundles. Use when user wants to find trips, flights, hotels, or travel options. Also use when user provides partial info like 'from Delhi' or 'to Mumbai' to merge with previous context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "Origin airport code (e.g., 'DEL' for Delhi, 'SFO' for San Francisco, 'JFK' for New York). Convert city names to codes."
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination airport code (e.g., 'BOM' for Mumbai, 'MIA' for Miami). Convert city names to codes."
                    },
                    "date_from": {
                        "type": "string",
                        "description": "Departure date in YYYY-MM-DD format. Calculate from relative dates like 'next week', 'December 20'."
                    },
                    "date_to": {
                        "type": "string",
                        "description": "Return date in YYYY-MM-DD format."
                    },
                    "budget": {
                        "type": "number",
                        "description": "Maximum total budget in USD."
                    },
                    "constraints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Travel constraints like 'pet-friendly', 'non-stop', 'refundable', 'breakfast included'."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "price_analyzer",
            "description": "Analyze if a travel deal is good value. Use when user asks 'is this a good deal?', 'worth it?', or wants price comparison.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "Bundle ID to analyze (e.g., 'option_1', 'option_2'). Default to 'option_1' if user says 'this' or 'it'."
                    }
                },
                "required": ["bundle_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "watch_creator",
            "description": "Create a price/inventory alert for a travel bundle. Use when user says 'alert me', 'notify me', 'watch', 'track', or 'let me know if'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "Bundle ID to watch (e.g., 'option_1'). Default to 'option_1'."
                    },
                    "price_threshold": {
                        "type": "number",
                        "description": "Alert when price drops below this amount in USD."
                    },
                    "inventory_threshold": {
                        "type": "integer",
                        "description": "Alert when inventory drops below this number (e.g., rooms or seats)."
                    },
                    "watch_type": {
                        "type": "string",
                        "enum": ["price", "inventory", "both"],
                        "description": "Type of watch: 'price', 'inventory', or 'both'."
                    }
                },
                "required": ["bundle_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "quote_generator",
            "description": "Generate a detailed booking quote with pricing breakdown. Use when user says 'quote', 'book', 'how much total', or wants to proceed with booking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "Bundle ID to quote (e.g., 'option_1')."
                    },
                    "travelers": {
                        "type": "integer",
                        "description": "Number of travelers. Default 1."
                    },
                    "nights": {
                        "type": "integer",
                        "description": "Number of hotel nights. Default 3."
                    }
                },
                "required": ["bundle_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "policy_lookup",
            "description": "Look up travel policies like cancellation, pets, parking, breakfast. Use when user asks about rules, policies, or 'can I...' questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The policy question to answer."
                    }
                },
                "required": ["question"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "booking_confirmer",
            "description": "Confirm and finalize a booking. Use when user says 'yes', 'confirm', 'book it', 'proceed', or agrees to book after seeing a quote.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "Bundle ID to book. Default to 'option_1' or the last quoted bundle."
                    }
                },
                "required": []
            }
        }
    }
]


# ============================================
# MRKL Tools Implementation
# ============================================

class MRKLTools:
    """
    MRKL-style tools for the Concierge Agent.
    Each tool is a callable that returns structured data.
    """
    
    # Class-level cache (shared across instances, keyed by user_id)
    _user_bundles_cache: Dict[str, List[Dict]] = {}
    
    # Class-level cache for last parsed intent (to merge with follow-up responses)
    _user_intent_cache: Dict[str, Dict] = {}
    
    def __init__(self, user_id: str, session_id: str):
        self.user_id = user_id
        self.session_id = session_id
        self._cached_bundles: List[Dict] = []
        self._last_intent: Dict = {}
        
        # Load bundles from class-level cache
        if user_id in MRKLTools._user_bundles_cache:
            self._cached_bundles = MRKLTools._user_bundles_cache[user_id]
            logger.info(f"Loaded {len(self._cached_bundles)} bundles from cache for user {user_id}")
        
        # Load last intent from class-level cache
        if user_id in MRKLTools._user_intent_cache:
            self._last_intent = MRKLTools._user_intent_cache[user_id]
            logger.info(f"Loaded previous intent: origin={self._last_intent.get('origin')}, dest={self._last_intent.get('destination')}")
    
    # ------------------------------------------
    # Tool: search_bundles
    # ------------------------------------------
    async def search_bundles(
        self,
        destination: str = None,
        origin: str = None,
        date_from: str = None,
        date_to: str = None,
        budget: float = None,
        constraints: List[str] = None
    ) -> Dict:
        """Search for flight+hotel bundles with intent merging"""
        logger.info(f"[Tool: search_bundles] origin={origin}, dest={destination}, dates={date_from} to {date_to}, budget={budget}")
        
        # Merge with previous intent (for multi-turn conversations)
        if self._last_intent:
            logger.info(f"Merging with previous intent: {self._last_intent}")
            if not destination and self._last_intent.get("destination"):
                destination = self._last_intent["destination"]
            if not origin and self._last_intent.get("origin"):
                origin = self._last_intent["origin"]
            if not date_from and self._last_intent.get("date_from"):
                date_from = self._last_intent["date_from"]
            if not date_to and self._last_intent.get("date_to"):
                date_to = self._last_intent["date_to"]
            if not budget and self._last_intent.get("budget"):
                budget = self._last_intent["budget"]
            if not constraints and self._last_intent.get("constraints"):
                constraints = self._last_intent["constraints"]
        
        # Save current intent to cache (for next turn)
        current_intent = {
            "destination": destination,
            "origin": origin,
            "date_from": date_from,
            "date_to": date_to,
            "budget": budget,
            "constraints": constraints
        }
        MRKLTools._user_intent_cache[self.user_id] = current_intent
        self._last_intent = current_intent
        
        # Check if destination is still missing (single clarifying question)
        if not destination:
            return {
                "tool": "search_bundles",
                "success": False,
                "needs_clarification": True,
                "message": "Where would you like to travel to? (e.g., Mumbai, Miami, Tokyo)"
            }
        
        # Convert city names to IATA codes using AirportLookup
        airport_lookup = None
        if AIRPORT_LOOKUP_AVAILABLE:
            try:
                airport_lookup = get_airport_lookup()
            except Exception as e:
                logger.warning(f"Failed to get AirportLookup: {e}")
        
        # Convert destination city name to IATA code
        dest_iata = destination
        if airport_lookup and len(destination) != 3:  # Not already an IATA code
            try:
                dest_iata = airport_lookup.city_to_iata(destination)
                if not dest_iata:
                    logger.warning(f"Could not find airport for '{destination}'")
                    # Continue with original destination (might be a valid code already)
                else:
                    logger.info(f"Converted destination '{destination}' → '{dest_iata}'")
                    destination = dest_iata
            except Exception as e:
                logger.warning(f"AirportLookup error for destination '{destination}': {e}")
                # Continue with original destination
        
        # Convert origin city name to IATA code or set smart default
        if not origin:
            if airport_lookup:
                try:
                    # Try to infer from destination region
                    dest_info = airport_lookup.get_airport_info(dest_iata)
                    if dest_info:
                        dest_country = dest_info.get("country", "").lower()
                        # Default origins by region
                        if "india" in dest_country:
                            origin = "DEL"  # Delhi
                        elif "united states" in dest_country or "usa" in dest_country:
                            origin = "SFO"  # San Francisco
                        elif "united kingdom" in dest_country:
                            origin = "JFK"  # New York
                        else:
                            origin = "SFO"  # Default
                    else:
                        origin = "SFO"
                except Exception as e:
                    logger.warning(f"AirportLookup error getting airport info: {e}")
                    origin = "SFO"  # Safe default
            else:
                # Fallback to old hardcoded logic
                india_airports = ["BOM", "DEL", "BLR", "MAA", "CCU", "HYD"]
                origin = "DEL" if dest_iata in india_airports else "SFO"
        elif airport_lookup and len(origin) != 3:  # Not already an IATA code
            try:
                origin_iata = airport_lookup.city_to_iata(origin)
                if origin_iata:
                    logger.info(f"Converted origin '{origin}' → '{origin_iata}'")
                    origin = origin_iata
            except Exception as e:
                logger.warning(f"AirportLookup error for origin '{origin}': {e}")
                # Continue with original origin
        
        # Validate route exists (non-blocking - just log warnings)
        if airport_lookup:
            try:
                if not airport_lookup.validate_route(origin, dest_iata):
                    # Try to find alternatives
                    try:
                        alternatives = airport_lookup.find_alternative_routes(origin, dest_iata, max_stops=1)
                        if alternatives:
                            alt_msg = f"No direct route found from {origin} to {dest_iata}. "
                            connections = [alt.get('connection', '') for alt in alternatives[:3]]
                            alt_msg += f"Alternatives with connections: {', '.join(connections)}"
                            logger.warning(alt_msg)
                        else:
                            logger.warning(f"Route {origin} → {dest_iata} not found in routes database, but continuing search...")
                    except Exception as e:
                        logger.debug(f"Could not find alternative routes: {e}")
            except Exception as e:
                logger.debug(f"Route validation error (non-critical): {e}")
                # Continue anyway - route validation is optional
        
        # Update cache with resolved codes
        current_intent["origin"] = origin
        current_intent["destination"] = dest_iata
        MRKLTools._user_intent_cache[self.user_id] = current_intent
        
        # Smart defaults for dates
        if not date_from:
            today = datetime.now()
            next_week = today + timedelta(days=7)
            date_from = next_week.strftime("%Y-%m-%d")
            date_to = (next_week + timedelta(days=5)).strftime("%Y-%m-%d")
        
        if not date_to:
            date_to = (datetime.strptime(date_from, "%Y-%m-%d") + timedelta(days=5)).strftime("%Y-%m-%d")
        
        constraints = constraints or []
        
        # Fetch deals (use resolved IATA codes)
        flights, hotels = await self._fetch_deals(dest_iata, origin)
        
        if not flights or not hotels:
            return {
                "tool": "search_bundles",
                "success": False,
                "message": f"No flights or hotels found for {origin} → {dest_iata}",
                "bundles": []
            }
        
        # Build bundles
        bundles = self._build_bundles(flights, hotels, {
            "origin": origin,
            "destination": dest_iata,
            "date_from": date_from,
            "date_to": date_to,
            "budget": budget,
            "constraints": constraints
        })
        
        # Cache bundles
        self._cached_bundles = bundles
        MRKLTools._user_bundles_cache[self.user_id] = bundles
        
        if session_store:
            session_store.save_recommendations(self.session_id, bundles)
        
        return {
            "tool": "search_bundles",
            "success": True,
            "origin": origin,
            "destination": dest_iata,
            "date_from": date_from,
            "date_to": date_to,
            "budget": budget,
            "bundles": bundles[:3],
            "total_found": len(bundles)
        }
    
    # ------------------------------------------
    # Tool: price_analyzer
    # ------------------------------------------
    async def price_analyzer(self, bundle_id: str = "option_1") -> Dict:
        """Analyze if a deal is good"""
        logger.info(f"[Tool: price_analyzer] bundle_id={bundle_id}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        if not bundle:
            return {
                "tool": "price_analyzer",
                "success": False,
                "message": "Bundle not found. Please search for options first."
            }
        
        flight = bundle.get("flight", {})
        hotel = bundle.get("hotel", {})
        
        current_price = bundle.get("total_price", 0)
        avg_price = (flight.get("avg_30d_price", current_price) or current_price) + \
                    ((hotel.get("avg_30d_price", 0) or hotel.get("current_price", 0)) * 3)
        
        if avg_price > 0:
            discount_pct = ((avg_price - current_price) / avg_price) * 100
        else:
            discount_pct = 0
        
        is_good_deal = discount_pct >= 10
        deal_score = bundle.get("deal_score", 70)
        
        return {
            "tool": "price_analyzer",
            "success": True,
            "bundle_id": bundle_id,
            "bundle_name": bundle.get("name"),
            "current_price": current_price,
            "avg_30d_price": avg_price,
            "discount_percentage": round(discount_pct, 1),
            "deal_score": deal_score,
            "is_good_deal": is_good_deal,
            "recommendation": "Good deal! Book soon." if is_good_deal else "Fair price. Consider waiting."
        }
    
    # ------------------------------------------
    # Tool: watch_creator
    # ------------------------------------------
    async def watch_creator(
        self,
        bundle_id: str = "option_1",
        price_threshold: float = None,
        inventory_threshold: int = None,
        watch_type: str = None
    ) -> Dict:
        """Create a price/inventory watch"""
        logger.info(f"[Tool: watch_creator] bundle_id={bundle_id}, price={price_threshold}, inventory={inventory_threshold}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        if not bundle:
            return {
                "tool": "watch_creator",
                "success": False,
                "message": "Bundle not found. Please search for options first."
            }
        
        # Determine watch type
        if not watch_type:
            if price_threshold and inventory_threshold:
                watch_type = "both"
            elif price_threshold:
                watch_type = "price"
            elif inventory_threshold:
                watch_type = "inventory"
            else:
                watch_type = "price"
                price_threshold = bundle.get("total_price", 0) * 0.9
        
        watch_id = f"watch_{uuid.uuid4().hex[:12]}"
        
        # Save to watch store
        if watch_store:
            try:
                watch_store.create_watch(
                    user_id=self.user_id,
                    listing_id=bundle.get("flight", {}).get("listing_id", bundle_id),
                    listing_type="bundle",
                    listing_name=bundle.get("name", "Travel Package"),
                    watch_type=watch_type,
                    threshold=price_threshold or 0,
                    inventory_threshold=inventory_threshold
                )
            except Exception as e:
                logger.error(f"Failed to save watch: {e}")
        
        msg_parts = []
        if price_threshold:
            msg_parts.append(f"price drops below ${price_threshold:.0f}")
        if inventory_threshold:
            msg_parts.append(f"inventory drops below {inventory_threshold}")
        
        return {
            "tool": "watch_creator",
            "success": True,
            "watch_id": watch_id,
            "bundle_name": bundle.get("name"),
            "watch_type": watch_type,
            "price_threshold": price_threshold,
            "inventory_threshold": inventory_threshold,
            "message": f"I'll notify you when {' or '.join(msg_parts)}."
        }
    
    # ------------------------------------------
    # Tool: quote_generator
    # ------------------------------------------
    async def quote_generator(
        self,
        bundle_id: str = "option_1",
        travelers: int = 1,
        nights: int = 3
    ) -> Dict:
        """Generate a booking quote"""
        logger.info(f"[Tool: quote_generator] bundle_id={bundle_id}, travelers={travelers}, nights={nights}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        if not bundle:
            return {
                "tool": "quote_generator",
                "success": False,
                "message": "Bundle not found. Please search for options first."
            }
        
        flight = bundle.get("flight", {})
        hotel = bundle.get("hotel", {})
        
        flight_price = (flight.get("current_price") or flight.get("price", 0)) * travelers
        hotel_price = (hotel.get("current_price") or hotel.get("pricePerNight", 0)) * nights
        
        subtotal = flight_price + hotel_price
        taxes = subtotal * 0.12
        fees = 25.00
        grand_total = subtotal + taxes + fees
        
        fare_class = flight.get("class") or flight.get("fare_class") or "Economy"
        baggage = flight.get("baggage") or "1 carry-on included"
        cancellation = hotel.get("cancellation_policy") or "Contact provider for details"
        
        return {
            "tool": "quote_generator",
            "success": True,
            "quote_id": f"quote_{uuid.uuid4().hex[:8]}",
            "bundle_id": bundle_id,
            "bundle_name": bundle.get("name"),
            "breakdown": {
                "flight": {
                    "route": f"{flight.get('origin', 'DEL')} → {flight.get('destination', 'BOM')}",
                    "price_per_person": flight.get("current_price", 0),
                    "travelers": travelers,
                    "total": flight_price,
                    "fare_class": fare_class,
                    "baggage": baggage
                },
                "hotel": {
                    "name": hotel.get("name", "Hotel"),
                    "price_per_night": hotel.get("current_price", 0),
                    "nights": nights,
                    "total": hotel_price
                },
                "subtotal": subtotal,
                "taxes": taxes,
                "fees": fees,
                "grand_total": grand_total
            },
            "cancellation_policy": cancellation,
            "valid_until": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
            "next_step": "Reply 'confirm' to proceed with booking"
        }
    
    # ------------------------------------------
    # Tool: policy_lookup
    # ------------------------------------------
    async def policy_lookup(self, question: str) -> Dict:
        """Look up policy information"""
        logger.info(f"[Tool: policy_lookup] question={question}")
        
        answer = None
        listing_id = None
        
        if self._cached_bundles:
            bundle = self._cached_bundles[0]
            hotel = bundle.get("hotel", {})
            listing_id = hotel.get("listing_id")
        
        if answer_policy_question and listing_id:
            try:
                answer = answer_policy_question(listing_id, question)
            except Exception as e:
                logger.warning(f"Policy store error: {e}")
        
        if not answer:
            q_lower = question.lower()
            if "cancel" in q_lower or "refund" in q_lower:
                answer = "Most bookings offer free cancellation up to 24-48 hours before check-in. Non-refundable rates are typically 10-15% cheaper."
            elif "pet" in q_lower:
                answer = "Pet policies vary by property. Look for 'pet-friendly' tags or contact the hotel directly."
            elif "breakfast" in q_lower:
                answer = "Breakfast inclusion varies by rate type. Check the amenities list for 'Breakfast included'."
            elif "parking" in q_lower:
                answer = "Parking availability and fees vary by property. Contact the hotel for specific rates."
            else:
                answer = "Please contact the hotel or airline directly for specific policy details."
        
        return {
            "tool": "policy_lookup",
            "success": True,
            "question": question,
            "answer": answer
        }
    
    # ------------------------------------------
    # Tool: booking_confirmer
    # ------------------------------------------
    async def booking_confirmer(self, bundle_id: str = "option_1") -> Dict:
        """Confirm and finalize a booking"""
        logger.info(f"[Tool: booking_confirmer] bundle_id={bundle_id}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        if not bundle:
            if self._cached_bundles:
                bundle = self._cached_bundles[0]
            else:
                return {
                    "tool": "booking_confirmer",
                    "success": False,
                    "message": "No bundle found to book. Please search for options first."
                }
        
        booking_ref = f"BK{uuid.uuid4().hex[:8].upper()}"
        
        return {
            "tool": "booking_confirmer",
            "success": True,
            "booking_reference": booking_ref,
            "bundle_name": bundle.get("name", "Travel Package"),
            "total_price": bundle.get("total_price", 0),
            "message": f"Booking confirmed! Reference: {booking_ref}. Confirmation email will be sent shortly."
        }
    
    # ------------------------------------------
    # Helper Methods
    # ------------------------------------------
    
    def _get_bundle_by_id(self, bundle_id: str) -> Optional[Dict]:
        """Get bundle by ID from cache"""
        if not self._cached_bundles:
            return None
        
        if bundle_id.startswith("option_"):
            try:
                idx = int(bundle_id.split("_")[1]) - 1
                if 0 <= idx < len(self._cached_bundles):
                    return self._cached_bundles[idx]
            except (ValueError, IndexError):
                pass
        
        for bundle in self._cached_bundles:
            if bundle.get("bundle_id") == bundle_id:
                return bundle
        
        return self._cached_bundles[0] if self._cached_bundles else None
    
    async def _fetch_deals(self, destination: str, origin: str) -> tuple:
        """Fetch flights and hotels from deals cache"""
        flights = []
        hotels = []
        
        if deals_cache:
            try:
                # Use correct method names
                all_flights = deals_cache.get_deals_by_type("flight") or []
                all_hotels = deals_cache.get_deals_by_type("hotel") or []
                
                # Filter flights by origin/destination
                for deal in all_flights:
                    # Convert Deal object to dict
                    f = deal.to_dict() if hasattr(deal, 'to_dict') else deal
                    f_origin = f.get("origin") or f.get("departure")
                    f_dest = f.get("destination") or f.get("arrival")
                    if f_origin == origin and f_dest == destination:
                        flights.append(f)
                
                # Filter hotels by destination city
                dest_city = self._airport_to_city(destination)
                for deal in all_hotels:
                    # Convert Deal object to dict
                    h = deal.to_dict() if hasattr(deal, 'to_dict') else deal
                    h_city = h.get("city") or h.get("destination") or h.get("location")
                    # Match by airport code or city name
                    if h_city == destination or h_city == dest_city:
                        hotels.append(h)
                
                logger.info(f"Fetched {len(flights)} flights, {len(hotels)} hotels from cache")
            except Exception as e:
                logger.error(f"Deals cache error: {e}")
        
        # Fallback to search service
        if not flights or not hotels:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    if not flights:
                        res = await client.get(
                            "http://search-service:3003/api/v1/search/flights",
                            params={"origin": origin, "destination": destination}
                        )
                        if res.status_code == 200:
                            flights = res.json().get("data", [])
                    
                    if not hotels:
                        res = await client.get(
                            "http://search-service:3003/api/v1/search/hotels",
                            params={"city": destination}
                        )
                        if res.status_code == 200:
                            hotels = res.json().get("data", [])
            except Exception as e:
                logger.error(f"Search service error: {e}")
        
        return flights, hotels
    
    def _airport_to_city(self, code: str) -> str:
        """Convert airport code to city name"""
        mapping = {
            "DEL": "Delhi", "BOM": "Mumbai", "BLR": "Bangalore",
            "MAA": "Chennai", "CCU": "Kolkata", "HYD": "Hyderabad",
            "SFO": "San Francisco", "LAX": "Los Angeles", "JFK": "New York",
            "MIA": "Miami", "ORD": "Chicago", "LHR": "London",
            "CDG": "Paris", "NRT": "Tokyo", "SIN": "Singapore"
        }
        return mapping.get(code, code)
    
    def _build_bundles(self, flights: List[Dict], hotels: List[Dict], params: Dict) -> List[Dict]:
        """Build flight+hotel bundles"""
        bundles = []
        budget = params.get("budget")
        constraints = params.get("constraints", [])
        
        flights_sorted = sorted(flights, key=lambda x: x.get("deal_score", 0), reverse=True)[:10]
        hotels_sorted = sorted(hotels, key=lambda x: x.get("deal_score", 0), reverse=True)[:10]
        
        for i, flight in enumerate(flights_sorted[:5]):
            for j, hotel in enumerate(hotels_sorted[:3]):
                flight_price = flight.get("current_price") or flight.get("price", 0)
                hotel_price = (hotel.get("current_price") or hotel.get("pricePerNight", 0)) * 3
                total_price = flight_price + hotel_price
                
                if budget and total_price > budget:
                    continue
                
                deal_score = ((flight.get("deal_score", 50) or 50) + (hotel.get("deal_score", 50) or 50)) // 2
                fit_score = self._calculate_fit_score(flight, hotel, params)
                explanation = self._generate_explanation(flight, hotel, params, fit_score)
                
                bundle = {
                    "bundle_id": f"bundle_{i}_{j}",
                    "name": f"{flight.get('origin', params.get('origin'))} → {flight.get('destination', params.get('destination'))} + Hotel",
                    "flight": {
                        "listing_id": flight.get("listing_id") or flight.get("id"),
                        "origin": flight.get("origin") or flight.get("departure"),
                        "destination": flight.get("destination") or flight.get("arrival"),
                        "airline": flight.get("airline"),
                        "flight_number": flight.get("flight_number") or flight.get("flightNumber"),
                        "current_price": flight_price,
                        "avg_30d_price": flight.get("avg_30d_price"),
                        "deal_score": flight.get("deal_score", 50),
                        "departure_time": flight.get("departure_time") or flight.get("departureTime"),
                        "arrival_time": flight.get("arrival_time") or flight.get("arrivalTime"),
                        "duration": flight.get("duration"),
                        "stops": flight.get("stops", 0),
                        "class": flight.get("class", "Economy")
                    },
                    "hotel": {
                        "listing_id": hotel.get("listing_id") or hotel.get("id"),
                        "name": hotel.get("name") or hotel.get("hotelName"),
                        "current_price": hotel.get("current_price") or hotel.get("pricePerNight", 0),
                        "avg_30d_price": hotel.get("avg_30d_price"),
                        "deal_score": hotel.get("deal_score", 50),
                        "rating": hotel.get("rating") or hotel.get("starRating"),
                        "neighbourhood": hotel.get("neighbourhood") or hotel.get("neighborhood"),
                        "amenities": hotel.get("amenities", []),
                        "pet_friendly": hotel.get("pet_friendly", False),
                        "breakfast_included": hotel.get("breakfast_included", False),
                        "refundable": hotel.get("refundable", True),
                        "rooms_available": hotel.get("availability", 10)
                    },
                    "total_price": total_price,
                    "savings": (budget - total_price) if budget else 0,
                    "deal_score": deal_score,
                    "fit_score": fit_score,
                    "explanation": explanation
                }
                
                bundles.append(bundle)
        
        bundles.sort(key=lambda x: x.get("fit_score", 0), reverse=True)
        return bundles
    
    def _calculate_fit_score(self, flight: Dict, hotel: Dict, params: Dict) -> int:
        """Calculate Fit Score (price vs budget + amenity match)"""
        score = 50
        budget = params.get("budget")
        constraints = params.get("constraints", [])
        
        flight_price = flight.get("current_price") or flight.get("price", 0)
        hotel_price = (hotel.get("current_price") or hotel.get("pricePerNight", 0)) * 3
        total_price = flight_price + hotel_price
        
        # Price vs Budget
        if budget and budget > 0:
            if total_price <= budget * 0.7:
                score += 30
            elif total_price <= budget * 0.85:
                score += 20
            elif total_price <= budget:
                score += 10
            else:
                score -= 10
        
        # Constraint match
        hotel_amenities = [a.lower() for a in (hotel.get("amenities") or [])]
        for constraint in constraints:
            c_lower = constraint.lower().replace("-", " ").replace("_", " ")
            if "pet" in c_lower and hotel.get("pet_friendly"):
                score += 5
            if "breakfast" in c_lower and hotel.get("breakfast_included"):
                score += 5
            if "refund" in c_lower and hotel.get("refundable"):
                score += 5
            if "non stop" in c_lower and flight.get("stops", 0) == 0:
                score += 5
        
        # Deal score contribution
        deal_score = ((flight.get("deal_score", 50) or 50) + (hotel.get("deal_score", 50) or 50)) // 2
        score += deal_score // 10
        
        return min(max(score, 0), 100)
    
    def _generate_explanation(self, flight: Dict, hotel: Dict, params: Dict, fit_score: int) -> Dict:
        """Generate 'why_this' (≤25 words) and 'what_to_watch' (≤12 words)"""
        why_parts = []
        watch_parts = []
        
        budget = params.get("budget")
        flight_price = flight.get("current_price") or flight.get("price", 0)
        hotel_price = (hotel.get("current_price") or hotel.get("pricePerNight", 0)) * 3
        total_price = flight_price + hotel_price
        
        # Why this
        if budget and total_price < budget:
            why_parts.append(f"${budget - total_price:.0f} under budget")
        
        deal_score = ((flight.get("deal_score", 50) or 50) + (hotel.get("deal_score", 50) or 50)) // 2
        if deal_score >= 70:
            why_parts.append(f"{deal_score}% deal score")
        
        if hotel.get("pet_friendly"):
            why_parts.append("pet-friendly")
        if hotel.get("breakfast_included"):
            why_parts.append("breakfast included")
        
        neighbourhood = hotel.get("neighbourhood") or hotel.get("neighborhood")
        if neighbourhood:
            why_parts.append(f"in {neighbourhood}")
        
        why_this = ". ".join(why_parts) if why_parts else "Good value for this route"
        if len(why_this.split()) > 25:
            why_this = " ".join(why_this.split()[:25]) + "..."
        
        # What to watch
        rooms = hotel.get("rooms_available") or hotel.get("availability", 10)
        if rooms and rooms < 5:
            watch_parts.append(f"Only {rooms} rooms left")
        if not hotel.get("refundable", True):
            watch_parts.append("Non-refundable")
        if deal_score >= 80:
            watch_parts.append("Great price - book soon")
        
        what_to_watch = ". ".join(watch_parts) if watch_parts else "Prices may change"
        if len(what_to_watch.split()) > 12:
            what_to_watch = " ".join(what_to_watch.split()[:12]) + "..."
        
        return {"why_this": why_this, "what_to_watch": what_to_watch}


# ============================================
# Concierge Agent
# ============================================

class ConciergeAgent:
    """
    Main Concierge Agent that processes user messages.
    Uses OpenAI or Ollama with unified tool definitions.
    """
    
    def __init__(self):
        today = datetime.now().strftime("%Y-%m-%d")
        self.system_prompt = f"""You are a helpful travel concierge assistant. Today is {today}.

You help users find and book travel packages (flights + hotels). You have these tools:

1. search_bundles - Search for travel options. Extracts and merges travel info across turns.
2. price_analyzer - Check if a deal is good value.
3. watch_creator - Set up price/inventory alerts.
4. quote_generator - Generate detailed booking quote.
5. policy_lookup - Answer policy questions (cancellation, pets, etc.)
6. booking_confirmer - Confirm a booking when user agrees.

CRITICAL RULES:
- ALWAYS preserve context from previous messages. If user previously said "Miami to Tokyo", keep that origin and destination.
- When user says "include a stop to X" or "add X to the route", add X to the constraints list and call search_bundles with the SAME origin/destination from previous context.
- Convert city names to airport codes (Delhi=DEL, Mumbai=BOM, New York=JFK, San Francisco=SFO, Los Angeles=LAX, Miami=MIA, Chicago=ORD, London=LHR, Paris=CDG, Tokyo=NRT, Singapore=SIN)
- Calculate dates from relative terms ("next week" = 7 days from {today}, "January 1-7" = 2025-01-01 to 2025-01-07)
- When user provides partial info like "from Delhi" or "to Mumbai", ALWAYS call search_bundles - it will merge with previous context automatically
- When user refines a search (e.g., "make it pet-friendly", "include stop to singapore"), call search_bundles with the constraint added, preserving origin/destination/dates from previous context
- You may ask AT MOST ONE clarifying question if destination is missing. Never ask multiple questions.
- When user says "confirm", "yes", "book it" after a quote, use booking_confirmer
- Be concise and helpful"""

        if USE_OPENAI:
            self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
            self.use_openai = True
            logger.info("ConciergeAgent: Using OpenAI")
        elif OLLAMA_AVAILABLE:
            self.openai_client = None
            self.use_openai = False
            logger.info("ConciergeAgent: Using Ollama")
        else:
            self.openai_client = None
            self.use_openai = False
            logger.warning("ConciergeAgent: No LLM available!")
    
    async def process_message(self, user_id: str, query: str, session_id: str = None) -> Dict:
        """Process a user message and return response"""
        if session_store:
            session_id = session_store.get_or_create_session(user_id, session_id)
        else:
            session_id = session_id or f"sess_{user_id}_{uuid.uuid4().hex[:8]}"
        
        # Get conversation history
        conversation_history = []
        if session_store:
            session = session_store.get_session(session_id)
            if session:
                # Build history from session data
                if session.get("last_query") and session.get("last_response"):
                    conversation_history = [
                        {"role": "user", "content": session.get("last_query")},
                        {"role": "assistant", "content": session.get("last_response")}
                    ]
        
        tools = MRKLTools(user_id, session_id)
        
        if self.use_openai:
            result = await self._call_openai(query, tools, conversation_history)
        else:
            result = await self._call_ollama(query, tools, conversation_history)
        
        if session_store:
            session_store.update_session(session_id, {
                "last_query": query,
                "last_response": result.get("response", "")[:200]
            })
        
        result["session_id"] = session_id
        return result
    
    async def _call_openai(self, query: str, tools: MRKLTools, conversation_history: List[Dict] = None) -> Dict:
        """Call OpenAI with function calling"""
        try:
            messages = [{"role": "system", "content": self.system_prompt}]
            
            # Add conversation history
            if conversation_history:
                messages.extend(conversation_history)
            
            # Add current query
            messages.append({"role": "user", "content": query})
            
            response = self.openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                tools=TOOL_DEFINITIONS,
                tool_choice="auto",
                max_tokens=500
            )
            
            message = response.choices[0].message
            
            if message.tool_calls:
                tool_call = message.tool_calls[0]
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                
                logger.info(f"OpenAI selected tool: {tool_name} with args: {tool_args}")
                
                tool_result = await self._execute_tool(tools, tool_name, tool_args)
                
                follow_up_messages = [{"role": "system", "content": self.system_prompt}]
                if conversation_history:
                    follow_up_messages.extend(conversation_history)
                follow_up_messages.extend([
                    {"role": "user", "content": query},
                    {"role": "assistant", "content": None, "tool_calls": [tool_call]},
                    {"role": "tool", "tool_call_id": tool_call.id, "content": json.dumps(tool_result)}
                ])
                
                follow_up = self.openai_client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=follow_up_messages,
                    max_tokens=800
                )
                
                return {
                    "response": follow_up.choices[0].message.content,
                    "type": self._get_response_type(tool_name),
                    "tool_used": tool_name,
                    "data": tool_result,
                    "bundles": tool_result.get("bundles", []) if tool_name == "search_bundles" else []
                }
            
            return {
                "response": message.content,
                "type": "message",
                "tool_used": None
            }
            
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            return {
                "response": "Sorry, I encountered an error. Please try again.",
                "type": "error",
                "error": str(e)
            }
    
    async def _call_ollama(self, query: str, tools: MRKLTools, conversation_history: List[Dict] = None) -> Dict:
        """Call Ollama with function calling"""
        try:
            # Some versions of the Ollama Python client do NOT yet support the
            # "tools" argument on Client.chat(). We first try with tools, and
            # if the client raises a TypeError for the unexpected keyword,
            # gracefully fall back to manual intent parsing + tool calling.
            try:
                messages = [{"role": "system", "content": self.system_prompt}]
                if conversation_history:
                    messages.extend(conversation_history)
                messages.append({"role": "user", "content": query})
                
                response = ollama.chat(
                    model=OLLAMA_MODEL,
                    messages=messages,
                    tools=TOOL_DEFINITIONS
                )
            except TypeError as te:
                if "unexpected keyword argument 'tools'" in str(te):
                    logger.warning(
                        "Ollama client does not support 'tools' argument on chat(); "
                        "falling back to manual intent parsing."
                    )
                    # Manual intent parsing when tools aren't supported
                    return await self._call_ollama_manual_intent(query, tools, conversation_history)
                # Re-raise any other TypeError so it is handled by the outer
                # exception block and logged as an Ollama error.
                raise
            
            message = response.get("message", {})
            tool_calls = message.get("tool_calls", [])
            
            if tool_calls:
                tool_call = tool_calls[0]
                tool_name = tool_call.get("function", {}).get("name")
                tool_args = tool_call.get("function", {}).get("arguments", {})
                
                if isinstance(tool_args, str):
                    tool_args = json.loads(tool_args)
                
                logger.info(f"Ollama selected tool: {tool_name} with args: {tool_args}")
                
                tool_result = await self._execute_tool(tools, tool_name, tool_args)
                
                follow_up_messages = [{"role": "system", "content": self.system_prompt}]
                if conversation_history:
                    follow_up_messages.extend(conversation_history)
                follow_up_messages.extend([
                    {"role": "user", "content": query},
                    {"role": "assistant", "content": f"Tool result: {json.dumps(tool_result)}"},
                    {"role": "user", "content": "Please summarize this result for the user."}
                ])
                
                follow_up = ollama.chat(
                    model=OLLAMA_MODEL,
                    messages=follow_up_messages
                )
                
                return {
                    "response": follow_up.get("message", {}).get("content", "Here are your results."),
                    "type": self._get_response_type(tool_name),
                    "tool_used": tool_name,
                    "data": tool_result,
                    "bundles": tool_result.get("bundles", []) if tool_name == "search_bundles" else []
                }
            
            return {
                "response": message.get("content", "How can I help you with travel planning?"),
                "type": "message",
                "tool_used": None
            }
            
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            return {
                "response": "Sorry, I encountered an error. Please try again.",
                "type": "error",
                "error": str(e)
            }
    
    async def _call_ollama_manual_intent(self, query: str, tools: MRKLTools, conversation_history: List[Dict] = None) -> Dict:
        """Manually parse intent and call tools when Ollama doesn't support tool calling"""
        import re
        
        query_lower = query.lower()
        
        # Check if this is a refinement/constraint addition
        is_refinement = any(phrase in query_lower for phrase in [
            "include", "add", "stop", "stopover", "via", "through",
            "make it", "also", "need", "want", "require"
        ])
        
        # Extract constraints
        constraints = []
        if "singapore" in query_lower or "sin" in query_lower:
            constraints.append("stop-singapore")
        if "pet" in query_lower and ("friendly" in query_lower or "allow" in query_lower):
            constraints.append("pet-friendly")
        if "wifi" in query_lower or "wi-fi" in query_lower:
            constraints.append("wifi")
        if "pool" in query_lower:
            constraints.append("pool")
        if "breakfast" in query_lower:
            constraints.append("breakfast")
        if "refund" in query_lower or "cancel" in query_lower:
            constraints.append("refundable")
        
        # Extract dates
        date_from = None
        date_to = None
        
        # Handle "1st week of January" or "first week of January"
        week_pattern = re.search(r"(?:1st|first)\s+week\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)", query_lower)
        if week_pattern:
            month_name = week_pattern.group(1)
            month_map = {
                "january": 1, "february": 2, "march": 3, "april": 4,
                "may": 5, "june": 6, "july": 7, "august": 8,
                "september": 9, "october": 10, "november": 11, "december": 12
            }
            month = month_map.get(month_name, 1)
            date_from = f"2025-{month:02d}-01"
            date_to = f"2025-{month:02d}-07"
        else:
            # Try other date patterns
            date_patterns = [
                (r"january\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 1)),
                (r"february\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 2)),
                (r"march\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 3)),
                (r"april\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 4)),
                (r"may\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 5)),
                (r"june\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 6)),
                (r"july\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 7)),
                (r"august\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 8)),
                (r"september\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 9)),
                (r"october\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 10)),
                (r"november\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 11)),
                (r"december\s+(\d+)(?:\s*-\s*(\d+))?", (2025, 12)),
            ]
            
            for pattern, (year, month) in date_patterns:
                match = re.search(pattern, query_lower)
                if match:
                    day1 = int(match.group(1))
                    day2 = int(match.group(2)) if match.group(2) else day1 + 6
                    date_from = f"{year}-{month:02d}-{day1:02d}"
                    date_to = f"{year}-{month:02d}-{min(day2, 31):02d}"
                    break
        
        # Extract origin/destination from query
        origin = None
        destination = None
        
        # City to IATA mapping
        city_map = {
            "miami": "MIA", "delhi": "DEL", "mumbai": "BOM", "tokyo": "NRT",
            "singapore": "SIN", "new york": "JFK", "nyc": "JFK",
            "san francisco": "SFO", "sfo": "SFO", "los angeles": "LAX",
            "chicago": "ORD", "london": "LHR", "paris": "CDG"
        }
        
        # Extract "from X" and "to Y" OR "Starting city: X" and "Destination: Y"
        from_match = re.search(r"(?:from|starting city:?)\s+(\w+)", query_lower)
        to_match = re.search(r"(?:to|destination:?)\s+(\w+)", query_lower)
        
        if from_match:
            city = from_match.group(1).strip()
            origin = city_map.get(city, city.upper()[:3])
        
        if to_match:
            city = to_match.group(1).strip()
            destination = city_map.get(city, city.upper()[:3])
        
        # If this is a refinement, use previous intent
        if is_refinement and tools._last_intent:
            if not origin:
                origin = tools._last_intent.get("origin")
            if not destination:
                destination = tools._last_intent.get("destination")
            if not date_from:
                date_from = tools._last_intent.get("date_from")
            if not date_to:
                date_to = tools._last_intent.get("date_to")
            # Merge constraints
            existing_constraints = tools._last_intent.get("constraints", [])
            constraints = list(set(existing_constraints + constraints))
        
        # Debug logging
        logger.info(f"Manual intent parsing: origin={origin}, destination={destination}, date_from={date_from}, date_to={date_to}, is_refinement={is_refinement}, has_last_intent={bool(tools._last_intent)}")
        
        # If we have enough info, call search_bundles
        if destination or (is_refinement and tools._last_intent):
            tool_args = {
                "destination": destination,
                "origin": origin,
                "date_from": date_from,
                "date_to": date_to,
                "constraints": constraints if constraints else None
            }
            
            logger.info(f"Manual intent parsing: calling search_bundles with {tool_args}")
            try:
                tool_result = await tools.search_bundles(**tool_args)
                logger.info(f"search_bundles returned: success={tool_result.get('success')}, bundles={len(tool_result.get('bundles', []))}")
                
                # Generate response using Ollama
                messages = [{"role": "system", "content": self.system_prompt}]
                if conversation_history:
                    messages.extend(conversation_history)
                messages.extend([
                    {"role": "user", "content": query},
                    {"role": "assistant", "content": f"Tool result: {json.dumps(tool_result)}"},
                    {"role": "user", "content": "Please summarize this result for the user in a natural, helpful way. If no flights were found, explain that and suggest alternatives."}
                ])
                
                try:
                    follow_up = ollama.chat(
                        model=OLLAMA_MODEL,
                        messages=messages
                    )
                    response_text = follow_up.get("message", {}).get("content", "Here are your results.")
                except Exception as e:
                    logger.error(f"Ollama follow-up error: {e}")
                    # Fallback response if Ollama fails
                    if tool_result.get("success"):
                        response_text = f"I found {len(tool_result.get('bundles', []))} travel options for {origin} → {destination}."
                    else:
                        response_text = tool_result.get("message", "No flights or hotels found for this route.")
                
                return {
                    "response": response_text,
                    "type": "recommendations",
                    "tool_used": "search_bundles",
                    "data": tool_result,
                    "bundles": tool_result.get("bundles", [])
                }
            except Exception as e:
                logger.error(f"Error in search_bundles: {e}", exc_info=True)
                # Return error response but still indicate tool was used
                return {
                    "response": f"Sorry, I encountered an error while searching: {str(e)}",
                    "type": "error",
                    "tool_used": "search_bundles",
                    "data": {"error": str(e)},
                    "bundles": []
                }
        
        # Not enough info - ask for clarification or generate generic response
        messages = [{"role": "system", "content": self.system_prompt}]
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": query})
        
        response = ollama.chat(
            model=OLLAMA_MODEL,
            messages=messages
        )
        
        return {
            "response": response.get("message", {}).get("content", "How can I help you with travel planning?"),
            "type": "message",
            "tool_used": None
        }
    
    async def _execute_tool(self, tools: MRKLTools, tool_name: str, tool_args: Dict) -> Dict:
        """Execute a tool by name"""
        tool_map = {
            "search_bundles": tools.search_bundles,
            "price_analyzer": tools.price_analyzer,
            "watch_creator": tools.watch_creator,
            "quote_generator": tools.quote_generator,
            "policy_lookup": tools.policy_lookup,
            "booking_confirmer": tools.booking_confirmer
        }
        
        if tool_name in tool_map:
            return await tool_map[tool_name](**tool_args)
        return {"error": f"Unknown tool: {tool_name}"}
    
    def _get_response_type(self, tool_name: str) -> str:
        """Map tool name to response type"""
        return {
            "search_bundles": "recommendations",
            "price_analyzer": "analysis",
            "watch_creator": "watch_created",
            "quote_generator": "quote",
            "policy_lookup": "policy_answer",
            "booking_confirmer": "booking_confirmed"
        }.get(tool_name, "message")


# ============================================
# Module exports
# ============================================

concierge_agent = ConciergeAgent()

async def process_chat(user_id: str, query: str, session_id: str = None) -> Dict:
    """Process a chat message"""
    return await concierge_agent.process_message(user_id, query, session_id)
