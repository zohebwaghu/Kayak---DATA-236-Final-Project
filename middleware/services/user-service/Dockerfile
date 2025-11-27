FROM node:18-alpine

# Root for the middleware repo inside the container
WORKDIR /app

# 1) Copy shared utilities so they end up at /app/shared/...
COPY shared ./shared

# 2) Copy the user-service source code so it ends up at /app/services/user-service/...
COPY services/user-service ./services/user-service

# 3) Copy the user-service package files into /app so npm installs into /app/node_modules
COPY services/user-service/package*.json ./

# 4) Install dependencies (kafkajs, express, mysql2, etc.) into /app/node_modules
RUN npm install --production

# 5) Expose the port the service listens on
EXPOSE 3001

# 6) Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 7) At runtime, run from inside the service folder:
#    /app/services/user-service/server.js
WORKDIR /app/services/user-service

CMD ["node", "server.js"]
