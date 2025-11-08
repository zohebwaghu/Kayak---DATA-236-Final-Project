"""
AI Service - FastAPI Application
Concierge Agent for travel recommendations
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import Config
from api.ai_chat import router as ai_router
from schemas.ai_schemas import HealthCheckResponse

# ============================================
# Create FastAPI App
# ============================================

app = FastAPI(
    title="AI Travel Service",
    description="Multi-Agent AI system for travel recommendations",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# ============================================
# CORS Middleware
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Include Routers
# ============================================

app.include_router(ai_router)

# ============================================
# Health Check Endpoint
# ============================================

@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """
    Health check endpoint
    
    Returns:
        HealthCheckResponse: Service health status
    """
    dependencies = {}
    
    # Check Redis
    try:
        from cache.redis_client import check_redis_health
        dependencies["redis"] = check_redis_health()
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        dependencies["redis"] = False
    
    # Check Ollama
    try:
        from cache.embeddings import EmbeddingService
        embedder = EmbeddingService()
        dependencies["ollama"] = True
    except Exception as e:
        logger.warning(f"Ollama health check failed: {e}")
        dependencies["ollama"] = False
    
    # Check OpenAI (just config presence)
    try:
        dependencies["openai"] = bool(Config.OPENAI_API_KEY)
    except Exception as e:
        logger.warning(f"OpenAI config check failed: {e}")
        dependencies["openai"] = False
    
    # Determine overall status
    all_healthy = all(dependencies.values())
    status = "healthy" if all_healthy else "degraded"
    
    return HealthCheckResponse(
        status=status,
        version="0.1.0",
        dependencies=dependencies
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Travel Service",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


# ============================================
# Startup Event
# ============================================

@app.on_event("startup")
async def startup_event():
    """
    Initialize services on startup
    """
    logger.info("="*60)
    logger.info("Starting AI Service")
    logger.info("="*60)
    
    # Log configuration
    logger.info(f"Service Port: {Config.AI_SERVICE_PORT}")
    logger.info(f"OpenAI Model: {Config.OPENAI_MODEL}")
    logger.info(f"Ollama Model: {Config.OLLAMA_EMBEDDING_MODEL}")
    logger.info(f"Redis: {Config.REDIS_HOST}:{Config.REDIS_PORT}")
    logger.info(f"Cache Threshold: {Config.CACHE_SIMILARITY_THRESHOLD}")
    
    # Test connections (optional)
    try:
        from cache.redis_client import check_redis_health
        if check_redis_health():
            logger.info("✅ Redis connection verified")
        else:
            logger.warning("⚠️  Redis not available (caching disabled)")
    except Exception as e:
        logger.warning(f"⚠️  Redis check failed: {e}")
    
    try:
        from cache.embeddings import EmbeddingService
        embedder = EmbeddingService()
        logger.info(f"✅ Ollama embeddings ready ({embedder.embedding_dim} dims)")
    except Exception as e:
        logger.warning(f"⚠️  Ollama not available: {e}")
    
    logger.info("="*60)
    logger.info("AI Service Ready")
    logger.info(f"Docs: http://localhost:{Config.AI_SERVICE_PORT}/docs")
    logger.info("="*60)


@app.on_event("shutdown")
async def shutdown_event():
    """
    Cleanup on shutdown
    """
    logger.info("Shutting down AI Service...")


# ============================================
# Run with uvicorn
# ============================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=Config.AI_SERVICE_HOST,
        port=Config.AI_SERVICE_PORT,
        reload=True,  # Auto-reload on code changes (development only)
        log_level="info"
    )
