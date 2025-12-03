# agents/concierge_agent.py
"""
Concierge Agent with MRKL Tools Pattern

Single LLM Agent that decides which tool to call based on user intent.

Exports: ConciergeAgent, concierge_agent, process_chat
...

Architecture:
┌─────────────────────────────────────────────────────────────┐
│                    Concierge Agent                          │
│                    (Single LLM Agent)                       │
│                          │                                  │
│            ┌─────────────┼─────────────┐                   │
│            │    Tool Selection (LLM)    │                   │
│            └─────────────┬─────────────┘                   │
│                          │                                  │
│    ┌──────────┬──────────┼──────────┬──────────┬─────────┐ │
│    ▼          ▼          ▼          ▼          ▼         ▼ │
│ ┌──────┐ ┌────────┐ ┌────────┐ ┌───────┐ ┌───────┐ ┌─────┐│
│ │Intent│ │Bundle  │ │Price   │ │Watch  │ │Quote  │ │Policy│
│ │Parser│ │Matcher │ │Analyzer│ │Creator│ │Gen    │ │Lookup││
│ └──────┘ └────────┘ └────────┘ └───────┘ └───────┘ └─────┘│
└─────────────────────────────────────────────────────────────┘

Tools (MRKL Pattern):
1. intent_parser - Extract destination, dates, budget, constraints
2. bundle_matcher - Find flight+hotel bundles from cached deals
3. price_analyzer - Compare price to 30-day average, verdict
4. watch_creator - Create price/inventory threshold alerts
5. quote_generator - Generate booking quote with breakdown
6. policy_lookup - Answer policy questions (cancellation, pets, etc.)
"""

import os
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from loguru import logger
import httpx

# ============================================
# LLM Imports
# ============================================
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    OpenAI = None

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    ollama = None

# ============================================
# Internal Module Imports
# ============================================
try:
    from llm.intent_parser import intent_parser, ParsedIntent
except ImportError:
    intent_parser = None
    ParsedIntent = None

try:
    from llm.explainer import explainer, generate_explanation
except ImportError:
    explainer = None
    def generate_explanation(rec):
        return {"why_this": "Good deal", "what_to_watch": "Book soon"}

try:
    from llm.quote_generator import quote_generator, generate_quote
except ImportError:
    quote_generator = None
    def generate_quote(bundle):
        return {"quote_id": "mock", "grand_total": bundle.get("total_price", 0)}

try:
    from interfaces.session_store import session_store
except ImportError:
    session_store = None

try:
    from interfaces.deals_cache import deals_cache, search_deals, get_deals_for_bundle
except ImportError:
    deals_cache = None
    def search_deals(**kwargs): return []
    def get_deals_for_bundle(dest, **kwargs): return {"flights": [], "hotels": []}

try:
    from interfaces.policy_store import policy_store, answer_policy_question
except ImportError:
    policy_store = None
    def answer_policy_question(lid, q): return "Policy information not available"

try:
    from api.watches import watch_store, WatchCreate
except ImportError:
    watch_store = None
    WatchCreate = None


# ============================================
# Configuration
# ============================================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Prefer OpenAI, fallback to Ollama
USE_OPENAI = bool(OPENAI_API_KEY) and not OPENAI_API_KEY.startswith("sk-your")


# ============================================
# MRKL Tool Definitions (OpenAI Function Calling Format)
# ============================================
MRKL_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "intent_parser",
            "description": "Parse user query to extract travel intent: destination, dates, budget, preferences. Use this first for any new search request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The user's natural language query"
                    },
                    "context": {
                        "type": "object",
                        "description": "Previous search context (optional)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "bundle_matcher",
            "description": "Find and recommend flight+hotel bundles based on search criteria. Use when user wants to see travel options, recommendations, or search results. Requires origin, destination, departure date, and return date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "Departure city or airport code (e.g., 'Delhi' or 'DEL')"
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination city or airport code (e.g., 'Mumbai' or 'BOM')"
                    },
                    "departure_date": {
                        "type": "string",
                        "description": "Departure date (e.g., '2024-12-15' or 'December 15')"
                    },
                    "return_date": {
                        "type": "string",
                        "description": "Return date (e.g., '2024-12-20' or 'December 20')"
                    },
                    "budget": {
                        "type": "number",
                        "description": "Maximum total budget in USD (optional)"
                    },
                    "constraints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of constraints like 'pet-friendly', 'breakfast', 'refundable'"
                    }
                },
                "required": ["origin", "destination", "departure_date", "return_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "price_analyzer",
            "description": "Analyze if a deal is good by comparing to 30-day average. Use when user asks 'is this a good deal?', 'worth it?', 'analyze this'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "ID of the bundle to analyze (e.g., 'option 1', 'bundle_1')"
                    },
                    "listing_type": {
                        "type": "string",
                        "enum": ["flight", "hotel", "bundle"],
                        "description": "Type of listing to analyze"
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
            "description": "Create a price or inventory alert. Use when user says 'watch', 'alert me', 'notify me', 'track', 'let me know if price drops'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "ID of the bundle to watch"
                    },
                    "price_threshold": {
                        "type": "number",
                        "description": "Alert when price drops below this amount (optional)"
                    },
                    "watch_type": {
                        "type": "string",
                        "enum": ["price", "inventory", "both"],
                        "description": "Type of alert to create"
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
            "description": "Generate a complete booking quote with itemized breakdown. Use when user says 'book', 'reserve', 'checkout', 'get quote', 'total cost'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bundle_id": {
                        "type": "string",
                        "description": "ID of the bundle to quote"
                    },
                    "travelers": {
                        "type": "integer",
                        "description": "Number of travelers (default: 1)"
                    },
                    "nights": {
                        "type": "integer",
                        "description": "Number of nights (default: 3)"
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
            "description": "Look up policy information like cancellation, pets, parking, breakfast. Use when user asks about rules, policies, or 'can I...' questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "ID of the listing (flight or hotel)"
                    },
                    "question": {
                        "type": "string",
                        "description": "The policy question to answer"
                    }
                },
                "required": ["question"]
            }
        }
    }
]


