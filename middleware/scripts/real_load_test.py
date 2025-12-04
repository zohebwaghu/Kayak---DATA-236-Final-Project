import asyncio
import httpx
import time
import random
import json
import os

# Configuration
BASE_URL = "http://localhost:3000/api/v1"
CONCURRENT_USERS = 100  # User requested exactly 100
DURATION_SECONDS = 30   # Run for 30 seconds to get stable data
OUTPUT_FILE = "real_test_results.json"

# Metrics
stats = {
    "requests": 0,
    "errors": 0,
    "latencies": [],
    "status_codes": {}
}

async def user_scenario(client, user_id):
    """Simulates a single user's journey: Search Flights -> Think -> Search Hotels"""
    try:
        # 1. Search Flights
        start = time.time()
        # Randomize search to hit different cache keys/DB rows
        origins = ['SFO', 'JFK', 'LHR', 'MIA', 'LAX']
        destinations = ['SFO', 'JFK', 'LHR', 'MIA', 'LAX']
        origin = random.choice(origins)
        dest = random.choice([d for d in destinations if d != origin])
        
        response = await client.get(f"{BASE_URL}/search/flights", params={
            "origin": origin,
            "destination": dest,
            "date": "2025-12-01"
        })
        latency = (time.time() - start) * 1000
        
        stats["requests"] += 1
        stats["latencies"].append(latency)
        
        code = response.status_code
        stats["status_codes"][code] = stats["status_codes"].get(code, 0) + 1
        
        if code >= 400:
            stats["errors"] += 1

        # Think time (0.5s - 1.5s)
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        # 2. Search Hotels
        start = time.time()
        city = random.choice(['San Francisco', 'New York', 'London', 'Miami', 'Los Angeles'])
        response = await client.get(f"{BASE_URL}/search/hotels", params={
            "city": city
        })
        latency = (time.time() - start) * 1000
        
        stats["requests"] += 1
        stats["latencies"].append(latency)
        
        code = response.status_code
        stats["status_codes"][code] = stats["status_codes"].get(code, 0) + 1
        
        if code >= 400:
            stats["errors"] += 1

    except Exception as e:
        stats["errors"] += 1
        print(f"Error: {e}")

async def run_load_test():
    print(f"🚀 Starting REAL Load Test with {CONCURRENT_USERS} users for {DURATION_SECONDS}s...")
    
    # Increase limits to handle 100 concurrent connections
    limits = httpx.Limits(max_keepalive_connections=CONCURRENT_USERS, max_connections=CONCURRENT_USERS)
    async with httpx.AsyncClient(limits=limits, timeout=10.0) as client:
        start_time = time.time()
        
        while time.time() - start_time < DURATION_SECONDS:
            # Spawn 100 concurrent tasks
            tasks = [user_scenario(client, f"user_{i}") for i in range(CONCURRENT_USERS)]
            await asyncio.gather(*tasks)
            
            # Small sleep to prevent local machine CPU exhaustion (simulating network delay)
            await asyncio.sleep(0.1)
            
    # Calculate Results
    total_reqs = stats["requests"]
    duration = time.time() - start_time
    rps = total_reqs / duration
    avg_lat = sum(stats["latencies"]) / len(stats["latencies"]) if stats["latencies"] else 0
    p95_lat = sorted(stats["latencies"])[int(len(stats["latencies"]) * 0.95)] if stats["latencies"] else 0
    error_rate = (stats["errors"] / total_reqs * 100) if total_reqs > 0 else 0
    
    results = {
        "throughput": rps,
        "avg_latency": avg_lat,
        "p95_latency": p95_lat,
        "error_rate": error_rate,
        "total_requests": total_reqs
    }
    
    print("\n=== Test Finished ===")
    print(f"Total Requests: {total_reqs}")
    print(f"RPS:            {rps:.2f}")
    print(f"Avg Latency:    {avg_lat:.2f} ms")
    print(f"P95 Latency:    {p95_lat:.2f} ms")
    print(f"Error Rate:     {error_rate:.2f}%")
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(run_load_test())
