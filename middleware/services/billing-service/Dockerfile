FROM node:18-alpine

# Root for the middleware repo inside the container
WORKDIR /app

# 1) Copy shared utilities so they end up at /app/shared/...
COPY shared ./shared

# 2) Copy the billing-service source code so it ends up at /app/services/billing-service/...
COPY services/billing-service ./services/billing-service

# 3) Copy the billing-service package files into /app so npm installs into /app/node_modules
COPY services/billing-service/package*.json ./

# 4) Install dependencies (express, mysql2, dotenv, etc.) into /app/node_modules
RUN npm install --production

# 5) Expose the port the billing-service listens on
EXPOSE 3005

# 6) Health check for billing-service
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 7) At runtime, run from inside the billing-service folder:
#    /app/services/billing-service/server.js
WORKDIR /app/services/billing-service

CMD ["node", "server.js"]
