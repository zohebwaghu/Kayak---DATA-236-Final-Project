#!/bin/bash

# Load Infra IDs
source infra_ids.env

AWS_REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
EXECUTION_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole"

# Check if role exists, if not, warn user (or try to create, but that requires permissions)
if [ "$EXECUTION_ROLE_ARN" == "NOT_FOUND" ]; then
    echo "⚠️  ecsTaskExecutionRole not found! You need to create this role in IAM for Fargate to pull images."
    # Fallback to a known ARN format if they created it manually
    EXECUTION_ROLE_ARN="arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole"
fi

echo "🚀 Registering Task Definitions..."

# 1. Register Database Task (MySQL + Mongo + Redis + Zookeeper + Kafka)
# Note: Running all these in one Fargate task is heavy. We'll split or use EC2.
# For Fargate, we can't run 5 heavy containers easily in free tier.
# Strategy: We will register individual tasks for services, and assume DBs are external OR
# we will create a "Infrastructure Task" that runs the DBs.

# Let's create a "Databases" task definition
cat <<EOF > task_databases.json
{
    "family": "kayak-databases",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "1024",
    "memory": "3072",
    "executionRoleArn": "$EXECUTION_ROLE_ARN",
    "containerDefinitions": [
        {
            "name": "mysql",
            "image": "mysql:8.0",
            "portMappings": [{"containerPort": 3306}],
            "environment": [
                {"name": "MYSQL_ROOT_PASSWORD", "value": "rootpassword"}
            ]
        },
        {
            "name": "mongo",
            "image": "mongo:latest",
            "portMappings": [{"containerPort": 27017}]
        },
        {
            "name": "redis",
            "image": "redis:alpine",
            "portMappings": [{"containerPort": 6379}]
        }
    ]
}
EOF

echo "Registering Databases Task..."
aws ecs register-task-definition --cli-input-json file://task_databases.json --region $AWS_REGION > /dev/null

# 2. Register API Gateway Task
# Needs to link to the databases. In Fargate, they talk via localhost if in same task, 
# or via private IP if in different tasks.
# For simplicity in this script, we will register the API Gateway.
# REAL WORLD: We need Service Discovery (Cloud Map) to let API Gateway find "user-service".
# SIMULATION: We will put ALL Microservices in ONE Task Definition so they can talk via localhost.
# This is the "Pod" pattern. It's the easiest way to deploy a microservices mesh without Service Discovery complexity.

cat <<EOF > task_kayak_app.json
{
    "family": "kayak-app-stack",
    "networkMode": "awsvpc",
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "2048", 
    "memory": "4096",
    "executionRoleArn": "$EXECUTION_ROLE_ARN",
    "containerDefinitions": [
        {
            "name": "frontend",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-frontend:latest",
            "portMappings": [{"containerPort": 80}],
            "essential": true
        },
        {
            "name": "api-gateway",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-api-gateway:latest",
            "portMappings": [{"containerPort": 3000}],
            "environment": [
                {"name": "USER_SERVICE_URL", "value": "http://localhost:3001"},
                {"name": "SEARCH_SERVICE_URL", "value": "http://localhost:3003"},
                {"name": "BOOKING_SERVICE_URL", "value": "http://localhost:3002"},
                {"name": "BILLING_SERVICE_URL", "value": "http://localhost:3004"},
                {"name": "ADMIN_SERVICE_URL", "value": "http://localhost:3005"}
            ],
            "essential": true
        },
        {
            "name": "user-service",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-user-service:latest",
            "portMappings": [{"containerPort": 3001}],
            "environment": [
                {"name": "MYSQL_HOST", "value": "127.0.0.1"},
                {"name": "MONGO_URI", "value": "mongodb://127.0.0.1:27017/kayak"}
            ]
        },
        {
            "name": "booking-service",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-booking-service:latest",
            "portMappings": [{"containerPort": 3002}],
            "environment": [
                {"name": "MYSQL_HOST", "value": "127.0.0.1"}
            ]
        },
        {
            "name": "search-service",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-search-service:latest",
            "portMappings": [{"containerPort": 3003}],
            "environment": [
                {"name": "MONGO_URI", "value": "mongodb://127.0.0.1:27017/kayak"},
                {"name": "REDIS_HOST", "value": "127.0.0.1"}
            ]
        },
        {
            "name": "billing-service",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-billing-service:latest",
            "portMappings": [{"containerPort": 3004}],
            "environment": [
                {"name": "MYSQL_HOST", "value": "127.0.0.1"}
            ]
        },
        {
            "name": "admin-service",
            "image": "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/kayak-admin-service:latest",
            "portMappings": [{"containerPort": 3005}],
            "environment": [
                {"name": "MYSQL_HOST", "value": "127.0.0.1"},
                {"name": "MONGO_URI", "value": "mongodb://127.0.0.1:27017/kayak"}
            ]
        },
        {
            "name": "mysql",
            "image": "mysql:8.0",
            "environment": [
                {"name": "MYSQL_ROOT_PASSWORD", "value": "rootpassword"},
                {"name": "MYSQL_DATABASE", "value": "kayak_users"}
            ]
        },
        {
            "name": "mongo",
            "image": "mongo:latest"
        },
        {
            "name": "redis",
            "image": "redis:alpine"
        }
    ]
}
EOF

echo "Registering Application Stack Task..."
aws ecs register-task-definition --cli-input-json file://task_kayak_app.json --region $AWS_REGION > /dev/null

echo "✅ Task Definitions Registered!"
