#!/bin/bash

# Load Infra IDs
source infra_ids.env

AWS_REGION="us-east-1"
SERVICE_NAME="kayak-service"
TASK_FAMILY="kayak-app-stack"

echo "🚀 Creating ECS Service..."

# Create Service
# We use the VPC/Subnets/SG created earlier
aws ecs create-service \
    --cluster $CLUSTER_NAME \
    --service-name $SERVICE_NAME \
    --task-definition $TASK_FAMILY \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET1_ID,$SUBNET2_ID],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
    --region $AWS_REGION

echo "✅ Service Created! It may take a few minutes to start."
echo "Monitor status with: aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME"
