FROM node:18-alpine

WORKDIR /app

# Shared libs
COPY backend/shared ./shared

# Service sources and package files
COPY backend/services/billing-service/package*.json ./
RUN npm install --production
COPY backend/services/billing-service ./services/billing-service

WORKDIR /app/services/billing-service

EXPOSE 3005

CMD ["npm", "start"]
