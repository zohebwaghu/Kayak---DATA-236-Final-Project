"""
Concierge Agent - User-facing Conversational AI
Handles natural language interactions with travelers
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.tools import Tool
from langchain.memory import ConversationBufferWindowMemory
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder

from ..config import settings
from ..interfaces.data_interface import DataInterface
from ..interfaces.conversation_store import ConversationStore
from ..algorithms.deal_scorer import DealScorer
from ..algorithms.fit_scorer import FitScorer
from ..llm.intent_parser import IntentParser
from ..llm.explainer import BundleExplainer
from ..cache.semantic_cache import SemanticCache
from .deals_agent import get_deals_agent

logger = logging.getLogger(__name__)


class ConciergeAgent:
    """
    Concierge Agent - User-facing conversational AI assistant
    
    Responsibilities:
    1. Handle natural language conversations with users
    2. Understand travel queries and preferences
    3. Provide personalized recommendations
    4. Answer policy and FAQ questions
    5. Maintain conversation context and history
    """
    
    def __init__(
        self,
        data_interface: Optional[DataInterface] = None,
        conversation_store: Optional[ConversationStore] = None,
        semantic_cache: Optional[SemanticCache] = None
    ):
        """
        Initialize Concierge Agent
        
        Args:
            data_interface: Interface to backend data
            conversation_store: Storage for conversation history
            semantic_cache: Cache for repeated queries
        """
        self.data_interface = data_interface or DataInterface()
        self.conversation_store = conversation_store or ConversationStore()
        self.cache = semantic_cache or SemanticCache()
        
        # Initialize components
        self.intent_parser = IntentParser()
        self.explainer = BundleExplainer()
        self.deal_scorer = DealScorer()
        self.fit_scorer = FitScorer()
        
        # Get reference to Deals Agent for recommendations
        self.deals_agent = get_deals_agent()
        
        # Initialize LLM
        self.llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            temperature=0.7,
            api_key=settings.OPENAI_API_KEY
        )
        
        # Create agent tools
        self.tools = self._create_tools()
        
        # Create agent
        self.agent = self._create_agent()
        
        # Conversation memories (per user/session)
        self.memories: Dict[str, ConversationBufferWindowMemory] = {}
        
        logger.info("ConciergeAgent initialized")
    
    def _create_tools(self) -> List[Tool]:
        """
        Create tools available to the agent
        
        Returns:
            List of LangChain tools
        """
        tools = [
            Tool(
                name="search_flights",
                func=self._search_flights,
                description="Search for flight deals. Input: JSON with origin, destination, date, budget"
            ),
            Tool(
                name="search_hotels",
                func=self._search_hotels,
                description="Search for hotel deals. Input: JSON with city, check_in, check_out, budget"
            ),
            Tool(
                name="get_recommendations",
                func=self._get_recommendations,
                description="Get personalized travel bundle recommendations. Input: natural language query"
            ),
            Tool(
                name="get_user_preferences",
                func=self._get_user_preferences,
                description="Get user's saved preferences and booking history. Input: user_id"
            ),
            Tool(
                name="explain_deal",
                func=self._explain_deal,
                description="Explain why a deal is recommended. Input: deal_id"
            ),
            Tool(
                name="answer_policy",
                func=self._answer_policy,
                description="Answer questions about booking policies, cancellation, refunds. Input: question"
            ),
            Tool(
                name="compare_deals",
                func=self._compare_deals,
                description="Compare multiple deals side by side. Input: comma-separated deal_ids"
            )
        ]
        
        return tools
    
    def _create_agent(self) -> AgentExecutor:
        """
        Create the LangChain agent with tools
        
        Returns:
            AgentExecutor instance
        """
        system_prompt = """You are a helpful travel concierge AI assistant for a Kayak-like travel booking platform.

Your role is to:
1. Help users find the best flight and hotel deals
2. Provide personalized recommendations based on their preferences
3. Answer questions about travel destinations, policies, and bookings
4. Explain why certain deals are recommended
5. Compare options when users are deciding

Guidelines:
- Be friendly, helpful, and concise
- Always consider the user's budget and preferences
- Proactively suggest relevant deals when appropriate
- If you don't know something, say so honestly
- Use the available tools to get accurate information

