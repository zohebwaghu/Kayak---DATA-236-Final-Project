"""
AI Agents Module

This module contains the intelligent agents that power the recommendation system:
- DealsAgent: Backend worker that processes Kafka streams and scores deals
- ConciergeAgent: User-facing conversational AI assistant
"""

from .deals_agent import DealsAgent, get_deals_agent
from .concierge_agent import ConciergeAgent, get_concierge_agent

__all__ = [
    "DealsAgent",
    "get_deals_agent",
    "ConciergeAgent",
    "get_concierge_agent",
]

__version__ = "2.0.0"
