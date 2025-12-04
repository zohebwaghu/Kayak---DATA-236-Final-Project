# Kayak Simulation Test Harness

Comprehensive test suite for validating functionality, scalability, and reliability across all tiers of the Kayak simulation system.

## Overview

This test harness provides automated testing for:
- **Functional Testing**: User CRUD, Search, Booking, Admin, Billing operations
- **Performance Testing**: Load testing, concurrent operations, resource management
- **Integration Testing**: Tier integration, Kafka messaging, end-to-end workflows
- **AI Service Testing**: Deals Agent, Concierge Agent, Bundles, Watches, WebSocket
- **Data Quality Testing**: Schema validation, data integrity, security

## Prerequisites

1. **Python 3.8+**
2. **All services running**:
   - API Gateway (port 3000)
   - User Service (port 3001)
   - Search Service (port 3003)
   - Booking Service (port 3004)
   - Billing Service (port 3005)
   - Admin Service (port 3006)
   - AI Service (port 8000)
3. **Databases accessible**:
   - MySQL (kayak_users, kayak_bookings, kayak_billing)
   - MongoDB (kayak_doc)
   - Redis (optional, for caching tests)
   - Kafka (optional, for messaging tests)

## Installation

1. **Activate your virtual environment** (if using one):
```bash
# If you have a venv in the project root
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate  # On Windows

# Or if you have a venv in the ai directory
source ai/venv/bin/activate  # On macOS/Linux
```

2. **Install dependencies** (from project root):
```bash
pip install -r test_harness/requirements.txt
```

Or using Python module syntax:
```bash
python -m pip install -r test_harness/requirements.txt
```

**Note**: If you're using the AI service's virtual environment, you may already have some dependencies installed. You can check with:
```bash
pip list | grep -E "(requests|mysql|pymongo|faker|websockets)"
```

2. **Configure environment**:

**Option A: Use the setup script (Recommended)**:
```bash
# Run the setup script to auto-detect MySQL configuration
./test_harness/setup_env.sh
```

**Option B: Create .env file manually**:
Create a `.env` file in the project root with:
```env
API_GATEWAY_URL=http://localhost:3000
AI_SERVICE_URL=http://localhost:8000
MYSQL_HOST=localhost
MYSQL_PORT=3307
MYSQL_USER=root
MYSQL_PASSWORD=password
MONGO_URI=mongodb://localhost:27017
REDIS_HOST=localhost
REDIS_PORT=6379
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
```

**MySQL Password Notes**: 
- **Docker MySQL**: Password is `password` (port 3307)
- **Local MySQL (Homebrew)**: Usually no password (leave empty)
- **Local MySQL (other)**: Use your root password

**Quick Setup for Docker MySQL**:
```bash
# If using Docker MySQL, create .env with:
echo "MYSQL_PASSWORD=password" >> .env
echo "MYSQL_PORT=3307" >> .env
```

## Usage

**Important**: Run tests from the **project root directory**, not from within the `test_harness` directory.

### Run All Tests

From the project root:
```bash
python test_harness/run_tests.py
```

Or using Python module syntax:
```bash
python -m test_harness.run_tests
```

### Run Specific Test Suite

From the project root:
```bash
# Functional tests only
python test_harness/run_tests.py --suite functional

# Performance tests only
python test_harness/run_tests.py --suite performance

# Integration tests only
python test_harness/run_tests.py --suite integration

# AI service tests only
python test_harness/run_tests.py --suite ai

# Data quality tests only
python test_harness/run_tests.py --suite data-quality
```

### Options

- `--no-cleanup`: Skip cleanup after tests (keeps test data)
- `--no-data`: Skip test data generation (uses existing data)
- `--skip-checks`: Skip service health checks (use if services are known to be running)

### Examples

```bash
# Run all tests without cleanup
python test_harness/run_tests.py --no-cleanup

# Run only functional tests without generating new data
python test_harness/run_tests.py --suite functional --no-data
```

## Test Execution Order

1. **Setup Phase**: Generate test data (10K users, 10K listings, 100K bookings)
2. **Functional Tests**: Run all CRUD operations
3. **Performance Tests**: Load testing with max data
4. **Integration Tests**: End-to-end workflows
5. **AI Service Tests**: Recommendation engine validation
6. **Data Quality Tests**: Schema validation and integrity
7. **Report Generation**: HTML and JSON reports
8. **Cleanup Phase**: Reset databases (optional)

## Test Coverage

### Functional Tests

- ✅ User CRUD Operations (10,000 users)
- ✅ Search & Filter Tests (flights, hotels, cars)
- ✅ Booking Flow Tests (100,000 bookings)
- ✅ Admin Module Tests (authentication, listings, analytics)
- ✅ Billing Module Tests (payments, invoices)

### Performance Tests

