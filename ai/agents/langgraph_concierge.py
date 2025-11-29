# agents/langgraph_concierge.py
"""
LangGraph-based Concierge Agent
Implements Orchestrator-Workers pattern with graph-based workflow

Architecture (matches DATA 236 course material):
┌─────────────────┐
│   supervisor    │  (Parse intent, route to worker)
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼          ▼
┌────────┐┌────────┐┌──────────┐┌────────┐┌──────────┐
│ policy ││ watch  ││  price   ││ quote  ││ recommend│
│ agent  ││ agent  ││ analysis ││ agent  ││  agent   │
└────┬───┘└───┬────┘└────┬─────┘└───┬────┘└────┬─────┘
     └────────┴──────────┴──────────┴──────────┘
                         │
                ┌────────▼────────┐
                │   synthesizer   │  (Format final response)
                └────────┬────────┘
                         ▼
                        END

This follows:
- Orchestrator-Workers Pattern (from Multi-Agent Design Patterns slides)
- LangGraph StateGraph (from LangGraph lecture)
- ReAct-style tool usage
"""

import os
import re
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List, TypedDict, Literal
from loguru import logger

# ============================================
# LangGraph Imports
# ============================================
from langgraph.graph import StateGraph, END

# ============================================
# Reuse existing modules (no changes needed)
# ============================================
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

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
USE_OPENAI = bool(OPENAI_API_KEY) and not OPENAI_API_KEY.startswith("sk-your")

# Initialize OpenAI client
openai_client = None
if USE_OPENAI and OPENAI_AVAILABLE:
    try:
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
    except Exception as e:
        logger.warning(f"OpenAI init failed: {e}")


# ============================================
# State Definition (TypedDict for LangGraph)
# ============================================
class TravelState(TypedDict):
    """
    Shared state passed between all nodes in the graph.
    This is the 'blackboard' that all agents read/write.
    """
    # Input
    query: str
    user_id: str
    session_id: str
    
    # Routing
    intent: str  # policy | watch | price_analysis | quote | recommendation | clarification
    
    # Context from session
    search_params: Dict
    previous_recommendations: List[Dict]
    parsed_intent: Optional[Dict]
    
    # Agent outputs (only one will be populated based on routing)
    agent_output: Dict
    
    # Final response
    response: str
    response_type: str
    metadata: Dict


# ============================================
# Helper Functions
# ============================================
def get_llm_response(prompt: str, system_prompt: str = None) -> str:
    """Get response from OpenAI"""
    if not system_prompt:
        system_prompt = """You are a helpful travel concierge. Be concise and helpful."""
    
    if openai_client:
        try:
            response = openai_client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
    
    return "I'd be happy to help you find great travel deals. Could you tell me where you'd like to go?"


# ============================================
# Node Functions (Worker Agents)
# ============================================

def supervisor_node(state: TravelState) -> TravelState:
    """
    SUPERVISOR NODE (Orchestrator)
    - Parses user intent
    - Loads session context
    - Routes to appropriate worker agent
    """
    query = state.get("query", "").lower()
    user_id = state.get("user_id", "")
    session_id = state.get("session_id", "")
    
    # Get or create session
    if session_store:
        session_id = session_store.get_or_create_session(user_id, session_id)
        search_params = session_store.get_search_params(session_id) or {}
        prev_recs = session_store.get_previous_recommendations(session_id) or []
    else:
        session_id = session_id or f"sess_{user_id}_{uuid.uuid4().hex[:8]}"
        search_params = {}
        prev_recs = []
    
    # Parse intent using LLM
    parsed_intent = None
    if intent_parser:
        parsed_intent = intent_parser.parse(query, search_params)
        if session_store and parsed_intent:
            session_store.merge_intent(session_id, parsed_intent.to_dict())
            # Re-fetch merged search params
            search_params = session_store.get_search_params(session_id) or {}
    
    # Determine routing based on keywords
    intent = "recommendation"  # default
    
    policy_keywords = ["cancel", "refund", "pet", "parking", "breakfast",
                      "wifi", "baggage", "check-in", "check-out", "policy"]
    watch_keywords = ["watch", "alert", "notify", "track", "monitor",
                     "let me know", "tell me if", "drops below"]
    analysis_keywords = ["good deal", "good price", "worth it", "actually good",
                        "compare", "vs", "versus", "better deal"]
    quote_keywords = ["book", "reserve", "quote", "total cost", "full price",
                     "complete", "proceed", "checkout"]
    
    if any(kw in query for kw in policy_keywords):
        intent = "policy"
    elif any(kw in query for kw in watch_keywords):
        intent = "watch"
    elif any(kw in query for kw in analysis_keywords):
        intent = "price_analysis"
    elif any(kw in query for kw in quote_keywords):
        intent = "quote"
    elif parsed_intent and hasattr(parsed_intent, 'needs_clarification') and parsed_intent.needs_clarification:
        if prev_recs:
            intent = "recommendation"
        else:
            intent = "clarification"
    
    logger.info(f"[Supervisor] Query: '{query[:50]}...' -> Routing to: {intent}")
    
    return {
        **state,
        "intent": intent,
        "session_id": session_id,
        "search_params": search_params,
        "previous_recommendations": prev_recs,
        "parsed_intent": parsed_intent.to_dict() if parsed_intent and hasattr(parsed_intent, 'to_dict') else None
    }


