import asyncio
import websockets
import json

async def test_connection():
    uri = "ws://localhost:8000/api/ai/events?user_id=test_user"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected successfully!")
            response = await websocket.recv()
            print(f"Received: {response}")
            
            # Send a ping
            await websocket.send(json.dumps({"type": "ping"}))
            pong = await websocket.recv()
            print(f"Received pong: {pong}")
            
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_connection())
