# Stage 1: Build TypeScript
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json package-lock.json ./

RUN npm ci --omit=dev=false

# Copy source and compile
COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build


# Stage 2: Production image
FROM node:18-alpine AS production

WORKDIR /app

# Copy only compiled output and production dependencies
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create data directory for JSONL log
RUN mkdir -p data

# Expose hub port (4000) and gateway port (18789)
EXPOSE 4000
EXPOSE 18789

# Default: start hub. Override CMD to start gateway.
# Examples:
#   docker run agent-bus node dist/index.js          (hub)
#   docker run agent-bus node dist/gateway/index.js  (gateway)
CMD ["node", "dist/index.js"]