def policy_agent_node(state: TravelState) -> TravelState:
    """
    POLICY AGENT (Worker)
    Handles questions about cancellation, pets, parking, etc.
    """
    query = state.get("query", "")
    prev_recs = state.get("previous_recommendations", [])
    
    listing_id = None
    if prev_recs:
        listing_id = prev_recs[0].get("hotel", {}).get("hotel_id") or \
                    prev_recs[0].get("flight", {}).get("flight_id")
    
    if listing_id and policy_store:
        answer = answer_policy_question(listing_id, query)
    else:
        answer = get_llm_response(f"Answer this travel policy question: {query}")
    
    logger.info(f"[PolicyAgent] Answered policy question")
    
    return {
        **state,
        "agent_output": {"answer": answer},
        "response_type": "policy_answer"
    }


def watch_agent_node(state: TravelState) -> TravelState:
    """
    WATCH AGENT (Worker)
    Creates price alerts and inventory alerts.
    """
    query = state.get("query", "")
    user_id = state.get("user_id", "")
    prev_recs = state.get("previous_recommendations", [])
    
    # Extract thresholds
    price_match = re.search(r'\$(\d+)', query)
    price_threshold = float(price_match.group(1)) if price_match else None
    
    inventory_match = re.search(r'(\d+)\s*(rooms?|seats?|left)', query)
    inventory_threshold = int(inventory_match.group(1)) if inventory_match else None
    
    watches_created = []
    
    if not prev_recs:
        output = {
            "success": False,
            "message": "I don't have a specific listing to watch. Search first, then ask me to watch it."
        }
    else:
        rec = prev_recs[0]
        listing_id = rec.get("bundle_id") or rec.get("deal_id")
        listing_name = rec.get("name") or f"{rec.get('destination', 'Trip')} package"
        current_price = rec.get("total_price", 0)
        
        if watch_store and WatchCreate:
            if price_threshold:
                watch_store.create_watch(WatchCreate(
                    user_id=user_id,
                    listing_type="bundle",
                    listing_id=listing_id,
                    listing_name=listing_name,
                    watch_type="price",
                    threshold=price_threshold,
                    current_value=current_price
                ))
                watches_created.append(f"price below ${price_threshold}")
            
            if inventory_threshold:
                watch_store.create_watch(WatchCreate(
                    user_id=user_id,
                    listing_type="bundle",
                    listing_id=listing_id,
                    listing_name=listing_name,
                    watch_type="inventory",
                    threshold=inventory_threshold,
                    current_value=rec.get("availability", 10)
                ))
                watches_created.append(f"availability below {inventory_threshold}")
        
        if watches_created:
            output = {
                "success": True,
                "listing_name": listing_name,
                "watches": watches_created
            }
        else:
            output = {
                "success": False,
                "message": "Specify a price (e.g., 'below $800') or availability (e.g., 'less than 5 rooms')."
            }
    
    logger.info(f"[WatchAgent] Created watches: {watches_created}")
    
    return {
        **state,
        "agent_output": output,
        "response_type": "watch_created"
    }


def price_analysis_agent_node(state: TravelState) -> TravelState:
    """
    PRICE ANALYSIS AGENT (Worker)
    Analyzes if a deal is actually good.
    """
    prev_recs = state.get("previous_recommendations", [])
    
    if not prev_recs:
        output = {
            "success": False,
            "message": "I don't have a listing to analyze. Search first!"
        }
    else:
        rec = prev_recs[0]
        current = rec.get("total_price", rec.get("current_price", 0))
        avg = rec.get("avg_30d_price", current * 1.15)
        diff_pct = ((current - avg) / avg) * 100 if avg > 0 else 0
        
        if diff_pct <= -15:
            verdict = "EXCELLENT DEAL"
        elif diff_pct <= -5:
            verdict = "GREAT DEAL"
        elif diff_pct <= 5:
            verdict = "FAIR PRICE"
        else:
            verdict = "ABOVE AVERAGE"
        
        output = {
            "success": True,
            "name": rec.get("name", "This deal"),
            "current_price": current,
            "avg_30d_price": avg,
            "diff_percent": diff_pct,
            "verdict": verdict
        }
    
    logger.info(f"[PriceAnalysisAgent] Verdict: {output.get('verdict', 'N/A')}")
    
    return {
        **state,
        "agent_output": output,
        "response_type": "price_analysis"
    }


