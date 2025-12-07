# interfaces/location_cache.py
"""
Location Cache with Fuzzy Search
Provides smart location matching for flights, hotels, cars
"""

from typing import List, Dict, Optional, Any
from loguru import logger

try:
    from rapidfuzz import fuzz, process
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    logger.warning("rapidfuzz not installed, fuzzy search disabled")

try:
    from sqlmodel import Session, select
    from models.database import get_engine
    from models.deals_entities import FlightDeal, HotelDeal, Airport
    SQLMODEL_AVAILABLE = True
except ImportError:
    SQLMODEL_AVAILABLE = False


class LocationCache:
    """
    Smart location cache with fuzzy matching
    Loads locations from DB and provides fuzzy search
    """

    def __init__(self):
        self.locations: List[Dict[str, Any]] = []
        self.name_to_code: Dict[str, str] = {}
        self.aliases: Dict[str, str] = {}
        self._loaded = False

        # Common aliases for cities
        self._builtin_aliases = {
            "bombay": "mumbai",
            "calcutta": "kolkata",
            "madras": "chennai",
            "bangalore": "bengaluru",
            "trivandrum": "thiruvananthapuram",
            "cochin": "kochi",
            "pondicherry": "puducherry",
            "benares": "varanasi",
            "poona": "pune",
            "baroda": "vadodara",
            "simla": "shimla",
            "ooty": "udhagamandalam",
            # International
            "nyc": "new york",
            "la": "los angeles",
            "sf": "san francisco",
            "vegas": "las vegas",
            "dc": "washington",
        }

        self._load_from_db()

    def _load_from_db(self):
        """Load all locations from database"""
        if not SQLMODEL_AVAILABLE:
            logger.warning("SQLModel not available, using empty location cache")
            return

        try:
            engine = get_engine()

            with Session(engine) as session:
                # IMPORTANT: Load flights FIRST so EaseMyTrip codes (MUM, BAN) take precedence
                # over global airports database (BOM, BLR)

                # Load unique flight destinations
                flights = session.exec(
                    select(FlightDeal.destination, FlightDeal.destination_city).distinct()
                ).all()
                for dest_code, dest_city in flights:
                    if dest_code and dest_city:
                        if dest_city.lower() not in self.name_to_code:
                            self.locations.append({
                                "name": dest_city,
                                "code": dest_code,
                                "type": "flight",
                                "country": "India",
                                "searchable": f"{dest_city} {dest_code}"
                            })
                            self.name_to_code[dest_city.lower()] = dest_code

                # Load unique flight origins
                origins = session.exec(
                    select(FlightDeal.origin, FlightDeal.origin_city).distinct()
                ).all()
                for orig_code, orig_city in origins:
                    if orig_code and orig_city:
                        if orig_city.lower() not in self.name_to_code:
                            self.locations.append({
                                "name": orig_city,
                                "code": orig_code,
                                "type": "flight",
                                "country": "India",
                                "searchable": f"{orig_city} {orig_code}"
                            })
                            self.name_to_code[orig_city.lower()] = orig_code

                # Load from airports table (fills in cities not in flight data)
                airports = session.exec(select(Airport)).all()
                for airport in airports:
                    if airport.iata and airport.city:
                        # Only add if not already from flights
                        if airport.city.lower() not in self.name_to_code:
                            self.locations.append({
                                "name": airport.city,
                                "code": airport.iata,
                                "type": "airport",
                                "country": airport.country or "",
                                "searchable": f"{airport.city} {airport.iata} {airport.name or ''}"
                            })
                            self.name_to_code[airport.city.lower()] = airport.iata

                # Load unique hotel cities
                hotels = session.exec(
                    select(HotelDeal.city_code, HotelDeal.city).distinct()
                ).all()
                for city_code, city in hotels:
                    if city_code and city:
                        if city.lower() not in self.name_to_code:
                            self.locations.append({
                                "name": city,
                                "code": city_code,
                                "type": "hotel",
                                "country": "",
                                "searchable": f"{city} {city_code}"
                            })
                            self.name_to_code[city.lower()] = city_code

            # Add aliases
            for alias, canonical in self._builtin_aliases.items():
                if canonical in self.name_to_code:
                    self.aliases[alias] = self.name_to_code[canonical]

            self._loaded = True
            logger.info(f"LocationCache loaded {len(self.locations)} locations, {len(self.aliases)} aliases")

        except Exception as e:
            logger.error(f"Failed to load locations from DB: {e}")

    def search(self, query: str, location_type: str = "all", limit: int = 10) -> List[Dict[str, Any]]:
        """
        Fuzzy search for locations

        Args:
            query: Search query (e.g., "mum", "bombay", "delhi")
            location_type: "flight", "hotel", "airport", "all"
            limit: Max results to return

        Returns:
            List of matches with scores: [{name, code, type, score}]
        """
        if not query:
            return []

        query_lower = query.lower().strip()

        # Check exact alias match first
        if query_lower in self.aliases:
            code = self.aliases[query_lower]
            # Find the location with this code
            for loc in self.locations:
                if loc["code"] == code:
                    return [{**loc, "score": 100}]

        # Check exact name match
        if query_lower in self.name_to_code:
            code = self.name_to_code[query_lower]
            for loc in self.locations:
                if loc["code"] == code:
                    return [{**loc, "score": 100}]

        # Fuzzy search
        if not RAPIDFUZZ_AVAILABLE:
            # Fallback to simple substring matching
            results = []
            for loc in self.locations:
                if location_type != "all" and loc["type"] != location_type:
                    continue
                if query_lower in loc["searchable"].lower():
                    results.append({**loc, "score": 80})
            return results[:limit]

        # Filter by type if specified
        if location_type == "all":
            candidates = self.locations
        else:
            candidates = [loc for loc in self.locations if loc["type"] == location_type]

        if not candidates:
            return []

        # Build searchable strings
        searchable = [loc["searchable"] for loc in candidates]

        # Fuzzy match
        matches = process.extract(
            query,
            searchable,
            scorer=fuzz.WRatio,
            limit=limit
        )

        results = []
        for match_text, score, idx in matches:
            if score >= 50:  # Minimum threshold
                loc = candidates[idx]
                results.append({
                    "name": loc["name"],
                    "code": loc["code"],
                    "type": loc["type"],
                    "country": loc.get("country", ""),
                    "score": int(score)  # Convert to int for Pydantic
                })

        return results

    def get_code(self, query: str, location_type: str = "all") -> Optional[str]:
        """
        Get the best matching code for a query

        Returns:
            Airport/city code if found with high confidence, else None
        """
        results = self.search(query, location_type, limit=1)
        if results and results[0]["score"] >= 70:
            return results[0]["code"]
        return None

    def normalize(self, query: str) -> Optional[str]:
        """
        Normalize a city name to its standard form

        Returns:
            Standard city name if found, else None
        """
        query_lower = query.lower().strip()

        # Check alias
        if query_lower in self._builtin_aliases:
            canonical = self._builtin_aliases[query_lower]
            return canonical.title()

        # Check if it's already a known city
        if query_lower in self.name_to_code:
            return query_lower.title()

        # Fuzzy search
        results = self.search(query, limit=1)
        if results and results[0]["score"] >= 70:
            return results[0]["name"]

        return None


# Global instance
location_cache = LocationCache()
