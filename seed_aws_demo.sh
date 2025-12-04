#!/bin/bash

# Usage: ./seed_aws_demo.sh <AWS_PUBLIC_IP>

if [ -z "$1" ]; then
    echo "❌ Usage: ./seed_aws_demo.sh <AWS_PUBLIC_IP>"
    echo "Example: ./seed_aws_demo.sh 54.123.45.67"
    exit 1
fi

AWS_IP=$1

echo "🚀 Starting Remote Seeding to AWS ($AWS_IP)..."
echo "This will insert 10,000 records into your AWS database."

# Set Environment Variables for the Node script
export MYSQL_HOST=$AWS_IP
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=rootpassword  # Default in our Task Definition
export MONGO_URI="mongodb://$AWS_IP:27017/kayak"

# Run the existing seeding script
cd middleware/scripts
node seed_large_dataset.js

echo "✅ AWS Database Seeded!"
