#!/bin/bash

# Configuration
CLUSTER_NAME="kayak-cluster"
REGION="us-east-1"
VPC_CIDR="10.0.0.0/16"
SUBNET1_CIDR="10.0.1.0/24"
SUBNET2_CIDR="10.0.2.0/24"

echo "🚀 Setting up ECS Infrastructure..."

# 1. Create ECS Cluster
echo "Creating ECS Cluster: $CLUSTER_NAME..."
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $REGION

# 2. Create VPC (Simplified for demo - usually use CloudFormation)
echo "Creating VPC..."
VPC_ID=$(aws ec2 create-vpc --cidr-block $VPC_CIDR --query Vpc.VpcId --output text --region $REGION)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=kayak-vpc --region $REGION
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames "{\"Value\":true}" --region $REGION
echo "VPC ID: $VPC_ID"

# 3. Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text --region $REGION)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $REGION
echo "IGW ID: $IGW_ID"

# 4. Create Route Table
RT_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID --query RouteTable.RouteTableId --output text --region $REGION)
aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $REGION
echo "Route Table ID: $RT_ID"

# 5. Create Subnets (Public)
echo "Creating Subnets..."
SUBNET1_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block $SUBNET1_CIDR --availability-zone ${REGION}a --query Subnet.SubnetId --output text --region $REGION)
SUBNET2_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block $SUBNET2_CIDR --availability-zone ${REGION}b --query Subnet.SubnetId --output text --region $REGION)

aws ec2 associate-route-table --route-table-id $RT_ID --subnet-id $SUBNET1_ID --region $REGION
aws ec2 associate-route-table --route-table-id $RT_ID --subnet-id $SUBNET2_ID --region $REGION
aws ec2 modify-subnet-attribute --subnet-id $SUBNET1_ID --map-public-ip-on-launch --region $REGION
aws ec2 modify-subnet-attribute --subnet-id $SUBNET2_ID --map-public-ip-on-launch --region $REGION

echo "Subnet 1: $SUBNET1_ID"
echo "Subnet 2: $SUBNET2_ID"

# 6. Create Security Group
echo "Creating Security Group..."
SG_ID=$(aws ec2 create-security-group --group-name kayak-sg --description "Allow HTTP/HTTPS" --vpc-id $VPC_ID --query GroupId --output text --region $REGION)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3001 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3002 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3003 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3004 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3005 --cidr 0.0.0.0/0 --region $REGION
# Allow Database ports for Remote Seeding (Demo only)
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3306 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 27017 --cidr 0.0.0.0/0 --region $REGION
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 6379 --cidr 0.0.0.0/0 --region $REGION
# Allow all internal traffic
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol -1 --source-group $SG_ID --region $REGION

echo "Security Group ID: $SG_ID"

# Save IDs to file for next steps
echo "VPC_ID=$VPC_ID" > infra_ids.env
echo "SUBNET1_ID=$SUBNET1_ID" >> infra_ids.env
echo "SUBNET2_ID=$SUBNET2_ID" >> infra_ids.env
echo "SG_ID=$SG_ID" >> infra_ids.env
echo "CLUSTER_NAME=$CLUSTER_NAME" >> infra_ids.env
echo "EXECUTION_ROLE_ARN=$(aws iam get-role --role-name ecsTaskExecutionRole --query Role.Arn --output text 2>/dev/null || echo 'NOT_FOUND')" >> infra_ids.env

echo "✅ Infrastructure Setup Complete!"
