FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY --from=builder /app/node_modules ./node_modules

COPY package.json ./
COPY src/ ./src/

USER apiuser

EXPOSE 3001

CMD ["node", "src/index.js"]
