# services/search-service/Dockerfile

FROM node:18-alpine

# 1. Base workdir for the whole app
WORKDIR /app

# 2. Copy shared utilities so /app/shared exists
COPY shared ./shared

# 3. Copy ONLY the search-service package files into /app
COPY services/search-service/package*.json ./

# 4. Install dependencies at /app/node_modules
#    This makes kafkajs visible to BOTH /app/shared and /app/services/search-service
RUN npm install --production

# 5. Copy the rest of the search-service source code under /app/services/search-service
COPY services/search-service ./services/search-service

# 6. Move into the search-service folder to run the server
WORKDIR /app/services/search-service

# 7. Expose port
EXPOSE 3003

# 8. Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 9. Start the service from the service folder
CMD ["node", "server.js"]
