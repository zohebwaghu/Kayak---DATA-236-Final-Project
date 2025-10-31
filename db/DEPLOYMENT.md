# Database Deployment Guide

## Production Deployment Checklist

### Pre-Deployment

- [ ] Review all schema changes
- [ ] Backup existing databases (if upgrading)
- [ ] Test schema creation on staging environment
- [ ] Verify all constraints and indexes
- [ ] Test data migration scripts (if applicable)
- [ ] Review security settings

### MySQL Deployment

#### Step 1: Backup Existing Data
```bash
mysqldump -u root -p kayak > kayak_backup_$(date +%Y%m%d).sql
```

#### Step 2: Create Schema
```bash
mysql -u root -p < db/mysql/schema.sql
```

#### Step 3: Restore Data (if migrating)
```bash
mysql -u root -p kayak < kayak_backup_YYYYMMDD.sql
```

#### Step 4: Verify
```bash
mysql -u root -p kayak -e "SHOW TABLES; SELECT COUNT(*) FROM users;"
```

### MongoDB Deployment

#### Step 1: Backup Existing Data
```bash
mongodump --uri="mongodb://localhost:27017/kayak_doc" --out=./backup_$(date +%Y%m%d)
```

#### Step 2: Create Schema
```bash
mongosh < db/mongodb/init.js
```

#### Step 3: Restore Data (if migrating)
```bash
mongorestore --uri="mongodb://localhost:27017/kayak_doc" ./backup_YYYYMMDD/kayak_doc
```

#### Step 4: Verify
```bash
mongosh kayak_doc --eval "db.getCollectionNames(); db.reviews.countDocuments()"
```

## Docker Deployment

### Docker Compose Example

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: kayak
    volumes:
      - ./db/mysql/schema.sql:/docker-entrypoint-initdb.d/schema.sql
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  mongodb:
    image: mongo:6
    volumes:
      - mongodb_data:/data/db
      - ./db/mongodb/init.js:/docker-entrypoint-initdb.d/init.js:ro
    ports:
      - "27017:27017"
    command: mongod --replSet rs0
    # Note: Initialize replica set separately for production

volumes:
  mysql_data:
  mongodb_data:
```

### Run with Docker
```bash
docker-compose up -d
docker-compose exec mysql mysql -u root -p -e "SHOW DATABASES;"
docker-compose exec mongodb mongosh --eval "db.adminCommand('listDatabases')"
```

## AWS Deployment

### RDS MySQL Setup

1. Create RDS MySQL 8.0 instance
2. Configure security groups
3. Run schema creation:
```bash
mysql -h <rds-endpoint> -u admin -p < db/mysql/schema.sql
```

### DocumentDB / MongoDB Atlas Setup

1. Create DocumentDB cluster or Atlas cluster
2. Configure VPC/Security settings
3. Get connection string
4. Run schema creation:
```bash
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/kayak_doc" < db/mongodb/init.js
```

## Kubernetes Deployment

### ConfigMap for Schema
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: db-schema
data:
  mysql-schema.sql: |
    # Schema content here
  mongodb-init.js: |
    # MongoDB init script here
```

### Init Container Pattern
Use init containers to run schema scripts before application starts.

## Migration Strategy

### Zero-Downtime Migration

1. **Dual Write**: Write to both old and new schemas
2. **Backfill**: Migrate existing data in batches
3. **Validation**: Verify data consistency
4. **Cutover**: Switch reads to new schema
5. **Cleanup**: Remove old schema

### Rollback Plan

- Keep database backups
- Document rollback SQL scripts
- Test rollback procedure in staging

## Security Considerations

### MySQL
- [ ] Create dedicated application user (not root)
- [ ] Grant minimum required permissions
- [ ] Enable SSL/TLS connections
- [ ] Restrict network access (firewall rules)
- [ ] Enable audit logging

### MongoDB
- [ ] Enable authentication
- [ ] Create application user with read/write permissions
- [ ] Configure IP whitelist
- [ ] Enable encryption at rest
- [ ] Use SSL/TLS connections

## Post-Deployment Validation

### Run Verification Scripts
```bash
./db/test_validation.sh
./db/test_schema_dry_run.sh
```

### Check Database Health
```bash
# MySQL
mysql -u root -p kayak -e "SHOW TABLE STATUS;"

# MongoDB
mongosh kayak_doc --eval "db.stats()"
```

### Monitor Performance
- Check slow query logs
- Monitor connection pool usage
- Review index usage statistics
- Track database size growth

