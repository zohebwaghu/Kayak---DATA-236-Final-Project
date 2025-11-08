"""
Bundle Explainer - Generate Human-Readable Recommendations
Uses GPT-3.5 to create compelling, concise explanations for bundle recommendations
"""

from typing import Dict, Any
from langchain_openai import ChatOpenAI
from langchain.chains import LLMChain
from loguru import logger

from config import Config
from .prompts import EXPLAINER_PROMPT


class BundleExplainer:
    """
    Generate natural language explanations for bundle recommendations
    
    Features:
    - Concise explanations (max 25 words)
    - Highlights deal value, amenities, and scarcity
    - GPT-3.5 powered for natural language
    
    Usage:
        explainer = BundleExplainer()
        explanation = explainer.explain(bundle_dict, user_query)
        # Returns: "Save $120 on Miami getaway - 4.5★ hotel with pool, only 2 rooms left"
    """
    
    def __init__(self):
        """Initialize Bundle Explainer with GPT-3.5"""
        self.llm = ChatOpenAI(
            model=Config.OPENAI_MODEL,
            api_key=Config.OPENAI_API_KEY,
            temperature=0.7  # Slightly creative for natural language
        )
        
        self.chain = LLMChain(
            llm=self.llm,
            prompt=EXPLAINER_PROMPT,
            verbose=False
        )
        
        logger.info("Bundle Explainer initialized")
    
    def explain(
        self,
        bundle: Dict[str, Any],
        user_query: str,
        max_words: int = 25
    ) -> str:
        """
        Generate explanation for why bundle is recommended
        
        Args:
            bundle: Bundle dict with keys:
                - total_price: float
                - savings: float
                - deal_score: int
                - fit_score: float
                - flight: dict
                - hotel: dict
            user_query: Original user query
            max_words: Maximum words in explanation (default: 25)
        
        Returns:
            str: Natural language explanation
        
        Example:
            >>> explainer = BundleExplainer()
            >>> bundle = {
            ...     "total_price": 430,
            ...     "savings": 120,
            ...     "hotel": {"hotelName": "Grand Hyatt", "starRating": 4.5, "amenities": ["pool", "wifi"]},
            ...     "flight": {"airline": "United", "departure": "SFO", "arrival": "Miami"}
            ... }
            >>> explanation = explainer.explain(bundle, "cheap flight to Miami")
            >>> print(explanation)
            "Save $120 on United to Miami - 4.5★ Grand Hyatt with pool and WiFi"
        """
        try:
            # Format bundle info for LLM
            bundle_info = self._format_bundle_info(bundle)
            
            # Call LLM
            explanation = self.chain.run(
                bundle_info=bundle_info,
                user_query=user_query
            )
            
            # Clean and truncate
            explanation = self._clean_explanation(explanation, max_words)
            
            logger.debug(f"Generated explanation: {explanation}")
            return explanation
            
        except Exception as e:
            logger.error(f"Error generating explanation: {e}")
            # Fallback to template-based explanation
            return self._fallback_explanation(bundle)
    
    def _format_bundle_info(self, bundle: Dict[str, Any]) -> str:
        """
        Format bundle into readable text for LLM
        """
        lines = []
        
        # Price and savings
        lines.append(f"Total Price: ${bundle.get('total_price', 0):.2f}")
        if bundle.get('savings', 0) > 0:
            lines.append(f"Savings: ${bundle.get('savings', 0):.2f}")
        
        # Scores
        lines.append(f"Deal Score: {bundle.get('deal_score', 0)}/100")
        fit_score = bundle.get('fit_score', 0)
        if isinstance(fit_score, float):
            lines.append(f"Fit Score: {fit_score:.0%}")
        
        # Flight info
        flight = bundle.get('flight', {})
        if flight:
            lines.append(
                f"Flight: {flight.get('airline', 'Unknown')} "
                f"{flight.get('departure', '')} → {flight.get('arrival', '')}"
            )
        
        # Hotel info
        hotel = bundle.get('hotel', {})
        if hotel:
            lines.append(
                f"Hotel: {hotel.get('hotelName', 'Unknown')} "
                f"({hotel.get('starRating', 0)}★)"
            )
            
            amenities = hotel.get('amenities', [])
            if amenities:
                lines.append(f"Amenities: {', '.join(amenities[:3])}")  # Top 3
            
            availability = hotel.get('availability', 0)
            if availability and availability <= 5:
                lines.append(f"Availability: Only {availability} rooms left!")
        
        return "\n".join(lines)
    
    def _clean_explanation(self, explanation: str, max_words: int) -> str:
        """
        Clean and truncate explanation
        """
        # Remove quotes if LLM added them
        explanation = explanation.strip('"\'')
        
        # Remove extra whitespace
        explanation = " ".join(explanation.split())
        
        # Truncate to max words
        words = explanation.split()
        if len(words) > max_words:
            explanation = " ".join(words[:max_words]) + "..."
        
        # Ensure it ends with proper punctuation
        if explanation and explanation[-1] not in ".!?":
            # Don't add period if ends with ...
            if not explanation.endswith("..."):
                explanation += "."
        
        return explanation
    
    def _fallback_explanation(self, bundle: Dict[str, Any]) -> str:
        """
        Generate simple template-based explanation if LLM fails
        """
        hotel = bundle.get('hotel', {})
        flight = bundle.get('flight', {})
        savings = bundle.get('savings', 0)
        
        parts = []
        
        # Airline and destination
        if flight.get('airline') and flight.get('arrival'):
            parts.append(f"{flight['airline']} to {flight['arrival']}")
        
        # Hotel name and rating
        if hotel.get('hotelName'):
            hotel_info = hotel['hotelName']
            if hotel.get('starRating'):
                hotel_info += f" ({hotel['starRating']}★)"
            parts.append(hotel_info)
        
        # Savings
        if savings > 50:
            parts.insert(0, f"Save ${savings:.0f}")
        
        explanation = " - ".join(parts)
        
        # Add amenities if space allows
        amenities = hotel.get('amenities', [])
        if amenities and len(explanation) < 80:
            explanation += f" with {', '.join(amenities[:2])}"
        
        return explanation[:150]  # Max 150 chars for fallback
    
    def explain_batch(
        self,
        bundles: list[Dict[str, Any]],
        user_query: str
    ) -> list[str]:
        """
        Generate explanations for multiple bundles
        
        Args:
            bundles: List of bundle dicts
            user_query: User query
        
        Returns:
            list[str]: List of explanations (same order as bundles)
        """
        explanations = []
        for bundle in bundles:
            explanation = self.explain(bundle, user_query)
            explanations.append(explanation)
        
        return explanations


# ============================================
# Example Usage
# ============================================

if __name__ == "__main__":
    # Example bundle
    bundle = {
        "bundleId": "bundle-001",
        "total_price": 430.0,
        "savings": 120.0,
        "deal_score": 85,
        "fit_score": 0.92,
        "flight": {
            "listingId": "flight-001",
            "airline": "United",
            "departure": "SFO",
            "arrival": "Miami",
            "price": 280.0
        },
        "hotel": {
            "listingId": "hotel-001",
            "hotelName": "Grand Hyatt Miami",
            "city": "Miami",
            "starRating": 4.5,
            "price": 150.0,
            "availability": 2,
            "amenities": ["wifi", "pool", "breakfast", "gym"]
        }
    }
    
    # Generate explanation
    explainer = BundleExplainer()
    
    user_queries = [
        "cheap flight to Miami with nice hotel",
        "weekend getaway to Miami",
        "business trip to Miami"
    ]
    
    for query in user_queries:
        print(f"\nQuery: {query}")
        explanation = explainer.explain(bundle, query)
        print(f"Explanation: {explanation}")
