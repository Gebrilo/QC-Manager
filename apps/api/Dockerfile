# =============================================================================
# QC API — Production Dockerfile (multi-stage)
# =============================================================================
# Build:  docker build -t <user>/qc-api:latest ./apps/api
# Run:    docker run -p 3001:3001 --env-file .env <user>/qc-api:latest
# =============================================================================

# --- Stage 1: Install production dependencies ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# --- Stage 2: Production runtime ---
FROM node:18-alpine AS runner

LABEL maintainer="QC Management Team"
LABEL org.opencontainers.image.title="qc-api"
LABEL org.opencontainers.image.description="QC Management Tool — Express.js API Server"
LABEL org.opencontainers.image.source="https://github.com/Gebrilo/QC-Manager"

WORKDIR /app
ENV NODE_ENV=production

# Install wget for health checks, create non-root user
RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

# Copy production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY package.json ./
COPY src/ ./src/

# Switch to non-root user
USER apiuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