def quote_agent_node(state: TravelState) -> TravelState:
    """
    QUOTE AGENT (Worker)
    Generates complete booking quotes.
    """
    prev_recs = state.get("previous_recommendations", [])
    
    if not prev_recs:
        output = {
            "success": False,
            "message": "I don't have a package to quote. Search first!"
        }
    else:
        bundle = prev_recs[0]
        quote = generate_quote(bundle)
        output = {
            "success": True,
            "bundle": bundle,
            "quote": quote
        }
    
    logger.info(f"[QuoteAgent] Generated quote")
    
    return {
        **state,
        "agent_output": output,
        "response_type": "quote"
    }


def recommendation_agent_node(state: TravelState) -> TravelState:
    """
    RECOMMENDATION AGENT (Worker)
    Generates flight+hotel bundle recommendations.
    """
    query = state.get("query", "")
    session_id = state.get("session_id", "")
    search_params = state.get("search_params", {})
    parsed_intent = state.get("parsed_intent")
    
    # Get previous recommendations from state
    prev_recs = state.get("previous_recommendations", [])
    
    # If we have previous recommendations, use them (for follow-up questions)
    if prev_recs:
        output = {
            "success": True,
            "bundles": prev_recs,
            "destination": search_params.get("destination", ""),
            "origin": search_params.get("origin", "")
        }
    # Check if clarification needed - but first check if search_params already has enough info
    elif parsed_intent and parsed_intent.get("needs_clarification"):
        # If we already have destination from session, don't ask for clarification
        if search_params.get("destination"):
            destination = search_params.get("destination")
            origin = search_params.get("origin", "SFO")
            budget = search_params.get("budget")
            constraints = search_params.get("constraints", [])
            deals = get_deals_for_bundle(
                destination=destination,
                origin=origin,
                max_flight_price=budget * 0.4 if budget else None,
                max_hotel_price=budget * 0.6 / 3 if budget else None,
                tags=constraints
            )
            bundles = _build_bundles(deals, search_params)
            if session_store and bundles:
                session_store.save_recommendations(session_id, bundles)
            output = {
                "success": True,
                "bundles": bundles,
                "destination": destination,
                "origin": origin
            }
        else:
            output = {
                "success": False,
                "needs_clarification": True,
                "question": parsed_intent.get("clarification_question", "Could you tell me more about your trip?")
            }
    else:
        # Get search parameters
        destination = search_params.get("destination", "MIA")
        origin = search_params.get("origin", "SFO")
        budget = search_params.get("budget")
        constraints = search_params.get("constraints", [])
        
        # Get deals
        deals = get_deals_for_bundle(
            destination=destination,
            origin=origin,
            max_flight_price=budget * 0.4 if budget else None,
            max_hotel_price=budget * 0.6 / 3 if budget else None,
            tags=constraints
        )
        
        # Build bundles
        bundles = _build_bundles(deals, search_params)
        
        # Save to session
        if session_store and bundles:
            session_store.save_recommendations(session_id, bundles)
        
        output = {
            "success": True,
            "bundles": bundles,
            "destination": destination,
            "origin": origin
        }
    
    logger.info(f"[RecommendationAgent] Found {len(output.get('bundles', []))} bundles")
    
    return {
        **state,
        "agent_output": output,
        "response_type": "recommendations"
    }


def _build_bundles(deals: Dict[str, List], params: Dict) -> List[Dict]:
    """Build flight+hotel bundles from deals"""
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
        hotel_price = hotel.get("current_price", 0) * 3 if hotel else 0
        total_price = flight_price + hotel_price
        separate_price = total_price * 1.1
        
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
            "name": f"{(flight.get('origin') if flight else None) or params.get('origin') or '???'} -> {(flight.get('destination') if flight else None) or params.get('destination') or '???'} + {hotel.get('name', 'Hotel') if hotel else 'Hotel'}",
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
    
    bundles.sort(key=lambda b: b["deal_score"], reverse=True)
    return bundles