- ✅ Database Performance (10K users, 10K listings, 100K bookings)
- ✅ Concurrent Operations (100+ simultaneous sessions)
- ✅ Resource Management (connection pooling, memory usage)
- ✅ Query Response Times (95th percentile < 500ms)

### Integration Tests

- ✅ Frontend ↔ Middleware (API endpoints, error propagation)
- ✅ Middleware ↔ Database (transactions, consistency)
- ✅ Kafka Messaging (producer/consumer, message delivery)
- ✅ End-to-End Workflows (complete booking flow)

### AI Service Tests

- ✅ Deals Agent (feed ingestion, deal detection, scoring)
- ✅ Concierge Agent (intent understanding, bundle creation)
- ✅ Bundle Generation (fit score, budget compliance)
- ✅ Watch Functionality (price/inventory alerts)
- ✅ WebSocket Events (real-time notifications)

### Data Quality Tests

- ✅ Schema Validation (foreign keys, NOT NULL, unique constraints)
- ✅ Data Integrity (booking-billing consistency, referential integrity)
- ✅ Security (SQL injection prevention)

## Test Reports

Reports are generated in `test_reports/` directory:

- **HTML Report**: `test_report_YYYYMMDD_HHMMSS.html` - Visual report with charts
- **JSON Report**: `test_report_YYYYMMDD_HHMMSS.json` - Machine-readable format
- **Console Summary**: Printed to stdout

### Report Contents

- Test coverage summary
- Pass/fail rates per suite
- Performance benchmarks
- Identified bugs/issues
- Recommendations for improvements

## Success Criteria

Tests pass if:
- ✅ All functional tests pass (100%)
- ✅ API response time < 500ms for 95th percentile
- ✅ System handles 10K+ listings, 100K+ bookings without crashes
- ✅ Zero data inconsistencies after failure scenarios
- ✅ AI recommendations return valid bundles within 3 seconds
- ✅ WebSocket messages delivered within 1 second

## Configuration

Edit `test_harness/config.py` to customize:

- Test data volumes (users, listings, bookings)
- Performance thresholds
- API timeouts
- Database connections
- Report directory

## Troubleshooting

### Common Issues

1. **MySQL Connection Errors**:
   ```
   Error: Can't connect to MySQL server on 'localhost:3306' (61)
   ```
   
   **Solutions**:
   - **If using Docker**: MySQL is exposed on port **3307** (not 3306)
     ```bash
     # Start MySQL via Docker
     cd middleware
     docker-compose up mysql
     ```
   - **If running locally**: MySQL might be on port 3306
     ```bash
     # Check which port MySQL is using
     mysql -u root -e "SHOW VARIABLES LIKE 'port';"
     ```
   - **Set correct port in `.env`**:
     ```env
     MYSQL_PORT=3307  # For Docker
     # or
     MYSQL_PORT=3306  # For local MySQL
     ```
   - **Check MySQL is running**:
     ```bash
     # Docker
     docker ps | grep mysql
     
     # Local
     brew services list | grep mysql  # macOS
     sudo systemctl status mysql     # Linux
     ```

2. **MongoDB Connection Errors**:
   ```bash
   # Start MongoDB via Docker
   cd middleware
   docker-compose up mongodb
   
   # Or start local MongoDB
   brew services start mongodb-community  # macOS
   sudo systemctl start mongod            # Linux
   ```

3. **Service Not Running Errors**:
   - The test harness now includes automatic service health checks
   - It will warn you if services are not available before starting tests
   - Start required services:
     ```bash
     # Start all services via Docker
     cd middleware
     docker-compose up
     
     # Or start services individually (see README_Middleware.md)
     ```

4. **Test Failures**:
   - Check service logs for errors
   - Verify database schemas are up to date
   - Ensure sufficient test data exists
   - Run with `--no-data` to skip data generation if databases already have data

5. **Performance Issues**:
   - Reduce test data volumes in `config.py`:
     ```python
     NUM_TEST_USERS = 1000  # Instead of 10000
     NUM_TEST_BOOKINGS = 10000  # Instead of 100000
     ```
   - Run tests in smaller batches using `--suite` option
   - Check system resources (CPU, memory, disk)

6. **Import Errors**:
   - Make sure you're running from the **project root**, not from `test_harness/`
   - Install dependencies: `pip install -r test_harness/requirements.txt`
   - Activate virtual environment if using one

### Debug Mode

Set environment variable for verbose logging:
```bash
export TEST_DEBUG=1
python test_harness/run_tests.py
```

## Cleanup Utility

Manually clean up test data:

```python
from test_harness.cleanup_utility import CleanupUtility

cleanup = CleanupUtility()
cleanup.cleanup_all()  # Removes all test data
```

## Contributing

When adding new tests:

1. Add test methods to appropriate test class
2. Use `log_test()` to record results
3. Return boolean indicating pass/fail
4. Update this README with new test coverage

## License

Part of the Kayak Simulation Project for DATA 236.

