# ── Stage 1: Build the React frontend ──
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# ── Stage 2: Production image ──
FROM node:22-alpine AS production

WORKDIR /app

# Install nginx
RUN apk add --no-cache nginx

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy server code
COPY server/ ./server/

# Copy built frontend from stage 1
COPY --from=build /app/dist ./dist

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
