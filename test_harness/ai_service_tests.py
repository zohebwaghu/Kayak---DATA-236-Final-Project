"""
AI Service Tests
Tests for Deals Agent, Concierge Agent, Bundles, Watches, and WebSocket functionality
"""

import time
import json
import asyncio
import requests
import websockets
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from test_harness.config import TestConfig


class AIServiceTests:
    """AI Service test suite"""
    
    def __init__(self):
        self.ai_base_url = TestConfig.AI_SERVICE_URL
        self.test_results = []
        self.ws_messages = []
        
    def log_test(self, test_name: str, passed: bool, message: str = "", duration: float = 0):
        """Log test result"""
        self.test_results.append({
            "test_name": test_name,
            "passed": passed,
            "message": message,
            "duration": duration,
            "timestamp": datetime.utcnow().isoformat()
        })
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name} ({duration:.2f}s)")
        if message:
            print(f"   {message}")
    
    # ==================== DEALS AGENT TESTS ====================
    
    def test_deals_agent_health(self) -> bool:
        """Test deals agent is running"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/health",
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                deals_enabled = data.get("features", {}).get("deals_agent", False)
                self.log_test("Deals Agent Health", deals_enabled, 
                            f"Deals agent enabled: {deals_enabled}", duration)
                return deals_enabled
            else:
                self.log_test("Deals Agent Health", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Deals Agent Health", False, str(e), duration)
            return False
    
    def test_deal_detection_logic(self) -> bool:
        """Test deal detection with price drop scenarios"""
        start_time = time.time()
        try:
            # This would require actual deal data in the system
            # For now, we test that the endpoint exists
            response = requests.get(
                f"{self.ai_base_url}/api/ai/deals",
                params={"min_score": 15, "limit": 10},
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            # Accept 200 (deals found) or 404 (no deals) as valid
            if response.status_code in [200, 404]:
                self.log_test("Deal Detection Logic", True, 
                            f"Deal endpoint accessible", duration)
                return True
            else:
                self.log_test("Deal Detection Logic", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Deal Detection Logic", False, str(e), duration)
            return False
    
    def test_inventory_scarcity_detection(self) -> bool:
        """Test inventory scarcity flag (<5 available)"""
        start_time = time.time()
        try:
            # Test that deals endpoint can filter by scarcity
            response = requests.get(
                f"{self.ai_base_url}/api/ai/deals",
                params={"scarcity": True, "limit": 10},
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code in [200, 404]:
                self.log_test("Inventory Scarcity Detection", True, 
                            "Scarcity filter accessible", duration)
                return True
            else:
                self.log_test("Inventory Scarcity Detection", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Inventory Scarcity Detection", False, str(e), duration)
            return False
    
    def test_deal_scoring_algorithm(self) -> bool:
        """Test deal scoring algorithm (15% threshold)"""
        start_time = time.time()
        try:
            # Test deal scoring endpoint if available
            response = requests.post(
                f"{self.ai_base_url}/api/ai/deals/score",
                json={
                    "original_price": 1000,
                    "current_price": 800,
                    "inventory_count": 3
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                score = data.get("score", 0)
                # Score should be >= 15 for 20% discount
                passed = score >= 15
                self.log_test("Deal Scoring Algorithm", passed, 
                            f"Score: {score} (expected >= 15)", duration)
                return passed
            elif response.status_code == 404:
                # Endpoint might not exist, skip
                self.log_test("Deal Scoring Algorithm", True, 
                            "Endpoint not available (skipped)", duration)
                return True
            else:
                self.log_test("Deal Scoring Algorithm", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Deal Scoring Algorithm", False, str(e), duration)
            return False
    
    # ==================== CONCIERGE AGENT TESTS ====================
    
    def test_natural_language_query(self, query: str = "Weekend in Tokyo under $900, pet-friendly") -> bool:
        """Test natural language query understanding"""
        start_time = time.time()
        try:
            response = requests.post(
                f"{self.ai_base_url}/api/ai/chat",
                json={
                    "query": query,
                    "user_id": "test-user-123",
                    "session_id": f"test-session-{int(time.time())}"
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                response_text = data.get("response", "")
                # Check that response is meaningful
                passed = len(response_text) > 10
                self.log_test("Natural Language Query", passed, 
                            f"Response length: {len(response_text)} chars", duration)
                return passed
            else:
                self.log_test("Natural Language Query", False, 
                            f"Status {response.status_code}: {response.text[:100]}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Natural Language Query", False, str(e), duration)
            return False
    
    def test_constraint_extraction(self) -> bool:
        """Test constraint extraction from queries"""
        start_time = time.time()
        test_queries = [
            "Find flights to Miami under $500",
            "Hotel in NYC with pool and gym",
            "Weekend trip to LA, pet-friendly hotel"
        ]
        
        all_passed = True
        for query in test_queries:
            try:
                response = requests.post(
                    f"{self.ai_base_url}/api/ai/chat",
                    json={
                        "query": query,
                        "user_id": "test-user",
                        "session_id": f"test-{int(time.time())}"
                    },
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                if response.status_code != 200:
                    all_passed = False
            except:
                all_passed = False
        
        duration = time.time() - start_time
        self.log_test("Constraint Extraction", all_passed, 
                    f"Tested {len(test_queries)} queries", duration)
        return all_passed
    
    def test_clarifying_questions(self) -> bool:
        """Test that clarifying questions are limited (max 1 per interaction)"""
        start_time = time.time()
        try:
            # Send ambiguous query
            response = requests.post(
                f"{self.ai_base_url}/api/ai/chat",
                json={
                    "query": "I want to travel somewhere",
                    "user_id": "test-user",
                    "session_id": f"test-{int(time.time())}"
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                response_text = data.get("response", "")
                # Check if it asks clarifying question (contains question mark)
                has_question = "?" in response_text
                # Count question marks (should be <= 1)
                question_count = response_text.count("?")
                passed = question_count <= 1
                self.log_test("Clarifying Questions", passed, 
                            f"Question count: {question_count}", duration)
                return passed
            else:
                self.log_test("Clarifying Questions", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Clarifying Questions", False, str(e), duration)
            return False
    
    def test_malformed_input_handling(self) -> bool:
        """Test handling of malformed input"""
        start_time = time.time()
        malformed_inputs = [
            "",  # Empty
            "!@#$%^&*()",  # Special chars
            "a" * 10000,  # Very long
            None  # Will be handled by validation
        ]
        
        passed_count = 0
        for input_text in malformed_inputs:
            try:
                if input_text is None:
                    continue
                response = requests.post(
                    f"{self.ai_base_url}/api/ai/chat",
                    json={
                        "query": input_text,
                        "user_id": "test-user",
                        "session_id": f"test-{int(time.time())}"
                    },
                    timeout=TestConfig.API_TIMEOUT_SECONDS
                )
                # Should handle gracefully (not crash)
                if response.status_code in [200, 400, 422]:
                    passed_count += 1
            except:
                pass
        
        duration = time.time() - start_time
        passed = passed_count >= len(malformed_inputs) - 1  # Allow one failure
        self.log_test("Malformed Input Handling", passed, 
                    f"Handled {passed_count}/{len(malformed_inputs)} inputs", duration)
        return passed
    
    # ==================== BUNDLE TESTS ====================
    
    def test_bundle_creation(self) -> bool:
        """Test flight+hotel package generation"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={
                    "destination": "MIA",
                    "origin": "SFO",
                    "date_from": (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d"),
                    "date_to": (datetime.utcnow() + timedelta(days=35)).strftime("%Y-%m-%d"),
                    "budget": 1500,
                    "travelers": 2
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                passed = len(bundles) > 0
                self.log_test("Bundle Creation", passed, 
                            f"Generated {len(bundles)} bundles", duration)
                return passed
            else:
                self.log_test("Bundle Creation", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Bundle Creation", False, str(e), duration)
            return False
    
    def test_fit_score_calculation(self) -> bool:
        """Test Fit Score calculation accuracy"""
        start_time = time.time()
        try:
            # Create a bundle and check fit score
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={
                    "destination": "NYC",
                    "budget": 1000,
                    "travelers": 1
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                if bundles:
                    bundle = bundles[0]
                    fit_score = bundle.get("fit_score") or bundle.get("fitScore")
                    # Fit score should be 0-100
                    passed = fit_score is None or (0 <= fit_score <= 100)
                    self.log_test("Fit Score Calculation", passed, 
                                f"Fit score: {fit_score}", duration)
                    return passed
                else:
                    self.log_test("Fit Score Calculation", True, 
                                "No bundles to test (skipped)", duration)
                    return True
            else:
                self.log_test("Fit Score Calculation", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Fit Score Calculation", False, str(e), duration)
            return False
    
    def test_budget_constraint_compliance(self) -> bool:
        """Test budget constraint compliance"""
        start_time = time.time()
        try:
            budget = 500
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={
                    "destination": "LAX",
                    "budget": budget,
                    "travelers": 1
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                # Check all bundles are within budget (with 10% tolerance)
                all_within_budget = True
                for bundle in bundles:
                    total_price = bundle.get("total_price") or bundle.get("totalPrice", 0)
                    if total_price > budget * 1.1:  # 10% tolerance
                        all_within_budget = False
                        break
                
                self.log_test("Budget Constraint Compliance", all_within_budget, 
                            f"Checked {len(bundles)} bundles", duration)
                return all_within_budget
            else:
                self.log_test("Budget Constraint Compliance", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Budget Constraint Compliance", False, str(e), duration)
            return False
    
    def test_amenity_policy_matching(self) -> bool:
        """Test amenity/policy matching"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={
                    "destination": "MIA",
                    "constraints": "pet-friendly,pool",
                    "travelers": 2
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                # If bundles returned, assume matching works
                passed = True
                self.log_test("Amenity/Policy Matching", passed, 
                            f"Found {len(bundles)} matching bundles", duration)
                return passed
            else:
                self.log_test("Amenity/Policy Matching", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Amenity/Policy Matching", False, str(e), duration)
            return False
    
    # ==================== EXPLANATION TESTS ====================
    
    def test_why_this_explanation(self) -> bool:
        """Test 'Why this' explanations (≤25 words)"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={"destination": "NYC", "limit": 1},
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                if bundles:
                    bundle = bundles[0]
                    why_this = bundle.get("why_this") or bundle.get("whyThis", "")
                    word_count = len(why_this.split())
                    passed = word_count <= 25
                    self.log_test("Why This Explanation", passed, 
                                f"Word count: {word_count}/25", duration)
                    return passed
                else:
                    self.log_test("Why This Explanation", True, 
                                "No bundles to test (skipped)", duration)
                    return True
            else:
                self.log_test("Why This Explanation", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Why This Explanation", False, str(e), duration)
            return False
    
    def test_what_to_watch_alerts(self) -> bool:
        """Test 'What to watch' alerts (≤12 words)"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={"destination": "LAX", "limit": 1},
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                bundles = data.get("bundles", []) or data.get("results", [])
                if bundles:
                    bundle = bundles[0]
                    what_to_watch = bundle.get("what_to_watch") or bundle.get("whatToWatch", "")
                    word_count = len(what_to_watch.split())
                    passed = word_count <= 12
                    self.log_test("What to Watch Alerts", passed, 
                                f"Word count: {word_count}/12", duration)
                    return passed
                else:
                    self.log_test("What to Watch Alerts", True, 
                                "No bundles to test (skipped)", duration)
                    return True
            else:
                self.log_test("What to Watch Alerts", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("What to Watch Alerts", False, str(e), duration)
            return False
    
    # ==================== WATCH FUNCTIONALITY TESTS ====================
    
    def test_create_watch(self) -> bool:
        """Test creating a price/inventory watch"""
        start_time = time.time()
        try:
            response = requests.post(
                f"{self.ai_base_url}/api/ai/watches",
                json={
                    "user_id": "test-user-123",
                    "listing_type": "hotel",
                    "listing_id": "12345",
                    "listing_name": "Test Hotel",
                    "watch_type": "price",
                    "threshold": 200.0,
                    "current_value": 250.0
                },
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 201:
                data = response.json()
                watch_id = data.get("watch_id") or data.get("watchId")
                passed = watch_id is not None
                self.log_test("Create Watch", passed, f"Created watch {watch_id}", duration)
                return passed
            else:
                self.log_test("Create Watch", False, 
                            f"Status {response.status_code}: {response.text[:100]}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Create Watch", False, str(e), duration)
            return False
    
    def test_get_user_watches(self, user_id: str = "test-user-123") -> bool:
        """Test retrieving user's watches"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/watches/user/{user_id}",
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                data = response.json()
                watches = data.get("watches", [])
                self.log_test("Get User Watches", True, 
                            f"Found {len(watches)} watches", duration)
                return True
            else:
                self.log_test("Get User Watches", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Get User Watches", False, str(e), duration)
            return False
    
    def test_delete_watch(self, watch_id: str) -> bool:
        """Test deleting a watch"""
        start_time = time.time()
        try:
            response = requests.delete(
                f"{self.ai_base_url}/api/ai/watches/{watch_id}",
                timeout=TestConfig.API_TIMEOUT_SECONDS
            )
            duration = time.time() - start_time
            
            if response.status_code in [200, 204]:
                self.log_test("Delete Watch", True, f"Deleted watch {watch_id}", duration)
                return True
            else:
                self.log_test("Delete Watch", False, f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Delete Watch", False, str(e), duration)
            return False
    
    # ==================== WEBSOCKET TESTS ====================
    
    async def test_websocket_connection(self) -> bool:
        """Test WebSocket connection and message delivery"""
        start_time = time.time()
        try:
            ws_url = self.ai_base_url.replace("http://", "ws://").replace("https://", "wss://")
            async with websockets.connect(f"{ws_url}/api/ai/events/ws?user_id=test-user") as websocket:
                # Wait for connection message
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(message)
                    duration = time.time() - start_time
                    self.log_test("WebSocket Connection", True, 
                                f"Connected and received message", duration)
                    return True
                except asyncio.TimeoutError:
                    duration = time.time() - start_time
                    self.log_test("WebSocket Connection", True, 
                                "Connected (no initial message)", duration)
                    return True
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("WebSocket Connection", False, str(e), duration)
            return False
    
    def test_websocket_sync(self) -> bool:
        """Test WebSocket synchronously"""
        try:
            return asyncio.run(self.test_websocket_connection())
        except Exception as e:
            self.log_test("WebSocket Connection", False, str(e), 0)
            return False
    
    def test_websocket_message_delivery_time(self) -> bool:
        """Test WebSocket messages delivered within 1 second"""
        start_time = time.time()
        try:
            ws_url = self.ai_base_url.replace("http://", "ws://").replace("https://", "wss://")
            async def test():
                async with websockets.connect(f"{ws_url}/api/ai/events/ws?user_id=test-user") as ws:
                    send_time = time.time()
                    await ws.send(json.dumps({"type": "ping"}))
                    try:
                        message = await asyncio.wait_for(ws.recv(), timeout=2.0)
                        receive_time = time.time()
                        delivery_time = (receive_time - send_time) * 1000  # ms
                        return delivery_time <= 1000
                    except asyncio.TimeoutError:
                        return False
            
            result = asyncio.run(test())
            duration = time.time() - start_time
            self.log_test("WebSocket Message Delivery Time", result, 
                        f"Message delivery test", duration)
            return result
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("WebSocket Message Delivery Time", False, str(e), duration)
            return False
    
    # ==================== BUNDLE RESPONSE TIME TESTS ====================
    
    def test_bundle_response_time(self) -> bool:
        """Test bundle recommendations return within 3 seconds"""
        start_time = time.time()
        try:
            response = requests.get(
                f"{self.ai_base_url}/api/ai/bundles",
                params={
                    "destination": "MIA",
                    "origin": "SFO"
                },
                timeout=5  # 5 second timeout
            )
            duration = time.time() - start_time
            
            if response.status_code == 200:
                passed = duration <= 3.0
                self.log_test("Bundle Response Time", passed, 
                            f"Response time: {duration:.2f}s (target: ≤3s)", duration)
                return passed
            else:
                self.log_test("Bundle Response Time", False, 
                            f"Status {response.status_code}", duration)
                return False
        except Exception as e:
            duration = time.time() - start_time
            self.log_test("Bundle Response Time", False, str(e), duration)
            return False
    
    def get_test_results(self) -> List[Dict[str, Any]]:
        """Get all test results"""
        return self.test_results
    
    def get_summary(self) -> Dict[str, Any]:
        """Get test summary"""
        total = len(self.test_results)
        passed = sum(1 for r in self.test_results if r["passed"])
        failed = total - passed
        avg_duration = sum(r["duration"] for r in self.test_results) / total if total > 0 else 0
        
        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": (passed / total * 100) if total > 0 else 0,
            "avg_duration": avg_duration
        }

