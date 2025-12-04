"""
Test Harness Configuration
Loads environment variables and provides configuration for all test modules
"""

import os
from dotenv import load_dotenv
from typing import Dict, Any

# Load environment variables
load_dotenv()

class TestConfig:
    """Configuration for test harness"""
    
    # API Gateway
    API_GATEWAY_URL: str = os.getenv("API_GATEWAY_URL", "http://localhost:3000")
    API_BASE_URL: str = f"{API_GATEWAY_URL}/api/v1"
    
    # AI Service
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
    
    # MySQL Configuration
    # Note: Docker exposes MySQL on port 3307 (host) -> 3306 (container)
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "localhost")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3307"))  # Default to 3307 for Docker
    MYSQL_USER: str = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DB_USERS: str = os.getenv("MYSQL_DB_USERS", "kayak_users")
    MYSQL_DB_BOOKINGS: str = os.getenv("MYSQL_DB_BOOKINGS", "kayak_bookings")
    MYSQL_DB_BILLING: str = os.getenv("MYSQL_DB_BILLING", "kayak_billing")
    
    # MongoDB Configuration
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB: str = os.getenv("MONGO_DB", "kayak_doc")
    MONGO_DB_SEARCH: str = os.getenv("MONGO_DB_SEARCH", "kayak_search")
    
    # Redis Configuration
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    
    # Kafka Configuration
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    
    # JWT Configuration
    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-key-change-in-production")
    
    # Test Data Configuration
    NUM_TEST_USERS: int = int(os.getenv("NUM_TEST_USERS", "10000"))
    NUM_TEST_LISTINGS: int = int(os.getenv("NUM_TEST_LISTINGS", "10000"))
    NUM_TEST_BOOKINGS: int = int(os.getenv("NUM_TEST_BOOKINGS", "100000"))
    NUM_TEST_FLIGHTS: int = int(os.getenv("NUM_TEST_FLIGHTS", "3000"))
    NUM_TEST_HOTELS: int = int(os.getenv("NUM_TEST_HOTELS", "3000"))
    NUM_TEST_CARS: int = int(os.getenv("NUM_TEST_CARS", "3000"))
    
    # Performance Test Configuration
    CONCURRENT_USERS: int = int(os.getenv("CONCURRENT_USERS", "100"))
    MAX_RESPONSE_TIME_MS: int = int(os.getenv("MAX_RESPONSE_TIME_MS", "500"))
    PERCENTILE_95_TARGET_MS: int = int(os.getenv("PERCENTILE_95_TARGET_MS", "500"))
    
    # Test Execution
    CLEANUP_AFTER_TESTS: bool = os.getenv("CLEANUP_AFTER_TESTS", "false").lower() == "true"
    GENERATE_REPORTS: bool = os.getenv("GENERATE_REPORTS", "true").lower() == "true"
    REPORT_DIR: str = os.getenv("REPORT_DIR", "test_reports")
    
    # Timeouts
    API_TIMEOUT_SECONDS: int = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
    DB_TIMEOUT_SECONDS: int = int(os.getenv("DB_TIMEOUT_SECONDS", "10"))
    
    @classmethod
    def get_mysql_connection_string(cls, database: str) -> Dict[str, Any]:
        """Get MySQL connection parameters"""
        return {
            "host": cls.MYSQL_HOST,
            "port": cls.MYSQL_PORT,
            "user": cls.MYSQL_USER,
            "password": cls.MYSQL_PASSWORD,
            "database": database,
            "connect_timeout": cls.DB_TIMEOUT_SECONDS
        }
    
    @classmethod
    def get_mongodb_connection_string(cls) -> str:
        """Get MongoDB connection string"""
        return cls.MONGO_URI
    
    @classmethod
    def get_redis_connection_params(cls) -> Dict[str, Any]:
        """Get Redis connection parameters"""
        return {
            "host": cls.REDIS_HOST,
            "port": cls.REDIS_PORT,
            "db": cls.REDIS_DB,
            "decode_responses": True
        }

