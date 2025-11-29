# Port Assignments

Current port assignments for all services:

## Tier 2: Middleware Services

- **Port 3000**: API Gateway
- **Port 3001**: User Service
- **Port 3003**: Search Service
- **Port 3004**: Booking Service

## Tier 1: Frontend

- **Port 3002**: Frontend (React App)

**Note**: Frontend uses port 3002 because:
- Port 3000 is used by API Gateway
- Port 3001 is used by User Service
- React automatically selects the next available port

## AI Service

- **Port 8000**: AI Service (FastAPI)

## Database Services

- **Port 3306**: MySQL
- **Port 27017**: MongoDB
- **Port 6379**: Redis
- **Port 9092**: Kafka

## Quick Access Links

- **Frontend**: http://localhost:3002
- **API Gateway**: http://localhost:3000
- **AI Service**: http://localhost:8000
- **AI Docs**: http://localhost:8000/docs

## CORS Configuration

If you need to update CORS settings, edit `middleware/.env`:

```bash
CORS_ORIGIN=http://localhost:3002
```

This allows the frontend on port 3002 to make requests to the API Gateway on port 3000.

