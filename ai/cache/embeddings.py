"""
Embedding Service - Gemini default, Ollama available
Uses Gemini text-embedding-004 model (768 dimensions)
"""

import os
from typing import List
from loguru import logger

# ============================================
# Embedding Provider Options (uncomment ONE)
# ============================================

# Option 1: Gemini (default - unlimited API calls)
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Option 2: Ollama (uncomment to use - requires local setup)
# import ollama
# OLLAMA_AVAILABLE = True
OLLAMA_AVAILABLE = False  # Disabled - using Gemini


class EmbeddingService:
    """
    Embedding service for semantic similarity

    Default: Gemini text-embedding-004 (768 dimensions, unlimited API calls)
    Alternative: Ollama mxbai-embed-large (1024 dimensions, local)

    Usage:
        embedder = EmbeddingService()
        embedding = embedder.embed_query("Find cheap flights to Miami")
    """

    def __init__(self):
        """
        Initialize Embedding Service

        Raises:
            RuntimeError: If no embedding provider available
        """
        self.provider = None
        self.model = None
        self.embedding_dim = None

        # Try Gemini first
        gemini_key = os.getenv("GEMINI_API_KEY", "")
        if GEMINI_AVAILABLE and gemini_key:
            try:
                genai.configure(api_key=gemini_key)
                self.provider = "gemini"
                self.model = "models/text-embedding-004"
                self.embedding_dim = 768
                logger.info(f"Embedding Service: Gemini ({self.embedding_dim} dims)")
                return
            except Exception as e:
                logger.warning(f"Gemini embedding init failed: {e}")

        # Fallback to Ollama (commented out - uncomment if using Ollama)
        # if OLLAMA_AVAILABLE:
        #     try:
        #         import ollama
        #         models = ollama.list()
        #         self.provider = "ollama"
        #         self.model = "mxbai-embed-large"
        #         self.embedding_dim = 1024
        #         logger.info(f"Embedding Service: Ollama ({self.embedding_dim} dims)")
        #         return
        #     except Exception as e:
        #         logger.warning(f"Ollama embedding init failed: {e}")

        # No provider available - embeddings disabled
        logger.warning("No embedding provider available - semantic caching disabled")
        self.provider = None

    def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a query string

        Args:
            query: Text to embed

        Returns:
            List[float]: Embedding vector

        Raises:
            RuntimeError: If embedding generation fails
        """
        if not self.provider:
            raise RuntimeError("No embedding provider configured")

        try:
            # ============================================
            # GEMINI EMBEDDINGS
            # ============================================
            if self.provider == "gemini":
                result = genai.embed_content(
                    model=self.model,
                    content=query
                )
                embedding = result['embedding']
                logger.debug(f"Gemini embedding: '{query[:50]}...' ({len(embedding)} dims)")
                return embedding

            # ============================================
            # OLLAMA EMBEDDINGS (uncomment if using)
            # ============================================
            # if self.provider == "ollama":
            #     import ollama
            #     result = ollama.embeddings(
            #         model=self.model,
            #         prompt=query
            #     )
            #     embedding = result['embedding']
            #     logger.debug(f"Ollama embedding: '{query[:50]}...' ({len(embedding)} dims)")
            #     return embedding

        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise RuntimeError(f"Embedding generation failed: {e}")

    def embed_batch(self, queries: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple queries

        Args:
            queries: List of text strings

        Returns:
            List[List[float]]: List of embedding vectors
        """
        embeddings = []
        for query in queries:
            embedding = self.embed_query(query)
            embeddings.append(embedding)
        logger.debug(f"Generated {len(embeddings)} embeddings")
        return embeddings

    def calculate_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float]
    ) -> float:
        """
        Calculate cosine similarity between two embeddings

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            float: Cosine similarity (0.0 to 1.0)
        """
        import numpy as np

        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        similarity = dot_product / (norm1 * norm2)
        return max(0.0, min(1.0, float(similarity)))

    @property
    def model_info(self) -> dict:
        """Get model information"""
        return {
            "provider": self.provider,
            "model": self.model,
            "embedding_dim": self.embedding_dim
        }


# ============================================
# Example Usage
# ============================================

if __name__ == "__main__":
    print("Testing Embedding Service...\n")

    try:
        embedder = EmbeddingService()
        print(f"Service initialized: {embedder.model_info}\n")

        # Test single embedding
        query1 = "Find cheap flights from SFO to Miami"
        embedding1 = embedder.embed_query(query1)
        print(f"Query 1: {query1}")
        print(f"Embedding dimensions: {len(embedding1)}")
        print(f"First 5 values: {embedding1[:5]}\n")

        # Test similar query
        query2 = "cheap flight SFO to Miami"
        embedding2 = embedder.embed_query(query2)

        similarity = embedder.calculate_similarity(embedding1, embedding2)
        print(f"Query 2: {query2}")
        print(f"Similarity: {similarity:.3f}")

    except RuntimeError as e:
        print(f"Error: {e}")
        print("\nTo use Gemini: export GEMINI_API_KEY='your-key'")
