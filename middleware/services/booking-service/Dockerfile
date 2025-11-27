FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared ./shared

# Copy package files
COPY services/booking-service/package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY services/booking-service ./services/booking-service

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run from this directory
WORKDIR /app/services/booking-service

# Start the service
CMD ["node", "server.js"]