When recommending deals:
- Explain the value proposition clearly
- Mention any time-sensitive aspects (limited seats, price changes)
- Consider the user's past booking patterns if available
"""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad")
        ])
        
        agent = create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt
        )
        
        agent_executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=True,
            max_iterations=5,
            handle_parsing_errors=True
        )
        
        return agent_executor
    
    def _get_memory(self, session_id: str) -> ConversationBufferWindowMemory:
        """
        Get or create conversation memory for a session
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            ConversationBufferWindowMemory instance
        """
        if session_id not in self.memories:
            self.memories[session_id] = ConversationBufferWindowMemory(
                memory_key="chat_history",
                return_messages=True,
                k=10  # Keep last 10 exchanges
            )
        return self.memories[session_id]
    
    async def chat(
        self,
        user_id: int,
        message: str,
        session_id: Optional[str] = None,
        preferences: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Handle a chat message from user
        
        Args:
            user_id: User identifier
            message: User's message
            session_id: Conversation session ID
            preferences: Optional user preferences override
            
        Returns:
            Dict with response and any recommendations
        """
        try:
            # Generate session ID if not provided
            if not session_id:
                session_id = f"session_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            
            # Check cache for similar queries
            cache_key = f"chat:{user_id}:{message[:50]}"
            cached_response = await self.cache.get(cache_key)
            if cached_response:
                logger.info(f"Cache hit for chat query: {message[:30]}...")
                return cached_response
            
            # Get user context
            user_prefs = preferences
            if not user_prefs:
                user_prefs = await self._get_user_context(user_id)
            
            # Get conversation memory
            memory = self._get_memory(session_id)
            
            # Build context-aware input
            context_input = self._build_context_input(message, user_prefs)
            
            # Run agent
            result = await asyncio.to_thread(
                self.agent.invoke,
                {
                    "input": context_input,
                    "chat_history": memory.chat_memory.messages
                }
            )
            
            # Extract response
            response_text = result.get("output", "I apologize, I couldn't process your request.")
            
            # Update memory
            memory.chat_memory.add_user_message(message)
            memory.chat_memory.add_ai_message(response_text)
            
            # Save to conversation store
            await self.conversation_store.save_message(
                session_id=session_id,
                user_id=user_id,
                role="user",
                content=message
            )
            await self.conversation_store.save_message(
                session_id=session_id,
                user_id=user_id,
                role="assistant",
                content=response_text
            )
            
            # Build response
            response = {
                "response": response_text,
                "session_id": session_id,
                "user_id": user_id,
                "timestamp": datetime.now().isoformat(),
                "recommendations": []
            }
            
            # Check if response contains recommendations
            if any(word in message.lower() for word in ["find", "search", "recommend", "suggest", "show"]):
                # Get recommendations to include
                recs = await self._get_contextual_recommendations(message, user_prefs)
                response["recommendations"] = recs
            
            # Cache response
            await self.cache.set(cache_key, response, ttl=300)
            
            return response
            
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            return {
                "response": "I apologize, I encountered an error processing your request. Please try again.",
                "session_id": session_id,
                "user_id": user_id,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def _get_user_context(self, user_id: int) -> Dict:
        """
        Get user context including preferences and history
        
        Args:
            user_id: User identifier
            
        Returns:
            Dict with user context
        """
        try:
            preferences = await self.data_interface.get_user_preferences(user_id)
            history = await self.data_interface.get_booking_history(user_id, limit=5)
            
            return {
                "preferences": preferences or {},
                "recent_bookings": history or [],
                "user_id": user_id
            }
        except Exception as e:
            logger.error(f"Error getting user context: {e}")
            return {"user_id": user_id, "preferences": {}, "recent_bookings": []}
    
    def _build_context_input(self, message: str, user_context: Dict) -> str:
        """
        Build context-aware input for the agent
        
        Args:
            message: User's message
            user_context: User preferences and history
            
        Returns:
            Enhanced input string
        """
        context_parts = [message]
        
        if user_context.get("preferences"):
            prefs = user_context["preferences"]
            if prefs.get("budget"):
                context_parts.append(f"[User prefers {prefs['budget']} budget options]")
            if prefs.get("interests"):
                context_parts.append(f"[User interests: {', '.join(prefs['interests'])}]")
        
        if user_context.get("recent_bookings"):
            recent = user_context["recent_bookings"][0] if user_context["recent_bookings"] else None
            if recent:
                context_parts.append(f"[Recent booking: {recent.get('destination', 'N/A')}]")
        
        return " ".join(context_parts)
    
    async def _get_contextual_recommendations(
        self,
        query: str,
        user_prefs: Dict,
        limit: int = 5
    ) -> List[Dict]:
        """
        Get recommendations based on conversation context
        
        Args:
            query: User's query
            user_prefs: User preferences
            limit: Max recommendations
            
        Returns:
            List of recommendation dicts
        """
        try:
            result = await self.deals_agent.get_recommendations(
                user_query=query,
                user_preferences=user_prefs.get("preferences", {}),
                limit=limit
            )
            return result.get("recommendations", [])
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            return []
    
    # Tool implementations
    
    def _search_flights(self, input_str: str) -> str:
        """Search for flights based on criteria"""
        try:
            import json
            criteria = json.loads(input_str) if isinstance(input_str, str) else input_str
            
            # Get flights from deals agent
            flights = list(self.deals_agent.processed_flights.values())
            
            # Filter by criteria
            filtered = []
            for flight in flights[:20]:  # Limit for performance
                if criteria.get("destination"):
                    if criteria["destination"].lower() not in flight.get("destination", "").lower():
                        continue
                if criteria.get("origin"):
                    if criteria["origin"].lower() not in flight.get("origin", "").lower():
                        continue
                filtered.append({
                    "id": flight.get("id"),
                    "origin": flight.get("origin"),
                    "destination": flight.get("destination"),
                    "price": flight.get("price"),
                    "score": flight.get("score"),
                    "airline": flight.get("airline")
                })
            
            if not filtered:
                return "No flights found matching your criteria."
            
            return json.dumps(filtered[:5], indent=2)
            
        except Exception as e:
            return f"Error searching flights: {str(e)}"
    
    def _search_hotels(self, input_str: str) -> str:
        """Search for hotels based on criteria"""
        try:
            import json
            criteria = json.loads(input_str) if isinstance(input_str, str) else input_str
            
            # Get hotels from deals agent
            hotels = list(self.deals_agent.processed_hotels.values())
            
            # Filter by criteria
            filtered = []
            for hotel in hotels[:20]:
                if criteria.get("city"):
                    if criteria["city"].lower() not in hotel.get("location", "").lower():
                        continue
                filtered.append({
                    "id": hotel.get("id"),
                    "name": hotel.get("name"),
                    "location": hotel.get("location"),
                    "price_per_night": hotel.get("price_per_night"),
                    "score": hotel.get("score"),
                    "star_rating": hotel.get("star_rating")
                })
            
            if not filtered:
                return "No hotels found matching your criteria."
            
            return json.dumps(filtered[:5], indent=2)
            
        except Exception as e:
            return f"Error searching hotels: {str(e)}"
    
    def _get_recommendations(self, query: str) -> str:
        """Get personalized recommendations"""
        try:
            import json
            import asyncio
            
            # Run async function in sync context
            loop = asyncio.get_event_loop()
            result = loop.run_until_complete(
                self.deals_agent.get_recommendations(query, limit=5)
            )
            
            recommendations = result.get("recommendations", [])
            if not recommendations:
                return "No recommendations found for your query."
            
            # Format recommendations
            formatted = []
            for rec in recommendations:
                bundle = rec.get("bundle", {})
                formatted.append({
                    "total_price": bundle.get("total_price"),
                    "score": rec.get("fit_score"),
                    "explanation": rec.get("explanation", "")[:200]
                })
            
            return json.dumps(formatted, indent=2)
            
        except Exception as e:
            return f"Error getting recommendations: {str(e)}"
    
    def _get_user_preferences(self, user_id: str) -> str:
        """Get user preferences and history"""
        try:
            import json
            import asyncio
            
            uid = int(user_id) if isinstance(user_id, str) else user_id
            
            loop = asyncio.get_event_loop()
            context = loop.run_until_complete(self._get_user_context(uid))
            
            return json.dumps(context, indent=2, default=str)
            
        except Exception as e:
            return f"Error getting user preferences: {str(e)}"
    
    def _explain_deal(self, deal_id: str) -> str:
        """Explain why a deal is recommended"""
        try:
            # Find deal in processed data
            flight = self.deals_agent.processed_flights.get(deal_id)
            hotel = self.deals_agent.processed_hotels.get(deal_id)
            
            deal = flight or hotel
            if not deal:
                return f"Deal {deal_id} not found."
            
            # Generate explanation
            explanation = []
            score = deal.get("score", 0)
            
            if score >= 80:
                explanation.append("This is an excellent deal with a high score.")
            elif score >= 60:
                explanation.append("This is a good deal with competitive pricing.")
            
            tags = deal.get("tags", [])
            if "nonstop" in tags:
                explanation.append("Direct flight with no layovers.")
            if "excellent_deal" in tags:
                explanation.append("Price is significantly below average.")
            if "highly_rated" in tags:
                explanation.append("Highly rated by previous guests.")
            
            return " ".join(explanation) if explanation else "Standard deal with average features."
            
        except Exception as e:
            return f"Error explaining deal: {str(e)}"
    
    def _answer_policy(self, question: str) -> str:
        """Answer policy-related questions"""
        # Simple FAQ-based responses
        policies = {
            "cancellation": "Most bookings can be cancelled within 24 hours for a full refund. After that, cancellation fees may apply depending on the airline or hotel policy.",
            "refund": "Refunds are typically processed within 5-10 business days. The refund amount depends on the cancellation policy of your specific booking.",
            "change": "Flight changes can usually be made for a fee. Hotel date changes are subject to availability and may incur rate differences.",
            "baggage": "Baggage allowance varies by airline and fare class. Check your booking confirmation for specific details.",
            "check-in": "Online check-in typically opens 24-48 hours before departure for flights. Hotel check-in times vary but are usually 3-4 PM.",
            "payment": "We accept major credit cards, debit cards, and PayPal. Some bookings may offer pay-later options."
        }
        
        question_lower = question.lower()
        
        for key, answer in policies.items():
            if key in question_lower:
                return answer
        
        return "For specific policy questions, please refer to the terms and conditions on your booking confirmation or contact customer support."
    
    def _compare_deals(self, deal_ids_str: str) -> str:
        """Compare multiple deals"""
        try:
            import json
            
            deal_ids = [d.strip() for d in deal_ids_str.split(",")]
            
            comparisons = []
            for deal_id in deal_ids[:3]:  # Max 3 comparisons
                flight = self.deals_agent.processed_flights.get(deal_id)
                hotel = self.deals_agent.processed_hotels.get(deal_id)
                deal = flight or hotel
                
                if deal:
                    comparisons.append({
                        "id": deal_id,
                        "type": "flight" if flight else "hotel",
                        "price": deal.get("price") or deal.get("price_per_night"),
                        "score": deal.get("score"),
                        "tags": deal.get("tags", [])[:3]
                    })
            
            if not comparisons:
                return "No deals found with the provided IDs."
            
            return json.dumps(comparisons, indent=2)
            
        except Exception as e:
            return f"Error comparing deals: {str(e)}"
    
    async def get_conversation_history(
        self,
        session_id: str,
        limit: int = 20
    ) -> List[Dict]:
        """
        Get conversation history for a session
        
        Args:
            session_id: Session identifier
            limit: Max messages to retrieve
            
        Returns:
            List of message dicts
        """
        return await self.conversation_store.get_history(session_id, limit)
    
    async def clear_session(self, session_id: str):
        """
        Clear a conversation session
        
        Args:
            session_id: Session to clear
        """
        if session_id in self.memories:
            del self.memories[session_id]
        await self.conversation_store.clear_session(session_id)
        logger.info(f"Cleared session: {session_id}")


# Singleton instance
_concierge_agent_instance: Optional[ConciergeAgent] = None


def get_concierge_agent() -> ConciergeAgent:
    """Get singleton instance of ConciergeAgent"""
    global _concierge_agent_instance
    if _concierge_agent_instance is None:
        _concierge_agent_instance = ConciergeAgent()
    return _concierge_agent_instance
