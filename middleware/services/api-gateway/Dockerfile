FROM node:18-alpine

WORKDIR /app

# Copy shared utilities
COPY shared ./shared

# Copy package files
COPY services/api-gateway/package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY services/api-gateway ./services/api-gateway

#Move into the api-gateway folder to run the server
WORKDIR /app/services/api-gateway

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "server.js"]

