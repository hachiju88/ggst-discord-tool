FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies if needed (better-sqlite3 might need some libs, but usually self-contained)
# RUN apt-get update && apt-get install -y ... && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database/*.sql ./dist/database/

# Copy necessary config files (if any)
# COPY --from=builder /app/.env .env # Cloud Run usually passes env vars, but copying .env.example might be good usage

USER node

EXPOSE 8080

CMD ["npm", "start"]
