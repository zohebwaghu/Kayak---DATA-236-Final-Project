FROM --platform=linux/amd64 node:18-alpine

# Root for the middleware repo inside the container
WORKDIR /app

# 1) Copy shared utilities so they end up at /app/shared/...
COPY shared ./shared

# 2) Copy the admin-service source code so it ends up at /app/services/admin-service/...
COPY services/admin-service ./services/admin-service

# 3) Copy the admin-service package files into /app so npm installs into /app/node_modules
COPY services/admin-service/package*.json ./

# 4) Install dependencies (kafkajs, express, mysql2, mongodb, etc.) into /app/node_modules
RUN npm install --production

# 5) Expose the port the service listens on
EXPOSE 3006

# 6) Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 7) At runtime, run from inside the service folder:
#    /app/services/admin-service/server.js
WORKDIR /app/services/admin-service

CMD ["node", "server.js"]

