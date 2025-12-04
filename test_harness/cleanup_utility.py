"""
Cleanup Utility
Cleans up test data from databases for test reproducibility
"""

import mysql.connector
from pymongo import MongoClient
from typing import Dict, List, Any, Optional
from test_harness.config import TestConfig


class CleanupUtility:
    """Utility for cleaning up test data"""
    
    def __init__(self):
        self.mysql_users_conn = None
        self.mysql_bookings_conn = None
        self.mysql_billing_conn = None
        self.mongo_client = None
        
    def connect(self):
        """Connect to databases"""
        try:
            self.mysql_users_conn = mysql.connector.connect(
                **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_USERS)
            )
            self.mysql_bookings_conn = mysql.connector.connect(
                **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_BOOKINGS)
            )
            self.mysql_billing_conn = mysql.connector.connect(
                **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_BILLING)
            )
            self.mongo_client = MongoClient(TestConfig.get_mongodb_connection_string())
        except Exception as e:
            print(f"Error connecting to databases: {e}")
            raise
    
    def disconnect(self):
        """Close database connections"""
        if self.mysql_users_conn:
            self.mysql_users_conn.close()
        if self.mysql_bookings_conn:
            self.mysql_bookings_conn.close()
        if self.mysql_billing_conn:
            self.mysql_billing_conn.close()
        if self.mongo_client:
            self.mongo_client.close()
    
    def cleanup_test_users(self, user_ids: Optional[List[str]] = None) -> int:
        """Clean up test users"""
        if not self.mysql_users_conn:
            self.connect()
        
        cursor = self.mysql_users_conn.cursor()
        deleted = 0
        
        try:
            if user_ids:
                # Delete specific users
                placeholders = ",".join(["%s"] * len(user_ids))
                cursor.execute(
                    f"DELETE FROM users WHERE user_id IN ({placeholders})",
                    user_ids
                )
                deleted = cursor.rowcount
            else:
                # Delete all test users (users created after a certain time or with test pattern)
                cursor.execute("""
                    DELETE FROM users 
                    WHERE email LIKE '%@test.%' 
                    OR email LIKE '%test%@example.com'
                    OR user_id LIKE '999-%'
                """)
                deleted = cursor.rowcount
            
            self.mysql_users_conn.commit()
            cursor.close()
            print(f"Deleted {deleted} test users")
            return deleted
        except Exception as e:
            self.mysql_users_conn.rollback()
            cursor.close()
            print(f"Error cleaning up users: {e}")
            return 0
    
    def cleanup_test_bookings(self, booking_ids: Optional[List[str]] = None) -> int:
        """Clean up test bookings (using camelCase schema)"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        deleted = 0
        
        try:
            if booking_ids:
                placeholders = ",".join(["%s"] * len(booking_ids))
                cursor.execute(
                    f"DELETE FROM bookings WHERE bookingId IN ({placeholders})",
                    booking_ids
                )
                deleted = cursor.rowcount
            else:
                # Delete bookings for test users (using camelCase column names)
                cursor.execute("""
                    DELETE FROM bookings 
                    WHERE userId IN (
                        SELECT user_id FROM kayak_users.users 
                        WHERE email LIKE '%@test.%' OR email LIKE '%test%@example.com'
                    )
                """)
                deleted = cursor.rowcount
            
            self.mysql_bookings_conn.commit()
            cursor.close()
            print(f"Deleted {deleted} test bookings")
            return deleted
        except Exception as e:
            self.mysql_bookings_conn.rollback()
            cursor.close()
            print(f"Error cleaning up bookings: {e}")
            return 0
    
    def cleanup_test_listings(self, listing_type: Optional[str] = None) -> int:
        """Clean up test listings from inventory table"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        deleted = 0
        
        try:
            # Clean up from inventory table (middleware schema)
            if listing_type:
                cursor.execute("""
                    DELETE FROM inventory 
                    WHERE listingType = %s 
                    AND (listingId LIKE 'FLT%' OR listingId LIKE 'HTL%' OR listingId LIKE 'CAR%')
                """, (listing_type,))
                deleted = cursor.rowcount
            else:
                # Delete all test listings (those starting with FLT, HTL, CAR from our generator)
                cursor.execute("""
                    DELETE FROM inventory 
                    WHERE listingId LIKE 'FLT%' 
                    OR listingId LIKE 'HTL%' 
                    OR listingId LIKE 'CAR%'
                """)
                deleted = cursor.rowcount
            
            self.mysql_bookings_conn.commit()
            cursor.close()
            print(f"Deleted {deleted} test listings")
            return deleted
        except Exception as e:
            self.mysql_bookings_conn.rollback()
            cursor.close()
            print(f"Error cleaning up listings: {e}")
            return 0
    
    def cleanup_test_billing(self) -> int:
        """Clean up test billing records (using payments/invoices tables)"""
        if not self.mysql_billing_conn:
            self.connect()
        
        cursor = self.mysql_billing_conn.cursor()
        deleted = 0
        
        try:
            # Delete payment records for test bookings (using camelCase schema)
            cursor.execute("""
                DELETE FROM payments 
                WHERE bookingId IN (
                    SELECT bookingId FROM kayak_bookings.bookings 
                    WHERE userId IN (
                        SELECT user_id FROM kayak_users.users 
                        WHERE email LIKE '%@test.%' OR email LIKE '%test%@example.com'
                    )
                )
            """)
            deleted = cursor.rowcount
            
            # Also delete invoices for test bookings
            cursor.execute("""
                DELETE FROM invoices 
                WHERE bookingId IN (
                    SELECT bookingId FROM kayak_bookings.bookings 
                    WHERE userId IN (
                        SELECT user_id FROM kayak_users.users 
                        WHERE email LIKE '%@test.%' OR email LIKE '%test%@example.com'
                    )
                )
            """)
            deleted += cursor.rowcount
            
            self.mysql_billing_conn.commit()
            cursor.close()
            print(f"Deleted {deleted} test billing records")
            return deleted
        except Exception as e:
            self.mysql_billing_conn.rollback()
            cursor.close()
            print(f"Error cleaning up billing: {e}")
            return 0
    
    def cleanup_mongodb_test_data(self) -> Dict[str, int]:
        """Clean up test data from MongoDB"""
        if not self.mongo_client:
            self.connect()
        
        db = self.mongo_client[TestConfig.MONGO_DB]
        deleted_counts = {}
        
        try:
            # Clean up test reviews
            if 'reviews' in db.list_collection_names():
                result = db.reviews.delete_many({
                    "$or": [
                        {"user_id": {"$regex": "test", "$options": "i"}},
                        {"entity_id": {"$regex": "test", "$options": "i"}}
                    ]
                })
                deleted_counts['reviews'] = result.deleted_count
            
            # Clean up test logs
            if 'logs' in db.list_collection_names():
                result = db.logs.delete_many({
                    "user_id": {"$regex": "test", "$options": "i"}
                })
                deleted_counts['logs'] = result.deleted_count
            
            # Clean up test images
            if 'images' in db.list_collection_names():
                result = db.images.delete_many({
                    "entity_id": {"$regex": "test", "$options": "i"}
                })
                deleted_counts['images'] = result.deleted_count
            
            print(f"Deleted MongoDB test data: {deleted_counts}")
            return deleted_counts
        except Exception as e:
            print(f"Error cleaning up MongoDB: {e}")
            return {}
    
    def cleanup_all(self) -> Dict[str, int]:
        """Clean up all test data"""
        print("\n🧹 Starting cleanup of all test data...")
        
        self.connect()
        
        results = {
            "users": self.cleanup_test_users(),
            "bookings": self.cleanup_test_bookings(),
            "listings": self.cleanup_test_listings(),
            "billing": self.cleanup_test_billing(),
            "mongodb": sum(self.cleanup_mongodb_test_data().values())
        }
        
        self.disconnect()
        
        total = sum(results.values())
        print(f"\n✅ Cleanup complete. Deleted {total} test records total.")
        return results
    
    def reset_database_counts(self) -> Dict[str, int]:
        """Reset auto-increment counters (optional, for complete reset)"""
        if not self.mysql_bookings_conn:
            self.connect()
        
        cursor = self.mysql_bookings_conn.cursor()
        
        try:
            # Reset auto-increment for bookings
            cursor.execute("ALTER TABLE bookings AUTO_INCREMENT = 1")
            cursor.execute("ALTER TABLE flights AUTO_INCREMENT = 1")
            cursor.execute("ALTER TABLE hotels AUTO_INCREMENT = 1")
            cursor.execute("ALTER TABLE cars AUTO_INCREMENT = 1")
            
            self.mysql_bookings_conn.commit()
            cursor.close()
            print("Reset auto-increment counters")
            return {"reset": 1}
        except Exception as e:
            self.mysql_bookings_conn.rollback()
            cursor.close()
            print(f"Error resetting counters: {e}")
            return {}

