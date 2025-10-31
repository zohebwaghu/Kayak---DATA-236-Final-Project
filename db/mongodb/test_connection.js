// Quick connection test script for MongoDB
// Usage: mongosh < db/mongodb/test_connection.js
// Or: mongosh "mongodb+srv://..." < db/mongodb/test_connection.js

const dbName = 'kayak_doc';

// Connect to database (defaults to current connection)
db = db.getSiblingDB(dbName);

print(`\n=== MongoDB Connection Test ===`);
print(`Connected to database: ${db.getName()}`);
print(`Current database stats:\n`);

// List all collections
const collections = db.getCollectionNames();
print(`Collections found: ${collections.length}`);
collections.forEach(col => {
  const count = db.getCollection(col).countDocuments();
  print(`  - ${col}: ${count} documents`);
});

// Check indexes for each collection
print(`\n=== Indexes ===`);
collections.forEach(col => {
  const indexes = db.getCollection(col).getIndexes();
  print(`\n${col}:`);
  indexes.forEach(idx => {
    print(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
  });
});

// Test validation (if schema validators are enabled)
print(`\n=== Schema Validation ===`);
collections.forEach(col => {
  const stats = db.getCollection(col).stats();
  if (stats.validator) {
    print(`✓ ${col} has validator`);
  } else {
    print(`⚠ ${col} has no validator`);
  }
});

print(`\n=== Connection Test Complete ===\n`);

