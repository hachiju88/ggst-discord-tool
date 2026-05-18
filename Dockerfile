FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Install Japanese font for canvas image generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-ipafont-gothic \
    && rm -rf /var/lib/apt/lists/*

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database/*.sql ./dist/database/

USER node

EXPOSE 8080

CMD ["npm", "start"]
