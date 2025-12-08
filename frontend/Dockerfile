#
# Multi-stage build for the React frontend.
#
# 1) Build stage: install deps and create production build.
# 2) Runtime stage: serve static assets via nginx.
#

FROM node:18-bullseye AS build
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build


FROM nginx:stable-alpine AS runtime

# Copy built assets
COPY --from=build /app/build /usr/share/nginx/html

# Expose the port nginx listens on
EXPOSE 80

# Start nginx (default command)

