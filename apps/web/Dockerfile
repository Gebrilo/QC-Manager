# =============================================================================
# QC Web — Production Dockerfile (multi-stage, Next.js standalone)
# =============================================================================
# Build:  docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#           -t <user>/qc-web:latest ./apps/web
# Run:    docker run -p 3000:3000 <user>/qc-web:latest
# =============================================================================

# --- Stage 1: Install ALL dependencies (needed for build) ---
FROM node:18-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# --- Stage 2: Build the Next.js app ---
FROM node:18-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars must be set at BUILD time (baked into JS bundle)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# --- Stage 3: Production runtime ---
FROM node:18-alpine AS runner

LABEL maintainer="QC Management Team"
LABEL org.opencontainers.image.title="qc-web"
LABEL org.opencontainers.image.description="QC Management Tool — Next.js Web Frontend"
LABEL org.opencontainers.image.source="https://github.com/Gebrilo/QC-Manager"

WORKDIR /app
ENV NODE_ENV=production

# Install wget for health checks, create non-root user
RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output (includes server.js + node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
