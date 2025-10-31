# MongoDB Connection Guide - Compass & Atlas

## Local MongoDB Connection (MongoDB Compass)

Based on your terminal output, your local MongoDB is running on the default port.

### Connection String for Local MongoDB Compass:
```
mongodb://127.0.0.1:27017
```
or
```
mongodb://localhost:27017
```

### Steps to Connect in MongoDB Compass:
1. Open MongoDB Compass
2. Paste the connection string: `mongodb://127.0.0.1:27017`
3. Click **Connect** (no authentication needed if running locally without auth)
4. You should see the `kayak_doc` database with your collections:
   - `reviews`
   - `images`
   - `logs`
   - `analytics_aggregates`
   - `deal_events`
   - `watches`

### Verify Collections:
After connecting, you can run this in Compass shell or mongosh:
```javascript
use kayak_doc
show collections
db.reviews.countDocuments()
db.images.countDocuments()
```

---

## MongoDB Atlas Connection

If you want to use MongoDB Atlas (cloud), you'll need to:

### 1. Create Atlas Cluster (if not already done)
- Go to https://www.mongodb.com/cloud/atlas
- Sign up/login
- Create a free M0 cluster (free tier)
- Choose your region

### 2. Get Connection String
- In Atlas dashboard, click **Connect** on your cluster
- Choose **Connect using MongoDB Compass**
- Copy the connection string (format: `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/`)

### 3. Update Connection String
Replace `<username>` and `<password>` with your Atlas database user credentials.

**Example:**
```
mongodb+srv://myuser:mypassword@cluster0.abc123.mongodb.net/kayak_doc?retryWrites=true&w=majority
```

### 4. Run Schema Script on Atlas
Once connected, you have two options:

#### Option A: Import via Compass
1. Connect to Atlas cluster in Compass
2. Navigate to `kayak_doc` database (or create it)
3. Use Compass's GUI to create collections manually, or

#### Option B: Run Script via mongosh (Recommended)
```bash
# Connect to Atlas cluster
mongosh "mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/kayak_doc"

# Then load the schema
load('db/mongodb/init.js')
```

Or run it directly:
```bash
mongosh "mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/kayak_doc" < db/mongodb/init.js
```

---

## Migration Script (Local → Atlas)

If you want to migrate data from local to Atlas, use this script:

```bash
# Export from local
mongodump --uri="mongodb://127.0.0.1:27017/kayak_doc" --out=./mongodb_backup

# Import to Atlas
mongorestore --uri="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/kayak_doc" ./mongodb_backup/kayak_doc
```

---

## Quick Connection Test

Test your Atlas connection:
```bash
mongosh "mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/kayak_doc" --eval "db.getCollectionNames()"
```

---

## Security Notes

- **Never commit** connection strings with passwords to Git
- Use environment variables for connection strings:
  ```bash
  export MONGODB_URI="mongodb+srv://..."
  ```
- For Atlas: Enable IP whitelist (add `0.0.0.0/0` for development or your specific IP)
- Create a database user with read/write permissions for your application

---

## Troubleshooting

### "Connection refused" or "Timeout"
- Check if MongoDB is running: `brew services list` (macOS) or check systemd
- Verify port 27017 is not blocked by firewall
- For Atlas: Check IP whitelist in Network Access settings

### "Authentication failed"
- Verify username/password are correct
- Check database user has proper permissions
- Ensure you're using the correct database name in connection string

### Can't see collections
- Verify you're connected to the correct database: `db.getName()`
- Check collections exist: `show collections`
- If collections are empty, re-run `init.js` script

