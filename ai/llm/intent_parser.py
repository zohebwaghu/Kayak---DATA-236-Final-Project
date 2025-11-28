# llm/intent_parser.py
"""
Intent Parser for Concierge Agent
Extracts structured data from natural language queries:
- Dates, budget, travelers
- Origin/destination
- Constraints (pet-friendly, no red-eye, etc.)
Implements: "Intent understanding with a single clarifying question max"
"""

import re
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from loguru import logger

# Try to import OpenAI for advanced parsing
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


@dataclass
class ParsedIntent:
    """Structured intent extracted from natural language"""
    origin: Optional[str] = None
    destination: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    budget: Optional[float] = None
    travelers: int = 1
    constraints: List[str] = field(default_factory=list)
    raw_query: str = ""
    confidence: float = 0.0
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "origin": self.origin,
            "destination": self.destination,
            "date_from": self.date_from,
            "date_to": self.date_to,
            "budget": self.budget,
            "travelers": self.travelers,
            "constraints": self.constraints,
            "raw_query": self.raw_query,
            "confidence": self.confidence,
            "needs_clarification": self.needs_clarification,
            "clarification_question": self.clarification_question
        }


class IntentParser:
    """
    Parses natural language travel queries into structured intents.
    Uses rule-based parsing with optional LLM enhancement.
    """
    
    def __init__(self):
        # Common airport codes
        self.airport_codes = {
            "sfo": "SFO", "san francisco": "SFO",
            "lax": "LAX", "los angeles": "LAX", "la": "LAX",
            "jfk": "JFK", "new york": "JFK", "nyc": "JFK",
            "mia": "MIA", "miami": "MIA",
            "ord": "ORD", "chicago": "ORD",
            "dfw": "DFW", "dallas": "DFW",
            "den": "DEN", "denver": "DEN",
            "sea": "SEA", "seattle": "SEA",
            "bos": "BOS", "boston": "BOS",
            "atl": "ATL", "atlanta": "ATL",
            "las": "LAS", "vegas": "LAS", "las vegas": "LAS",
            "phx": "PHX", "phoenix": "PHX",
            "hnl": "HNL", "honolulu": "HNL", "hawaii": "HNL",
            "cancun": "CUN", "cun": "CUN",
            "tokyo": "NRT", "nrt": "NRT",
            "paris": "CDG", "cdg": "CDG",
            "london": "LHR", "lhr": "LHR",
        }
        
        # Destination keywords (for "anywhere warm" type queries)
        self.destination_keywords = {
            "warm": ["MIA", "CUN", "HNL", "PHX"],
            "beach": ["MIA", "CUN", "HNL"],
            "mountain": ["DEN", "SLC"],
            "city": ["JFK", "ORD", "LAX"],
            "europe": ["CDG", "LHR", "FCO"],
            "asia": ["NRT", "HKG", "SIN"],
        }
        
        # Constraint patterns
        self.constraint_patterns = {
            "pet-friendly": [r"pet[- ]?friendly", r"pets? allowed", r"with pets?", r"bring.*pet"],
            "no-redeye": [r"no red[- ]?eye", r"avoid red[- ]?eye", r"not red[- ]?eye"],
            "direct-flight": [r"direct", r"non[- ]?stop", r"no stops?", r"no layover"],
            "refundable": [r"refundable", r"free cancel", r"flexible"],
            "breakfast": [r"breakfast", r"with breakfast"],
            "wifi": [r"wifi", r"wi-fi", r"internet"],
            "parking": [r"parking", r"free parking"],
            "pool": [r"pool", r"swimming"],
            "gym": [r"gym", r"fitness"],
            "business-class": [r"business class", r"business seat"],
            "first-class": [r"first class"],
            "economy": [r"economy", r"cheap"],
        }
        
        # Budget patterns
        self.budget_patterns = [
            r"\$(\d+(?:,\d{3})*(?:\.\d{2})?)",  # $1000, $1,000, $1000.00
            r"(\d+(?:,\d{3})*)\s*(?:dollars?|usd|bucks?)",  # 1000 dollars
            r"budget\s*(?:of|is|:)?\s*\$?(\d+(?:,\d{3})*)",  # budget of 1000
            r"under\s*\$?(\d+(?:,\d{3})*)",  # under 1000
            r"(?:max|maximum)\s*\$?(\d+(?:,\d{3})*)",  # max 1000
        ]
        
        # Date patterns
        self.month_names = {
            "jan": 1, "january": 1, "feb": 2, "february": 2,
            "mar": 3, "march": 3, "apr": 4, "april": 4,
            "may": 5, "jun": 6, "june": 6,
            "jul": 7, "july": 7, "aug": 8, "august": 8,
            "sep": 9, "september": 9, "oct": 10, "october": 10,
            "nov": 11, "november": 11, "dec": 12, "december": 12
        }
        
        # OpenAI client (if available)
        self.openai_client = None
        if OPENAI_AVAILABLE:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if api_key and not api_key.startswith("sk-your"):
                try:
                    self.openai_client = OpenAI(api_key=api_key)
                    logger.info("IntentParser: OpenAI client initialized")
                except Exception as e:
                    logger.warning(f"IntentParser: OpenAI init failed: {e}")
    
    def parse(self, query: str, context: Optional[Dict[str, Any]] = None) -> ParsedIntent:
        """
        Parse a natural language query into structured intent.
        
        Args:
            query: User's natural language query
            context: Optional session context for multi-turn conversations
        
        Returns:
            ParsedIntent with extracted data
        """
        query_lower = query.lower().strip()
        
        intent = ParsedIntent(raw_query=query)
        
        # Extract each component
        intent.origin = self._extract_origin(query_lower, context)
        intent.destination = self._extract_destination(query_lower)
        intent.date_from, intent.date_to = self._extract_dates(query_lower)
        intent.budget = self._extract_budget(query_lower)
        intent.travelers = self._extract_travelers(query_lower)
        intent.constraints = self._extract_constraints(query_lower)
        
        # Calculate confidence
        intent.confidence = self._calculate_confidence(intent)
        
        # Check if clarification needed (single question max)
        intent.needs_clarification, intent.clarification_question = self._check_clarification_needed(intent)
        
        logger.info(f"Parsed intent: destination={intent.destination}, "
                   f"dates={intent.date_from}-{intent.date_to}, "
                   f"budget={intent.budget}, confidence={intent.confidence:.2f}")
        
        return intent
    
    def _extract_origin(self, query: str, context: Optional[Dict] = None) -> Optional[str]:
        """Extract origin airport/city"""
        # Pattern: "from SFO", "departing from San Francisco"
        patterns = [
            r"from\s+(\w+(?:\s+\w+)?)",
            r"departing\s+(?:from\s+)?(\w+(?:\s+\w+)?)",
            r"leaving\s+(?:from\s+)?(\w+(?:\s+\w+)?)",
            r"(\w{3})\s+to\s+",  # SFO to ...
        ]
        
        for pattern in patterns:
            match = re.search(pattern, query)
            if match:
                location = match.group(1).lower().strip()
                if location in self.airport_codes:
                    return self.airport_codes[location]
        
        # Check context for previous origin
        if context and context.get("origin"):
            return context["origin"]
        
        # Default to SFO (common in our dataset)
        return None
    
    def _extract_destination(self, query: str) -> Optional[str]:
        """Extract destination airport/city"""
        # Pattern: "to Miami", "going to NYC"
        patterns = [
            r"to\s+(\w+(?:\s+\w+)?)",
            r"going\s+(?:to\s+)?(\w+(?:\s+\w+)?)",
            r"visiting\s+(\w+(?:\s+\w+)?)",
            r"trip\s+to\s+(\w+(?:\s+\w+)?)",
            r"fly\s+to\s+(\w+(?:\s+\w+)?)",
            r"in\s+(\w+(?:\s+\w+)?)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, query)
            if match:
                location = match.group(1).lower().strip()
                # Skip common words
                if location in ["the", "a", "an", "anywhere", "somewhere"]:
                    continue
                if location in self.airport_codes:
                    return self.airport_codes[location]
        
        # Check for keyword destinations ("anywhere warm")
        for keyword, destinations in self.destination_keywords.items():
            if keyword in query:
                return destinations[0]  # Return first match
        
        return None
    
    def _extract_dates(self, query: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract travel dates"""
        date_from = None
        date_to = None
        today = datetime.now()
        
        # Pattern: "Oct 25-27", "October 25 to 27"
        range_pattern = r"(\w+)\s+(\d{1,2})[-–to]+\s*(\d{1,2})"
        match = re.search(range_pattern, query)
        if match:
            month_str = match.group(1).lower()
            day1 = int(match.group(2))
            day2 = int(match.group(3))
            
            if month_str in self.month_names:
                month = self.month_names[month_str]
                year = today.year if month >= today.month else today.year + 1
                
                date_from = f"{year}-{month:02d}-{day1:02d}"
                date_to = f"{year}-{month:02d}-{day2:02d}"
                return date_from, date_to
        
        # Pattern: "next weekend", "this weekend"
        if "next weekend" in query:
            # Find next Saturday
            days_until_saturday = (5 - today.weekday()) % 7
            if days_until_saturday == 0:
                days_until_saturday = 7
            saturday = today + timedelta(days=days_until_saturday + 7)
            sunday = saturday + timedelta(days=1)
            date_from = saturday.strftime("%Y-%m-%d")
            date_to = sunday.strftime("%Y-%m-%d")
            return date_from, date_to
        
        if "this weekend" in query or "weekend" in query:
            days_until_saturday = (5 - today.weekday()) % 7
            if days_until_saturday == 0:
                days_until_saturday = 7
            saturday = today + timedelta(days=days_until_saturday)
            sunday = saturday + timedelta(days=1)
            date_from = saturday.strftime("%Y-%m-%d")
            date_to = sunday.strftime("%Y-%m-%d")
            return date_from, date_to
        
        # Pattern: "next month"
        if "next month" in query:
            next_month = today.month + 1 if today.month < 12 else 1
            year = today.year if today.month < 12 else today.year + 1
            date_from = f"{year}-{next_month:02d}-01"
            # End of month
            if next_month in [4, 6, 9, 11]:
                date_to = f"{year}-{next_month:02d}-30"
            elif next_month == 2:
                date_to = f"{year}-{next_month:02d}-28"
            else:
                date_to = f"{year}-{next_month:02d}-31"
            return date_from, date_to
        
        # Pattern: specific date "December 15"
        single_date = r"(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?"
        match = re.search(single_date, query)
        if match:
            month_str = match.group(1).lower()
            day = int(match.group(2))
            
            if month_str in self.month_names:
                month = self.month_names[month_str]
                year = today.year if month >= today.month else today.year + 1
                date_from = f"{year}-{month:02d}-{day:02d}"
                # Default 3-night stay
                date_to_obj = datetime(year, month, day) + timedelta(days=3)
                date_to = date_to_obj.strftime("%Y-%m-%d")
                return date_from, date_to
        
        return date_from, date_to
    
    def _extract_budget(self, query: str) -> Optional[float]:
        """Extract budget amount"""
        for pattern in self.budget_patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                budget_str = match.group(1).replace(",", "")
                try:
                    return float(budget_str)
                except ValueError:
                    continue
        return None
    
    def _extract_travelers(self, query: str) -> int:
        """Extract number of travelers"""
        patterns = [
            r"for\s+(\d+)\s*(?:people|persons?|travelers?|adults?)",
            r"(\d+)\s*(?:people|persons?|travelers?|adults?)",
            r"party\s+of\s+(\d+)",
            r"(\d+)\s+of\s+us",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    continue
        
        # Check for "two", "three", etc.
        word_numbers = {
            "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "couple": 2, "pair": 2
        }
        for word, num in word_numbers.items():
            if word in query:
                return num
        
        return 1  # Default to 1
    
    def _extract_constraints(self, query: str) -> List[str]:
        """Extract travel constraints/preferences"""
        constraints = []
        
        for constraint_name, patterns in self.constraint_patterns.items():
            for pattern in patterns:
                if re.search(pattern, query, re.IGNORECASE):
                    constraints.append(constraint_name)
                    break
        
        return constraints
    
    def _calculate_confidence(self, intent: ParsedIntent) -> float:
        """Calculate confidence score based on extracted data"""
        score = 0.0
        
        if intent.destination:
            score += 0.3
        if intent.date_from and intent.date_to:
            score += 0.25
        elif intent.date_from:
            score += 0.15
        if intent.budget:
            score += 0.2
        if intent.origin:
            score += 0.15
        if intent.constraints:
            score += 0.1
        
        return min(score, 1.0)
    
    def _check_clarification_needed(self, intent: ParsedIntent) -> Tuple[bool, Optional[str]]:
        """
        Check if clarification is needed.
        Returns at most ONE clarifying question (as per requirements).
        """
        # Priority order for clarification
        if not intent.destination:
            return True, "Where would you like to go? (e.g., Miami, Tokyo, 'anywhere warm')"
        
        if not intent.date_from:
            return True, "When are you planning to travel? (e.g., 'next weekend', 'Oct 25-27')"
        
        # Budget and travelers are optional, don't ask
        return False, None
    
    def merge_with_context(self, intent: ParsedIntent, context: Dict[str, Any]) -> ParsedIntent:
        """
        Merge new intent with existing session context.
        Implements 'Refine without starting over'.
        """
        # Only update fields that are present in new intent
        if not intent.origin and context.get("origin"):
            intent.origin = context["origin"]
        if not intent.destination and context.get("destination"):
            intent.destination = context["destination"]
        if not intent.date_from and context.get("date_from"):
            intent.date_from = context["date_from"]
        if not intent.date_to and context.get("date_to"):
            intent.date_to = context["date_to"]
        if not intent.budget and context.get("budget"):
            intent.budget = context["budget"]
        if intent.travelers == 1 and context.get("travelers", 1) > 1:
            intent.travelers = context["travelers"]
        
        # Merge constraints (append new, don't replace)
        existing_constraints = context.get("constraints", [])
        intent.constraints = list(set(existing_constraints + intent.constraints))
        
        # Recalculate confidence
        intent.confidence = self._calculate_confidence(intent)
        intent.needs_clarification, intent.clarification_question = self._check_clarification_needed(intent)
        
        return intent


# ============================================
# Global Instance
# ============================================

intent_parser = IntentParser()


# ============================================
# Convenience Function
# ============================================

def parse_intent(query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Parse a query and return dict"""
    intent = intent_parser.parse(query, context)
    if context:
        intent = intent_parser.merge_with_context(intent, context)
    return intent.to_dict()
