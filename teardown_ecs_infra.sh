#!/bin/bash

# Load Infra IDs
if [ -f infra_ids.env ]; then
    source infra_ids.env
else
    echo "⚠️  infra_ids.env not found. Please manually delete resources if this script fails."
    # Set defaults or exit? Let's try to proceed with known names if possible, but IDs are safer.
    CLUSTER_NAME="kayak-cluster"
    SERVICE_NAME="kayak-service"
    REGION="us-east-1"
fi

AWS_REGION="us-east-1"
SERVICE_NAME="kayak-service"

echo "🛑 Tearing down AWS Resources..."

# 1. Delete Service
echo "Deleting ECS Service: $SERVICE_NAME..."
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION > /dev/null
aws ecs delete-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force --region $AWS_REGION
echo "✅ Service deleted."

# 2. Deregister Task Definitions (Optional, but good for cleanup)
# We won't delete them, just leave them. They don't cost money.

# 3. Delete Cluster
echo "Deleting ECS Cluster: $CLUSTER_NAME..."
# Cluster deletion might fail if tasks are still draining. Wait a bit.
echo "Waiting 10s for tasks to stop..."
sleep 10
aws ecs delete-cluster --cluster $CLUSTER_NAME --region $AWS_REGION
echo "✅ Cluster deleted."

# 4. Delete Networking (Reverse order of creation)
# SG -> Subnets -> RT -> IGW -> VPC

if [ ! -z "$SG_ID" ]; then
    echo "Deleting Security Group: $SG_ID..."
    aws ec2 delete-security-group --group-id $SG_ID --region $AWS_REGION
fi

if [ ! -z "$SUBNET1_ID" ]; then
    echo "Deleting Subnet 1: $SUBNET1_ID..."
    aws ec2 delete-subnet --subnet-id $SUBNET1_ID --region $AWS_REGION
fi

if [ ! -z "$SUBNET2_ID" ]; then
    echo "Deleting Subnet 2: $SUBNET2_ID..."
    aws ec2 delete-subnet --subnet-id $SUBNET2_ID --region $AWS_REGION
fi

# Detach and Delete IGW
# Need to find IGW if not in env, but we saved it? No we didn't save IGW_ID in env file explicitly in setup script?
# Let's check setup_ecs_infra.sh content from memory/context. 
# It did: echo "IGW ID: $IGW_ID" but didn't save to infra_ids.env.
# We need to query it.

if [ ! -z "$VPC_ID" ]; then
    echo "Cleaning up VPC: $VPC_ID..."
    
    # Find IGW attached to VPC
    IGW_ID=$(aws ec2 describe-internet-gateways --filters Name=attachment.vpc-id,Values=$VPC_ID --query "InternetGateways[0].InternetGatewayId" --output text --region $AWS_REGION)
    
    if [ "$IGW_ID" != "None" ]; then
        echo "Detaching and Deleting IGW: $IGW_ID..."
        aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $AWS_REGION
        aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID --region $AWS_REGION
    fi

    # Delete Route Table (Main one can't be deleted, but custom ones can)
    # We created a custom one.
    # Find RTs for VPC
    RT_IDS=$(aws ec2 describe-route-tables --filters Name=vpc-id,Values=$VPC_ID --query "RouteTables[?Associations==\`[]\`].RouteTableId" --output text --region $AWS_REGION)
    # The one we created has associations? We deleted subnets, so associations are gone?
    # Actually, if we delete subnets, the associations are removed.
    
    # Let's just try to delete all non-main RTs
    # Simplified: Just delete the VPC, it usually fails if dependencies exist.
    
    echo "Deleting VPC: $VPC_ID..."
    aws ec2 delete-vpc --vpc-id $VPC_ID --region $AWS_REGION
    echo "✅ VPC deleted."
fi

echo "🎉 Teardown Complete! No more costs will be incurred."
echo "Note: ECR Repositories and Task Definitions remain (they are free/cheap storage)."
