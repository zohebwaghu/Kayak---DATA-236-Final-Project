# Kayak Simulation - DATA 236 Final Project

Distributed Systems for Data Engineering - Travel Booking Platform

## Project Overview

This project implements a 3-tier distributed system simulating Kayak's travel metasearch and booking platform, including:
- Flight, hotel, and car rental listings
- User booking and payment processing
- Admin management and analytics
- Agentic AI recommendation service

## Middleware Services (Tier 2)

**Status**: Complete

The middleware layer exposes REST APIs between the client and databases. Key components:
- **API Gateway**: JWT authentication, rate limiting, and routing to downstream services.
- **User Service**: Registration, login, profile CRUD, and Kafka event production.
- **Search Service**: MongoDB-backed search with Redis caching for hotels/flights/cars.
- **Booking Service**: Transactional booking workflows with inventory management.

See [`README_Middleware.md`](README_Middleware.md) for full architecture details, setup steps, and test flows.

## Database Schema (Tier 3)

**Status**: Complete

The database layer includes:
- **MySQL**: Relational schema for OLTP operations (users, bookings, billing, listings)
- **MongoDB**: Document schema for analytics (reviews, logs, deal events)

See [`README_DB.md`](README_DB.md) for complete database documentation.

### Quick Links
- [Setup Guide](db/SETUP.md) - Installation instructions
- [Schema Diagram](db/SCHEMA_DIAGRAM.md) - Entity relationships
- [Performance Guide](db/PERFORMANCE.md) - Optimization strategies
- [Deployment Guide](db/DEPLOYMENT.md) - Production deployment
- [Migration Guide](db/MIGRATION.md) - Data import procedures
- [Project Status](db/STATUS.md) - Completion checklist

## Repository Structure

```
├── db/
│   ├── mysql/          # MySQL schema and scripts
│   ├── mongodb/         # MongoDB collections and scripts
│   ├── SETUP.md         # Installation guide
│   ├── TESTING.md       # Test procedures
│   └── ...              # Additional documentation
├── middleware/
│   ├── services/        # API Gateway, User, Search, Booking
│   ├── shared/          # Kafka, validators, error utilities
│   ├── scripts/         # Database setup helpers
│   └── README_Middleware.md
└── README.md            # This file
```

## Getting Started

1. Review [Database Setup Guide](db/SETUP.md) and provision MySQL/MongoDB.
2. Load sample data (optional) following `db/TESTING.md`.
3. Configure Tier 2 by copying `middleware/env.example` to `.env` and running `docker-compose up -d` in `middleware/`.
4. If databases are empty, execute `middleware/scripts/setup-databases.sh` inside the middleware directory to align schemas with Tier 3.
5. Use `README_Middleware.md` for API testing instructions and integration notes.
