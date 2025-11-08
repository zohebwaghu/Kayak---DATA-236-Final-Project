"""
Intent Parser - Natural Language Understanding
Uses GPT-3.5 + Langchain to parse user queries
Includes Redis semantic caching to reduce API costs
"""

import json
from typing import Dict, Any, Optional
from langchain_openai import ChatOpenAI
from langchain.chains import LLMChain
from loguru import logger

from config import Config
from .prompts import INTENT_PARSER_PROMPT


class IntentParser:
    """
    Parse natural language travel queries into structured data
    
    Features:
    - GPT-3.5 powered intent extraction
    - Redis semantic caching (similarity > 0.85)
    - Automatic constraint normalization
    
    Usage:
        parser = IntentParser()
        intent = parser.parse("Find cheap flights from SFO to Miami")
        # Returns: {"origin": "SFO", "destination": "Miami", ...}
    """
    
    def __init__(self, use_cache: bool = True):
        """
        Initialize Intent Parser
        
        Args:
            use_cache: Enable Redis semantic caching (default: True)
        """
        # Initialize LLM (GPT-3.5)
        self.llm = ChatOpenAI(
            model=Config.OPENAI_MODEL,
            api_key=Config.OPENAI_API_KEY,
            temperature=0.0  # Deterministic for consistent parsing
        )
        
        # Create Langchain chain
        self.chain = LLMChain(
            llm=self.llm,
            prompt=INTENT_PARSER_PROMPT,
            verbose=False
        )
        
        # Initialize semantic cache (if enabled)
        self.cache = None
        if use_cache:
            try:
                from cache.semantic_cache import SemanticCache
                from cache.embeddings import EmbeddingService
                from cache.redis_client import get_redis_client
                
                redis_client = get_redis_client()
                embedding_service = EmbeddingService()
                self.cache = SemanticCache(
                    redis_client=redis_client,
                    embedding_service=embedding_service,
                    threshold=Config.CACHE_SIMILARITY_THRESHOLD
                )
                logger.info("Intent Parser initialized with semantic caching")
            except Exception as e:
                logger.warning(f"Could not initialize cache: {e}. Running without cache.")
                self.cache = None
        else:
            logger.info("Intent Parser initialized without caching")
    
    def parse(self, user_query: str) -> Dict[str, Any]:
        """
        Parse user query into structured intent
        
        Args:
            user_query: Natural language query
        
        Returns:
            dict: Structured intent with keys:
                - origin: str
                - destination: str
                - dates: list or null
                - budget: float or null
                - constraints: list of str
        
        Example:
            >>> parser = IntentParser()
            >>> intent = parser.parse("Weekend trip to Miami under $800, need wifi")
            >>> print(intent)
            {
                "origin": "flexible",
                "destination": "Miami",
                "dates": null,
                "budget": 800,
                "constraints": ["wifi"]
            }
        """
        # Try cache first
        if self.cache:
            cached_result = self.cache.get(user_query)
            if cached_result:
                logger.info(
                    f"[Cache Hit] Similarity: {cached_result['similarity']:.3f} | "
                    f"Original: '{cached_result['cached_query']}'"
                )
                return cached_result['response']
        
        # Cache miss - call LLM
        logger.info(f"[Cache Miss] Calling GPT-3.5 to parse: '{user_query}'")
        
        try:
            # Call LLM
            result = self.chain.run(user_query=user_query)
            
            # Parse JSON response
            parsed_intent = self._parse_llm_response(result)
            
            # Normalize intent
            normalized_intent = self._normalize_intent(parsed_intent)
            
            # Store in cache
            if self.cache:
                self.cache.set(user_query, normalized_intent)
                logger.debug("Intent stored in cache")
            
            logger.info(f"Parsed intent: {normalized_intent}")
            return normalized_intent
            
        except Exception as e:
            logger.error(f"Error parsing intent: {e}")
            # Return default intent on error
            return self._get_default_intent()
    
    def _parse_llm_response(self, response: str) -> Dict[str, Any]:
        """
        Parse LLM JSON response
        
        Handles cases where LLM includes markdown formatting
        """
        # Remove markdown code blocks if present
        response = response.strip()
        if response.startswith("```json"):
            response = response[7:]
        if response.startswith("```"):
            response = response[3:]
        if response.endswith("```"):
            response = response[:-3]
        response = response.strip()
        
        try:
            return json.loads(response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {response}")
            raise ValueError(f"Invalid JSON from LLM: {e}")
    
    def _normalize_intent(self, intent: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize intent values
        
        - Convert null strings to None
        - Normalize airport codes to uppercase
        - Clean constraint strings
        """
        normalized = intent.copy()
        
        # Normalize origin
        if normalized.get("origin") in ["null", "flexible", None]:
            normalized["origin"] = None
        elif normalized.get("origin"):
            normalized["origin"] = normalized["origin"].upper()
        
        # Normalize destination
        if normalized.get("destination") in ["null", "flexible", None]:
            normalized["destination"] = None
        elif normalized.get("destination"):
            # Keep city names as-is, but uppercase airport codes
            dest = normalized["destination"]
            if len(dest) == 3:  # Airport code
                normalized["destination"] = dest.upper()
        
        # Normalize dates
        if normalized.get("dates") == "null" or not normalized.get("dates"):
            normalized["dates"] = None
        
        # Normalize budget
        if normalized.get("budget") in ["null", None]:
            normalized["budget"] = None
        elif isinstance(normalized.get("budget"), str):
            # Extract number from string like "$800"
            import re
            budget_str = normalized["budget"]
            numbers = re.findall(r'\d+', budget_str)
            if numbers:
                normalized["budget"] = float(numbers[0])
            else:
                normalized["budget"] = None
        
        # Normalize constraints
        if not normalized.get("constraints"):
            normalized["constraints"] = []
        else:
            # Clean constraint strings
            normalized["constraints"] = [
                c.lower().strip() for c in normalized["constraints"]
            ]
        
        return normalized
    
    def _get_default_intent(self) -> Dict[str, Any]:
        """
        Return default intent on error
        """
        return {
            "origin": None,
            "destination": None,
            "dates": None,
            "budget": None,
            "constraints": []
        }
    
    def clear_cache(self):
        """Clear semantic cache (for testing)"""
        if self.cache:
            # Note: SemanticCache doesn't have clear method
            # This would need to be implemented
            logger.info("Cache clear requested (not implemented)")


# ============================================
# Example Usage
# ============================================

if __name__ == "__main__":
    # Example: Parse various queries
    parser = IntentParser(use_cache=True)
    
    queries = [
        "Find cheap flights from SFO to Miami",
        "Weekend trip to Miami under $800, need pet-friendly hotel with wifi",
        "Business trip to NYC, hotel near city center",
        "Fly to anywhere warm under $1000",
        "SFO to MIA, budget $500, need pool and breakfast"
    ]
    
    for query in queries:
        print(f"\n{'='*60}")
        print(f"Query: {query}")
        intent = parser.parse(query)
        print(f"Intent: {json.dumps(intent, indent=2)}")
    
    # Test cache hit
    print(f"\n{'='*60}")
    print("Testing cache with similar query...")
    similar_query = "cheap flight SFO to Miami"  # Should hit cache
    intent = parser.parse(similar_query)
    print(f"Intent: {json.dumps(intent, indent=2)}")
