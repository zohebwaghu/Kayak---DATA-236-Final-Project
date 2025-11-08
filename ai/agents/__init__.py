"""
AI Agents Module

This module contains the intelligent agents that power the recommendation system:
- DealsAgent: Backend worker that processes Kafka streams and scores deals
- ConciergeAgent: User-facing agent that handles natural language queries (Week 2)
"""

from .deals_agent import DealsAgent, get_deals_agent

__all__ = [
    "DealsAgent",
    "get_deals_agent",
]

# Version info
__version__ = "1.0.0"
