"""
AI Recommendation Service - FastAPI Application
Main entry point for the AI service
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .api.chat import router as chat_router
from .api.recommendations import router as recommendations_router
from .api.scoring import router as scoring_router
from .api.websocket import router as websocket_router
from .agents.deals_agent import get_deals_agent
from .agents.concierge_agent import get_concierge_agent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler
    Initializes and cleans up resources
    """
    # Startup
    logger.info("Starting AI Recommendation Service...")
    
    # Initialize agents
    deals_agent = get_deals_agent()
    concierge_agent = get_concierge_agent()
    
    logger.info("AI Service started successfully")
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Service...")
    
    # Cleanup
    if deals_agent:
        await deals_agent.stop()
    
    logger.info("AI Service shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="AI Recommendation Service",
    description="Intelligent travel recommendation engine with conversational AI",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router)
app.include_router(recommendations_router)
app.include_router(scoring_router)
app.include_router(websocket_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Recommendation Service",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/api/ai/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "ai-recommendation-service",
        "version": "2.0.0",
        "components": {
            "deals_agent": "ready",
            "concierge_agent": "ready",
            "cache": "ready",
            "kafka": "ready"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_ENV == "development"
    )
