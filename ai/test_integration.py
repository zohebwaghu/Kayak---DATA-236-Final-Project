"""
Integration Test Script
Tests connectivity to all services: MySQL, Redis, Kafka, MongoDB
Run this after starting docker-compose to verify everything works
"""

import asyncio
import sys
import json
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, '.')

def print_header(text: str):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def print_result(name: str, success: bool, message: str = ""):
    status = "[PASS]" if success else "[FAIL]"
    color = "\033[92m" if success else "\033[91m"
    reset = "\033[0m"
    print(f"{color}{status}{reset} {name}")
    if message:
        print(f"       {message}")

async def test_mysql():
    """Test MySQL connections to kayak_users and kayak_bookings"""
    print_header("Testing MySQL Connection")
    
    try:
        import mysql.connector
        from config import settings
        
        # Test kayak_users database
        try:
            conn = mysql.connector.connect(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                database=settings.DB_NAME_USERS
            )
            cursor = conn.cursor(dictionary=True)
            
            # Check users table
            cursor.execute("SELECT COUNT(*) as count FROM users")
            result = cursor.fetchone()
            print_result(
                f"MySQL kayak_users.users",
                True,
                f"Found {result['count']} users"
            )
            
            # Check table structure
            cursor.execute("DESCRIBE users")
            columns = [row['Field'] for row in cursor.fetchall()]
            has_camel_case = 'firstName' in columns or 'userId' in columns
            print_result(
                "Table uses camelCase",
                has_camel_case,
                f"Columns: {', '.join(columns[:5])}..."
            )
            
            cursor.close()
            conn.close()
            
        except Exception as e:
            print_result("MySQL kayak_users", False, str(e))
            return False
        
        # Test kayak_bookings database
        try:
            conn = mysql.connector.connect(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                database=settings.DB_NAME_BOOKINGS
            )
            cursor = conn.cursor(dictionary=True)
            
            # Check bookings table
            cursor.execute("SELECT COUNT(*) as count FROM bookings")
            result = cursor.fetchone()
            print_result(
                f"MySQL kayak_bookings.bookings",
                True,
                f"Found {result['count']} bookings"
            )
            
            # Check inventory table
            cursor.execute("SELECT COUNT(*) as count FROM inventory")
            result = cursor.fetchone()
            print_result(
                f"MySQL kayak_bookings.inventory",
                True,
                f"Found {result['count']} inventory items"
            )
            
            cursor.close()
            conn.close()
            
        except Exception as e:
            print_result("MySQL kayak_bookings", False, str(e))
            return False
        
        return True
        
    except ImportError:
        print_result("MySQL", False, "mysql-connector-python not installed")
        return False
    except Exception as e:
        print_result("MySQL", False, str(e))
        return False

async def test_redis():
    """Test Redis connection"""
    print_header("Testing Redis Connection")
    
    try:
        import redis
        from config import settings
        
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB
        )
        
        # Test ping
        ping_result = r.ping()
        print_result("Redis PING", ping_result, "PONG received")
        
        # Test set/get
        test_key = "ai_test_key"
        test_value = f"test_value_{datetime.now().isoformat()}"
        r.set(test_key, test_value, ex=60)
        retrieved = r.get(test_key)
        
        set_get_ok = retrieved.decode() == test_value if retrieved else False
        print_result("Redis SET/GET", set_get_ok)
        
        # Cleanup
        r.delete(test_key)
        
        return True
        
    except ImportError:
        print_result("Redis", False, "redis package not installed")
        return False
    except Exception as e:
        print_result("Redis", False, str(e))
        return False