def synthesizer_node(state: TravelState) -> TravelState:
    """
    SYNTHESIZER NODE
    Formats the final response based on agent output.
    """
    response_type = state.get("response_type", "")
    output = state.get("agent_output", {})
    session_id = state.get("session_id", "")
    user_id = state.get("user_id", "")
    
    # Format response based on type
    if response_type == "policy_answer":
        response = output.get("answer", "I couldn't find that information.")
    
    elif response_type == "watch_created":
        if output.get("success"):
            watches = output.get("watches", [])
            listing = output.get("listing_name", "your selection")
            response = f"Got it! I'll alert you when {listing} has: {', '.join(watches)}."
        else:
            response = output.get("message", "Couldn't create watch.")
    
    elif response_type == "price_analysis":
        if output.get("success"):
            response = f"""**Price Analysis: {output['name']}**

Current Price: ${output['current_price']:.0f}
30-day Average: ${output['avg_30d_price']:.0f}
Difference: {output['diff_percent']:.0f}%

**Verdict: {output['verdict']}**"""
        else:
            response = output.get("message", "Couldn't analyze price.")
    
    elif response_type == "quote":
        if output.get("success"):
            bundle = output.get("bundle", {})
            quote = output.get("quote", {})
            response = f"""**Complete Quote: {bundle.get('name', 'Your Trip')}**

**Flight:**
- {quote.get('flight_quote', {}).get('route', 'Flight')}
- Total: ${quote.get('flight_quote', {}).get('pricing', {}).get('total', 0):.0f}

**Hotel:**
- {quote.get('hotel_quote', {}).get('name', 'Hotel')}
- Total: ${quote.get('hotel_quote', {}).get('pricing', {}).get('total', 0):.0f}

**Grand Total: ${quote.get('summary', {}).get('grand_total', 0):.0f}**

Quote valid for 30 minutes. Ready to book?"""
        else:
            response = output.get("message", "Couldn't generate quote.")
    
    elif response_type == "recommendations":
        if output.get("needs_clarification"):
            response = output.get("question", "Could you tell me more about your trip?")
        elif output.get("bundles"):
            bundles = output["bundles"]
            lines = [f"**Here are {len(bundles)} options for {output.get('destination', 'your destination')}:**\n"]
            
            for i, bundle in enumerate(bundles[:3], 1):
                lines.append(f"**Option {i}: {bundle['name']}**")
                lines.append(f"Total: ${bundle['total_price']:.0f} (save ${bundle['savings']:.0f})")
                lines.append(f"Deal Score: {bundle['deal_score']}/100")
                exp = bundle.get("explanation", {})
                lines.append(f"Why: {exp.get('why_this', 'Good value')}")
                lines.append("")
            
            lines.append("Want me to analyze any of these, create a price alert, or get a full quote?")
            response = "\n".join(lines)
        else:
            response = get_llm_response(
                f"Help the user find travel options. Query: {state.get('query', '')}. "
                f"Destination: {output.get('destination', 'unknown')}"
            )
    
    else:
        response = "How can I help you with your travel plans today?"
    
    logger.info(f"[Synthesizer] Response type: {response_type}, length: {len(response)}")
    
    return {
        **state,
        "response": response,
        "metadata": {
            "session_id": session_id,
            "user_id": user_id,
            "response_type": response_type,
            "timestamp": datetime.utcnow().isoformat()
        }
    }


# ============================================
# Router Function (Conditional Edge)
# ============================================
def route_to_agent(state: TravelState) -> str:
    """
    Routing function for conditional edges.
    Returns the name of the next node based on intent.
    """
    intent = state.get("intent", "recommendation")
    
    routing_map = {
        "policy": "policy_agent",
        "watch": "watch_agent",
        "price_analysis": "price_analysis_agent",
        "quote": "quote_agent",
        "recommendation": "recommendation_agent",
        "clarification": "recommendation_agent"
    }
    
    return routing_map.get(intent, "recommendation_agent")


