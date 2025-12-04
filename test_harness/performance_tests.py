"""
Performance and Scalability Tests
Tests load, concurrent operations, and resource management
"""

import time
import statistics
import concurrent.futures
import requests
import mysql.connector
from typing import Dict, List, Any
from datetime import datetime, timedelta
from test_harness.config import TestConfig
from test_harness.data_generator import DataGenerator

class PerformanceTests:
    """Performance and scalability test suite"""
    
    def __init__(self):
        self.base_url = TestConfig.API_BASE_URL
        self.test_results = []
        self.response_times = []
        
    def log_test(self, test_name: str, passed: bool, metrics: Dict[str, Any], message: str = ""):
        """Log test result with performance metrics"""
        self.test_results.append({
            "test_name": test_name,
            "passed": passed,
            "metrics": metrics,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        })
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        for key, value in metrics.items():
            print(f"   {key}: {value}")
        if message:
            print(f"   {message}")
    
    def test_database_insert_performance(self, num_records: int = 10000) -> Dict[str, Any]:
        """Test database insert performance"""
        print(f"\n📊 Testing database insert performance ({num_records} records)...")
        
        data_gen = DataGenerator()
        data_gen.connect()
        
        start_time = time.time()
        
        # Insert users
        users = data_gen.generate_users(1000)
        user_start = time.time()
        inserted_users = data_gen.insert_users(users)
        user_duration = time.time() - user_start
        
        # Insert flights
        flight_start = time.time()
        flight_ids = data_gen.insert_flights(1000)
        flight_duration = time.time() - flight_start
        
        # Insert hotels
        hotel_start = time.time()
        hotel_ids = data_gen.insert_hotels(1000)
        hotel_duration = time.time() - hotel_start
        
        # Insert cars
        car_start = time.time()
        car_ids = data_gen.insert_cars(1000)
        car_duration = time.time() - car_start
        
        total_duration = time.time() - start_time
        
        metrics = {
            "total_records": inserted_users + len(flight_ids) + len(hotel_ids) + len(car_ids),
            "total_duration_seconds": round(total_duration, 2),
            "records_per_second": round((inserted_users + len(flight_ids) + len(hotel_ids) + len(car_ids)) / total_duration, 2),
            "users_inserted": inserted_users,
            "users_duration_seconds": round(user_duration, 2),
            "flights_inserted": len(flight_ids),
            "flights_duration_seconds": round(flight_duration, 2),
            "hotels_inserted": len(hotel_ids),
            "hotels_duration_seconds": round(hotel_duration, 2),
            "cars_inserted": len(car_ids),
            "cars_duration_seconds": round(car_duration, 2)
        }
        
        passed = total_duration < 300  # Should complete in under 5 minutes
        self.log_test("Database Insert Performance", passed, metrics)
        
        data_gen.disconnect()
        return metrics
    
    def test_query_performance(self, num_queries: int = 100) -> Dict[str, Any]:
        """Test query performance"""
        print(f"\n📊 Testing query performance ({num_queries} queries)...")
        
        response_times = []
        
        for i in range(num_queries):
            start = time.time()
            try:
                response = requests.get(
                    f"{self.base_url}/search/flights",
                    params={"origin": "SFO", "destination": "LAX", "page": 1, "limit": 10},
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                duration = (time.time() - start) * 1000  # Convert to ms
                if response.status_code == 200:
                    response_times.append(duration)
            except Exception as e:
                print(f"Query {i+1} failed: {e}")
        
        if response_times:
            metrics = {
                "num_queries": len(response_times),
                "avg_response_time_ms": round(statistics.mean(response_times), 2),
                "median_response_time_ms": round(statistics.median(response_times), 2),
                "p95_response_time_ms": round(statistics.quantiles(response_times, n=20)[18], 2),
                "p99_response_time_ms": round(statistics.quantiles(response_times, n=100)[98], 2),
                "min_response_time_ms": round(min(response_times), 2),
                "max_response_time_ms": round(max(response_times), 2)
            }
            
            passed = metrics["p95_response_time_ms"] <= TestConfig.PERCENTILE_95_TARGET_MS
            self.log_test("Query Performance", passed, metrics)
            return metrics
        else:
            self.log_test("Query Performance", False, {}, "All queries failed")
            return {}
    
    def test_concurrent_requests(self, num_concurrent: int = 100, num_requests_per_user: int = 10) -> Dict[str, Any]:
        """Test concurrent request handling"""
        print(f"\n📊 Testing concurrent requests ({num_concurrent} concurrent users)...")
        
        def make_requests(user_id):
            response_times = []
            for _ in range(num_requests_per_user):
                start = time.time()
                try:
                    response = requests.get(
                        f"{self.base_url}/search/hotels",
                        params={"city": "San Francisco", "page": 1, "limit": 10},
                        timeout=TestConfig.API_TIMEOUT_SECONDS
                    )
                    duration = (time.time() - start) * 1000
                    if response.status_code == 200:
                        response_times.append(duration)
                except Exception as e:
                    pass
            return response_times
        
        start_time = time.time()
        all_response_times = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(make_requests, i) for i in range(num_concurrent)]
            for future in concurrent.futures.as_completed(futures):
                all_response_times.extend(future.result())
        
        total_duration = time.time() - start_time
        
        if all_response_times:
            metrics = {
                "concurrent_users": num_concurrent,
                "total_requests": len(all_response_times),
                "total_duration_seconds": round(total_duration, 2),
                "requests_per_second": round(len(all_response_times) / total_duration, 2),
                "avg_response_time_ms": round(statistics.mean(all_response_times), 2),
                "p95_response_time_ms": round(statistics.quantiles(all_response_times, n=20)[18], 2),
                "success_rate_percent": round((len(all_response_times) / (num_concurrent * num_requests_per_user)) * 100, 2)
            }
            
            passed = metrics["p95_response_time_ms"] <= TestConfig.PERCENTILE_95_TARGET_MS and metrics["success_rate_percent"] >= 95
            self.log_test("Concurrent Requests", passed, metrics)
            return metrics
        else:
            self.log_test("Concurrent Requests", False, {}, "All requests failed")
            return {}
    
    def test_concurrent_bookings(self, listing_id: int, num_concurrent: int = 50) -> Dict[str, Any]:
        """Test concurrent booking attempts"""
        print(f"\n📊 Testing concurrent bookings ({num_concurrent} concurrent attempts)...")
        
        # Generate test users and get tokens
        data_gen = DataGenerator()
        users = data_gen.generate_users(num_concurrent)
        
        def attempt_booking(user_data):
            # Register user
            try:
                reg_response = requests.post(
                    f"{self.base_url}/users/register",
                    json=user_data,
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                if reg_response.status_code != 201:
                    return False
                
                # Login
                login_response = requests.post(
                    f"{self.base_url}/users/login",
                    json={"email": user_data["email"], "password": "Test123!"},
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                if login_response.status_code != 200:
                    return False
                
                token = login_response.json().get("token")
                if not token:
                    return False
                
                # Attempt booking
                booking_data = {
                    "userId": user_data["userId"],
                    "bookingType": "hotel",
                    "listingId": str(listing_id),
                    "startDate": (datetime.utcnow().replace(microsecond=0) + timedelta(days=7)).isoformat(),
                    "numGuests": 1
                }
                
                booking_response = requests.post(
                    f"{self.base_url}/bookings",
                    json=booking_data,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                
                return booking_response.status_code == 201
            except:
                return False
        
        start_time = time.time()
        successful_bookings = 0
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [executor.submit(attempt_booking, user) for user in users]
            for future in concurrent.futures.as_completed(futures):
                if future.result():
                    successful_bookings += 1
        
        duration = time.time() - start_time
        
        metrics = {
            "concurrent_attempts": num_concurrent,
            "successful_bookings": successful_bookings,
            "failed_bookings": num_concurrent - successful_bookings,
            "duration_seconds": round(duration, 2),
            "bookings_per_second": round(successful_bookings / duration, 2) if duration > 0 else 0
        }
        
        # Should allow some bookings but prevent overbooking
        passed = successful_bookings > 0 and successful_bookings < num_concurrent
        self.log_test("Concurrent Bookings", passed, metrics)
        return metrics
    
    def test_pagination_performance(self, page_size: int = 100) -> Dict[str, Any]:
        """Test pagination with large result sets"""
        print(f"\n📊 Testing pagination performance...")
        
        response_times = []
        
        for page in range(1, 11):  # Test 10 pages
            start = time.time()
            try:
                response = requests.get(
                    f"{self.base_url}/search/hotels",
                    params={"city": "San Francisco", "page": page, "limit": page_size},
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                duration = (time.time() - start) * 1000
                if response.status_code == 200:
                    response_times.append(duration)
            except Exception as e:
                print(f"Page {page} failed: {e}")
        
        if response_times:
            metrics = {
                "pages_tested": len(response_times),
                "page_size": page_size,
                "avg_response_time_ms": round(statistics.mean(response_times), 2),
                "max_response_time_ms": round(max(response_times), 2),
                "min_response_time_ms": round(min(response_times), 2)
            }
            
            passed = metrics["avg_response_time_ms"] <= TestConfig.MAX_RESPONSE_TIME_MS
            self.log_test("Pagination Performance", passed, metrics)
            return metrics
        else:
            self.log_test("Pagination Performance", False, {}, "All pagination requests failed")
            return {}
    
    def test_database_connection_pooling(self) -> Dict[str, Any]:
        """Test database connection pooling"""
        print(f"\n📊 Testing database connection pooling...")
        
        connections = []
        start_time = time.time()
        
        try:
            for i in range(20):  # Try to open 20 connections
                conn = mysql.connector.connect(
                    **TestConfig.get_mysql_connection_string(TestConfig.MYSQL_DB_USERS)
                )
                connections.append(conn)
                time.sleep(0.1)
            
            duration = time.time() - start_time
            
            # Test query on each connection
            query_times = []
            for conn in connections:
                start = time.time()
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM users")
                cursor.fetchone()
                cursor.close()
                query_times.append((time.time() - start) * 1000)
            
            # Close connections
            for conn in connections:
                conn.close()
            
            metrics = {
                "connections_opened": len(connections),
                "connection_time_seconds": round(duration, 2),
                "avg_query_time_ms": round(statistics.mean(query_times), 2),
                "max_query_time_ms": round(max(query_times), 2)
            }
            
            passed = len(connections) == 20 and duration < 5
            self.log_test("Database Connection Pooling", passed, metrics)
            return metrics
            
        except Exception as e:
            for conn in connections:
                try:
                    conn.close()
                except:
                    pass
            self.log_test("Database Connection Pooling", False, {}, str(e))
            return {}
    
    def test_memory_usage(self, num_operations: int = 1000) -> Dict[str, Any]:
        """Test memory usage with large datasets"""
        print(f"\n📊 Testing memory usage...")
        
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Perform operations
        data_gen = DataGenerator()
        data_gen.connect()
        
        users = data_gen.generate_users(100)
        data_gen.insert_users(users)
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        data_gen.disconnect()
        
        metrics = {
            "initial_memory_mb": round(initial_memory, 2),
            "final_memory_mb": round(final_memory, 2),
            "memory_increase_mb": round(memory_increase, 2)
        }
        
        # Memory increase should be reasonable (< 500MB for 100 users)
        passed = memory_increase < 500
        self.log_test("Memory Usage", passed, metrics)
        return metrics
    
    def get_test_results(self) -> List[Dict[str, Any]]:
        """Get all test results"""
        return self.test_results
    
    def get_summary(self) -> Dict[str, Any]:
        """Get test summary"""
        total = len(self.test_results)
        passed = sum(1 for r in self.test_results if r["passed"])
        failed = total - passed
        
        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": (passed / total * 100) if total > 0 else 0
        }

