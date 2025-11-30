import asyncio
import httpx
import time
import random
import os
import sys
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:3000/api/v1"
CONCURRENT_USERS = 1000  # Start small, can increase to 10000
DURATION_SECONDS = 30
HEADLESS = True

# Metrics
stats = {
    "requests": 0,
    "errors": 0,
    "latencies": []
}

async def user_scenario(client, user_id):
    """Simulates a single user's journey"""
    try:
        # 1. Login (simulated or real)
        # For this test, we might skip actual login if we don't want to hammer the DB with 10k logins at once
        # Or we can use a pre-generated token if available.
        # Let's try to hit a public endpoint first to test throughput.
        
        # 2. Search Flights (Read Heavy)
        start = time.time()
        response = await client.get(f"{BASE_URL}/search/flights", params={
            "origin": "SFO",
            "destination": "JFK",
            "date": "2025-12-01"
        })
        latency = (time.time() - start) * 1000
        
        stats["requests"] += 1
        stats["latencies"].append(latency)
        
        if response.status_code >= 400:
            stats["errors"] += 1
            
        # Random think time
        await asyncio.sleep(random.uniform(0.5, 2.0))
        
        # 3. Search Hotels
        start = time.time()
        response = await client.get(f"{BASE_URL}/search/hotels", params={
            "city": "Miami"
        })
        latency = (time.time() - start) * 1000
        
        stats["requests"] += 1
        stats["latencies"].append(latency)
        
        if response.status_code >= 400:
            stats["errors"] += 1
            if stats["errors"] <= 5:
                print(f"Error {response.status_code}: {response.text[:100]}")

    except Exception as e:
        stats["errors"] += 1
        if stats["errors"] <= 5:
            print(f"Exception: {e}")

async def run_load_test():
    print(f"🚀 Starting Load Test with {CONCURRENT_USERS} users for {DURATION_SECONDS} seconds...")
    
    async with httpx.AsyncClient(limits=httpx.Limits(max_keepalive_connections=None, max_connections=None)) as client:
        start_time = time.time()
        tasks = []
        
        # Run until duration
        while time.time() - start_time < DURATION_SECONDS:
            # Create NEW tasks for each iteration
            tasks = [user_scenario(client, f"user_{i}") for i in range(CONCURRENT_USERS)]
            await asyncio.gather(*tasks)
            
            # Optional: small sleep to prevent tight loop if requests are super fast
            # await asyncio.sleep(0.1)
            
    print("\n=== Test Finished ===")
    total_reqs = stats["requests"]
    duration = time.time() - start_time
    rps = total_reqs / duration
    avg_lat = sum(stats["latencies"]) / len(stats["latencies"]) if stats["latencies"] else 0
    
    print(f"Total Requests: {total_reqs}")
    print(f"Duration:       {duration:.2f}s")
    print(f"RPS:            {rps:.2f} req/s")
    print(f"Avg Latency:    {avg_lat:.2f} ms")
    print(f"Errors:         {stats['errors']}")

if __name__ == "__main__":
    # Check if server is up
    try:
        import requests
        requests.get(BASE_URL.replace("/api/v1", "/health"))
    except:
        print("⚠️  Warning: API Gateway might be down or not reachable at localhost:3000")
    
    asyncio.run(run_load_test())
