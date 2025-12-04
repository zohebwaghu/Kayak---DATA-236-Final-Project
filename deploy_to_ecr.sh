#!/bin/bash

# Configuration
AWS_REGION="us-east-1" # Change if needed
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# List of services to deploy
SERVICES=(
  "kayak-frontend:frontend"
  "kayak-api-gateway:middleware/services/api-gateway"
  "kayak-user-service:middleware/services/user-service"
  "kayak-search-service:middleware/services/search-service"
  "kayak-booking-service:middleware/services/booking-service"
  "kayak-billing-service:middleware/services/billing-service"
  "kayak-admin-service:middleware/services/admin-service"
)

echo "🚀 Starting Deployment to ECR..."
echo "Account ID: $ACCOUNT_ID"
echo "Region: $AWS_REGION"

# 1. Login to ECR
echo "🔑 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

# 2. Loop through services
for entry in "${SERVICES[@]}"; do
  REPO_NAME="${entry%%:*}"
  DIR_PATH="${entry##*:}"
  
  FULL_IMAGE_URL="$ECR_URL/$REPO_NAME:latest"

  echo "---------------------------------------------------"
  echo "📦 Processing $REPO_NAME..."

  # Create Repo if not exists
  aws ecr describe-repositories --repository-names $REPO_NAME --region $AWS_REGION > /dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "   Creating repository $REPO_NAME..."
    aws ecr create-repository --repository-name $REPO_NAME --region $AWS_REGION > /dev/null
  else
    echo "   Repository $REPO_NAME exists."
  fi

  # Build
  echo "   Building Docker image from $DIR_PATH..."
  
  # Determine context and dockerfile path
  # If it's frontend, context is frontend root.
  # If it's middleware service, context is middleware root.
  
  if [[ "$REPO_NAME" == "kayak-frontend" ]]; then
      # Frontend build
      docker build -t $REPO_NAME -f "$DIR_PATH/Dockerfile" "$DIR_PATH" --platform linux/amd64
  else
      # Middleware build (needs access to shared/)
      # Context should be 'middleware/'
      # Dockerfile is inside the service dir
      
      # DIR_PATH is like 'middleware/services/user-service'
      # We want context to be 'middleware'
      
      # Extract 'middleware' from the path (assuming structure is fixed)
      CONTEXT_DIR="middleware"
      
      # Dockerfile path relative to where we run the command (project root)
      DOCKERFILE_PATH="$DIR_PATH/Dockerfile"
      
      if [ ! -f "$DOCKERFILE_PATH" ]; then
          echo "❌ Dockerfile not found at $DOCKERFILE_PATH! Skipping."
          continue
      fi

      docker build -t $REPO_NAME -f "$DOCKERFILE_PATH" "$CONTEXT_DIR" --platform linux/amd64
  fi
  
  # Tag
  echo "   Tagging image..."
  docker tag $REPO_NAME:latest $FULL_IMAGE_URL

  # Push
  echo "   Pushing to ECR..."
  docker push $FULL_IMAGE_URL
  
  echo "✅ $REPO_NAME deployed successfully!"
done

echo "---------------------------------------------------"
echo "🎉 All services processed."
