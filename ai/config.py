"""
Configuration Management for AI Service
Loads environment variables and provides configuration singleton
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """
    Application Settings
    All configurations loaded from .env file
    """
    
    # ============================================
    # Service Configuration
    # ============================================
    AI_SERVICE_PORT: int = 8001
    AI_SERVICE_HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "INFO"
    
    # ============================================
    # OpenAI Configuration (GPT-3.5 only)
    # ============================================
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-3.5-turbo"
    
    # ============================================
    # Ollama Configuration (Embeddings)
    # ============================================
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_EMBEDDING_MODEL: str = "mxbai-embed-large"
    OLLAMA_EMBEDDING_DIM: int = 1024  # mxbai-embed-large dimension
    
    # ============================================
    # Redis Configuration
    # ============================================
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 0
    
    # ============================================
    # Semantic Cache Configuration
    # ============================================
    CACHE_SIMILARITY_THRESHOLD: float = 0.85
    CACHE_TTL_DAYS: int = 7
    
    # ============================================
    # Kafka Configuration
    # ============================================
    USE_REAL_KAFKA: bool = False
    KAFKA_BOOTSTRAP_SERVERS: str = "localhost:9092"
    
    # ============================================
    # Algorithm Parameters
    # ============================================
    DEAL_SCORE_THRESHOLD: int = 40
    PRICE_DROP_THRESHOLD: float = 0.15
    MAX_BUNDLES_TO_RETURN: int = 3
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance
    
    Returns:
        Settings: Application settings singleton
    """
    return Settings()


# Convenience alias
Config = get_settings()
