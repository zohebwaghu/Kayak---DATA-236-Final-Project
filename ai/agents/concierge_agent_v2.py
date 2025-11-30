# agents/concierge_agent_v2.py
"""
Enhanced Concierge Agent (chat-facing)
Implements all 5 user journeys:
1. Tell me what I should book - Bundle recommendations
2. Refine without starting over - Context preservation
3. Keep an eye on it - Watch creation
4. Decide with confidence - Price analysis
5. Book or hand off cleanly - Full quotes

Uses:
- Intent Parser for understanding queries
- Session Store for multi-turn context
- Deals Cache for recommendations
- Explainer for "Why this" / "What to watch"
- Quote Generator for complete quotes
"""

import os
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from loguru import logger
import httpx

# LLM
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

# Import our modules
try:
    from llm.intent_parser import intent_parser, ParsedIntent
except ImportError:
    intent_parser = None

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


# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
USE_OPENAI = bool(OPENAI_API_KEY) and not OPENAI_API_KEY.startswith("sk-your")


class ConciergeAgent:
    """
    Enhanced Concierge Agent for travel recommendations.
    Handles natural language conversations and generates actionable recommendations.
    """
    
    def __init__(self):
        self.openai_client = None
        
        if USE_OPENAI and OPENAI_AVAILABLE:
            try:
                self.openai_client = OpenAI(api_key=OPENAI_API_KEY)
                logger.info("ConciergeAgent: Using OpenAI")
            except Exception as e:
                logger.warning(f"ConciergeAgent: OpenAI init failed: {e}")
        
        # System prompt for LLM
        self.system_prompt = """You are a helpful travel concierge for a Kayak-like booking platform.
Your role is to:
1. Understand user's travel needs (dates, destination, budget, preferences)
2. Recommend flight + hotel bundles
3. Explain why recommendations are good deals
4. Answer questions about policies (cancellation, pets, parking)
5. Help users set price alerts

Be concise and helpful. When you have specific recommendations, present them clearly.
If you need more information, ask ONE clarifying question at most.
If you need more information, ask ONE clarifying question at most.
Always be friendly and professional."""

    async def _fetch_from_search_service(self, destination: str, origin: str) -> Dict[str, List]:
        """Fetch real flights and hotels from Search Service"""
        flights = []
        hotels = []
        
        try:
            async with httpx.AsyncClient() as client:
                # Fetch Flights
                logger.info(f"Fetching flights: {origin} -> {destination}")
                flight_res = await client.get(
                    "http://search-service:3003/api/v1/search/flights",
                    params={"origin": origin, "destination": destination}
                )
                if flight_res.status_code == 200:
                    flights = flight_res.json().get("data", [])
                    # Normalize for bundle builder
                    for f in flights:
                        f["current_price"] = f.get("price", 0)
                        f["deal_score"] = 80 # Default score for live data
                
                # Fetch Hotels
                logger.info(f"Fetching hotels in {destination}")
                hotel_res = await client.get(
                    "http://search-service:3003/api/v1/search/hotels",
                    params={"city": destination}
                )
                if hotel_res.status_code == 200:
                    hotels = hotel_res.json().get("data", [])
                    # Normalize
                    for h in hotels:
                        h["current_price"] = h.get("pricePerNight", h.get("price", 0))
                        h["deal_score"] = 80
                        
        except Exception as e:
            logger.error(f"Search Service error: {e}")
            
        return {"flights": flights, "hotels": hotels}
    
    async def process_message(
        self,
        query: str,
        user_id: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a user message and generate response.
        Main entry point for chat.
        """
        # Get or create session
        if session_store:
            session_id = session_store.get_or_create_session(user_id, session_id)
            session = session_store.get_session(session_id)
        else:
            session_id = session_id or f"sess_{user_id}_{uuid.uuid4().hex[:8]}"
            session = {}
        
        # Parse intent
        parsed_intent = None
        if intent_parser:
            context = session_store.get_search_params(session_id) if session_store else {}
            parsed_intent = intent_parser.parse(query, context)
            
            # Merge with session context
            if session_store and parsed_intent:
                session_store.merge_intent(session_id, parsed_intent.to_dict())
        
        # Detect query type and route accordingly
        query_lower = query.lower()
        
        # Check for policy questions
        if self._is_policy_question(query_lower):
            return await self._handle_policy_question(query, session, session_id, user_id)
        
        # Check for watch/alert requests
        if self._is_watch_request(query_lower):
            return await self._handle_watch_request(query, session, session_id, user_id)
        
        # Check for price analysis requests
        if self._is_price_analysis_request(query_lower):
            return await self._handle_price_analysis(query, session, session_id, user_id)
        
        # Check for quote/booking requests
        if self._is_quote_request(query_lower):
            return await self._handle_quote_request(query, session, session_id, user_id)
        
        # Default: Generate recommendations
        return await self._handle_recommendation_request(
            query, parsed_intent, session, session_id, user_id
        )
    
    def _is_policy_question(self, query: str) -> bool:
        """Check if query is about policies"""
        policy_keywords = ["cancel", "refund", "pet", "parking", "breakfast", 
                          "wifi", "baggage", "check-in", "check-out", "policy"]
        return any(kw in query for kw in policy_keywords)
    
    def _is_watch_request(self, query: str) -> bool:
        """Check if query is about setting a watch/alert"""
        watch_keywords = ["watch", "alert", "notify", "track", "monitor", 
                         "let me know", "tell me if", "drops below"]
        return any(kw in query for kw in watch_keywords)
    
    def _is_price_analysis_request(self, query: str) -> bool:
        """Check if query is asking about price analysis"""
        analysis_keywords = ["good deal", "good price", "worth it", "actually good",
                           "compare", "vs", "versus", "better deal"]
        return any(kw in query for kw in analysis_keywords)
    
    def _is_quote_request(self, query: str) -> bool:
        """Check if query is requesting a quote/booking"""
        quote_keywords = ["book", "reserve", "quote", "total cost", "full price",
                         "complete", "proceed", "checkout"]
        return any(kw in query for kw in quote_keywords)
    
    async def _handle_policy_question(
        self, query: str, session: Dict, session_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Handle policy-related questions"""
        # Try to find relevant listing from session
        prev_recs = session.get("previous_recommendations", [])
        listing_id = None
        
        if prev_recs:
            # Use most recent recommendation
            listing_id = prev_recs[0].get("hotel", {}).get("hotel_id") or \
                        prev_recs[0].get("flight", {}).get("flight_id")
        
        # Get policy answer
        if listing_id and policy_store:
            answer = answer_policy_question(listing_id, query)
        else:
            # Use LLM for general policy questions
            answer = await self._get_llm_response(
                f"Answer this travel policy question: {query}"
            )
        
        return {
            "response": answer,
            "session_id": session_id,
            "user_id": user_id,
            "type": "policy_answer",
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _handle_watch_request(
        self, query: str, session: Dict, session_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Handle watch/alert creation requests"""
        # Extract threshold from query
        import re
        
        # Try to find price threshold
        price_match = re.search(r'\$(\d+)', query)
        price_threshold = float(price_match.group(1)) if price_match else None
        
        # Try to find inventory threshold
        inventory_match = re.search(r'(\d+)\s*(rooms?|seats?|left)', query)
        inventory_threshold = int(inventory_match.group(1)) if inventory_match else None
        
        # Get listing from previous recommendations
        prev_recs = session.get("previous_recommendations", [])
        
        if not prev_recs:
            return {
                "response": "I don't have a specific listing to watch. Could you first search for flights or hotels, then ask me to watch a specific one?",
                "session_id": session_id,
                "user_id": user_id,
                "type": "clarification",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Create watch for the first recommendation
        rec = prev_recs[0]
        listing_id = rec.get("bundle_id") or rec.get("deal_id")
        listing_name = rec.get("name") or f"{rec.get('destination', 'Trip')} package"
        listing_type = "bundle"
        current_price = rec.get("total_price", 0)
        
        watches_created = []
        
        if watch_store and WatchCreate:
            # Create price watch
            if price_threshold:
                watch = watch_store.create_watch(WatchCreate(
                    user_id=user_id,
                    listing_type=listing_type,
                    listing_id=listing_id,
                    listing_name=listing_name,
                    watch_type="price",
                    threshold=price_threshold,
                    current_value=current_price
                ))
                watches_created.append(f"price below ${price_threshold}")
            
            # Create inventory watch
            if inventory_threshold:
                watch = watch_store.create_watch(WatchCreate(
                    user_id=user_id,
                    listing_type=listing_type,
                    listing_id=listing_id,
                    listing_name=listing_name,
                    watch_type="inventory",
                    threshold=inventory_threshold,
                    current_value=rec.get("availability", 10)
                ))
                watches_created.append(f"availability below {inventory_threshold}")
        
        if watches_created:
            response = f"Got it! I'll alert you when {listing_name} has: {', '.join(watches_created)}."
        else:
            response = "I couldn't determine what to watch for. Please specify a price (e.g., 'below $800') or availability (e.g., 'less than 5 rooms')."
        
        return {
            "response": response,
            "session_id": session_id,
            "user_id": user_id,
            "type": "watch_created",
            "watches": watches_created,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _handle_price_analysis(
        self, query: str, session: Dict, session_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Handle 'Decide with confidence' - price analysis"""
        prev_recs = session.get("previous_recommendations", [])
        
        if not prev_recs:
            return {
                "response": "I don't have a listing to analyze. Search for something first, then ask if it's a good deal!",
                "session_id": session_id,
                "user_id": user_id,
                "type": "clarification",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        rec = prev_recs[0]
        
        # Generate price analysis
        if explainer:
            analysis = explainer.generate_price_analysis(
                current_price=rec.get("total_price", rec.get("current_price", 0)),
                avg_30d_price=rec.get("avg_30d_price", rec.get("total_price", 0) * 1.15),
                similar_options=rec.get("similar_options", [])
            )
            
            response = f"""**Price Analysis: {rec.get('name', 'This deal')}**

Current Price: ${analysis.current_price:.0f}
30-day Average: ${analysis.avg_30d_price:.0f}
Difference: {analysis.price_vs_avg_percent:.0f}%

**Verdict: {analysis.verdict}**

{analysis.verdict_explanation}"""
        else:
            current = rec.get("total_price", 0)
            avg = rec.get("avg_30d_price", current * 1.15)
            diff_pct = ((current - avg) / avg) * 100 if avg > 0 else 0
            
            if diff_pct <= -15:
                verdict = "EXCELLENT DEAL"
            elif diff_pct <= -5:
                verdict = "GREAT DEAL"
            else:
                verdict = "FAIR PRICE"
            
            response = f"This is priced at ${current:.0f}, which is {abs(diff_pct):.0f}% {'below' if diff_pct < 0 else 'above'} the 30-day average. Verdict: **{verdict}**"
        
        return {
            "response": response,
            "session_id": session_id,
            "user_id": user_id,
            "type": "price_analysis",
            "analysis": analysis.__dict__ if explainer else None,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _handle_quote_request(
        self, query: str, session: Dict, session_id: str, user_id: str
    ) -> Dict[str, Any]:
        """Handle 'Book or hand off cleanly' - generate full quote"""
        prev_recs = session.get("previous_recommendations", [])
        
        if not prev_recs:
            return {
                "response": "I don't have a package to quote. Search for flights and hotels first!",
                "session_id": session_id,
                "user_id": user_id,
                "type": "clarification",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Generate full quote for first recommendation
        bundle = prev_recs[0]
        quote = generate_quote(bundle)
        
        response = f"""**Complete Quote: {bundle.get('name', 'Your Trip')}**

**Flight:**
- {quote.get('flight_quote', {}).get('route', 'Flight')}
- Base fare: ${quote.get('flight_quote', {}).get('pricing', {}).get('base_fare', 0):.0f}
- Taxes & fees: ${quote.get('flight_quote', {}).get('pricing', {}).get('taxes', 0):.0f}
- Flight total: ${quote.get('flight_quote', {}).get('pricing', {}).get('total', 0):.0f}

**Hotel:**
- {quote.get('hotel_quote', {}).get('name', 'Hotel')} ({quote.get('hotel_quote', {}).get('nights', 0)} nights)
- Room rate: ${quote.get('hotel_quote', {}).get('pricing', {}).get('rate_per_night', 0):.0f}/night
- Taxes & fees: ${quote.get('hotel_quote', {}).get('pricing', {}).get('taxes', 0):.0f}
- Hotel total: ${quote.get('hotel_quote', {}).get('pricing', {}).get('total', 0):.0f}

**Grand Total: ${quote.get('summary', {}).get('grand_total', 0):.0f}**
Bundle Savings: ${quote.get('summary', {}).get('bundle_savings', 0):.0f}

**Cancellation Policy:**
{quote.get('cancellation_summary', 'See individual policies')}

Quote valid for 30 minutes. Ready to book?"""
        
        return {
            "response": response,
            "session_id": session_id,
            "user_id": user_id,
            "type": "quote",
            "quote": quote,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def _handle_recommendation_request(
        self,
        query: str,
        parsed_intent: Optional[ParsedIntent],
        session: Dict,
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Handle 'Tell me what I should book' - generate recommendations"""
        
        # Check if we need clarification
        if parsed_intent and parsed_intent.needs_clarification:
            return {
                "response": parsed_intent.clarification_question,
                "session_id": session_id,
                "user_id": user_id,
                "type": "clarification",
                "parsed_intent": parsed_intent.to_dict() if parsed_intent else None,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Get search parameters
        if session_store:
            params = session_store.get_search_params(session_id)
        elif parsed_intent:
            params = parsed_intent.to_dict()
        else:
            params = {}
        
        # Search for deals
        destination = params.get("destination", "MIA")  # Default to Miami
        origin = params.get("origin", "SFO")
        budget = params.get("budget")
        constraints = params.get("constraints", [])
        
        # Get matching deals (from Search Service)
        # deals = get_deals_for_bundle(
        #     destination=destination,
        #     origin=origin,
        #     max_flight_price=budget * 0.4 if budget else None,
        #     max_hotel_price=budget * 0.6 / 3 if budget else None,  # Assume 3 nights
        #     tags=constraints
        # )
        
        # FETCH LIVE DATA
        deals = await self._fetch_from_search_service(
            destination=destination,
            origin=origin
        )
        
        # Build bundles
        bundles = self._build_bundles(deals, params)
        
        # Check for changes from previous
        changes = []
        if session_store:
            prev_recs = session_store.get_previous_recommendations(session_id)
            if prev_recs:
                changes = session_store.compare_with_previous(session_id, bundles)
            
            # Save new recommendations
            session_store.save_recommendations(session_id, bundles)
        
        # Generate response
        if bundles:
            response = self._format_bundle_recommendations(bundles, params, changes)
        else:
            response = await self._get_llm_response(
                f"Help the user find travel options. Query: {query}. "
                f"Destination: {destination}, Budget: {budget}"
            )
        
        return {
            "response": response,
            "session_id": session_id,
            "user_id": user_id,
            "type": "recommendations",
            "bundles": bundles[:3],  # Top 3
            "changes": changes if changes else None,
            "parsed_intent": parsed_intent.to_dict() if parsed_intent else None,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    def _build_bundles(self, deals: Dict[str, List], params: Dict) -> List[Dict]:
        """Build flight+hotel bundles from deals"""
        flights = deals.get("flights", [])
        hotels = deals.get("hotels", [])
        
        if not flights and not hotels:
            return []
        
        bundles = []
        
        # Create up to 3 bundles
        for i in range(min(3, max(len(flights), len(hotels)))):
            flight = flights[i] if i < len(flights) else (flights[0] if flights else None)
            hotel = hotels[i] if i < len(hotels) else (hotels[0] if hotels else None)
            
            if not flight and not hotel:
                continue
            
            flight_price = flight.get("current_price", 0) if flight else 0
            hotel_price = hotel.get("current_price", 0) * 3 if hotel else 0  # 3 nights
            total_price = flight_price + hotel_price
            separate_price = total_price * 1.1  # 10% more if booked separately
            
            # Generate explanation
            exp = generate_explanation({
                "total_price": total_price,
                "avg_30d_price": total_price * 1.15,
                "rating": hotel.get("metadata", {}).get("star_rating", 4) if hotel else 4,
                "rooms_left": hotel.get("availability", 5) if hotel else 5,
                "flight": flight or {},
                "hotel": {"amenities": hotel.get("tags", []), "policy": {"refundable": True}} if hotel else {}
            })
            
            bundle = {
                "bundle_id": f"bundle_{i+1}_{datetime.utcnow().strftime('%H%M%S')}",
                "name": f"{params.get('origin', 'SFO')} → {params.get('destination', 'MIA')} + {hotel.get('name', 'Hotel') if hotel else 'Hotel'}",
                "flight": flight,
                "hotel": hotel,
                "total_price": total_price,
                "separate_price": separate_price,
                "savings": separate_price - total_price,
                "deal_score": (flight.get("deal_score", 70) + (hotel.get("deal_score", 70) if hotel else 70)) // 2,
                "explanation": exp,
                "destination": params.get("destination", "MIA"),
                "origin": params.get("origin", "SFO")
            }
            
            bundles.append(bundle)
        
        # Sort by deal score
        bundles.sort(key=lambda b: b["deal_score"], reverse=True)
        
        return bundles
    
    def _format_bundle_recommendations(
        self, bundles: List[Dict], params: Dict, changes: List[Dict]
    ) -> str:
        """Format bundles as readable response"""
        lines = []
        
        # Header with context
        if changes:
            constraints = params.get("constraints", [])
            lines.append(f"**Updated based on: {', '.join(constraints) if constraints else 'your preferences'}**\n")
            
            # Show changes
            for change in changes[:3]:
                icon = "✅" if change.get("is_improvement") else "🔺"
                lines.append(f"{icon} {change['field']}: {change['previous_value']} → {change['new_value']}")
            lines.append("")
        else:
            dest = params.get("destination", "your destination")
            lines.append(f"**Here are {len(bundles)} options for {dest}:**\n")
        
        # Format each bundle
        for i, bundle in enumerate(bundles[:3], 1):
            lines.append(f"**Option {i}: {bundle['name']}**")
            lines.append(f"💰 ${bundle['total_price']:.0f} total (save ${bundle['savings']:.0f})")
            lines.append(f"⭐ Deal Score: {bundle['deal_score']}/100")
            
            exp = bundle.get("explanation", {})
            lines.append(f"💡 Why: {exp.get('why_this', 'Good value')}")
            lines.append(f"⚠️ Watch: {exp.get('what_to_watch', 'Book soon')}")
            lines.append("")
        
        lines.append("Want me to analyze any of these, create a price alert, or get a full quote?")
        
        return "\n".join(lines)
    
    async def _get_llm_response(self, prompt: str) -> str:
        """Get response from LLM"""
        if self.openai_client:
            try:
                response = self.openai_client.chat.completions.create(
                    model=OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": self.system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=500,
                    temperature=0.7
                )
                return response.choices[0].message.content
            except Exception as e:
                logger.error(f"OpenAI error: {e}")
        
        # Fallback response
        return "I'd be happy to help you find great travel deals. Could you tell me where you'd like to go and when?"


# ============================================
# Global Instance
# ============================================

concierge_agent = ConciergeAgent()


# ============================================
# Convenience Function
# ============================================

async def process_chat(query: str, user_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Process a chat message"""
    return await concierge_agent.process_message(query, user_id, session_id)