# ============================================
# Build the Graph
# ============================================
def build_travel_graph() -> StateGraph:
    """
    Build the LangGraph workflow.
    
    Graph structure:
    START -> supervisor -> [router] -> {agent} -> synthesizer -> END
    """
    # Create graph with state schema
    workflow = StateGraph(TravelState)
    
    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("policy_agent", policy_agent_node)
    workflow.add_node("watch_agent", watch_agent_node)
    workflow.add_node("price_analysis_agent", price_analysis_agent_node)
    workflow.add_node("quote_agent", quote_agent_node)
    workflow.add_node("recommendation_agent", recommendation_agent_node)
    workflow.add_node("synthesizer", synthesizer_node)
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional routing from supervisor to agents
    workflow.add_conditional_edges(
        "supervisor",
        route_to_agent,
        {
            "policy_agent": "policy_agent",
            "watch_agent": "watch_agent",
            "price_analysis_agent": "price_analysis_agent",
            "quote_agent": "quote_agent",
            "recommendation_agent": "recommendation_agent"
        }
    )
    
    # All agents go to synthesizer
    workflow.add_edge("policy_agent", "synthesizer")
    workflow.add_edge("watch_agent", "synthesizer")
    workflow.add_edge("price_analysis_agent", "synthesizer")
    workflow.add_edge("quote_agent", "synthesizer")
    workflow.add_edge("recommendation_agent", "synthesizer")
    
    # Synthesizer goes to END
    workflow.add_edge("synthesizer", END)
    
    return workflow


# ============================================
# Compile and Create Global Instance
# ============================================
travel_graph = build_travel_graph()
travel_app = travel_graph.compile()


# ============================================
# Main Interface (Drop-in replacement)
# ============================================
class LangGraphConciergeAgent:
    """
    LangGraph-based Concierge Agent.
    Drop-in replacement for ConciergeAgent.
    """
    
    def __init__(self):
        self.graph = travel_app
        logger.info("LangGraphConciergeAgent initialized with graph workflow")
    
    async def process_message(
        self,
        query: str,
        user_id: str,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a user message using the LangGraph workflow.
        Same interface as original ConciergeAgent.
        """
        # Initial state
        initial_state: TravelState = {
            "query": query,
            "user_id": user_id,
            "session_id": session_id or "",
            "intent": "",
            "search_params": {},
            "previous_recommendations": [],
            "parsed_intent": None,
            "agent_output": {},
            "response": "",
            "response_type": "",
            "metadata": {}
        }
        
        # Run the graph
        try:
            final_state = self.graph.invoke(initial_state)
            
            return {
                "response": final_state.get("response", ""),
                "session_id": final_state.get("metadata", {}).get("session_id", session_id),
                "user_id": user_id,
                "type": final_state.get("response_type", ""),
                "timestamp": final_state.get("metadata", {}).get("timestamp", datetime.utcnow().isoformat()),
                # Include additional data based on type
                **({"bundles": final_state.get("agent_output", {}).get("bundles", [])} 
                   if final_state.get("response_type") == "recommendations" else {}),
                **({"quote": final_state.get("agent_output", {}).get("quote")} 
                   if final_state.get("response_type") == "quote" else {}),
            }
        except Exception as e:
            logger.error(f"Graph execution error: {e}")
            return {
                "response": "I encountered an error. Could you try rephrasing?",
                "session_id": session_id,
                "user_id": user_id,
                "type": "error",
                "timestamp": datetime.utcnow().isoformat()
            }


# ============================================
# Global Instance (Drop-in replacement)
# ============================================
langgraph_concierge_agent = LangGraphConciergeAgent()


# ============================================
# Convenience Function (Same interface)
# ============================================
async def process_chat(query: str, user_id: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Process a chat message using LangGraph workflow"""
    return await langgraph_concierge_agent.process_message(query, user_id, session_id)


# ============================================
# For Testing / Visualization
# ============================================
def get_graph_diagram() -> str:
    """
    Returns ASCII diagram of the graph for documentation.
    """
    return """
    LangGraph Travel Concierge Workflow
    ===================================
    
                    +------------------+
                    |   supervisor     |
                    +--------+---------+
                             |
            +----------------+----------------+
            |                |                |
            v                v                v
    +---------------+---------------+---------------+
    | policy_agent  | watch_agent   | quote_agent   |
    |               |               |               |
    | price_analysis_agent          | recommend_agent|
    +-------+-------+-------+-------+-------+-------+
            |               |               |
            +---------------+---------------+
                            |
                   +--------v--------+
                   |   synthesizer   |
                   +--------+--------+
                            |
                           END
    
    Pattern: Orchestrator-Workers (DATA 236 Multi-Agent Design Patterns)
    """


if __name__ == "__main__":
    # Quick test
    import asyncio
    
    async def test():
        # Test different intents
        test_queries = [
            ("I want to go to Miami next week", "user123"),
            ("Is this a good deal?", "user123"),
            ("Watch it for me below $500", "user123"),
            ("What's the cancellation policy?", "user123"),
            ("Book it!", "user123")
        ]
        
        for query, user_id in test_queries:
            print(f"\n{'='*50}")
            print(f"Query: {query}")
            result = await process_chat(query, user_id)
            print(f"Type: {result['type']}")
            print(f"Response: {result['response'][:200]}...")
    
    asyncio.run(test())
