# Kayak Simulation - DATA 236 Final Project

Distributed Systems for Data Engineering - Travel Booking Platform

## Project Overview

This project implements a 3-tier distributed system simulating Kayak's travel metasearch and booking platform, including:
- Flight, hotel, and car rental listings
- User booking and payment processing
- Admin management and analytics
- Agentic AI recommendation service

## Database Schema (Tier 3)

**Status**: ✅ Complete

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
└── README.md            # This file
```

## Getting Started

1. Review [Database Setup Guide](db/SETUP.md)
2. Create MySQL and MongoDB schemas
3. Load sample data for testing
4. Refer to documentation for integration