async def test_kafka():
    """Test Kafka connection"""
    print_header("Testing Kafka Connection")
    
    try:
        from kafka import KafkaProducer, KafkaConsumer
        from kafka.admin import KafkaAdminClient, NewTopic
        from kafka.errors import TopicAlreadyExistsError
        from config import settings
        
        bootstrap_servers = settings.KAFKA_BOOTSTRAP_SERVERS.split(",")
        
        # Test producer connection
        try:
            producer = KafkaProducer(
                bootstrap_servers=bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            print_result("Kafka Producer", True, f"Connected to {settings.KAFKA_BOOTSTRAP_SERVERS}")
            producer.close()
        except Exception as e:
            print_result("Kafka Producer", False, str(e))
            return False
        
        # Test consumer connection
        try:
            consumer = KafkaConsumer(
                bootstrap_servers=bootstrap_servers,
                consumer_timeout_ms=1000
            )
            topics = consumer.topics()
            print_result(
                "Kafka Consumer",
                True,
                f"Found {len(topics)} topics: {', '.join(list(topics)[:5])}"
            )
            consumer.close()
        except Exception as e:
            print_result("Kafka Consumer", False, str(e))
            return False
        
        # Check required topics
        required_topics = [
            settings.KAFKA_DEALS_NORMALIZED_TOPIC,
            settings.KAFKA_DEALS_SCORED_TOPIC,
            settings.KAFKA_DEALS_TAGGED_TOPIC,
            settings.KAFKA_DEAL_EVENTS_TOPIC
        ]
        
        consumer = KafkaConsumer(bootstrap_servers=bootstrap_servers)
        existing_topics = consumer.topics()
        consumer.close()
        
        for topic in required_topics:
            exists = topic in existing_topics
            print_result(f"Topic: {topic}", exists, "exists" if exists else "MISSING")
        
        return True
        
    except ImportError:
        print_result("Kafka", False, "kafka-python not installed")
        return False
    except Exception as e:
        print_result("Kafka", False, str(e))
        return False

async def test_mongodb():
    """Test MongoDB connection"""
    print_header("Testing MongoDB Connection")
    
    try:
        from pymongo import MongoClient
        from config import settings
        
        client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
        
        # Test connection
        client.admin.command('ping')
        print_result("MongoDB PING", True)
        
        # Check kayak_doc database
        db = client[settings.MONGO_DB]
        collections = db.list_collection_names()
        print_result(
            f"MongoDB {settings.MONGO_DB}",
            True,
            f"Collections: {', '.join(collections)}"
        )
        
        # Check deal_events collection
        if 'deal_events' in collections:
            count = db.deal_events.count_documents({})
            print_result("deal_events collection", True, f"{count} documents")
        else:
            print_result("deal_events collection", False, "NOT FOUND")
        
        client.close()
        return True
        
    except ImportError:
        print_result("MongoDB", False, "pymongo not installed")
        return False
    except Exception as e:
        print_result("MongoDB", False, str(e))
        return False

async def test_data_interface():
    """Test DataInterface class"""
    print_header("Testing DataInterface")
    
    try:
        from interfaces.data_interface import DataInterface
        
        di = DataInterface()
        
        # Test health check
        health = await di.health_check()
        print_result("DataInterface.health_check()", all(health.values()), str(health))
        
        # Test get user (using test user from mysql-init.sql)
        test_user_id = "123-45-6789"  # Admin user from seed data
        user = await di.get_user_by_id(test_user_id)
        print_result(
            f"get_user_by_id('{test_user_id}')",
            user is not None,
            f"Found: {user.get('firstName')} {user.get('lastName')}" if user else "Not found"
        )
        
        # Test get user preferences
        prefs = await di.get_user_preferences(test_user_id)
        print_result(
            "get_user_preferences()",
            prefs is not None,
            f"Budget: {prefs.get('preferences', {}).get('budget')}" if prefs else "Not found"
        )
        
        # Test get booking history
        bookings = await di.get_booking_history(test_user_id)
        print_result(
            "get_booking_history()",
            True,
            f"Found {len(bookings)} bookings"
        )
        
        # Test get inventory
        inventory = await di.get_inventory(listing_type="hotel")
        print_result(
            "get_inventory(listing_type='hotel')",
            True,
            f"Found {len(inventory)} hotel inventory records"
        )
        
        return True
        
    except Exception as e:
        print_result("DataInterface", False, str(e))
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Run all integration tests"""
    print("\n" + "="*60)
    print("  AI SERVICE INTEGRATION TESTS")
    print("="*60)
    print(f"  Time: {datetime.now().isoformat()}")
    print("="*60)
    
    results = {}
    
    # Run tests
    results["MySQL"] = await test_mysql()
    results["Redis"] = await test_redis()
    results["Kafka"] = await test_kafka()
    results["MongoDB"] = await test_mongodb()
    results["DataInterface"] = await test_data_interface()
    
    # Summary
    print_header("TEST SUMMARY")
    
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    
    for name, success in results.items():
        print_result(name, success)
    
    print(f"\n{'='*60}")
    print(f"  Results: {passed}/{total} passed")
    print(f"{'='*60}\n")
    
    if passed == total:
        print("\033[92m  All tests passed! Ready for integration.\033[0m\n")
        return 0
    else:
        print("\033[91m  Some tests failed. Check the errors above.\033[0m\n")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