# ============================================
# Tool Implementation Functions
# ============================================
class MRKLTools:
    """Implementation of MRKL tools"""
    
    def __init__(self, session_id: str, user_id: str):
        self.session_id = session_id
        self.user_id = user_id
        self._cached_bundles = []  # Store recommendations for reference
    
    async def intent_parser(self, query: str, context: Dict = None) -> Dict:
        """Parse user intent from natural language"""
        logger.info(f"[Tool: intent_parser] query={query}")
        
        if intent_parser:
            parsed = intent_parser.parse(query, context or {})
            if session_store and parsed:
                session_store.merge_intent(self.session_id, parsed.to_dict())
            return {
                "tool": "intent_parser",
                "result": parsed.to_dict() if parsed else {},
                "needs_clarification": parsed.needs_clarification if parsed else False,
                "clarification_question": parsed.clarification_question if parsed and parsed.needs_clarification else None
            }
        
        # Fallback: basic extraction
        return {
            "tool": "intent_parser",
            "result": {"query": query, "destination": None, "budget": None},
            "needs_clarification": True,
            "clarification_question": "Where would you like to travel to?"
        }
    
    async def bundle_matcher(
        self, 
        destination: str = None,
        origin: str = None,
        departure_date: str = None,
        return_date: str = None,
        budget: float = None,
        constraints: List[str] = None
    ) -> Dict:
        """Find flight+hotel bundles"""
        logger.info(f"[Tool: bundle_matcher] origin={origin}, dest={destination}, depart={departure_date}, return={return_date}, budget={budget}")
        
        # Collect missing required fields
        missing_fields = []
        if not origin:
            missing_fields.append("departure city")
        if not destination:
            missing_fields.append("destination")
        if not departure_date:
            missing_fields.append("departure date")
        if not return_date:
            missing_fields.append("return date")
        
        # If any required field is missing, ask for clarification
        if missing_fields:
            missing_str = ", ".join(missing_fields)
            example = "For example: 'Flights from Delhi to Mumbai, December 15-20'"
            return {
                "tool": "bundle_matcher",
                "bundles": [],
                "count": 0,
                "needs_clarification": True,
                "missing_fields": missing_fields,
                "clarification_question": f"I need a few more details: {missing_str}. {example}"
            }
        
        # Fetch from search service
        deals = await self._fetch_deals(destination, origin)
        
        # Build bundles
        bundles = self._build_bundles(deals, {
            "destination": destination,
            "origin": origin,
            "departure_date": departure_date,
            "return_date": return_date,
            "budget": budget,
            "constraints": constraints or []
        })
        
        # If no bundles found, inform user
        if not bundles:
            return {
                "tool": "bundle_matcher",
                "bundles": [],
                "count": 0,
                "destination": destination,
                "origin": origin,
                "needs_clarification": True,
                "clarification_question": f"Sorry, I couldn't find any flights from {origin} to {destination} for {departure_date} to {return_date}. Please try different dates or route."
            }
        
        # Cache for later reference
        self._cached_bundles = bundles
        if session_store:
            session_store.save_recommendations(self.session_id, bundles)
        
        return {
            "tool": "bundle_matcher",
            "bundles": bundles[:3],
            "count": len(bundles),
            "destination": destination,
            "origin": origin,
            "departure_date": departure_date,
            "return_date": return_date
        }
    
    async def price_analyzer(self, bundle_id: str, listing_type: str = "bundle") -> Dict:
        """Analyze if a deal is good"""
        logger.info(f"[Tool: price_analyzer] bundle_id={bundle_id}")
        
        # Get bundle from cache or session
        bundle = self._get_bundle_by_id(bundle_id)
        
        if not bundle:
            return {
                "tool": "price_analyzer",
                "error": "Bundle not found. Please search for options first."
            }
        
        # Calculate analysis
        current_price = bundle.get("total_price", 0)
        avg_30d = current_price * 1.15  # Mock: assume 15% higher average
        discount_pct = ((avg_30d - current_price) / avg_30d) * 100
        
        # Determine verdict
        if discount_pct >= 20:
            verdict = "GREAT_DEAL"
            verdict_text = "This is a great deal!"
        elif discount_pct >= 10:
            verdict = "GOOD_DEAL"
            verdict_text = "This is a good deal."
        elif discount_pct >= 0:
            verdict = "FAIR"
            verdict_text = "This is a fair price."
        else:
            verdict = "ABOVE_AVERAGE"
            verdict_text = "This is above average price."
        
        return {
            "tool": "price_analyzer",
            "bundle_id": bundle_id,
            "current_price": current_price,
            "avg_30d_price": avg_30d,
            "discount_pct": round(discount_pct, 1),
            "verdict": verdict,
            "verdict_text": verdict_text,
            "deal_score": bundle.get("deal_score", 70)
        }
    
    async def watch_creator(
        self, 
        bundle_id: str, 
        price_threshold: float = None,
        watch_type: str = "both"
    ) -> Dict:
        """Create a price/inventory watch"""
        logger.info(f"[Tool: watch_creator] bundle_id={bundle_id}, threshold={price_threshold}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        
        if not bundle:
            return {
                "tool": "watch_creator",
                "error": "Bundle not found. Please search for options first."
            }
        
        try:
            # Create watch
            watch_id = f"watch_{uuid.uuid4().hex[:8]}"
            current_price = bundle.get("total_price", 0) or 0
            
            # Safely get listing_id
            flight = bundle.get("flight") or {}
            hotel = bundle.get("hotel") or {}
            listing_id = flight.get("listing_id") or hotel.get("listing_id") or bundle_id
            
            watch_data = {
                "watch_id": watch_id,
                "user_id": self.user_id,
                "bundle_id": bundle_id,
                "listing_id": listing_id,
                "price_threshold": price_threshold or (current_price * 0.9 if current_price else 100),
                "current_price": current_price,
                "watch_type": watch_type,
                "created_at": datetime.utcnow().isoformat(),
                "active": True
            }
            
            # Save to watch store if available
            if watch_store and WatchCreate:
                try:
                    watch_store.create_watch(WatchCreate(**watch_data))
                except Exception as e:
                    logger.warning(f"Watch store error: {e}")
            
            return {
                "tool": "watch_creator",
                "watch_id": watch_id,
                "bundle_name": bundle.get("name", "Selected bundle"),
                "price_threshold": watch_data["price_threshold"],
                "watch_type": watch_type,
                "message": f"I'll notify you when the price drops below ${watch_data['price_threshold']:.0f}"
            }
        except Exception as e:
            logger.error(f"watch_creator error: {e}")
            return {
                "tool": "watch_creator",
                "error": f"Failed to create watch: {str(e)}"
            }
    
    async def quote_generator(
        self, 
        bundle_id: str, 
        travelers: int = 1,
        nights: int = 3
    ) -> Dict:
        """Generate booking quote"""
        logger.info(f"[Tool: quote_generator] bundle_id={bundle_id}, travelers={travelers}")
        
        bundle = self._get_bundle_by_id(bundle_id)
        
        if not bundle:
            return {
                "tool": "quote_generator",
                "error": "Bundle not found. Please search for options first."
            }
        
        try:
            # Safely get flight and hotel data
            flight = bundle.get("flight") or {}
            hotel = bundle.get("hotel") or {}
            
            # Calculate prices safely
            flight_unit_price = flight.get("current_price") or flight.get("price") or 0
            hotel_unit_price = hotel.get("current_price") or hotel.get("pricePerNight") or 0
            
            flight_price = flight_unit_price * travelers
            hotel_price = hotel_unit_price * nights
            
            subtotal = flight_price + hotel_price
            taxes = subtotal * 0.12  # 12% taxes
            fees = 25.00  # Booking fee
            grand_total = subtotal + taxes + fees
            
            quote = {
                "tool": "quote_generator",
                "quote_id": f"quote_{uuid.uuid4().hex[:8]}",
                "bundle_id": bundle_id,
                "bundle_name": bundle.get("name", "Selected bundle"),
                "breakdown": {
                    "flight": {
                        "description": f"{flight.get('origin', 'DEL')} → {flight.get('destination', 'BOM')}",
                        "unit_price": flight_unit_price,
                        "quantity": travelers,
                        "total": flight_price
                    },
                    "hotel": {
                        "description": hotel.get("name", "Hotel"),
                        "unit_price": hotel_unit_price,
                        "quantity": nights,
                        "total": hotel_price
                    },
                    "subtotal": subtotal,
                    "taxes": taxes,
                    "fees": fees,
                    "grand_total": grand_total
                },
                "travelers": travelers,
                "nights": nights,
                "valid_until": datetime.utcnow().isoformat(),
                "next_step": "Reply 'confirm' to proceed with booking"
            }
            
            # Save quote to session
            if session_store:
                try:
                    session_store.save_quote(self.session_id, quote)
                except Exception as e:
                    logger.warning(f"Failed to save quote to session: {e}")
            
            return quote
        except Exception as e:
            logger.error(f"quote_generator error: {e}")
            return {
                "tool": "quote_generator",
                "error": f"Failed to generate quote: {str(e)}"
            }
    
    async def policy_lookup(self, question: str, listing_id: str = None) -> Dict:
        """Look up policy information"""
        logger.info(f"[Tool: policy_lookup] question={question}")
        
        try:
            # Try to get listing from recent bundles
            if not listing_id and self._cached_bundles:
                bundle = self._cached_bundles[0]
                hotel = bundle.get("hotel") or {}
                flight = bundle.get("flight") or {}
                listing_id = hotel.get("listing_id") or flight.get("listing_id")
            
            answer = None
            
            # Get policy answer from store
            if policy_store:
                try:
                    answer = answer_policy_question(listing_id, question)
                except Exception as e:
                    logger.warning(f"Policy store error: {e}")
                    answer = None
            
            # If no answer found, suggest contacting the property
            if not answer:
                answer = "I couldn't find specific policy information for this listing. Please contact the hotel or airline directly to confirm their policies."
            
            return {
                "tool": "policy_lookup",
                "question": question,
                "answer": answer,
                "listing_id": listing_id
            }
        except Exception as e:
            logger.error(f"policy_lookup error: {e}")
            return {
                "tool": "policy_lookup",
                "question": question,
                "answer": "I couldn't find specific policy information. Please contact the hotel or airline directly.",
                "listing_id": None
            }
    
    # ============================================
    # Helper Methods
    # ============================================
    async def _fetch_deals(self, destination: str, origin: str) -> Dict:
        """Fetch deals from search service"""
        flights = []
        hotels = []
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Fetch flights
                flight_res = await client.get(
                    "http://search-service:3003/api/v1/search/flights",
                    params={"origin": origin, "destination": destination}
                )
                if flight_res.status_code == 200:
                    flights = flight_res.json().get("data", [])
                    for f in flights:
                        f["current_price"] = f.get("price", 0)
                        f["deal_score"] = f.get("deal_score", 75)
                
                # Fetch hotels
                hotel_res = await client.get(
                    "http://search-service:3003/api/v1/search/hotels",
                    params={"city": destination}
                )
                if hotel_res.status_code == 200:
                    hotels = hotel_res.json().get("data", [])
                    for h in hotels:
                        h["current_price"] = h.get("pricePerNight", h.get("price", 0))
                        h["deal_score"] = h.get("deal_score", 75)
                        
        except Exception as e:
            logger.error(f"Search service error: {e}")
            # Fallback to deals cache
            if deals_cache:
                return get_deals_for_bundle(destination, origin=origin)
        
        return {"flights": flights, "hotels": hotels}
    
    def _build_bundles(self, deals: Dict, params: Dict) -> List[Dict]:
        """Build flight+hotel bundles"""
        flights = deals.get("flights", [])
        hotels = deals.get("hotels", [])
        
        if not flights and not hotels:
            return []
        
        bundles = []
        for i in range(min(3, max(len(flights), len(hotels)))):
            flight = flights[i] if i < len(flights) else (flights[0] if flights else None)
            hotel = hotels[i] if i < len(hotels) else (hotels[0] if hotels else None)
            
            if not flight and not hotel:
                continue
            
            flight_price = flight.get("current_price", 0) if flight else 0
            hotel_price = (hotel.get("current_price", 0) * 3) if hotel else 0
            total_price = flight_price + hotel_price
            
            bundle = {
                "bundle_id": f"option_{i+1}",
                "name": f"{params.get('origin', 'SFO')} → {params.get('destination', 'MIA')} + {hotel.get('name', 'Hotel') if hotel else 'Hotel'}",
                "flight": flight,
                "hotel": hotel,
                "total_price": total_price,
                "savings": total_price * 0.1,
                "deal_score": ((flight.get("deal_score", 70) if flight else 70) + (hotel.get("deal_score", 70) if hotel else 70)) // 2,
                "explanation": generate_explanation({
                    "total_price": total_price,
                    "flight": flight or {},
                    "hotel": hotel or {}
                }),
                "destination": params.get("destination"),
                "origin": params.get("origin", "SFO")
            }
            bundles.append(bundle)
        
        bundles.sort(key=lambda b: b["deal_score"], reverse=True)
        return bundles
    
    def _get_bundle_by_id(self, bundle_id: str) -> Optional[Dict]:
        """Get bundle by ID from cache or session"""
        # Normalize bundle_id
        bundle_id = bundle_id.lower().replace(" ", "_")
        if bundle_id.startswith("option"):
            bundle_id = bundle_id.replace("option", "option_").replace("__", "_")
        
        # Try to extract number
        import re
        match = re.search(r'(\d+)', bundle_id)
        if match:
            idx = int(match.group(1)) - 1  # Convert to 0-indexed
            if 0 <= idx < len(self._cached_bundles):
                return self._cached_bundles[idx]
        
        # Search by bundle_id
        for bundle in self._cached_bundles:
            if bundle.get("bundle_id", "").lower() == bundle_id:
                return bundle
        
        # Try session store
        if session_store:
            bundles = session_store.get_previous_recommendations(self.session_id)
            if bundles:
                self._cached_bundles = bundles
                if match:
                    idx = int(match.group(1)) - 1
                    if 0 <= idx < len(bundles):
                        return bundles[idx]
        
        return None


# ============================================
# Main Concierge Agent Class
# ============================================
class ConciergeAgent:
    """
    Single LLM Agent with MRKL Tools.
    LLM decides which tool to call based on user query.
    """
    
    def __init__(self):
        self.openai_client = None
        
        if USE_OPENAI and OPENAI_AVAILABLE:
            try:
                self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
                logger.info("ConciergeAgent: Using OpenAI with function calling")
            except Exception as e:
                logger.warning(f"OpenAI init failed: {e}")
        
        self.system_prompt = """You are a travel concierge assistant for a Kayak-like booking platform.

You have access to these tools:
1. intent_parser - Extract travel details from user query
2. bundle_matcher - Find flight+hotel bundles
3. price_analyzer - Check if a deal is good
4. watch_creator - Set up price alerts
5. quote_generator - Get booking quote
6. policy_lookup - Answer policy questions

For new searches, use bundle_matcher with the destination.
For analysis questions, use price_analyzer.
For alert requests, use watch_creator.
For booking requests, use quote_generator.
For policy questions, use policy_lookup.

Be concise and helpful. Always use tools to provide accurate information."""

    async def process_message(
        self,
        query: str,
        user_id: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Process user message using MRKL tool pattern"""
        
        # Get or create session
        if session_store:
            session_id = session_store.get_or_create_session(user_id, session_id)
        else:
            session_id = session_id or f"sess_{user_id}_{uuid.uuid4().hex[:8]}"
        
        # Initialize tools
        tools = MRKLTools(session_id, user_id)
        
        # Load previous recommendations into tools cache
        if session_store:
            prev_recs = session_store.get_previous_recommendations(session_id)
            if prev_recs:
                tools._cached_bundles = prev_recs
        
        # Call LLM with tools
        if self.openai_client:
            result = await self._call_with_openai_tools(query, tools)
        elif OLLAMA_AVAILABLE:
            result = await self._call_with_ollama_tools(query, tools)
        else:
            result = await self._call_with_keyword_fallback(query, tools)
        
        # Format response with backward-compatible fields
        response_data = {
            "response": result.get("response", ""),
            "session_id": session_id,
            "user_id": user_id,
            "type": result.get("type", "message"),
            "tool_used": result.get("tool_used"),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Add type-specific fields for backward compatibility
        data = result.get("data", {})
        if result.get("type") == "recommendations":
            response_data["bundles"] = data.get("bundles", [])
        elif result.get("type") == "quote":
            response_data["quote"] = data
        elif result.get("type") == "watch_created":
            response_data["watches"] = [data] if data else []
        elif result.get("type") == "analysis":
            response_data["analysis"] = data
        elif result.get("type") == "policy":
            response_data["policy_answer"] = data.get("answer")
        
        return response_data
    
    async def _call_with_openai_tools(self, query: str, tools: MRKLTools) -> Dict:
        """Use OpenAI function calling to select and execute tools"""
        
        try:
            # First call: let LLM decide which tool to use
            response = self.openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": query}
                ],
                tools=MRKL_TOOLS,
                tool_choice="auto",
                max_tokens=500
            )
            
            message = response.choices[0].message
            
            # Check if LLM wants to call a tool
            if message.tool_calls:
                tool_call = message.tool_calls[0]
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                
                logger.info(f"LLM selected tool: {tool_name} with args: {tool_args}")
                
                # Execute the tool
                tool_result = await self._execute_tool(tools, tool_name, tool_args)
                
                # Second call: generate natural language response
                follow_up = self.openai_client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": query},
                        message,
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(tool_result)
                        }
                    ],
                    max_tokens=500
                )
                
                return {
                    "response": follow_up.choices[0].message.content,
                    "type": self._get_response_type(tool_name),
                    "tool_used": tool_name,
                    "data": tool_result
                }
            
            # No tool call, just return the message
            return {
                "response": message.content,
                "type": "message",
                "tool_used": None
            }
            
        except Exception as e:
            logger.error(f"OpenAI tool call error: {e}")
            return await self._call_with_keyword_fallback(query, tools)
    
    async def _call_with_ollama_tools(self, query: str, tools: MRKLTools) -> Dict:
        """Use Ollama with tools (if supported) or fallback to keyword matching"""
        
        try:
            # Try Ollama with tools format
            response = ollama.chat(
                model=OLLAMA_MODEL,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": query}
                ],
                tools=MRKL_TOOLS
            )
            
            message = response.get("message", {})
            
            if message.get("tool_calls"):
                tool_call = message["tool_calls"][0]
                tool_name = tool_call["function"]["name"]
                tool_args = tool_call["function"]["arguments"]
                
                if isinstance(tool_args, str):
                    tool_args = json.loads(tool_args)
                
                logger.info(f"Ollama selected tool: {tool_name}")
                
                tool_result = await self._execute_tool(tools, tool_name, tool_args)
                
                # Generate response with tool result
                follow_up = ollama.chat(
                    model=OLLAMA_MODEL,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": query},
                        {"role": "assistant", "content": f"Tool result: {json.dumps(tool_result)}"},
                        {"role": "user", "content": "Please summarize this result for the user."}
                    ]
                )
                
                return {
                    "response": follow_up["message"]["content"],
                    "type": self._get_response_type(tool_name),
                    "tool_used": tool_name,
                    "data": tool_result
                }
            
            return {
                "response": message.get("content", "How can I help you with travel planning?"),
                "type": "message",
                "tool_used": None
            }
            
        except Exception as e:
            logger.warning(f"Ollama tools not supported, using keyword fallback: {e}")
            return await self._call_with_keyword_fallback(query, tools)
    
    async def _call_with_keyword_fallback(self, query: str, tools: MRKLTools) -> Dict:
        """Fallback: use keyword matching to select tools (no LLM tool selection)"""
        
        query_lower = query.lower().strip()
        
        # Check for confirmation keywords (user saying "yes" after a quote)
        confirm_keywords = ["yes", "confirm", "sure", "ok", "okay", "go ahead", 
                          "do it", "let's do it", "sounds good", "perfect", "yeah", "yes please"]
        
        # Handle booking confirmation
        if query_lower in confirm_keywords or any(kw == query_lower for kw in confirm_keywords):
            # Check if we have a pending quote
            if tools._cached_bundles:
                tool_name = "booking_confirmation"
                bundle = tools._cached_bundles[0]
                tool_result = {
                    "tool": "booking_confirmation",
                    "status": "confirmed",
                    "bundle_id": bundle.get("bundle_id"),
                    "bundle_name": bundle.get("name"),
                    "redirect_url": f"/booking/{bundle.get('bundle_id')}",
                    "message": f"Great! Redirecting you to complete your booking for {bundle.get('name')}..."
                }
                return {
                    "response": tool_result["message"],
                    "type": "booking_confirmation",
                    "tool_used": tool_name,
                    "data": tool_result
                }
        
        # Keyword-based tool selection
        if any(kw in query_lower for kw in ["cancel", "refund", "pet", "parking", "breakfast", "wifi", "policy", "check-in", "check-out"]):
            tool_name = "policy_lookup"
            tool_result = await tools.policy_lookup(question=query)
            
        elif any(kw in query_lower for kw in ["watch", "alert", "notify", "track", "let me know", "tell me if"]):
            tool_name = "watch_creator"
            # Extract bundle reference
            bundle_id = "option_1"  # Default to first option
            import re
            match = re.search(r'option\s*(\d+)', query_lower)
            if match:
                bundle_id = f"option_{match.group(1)}"
            tool_result = await tools.watch_creator(bundle_id=bundle_id)
            
        elif any(kw in query_lower for kw in ["analyze", "good deal", "worth it", "is this good", "compare"]):
            tool_name = "price_analyzer"
            bundle_id = "option_1"
            import re
            match = re.search(r'option\s*(\d+)', query_lower)
            if match:
                bundle_id = f"option_{match.group(1)}"
            tool_result = await tools.price_analyzer(bundle_id=bundle_id)
            
        elif any(kw in query_lower for kw in ["book", "reserve", "quote", "checkout", "total cost", "proceed"]):
            tool_name = "quote_generator"
            bundle_id = "option_1"
            import re
            match = re.search(r'option\s*(\d+)', query_lower)
            if match:
                bundle_id = f"option_{match.group(1)}"
            tool_result = await tools.quote_generator(bundle_id=bundle_id)
            
        else:
            # Default: search for bundles
            tool_name = "bundle_matcher"
            # Extract origin, destination, and dates
            origin, destination = self._extract_origin_destination(query)
            departure_date, return_date = self._extract_dates(query)
            tool_result = await tools.bundle_matcher(
                origin=origin,
                destination=destination,
                departure_date=departure_date,
                return_date=return_date
            )
        
        # Format response
        response = self._format_tool_result(tool_name, tool_result)
        
        return {
            "response": response,
            "type": self._get_response_type(tool_name),
            "tool_used": tool_name,
            "data": tool_result
        }
    
    async def _execute_tool(self, tools: MRKLTools, tool_name: str, tool_args: Dict) -> Dict:
        """Execute a tool by name"""
        
        tool_map = {
            "intent_parser": tools.intent_parser,
            "bundle_matcher": tools.bundle_matcher,
            "price_analyzer": tools.price_analyzer,
            "watch_creator": tools.watch_creator,
            "quote_generator": tools.quote_generator,
            "policy_lookup": tools.policy_lookup
        }
        
        tool_func = tool_map.get(tool_name)
        if tool_func:
            return await tool_func(**tool_args)
        
        return {"error": f"Unknown tool: {tool_name}"}
    
    def _get_response_type(self, tool_name: str) -> str:
        """Map tool name to response type"""
        type_map = {
            "intent_parser": "clarification",
            "bundle_matcher": "recommendations",
            "price_analyzer": "analysis",
            "watch_creator": "watch_created",
            "quote_generator": "quote",
            "policy_lookup": "policy",
            "booking_confirmation": "booking_confirmation"
        }
        return type_map.get(tool_name, "message")
    
    def _extract_origin_destination(self, query: str) -> tuple:
        """Extract origin and destination from query"""
        import re
        
        # Common city to airport code mapping
        city_codes = {
            "miami": "MIA", "new york": "JFK", "los angeles": "LAX",
            "san francisco": "SFO", "chicago": "ORD", "boston": "BOS",
            "seattle": "SEA", "denver": "DEN", "vegas": "LAS", "las vegas": "LAS",
            "orlando": "MCO", "dallas": "DFW", "atlanta": "ATL",
            "mumbai": "BOM", "delhi": "DEL", "bangalore": "BLR", "bengaluru": "BLR",
            "chennai": "MAA", "kolkata": "CCU", "hyderabad": "HYD"
        }
        
        query_lower = query.lower()
        origin = None
        destination = None
        
        # Pattern: "from X to Y" or "X to Y"
        from_to_pattern = r'from\s+(\w+(?:\s+\w+)?)\s+to\s+(\w+(?:\s+\w+)?)'
        match = re.search(from_to_pattern, query_lower)
        if match:
            origin_str = match.group(1).strip()
            dest_str = match.group(2).strip()
            origin = city_codes.get(origin_str, origin_str.upper()[:3])
            destination = city_codes.get(dest_str, dest_str.upper()[:3])
        else:
            # Pattern: "to Y" (destination only)
            to_pattern = r'\bto\s+(\w+(?:\s+\w+)?)'
            match = re.search(to_pattern, query_lower)
            if match:
                dest_str = match.group(1).strip()
                destination = city_codes.get(dest_str, dest_str.upper()[:3])
        
        # Check for 3-letter airport codes
        codes = re.findall(r'\b([A-Z]{3})\b', query.upper())
        if len(codes) >= 2 and not origin:
            origin = codes[0]
            destination = codes[1]
        elif len(codes) == 1 and not destination:
            destination = codes[0]
        
        return origin, destination
    
    def _extract_dates(self, query: str) -> tuple:
        """Extract departure and return dates from query"""
        import re
        from datetime import datetime, timedelta
        
        departure_date = None
        return_date = None
        
        # Pattern: "December 15-20" or "Dec 15 - Dec 20"
        range_pattern = r'(\w+\s+\d{1,2})\s*[-–to]+\s*(\w+\s+\d{1,2}|\d{1,2})'
        match = re.search(range_pattern, query, re.IGNORECASE)
        if match:
            departure_date = match.group(1)
            return_date = match.group(2)
        
        # Pattern: "2024-12-15 to 2024-12-20"
        iso_pattern = r'(\d{4}-\d{2}-\d{2})\s*(?:to|-)\s*(\d{4}-\d{2}-\d{2})'
        match = re.search(iso_pattern, query)
        if match:
            departure_date = match.group(1)
            return_date = match.group(2)
        
        # Pattern: "next week", "this weekend"
        if "next week" in query.lower():
            today = datetime.now()
            next_monday = today + timedelta(days=(7 - today.weekday()))
            departure_date = next_monday.strftime("%Y-%m-%d")
            return_date = (next_monday + timedelta(days=5)).strftime("%Y-%m-%d")
        elif "this weekend" in query.lower():
            today = datetime.now()
            saturday = today + timedelta(days=(5 - today.weekday()) % 7)
            departure_date = saturday.strftime("%Y-%m-%d")
            return_date = (saturday + timedelta(days=2)).strftime("%Y-%m-%d")
        
        return departure_date, return_date
    
    def _format_tool_result(self, tool_name: str, result: Dict) -> str:
        """Format tool result as natural language"""
        
        if "error" in result:
            return result["error"]
        
        if tool_name == "bundle_matcher":
            # Check if clarification is needed
            if result.get("needs_clarification"):
                return result.get("clarification_question", "Could you provide more details about your trip?")
            
            bundles = result.get("bundles", [])
            if not bundles:
                return f"I couldn't find any deals for {result.get('destination')}. Could you tell me where you're flying from?"
            
            lines = [f"**Here are {len(bundles)} options for {result.get('destination')}:**\n"]
            for i, b in enumerate(bundles, 1):
                lines.append(f"**Option {i}: {b['name']}**")
                lines.append(f"💰 ${b['total_price']:.0f} total (save ${b['savings']:.0f})")
                lines.append(f"⭐ Deal Score: {b['deal_score']}/100")
                exp = b.get("explanation", {})
                lines.append(f"💡 {exp.get('why_this', 'Good value')}")
                lines.append("")
            lines.append("Want me to analyze any option, create a price alert, or get a quote?")
            return "\n".join(lines)
        
        elif tool_name == "price_analyzer":
            return (
                f"**Price Analysis for {result.get('bundle_id', 'this deal')}:**\n"
                f"Current Price: ${result.get('current_price', 0):.0f}\n"
                f"30-Day Average: ${result.get('avg_30d_price', 0):.0f}\n"
                f"Discount: {result.get('discount_pct', 0):.1f}%\n"
                f"Verdict: **{result.get('verdict_text', 'Fair price')}**"
            )
        
        elif tool_name == "watch_creator":
            return (
                f"✅ **Watch Created!**\n"
                f"Tracking: {result.get('bundle_name', 'your selection')}\n"
                f"{result.get('message', 'I will notify you of price changes.')}"
            )
        
        elif tool_name == "quote_generator":
            breakdown = result.get("breakdown", {})
            return (
                f"**Booking Quote: {result.get('bundle_name', '')}**\n\n"
                f"Flight: ${breakdown.get('flight', {}).get('total', 0):.0f}\n"
                f"Hotel ({result.get('nights', 3)} nights): ${breakdown.get('hotel', {}).get('total', 0):.0f}\n"
                f"Subtotal: ${breakdown.get('subtotal', 0):.0f}\n"
                f"Taxes & Fees: ${breakdown.get('taxes', 0) + breakdown.get('fees', 0):.0f}\n"
                f"**Grand Total: ${breakdown.get('grand_total', 0):.0f}**\n\n"
                f"{result.get('next_step', 'Reply confirm to proceed.')}"
            )
        
        elif tool_name == "policy_lookup":
            return f"**Policy Info:**\n{result.get('answer', 'Information not available.')}"
        
        return str(result)


# ============================================
# Global Instance
# ============================================
concierge_agent = ConciergeAgent()


# ============================================
# Convenience Function
# ============================================
async def process_chat(query: str, user_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Process a chat message using MRKL tools"""
    return await concierge_agent.process_message(query, user_id, session_id)


# ============================================
# For Testing
# ============================================
if __name__ == "__main__":
    import asyncio
    
    async def test():
        test_queries = [
            ("Find me flights to Miami", "user123"),
            ("Is option 1 a good deal?", "user123"),
            ("Watch option 1 for me", "user123"),
            ("What's the cancellation policy?", "user123"),
            ("Book option 1", "user123")
        ]
        
        for query, user_id in test_queries:
            print(f"\n{'='*50}")
            print(f"Query: {query}")
            result = await process_chat(query, user_id)
            print(f"Tool Used: {result.get('tool_used')}")
            print(f"Response: {result['response'][:300]}...")
    
    asyncio.run(test())
