FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY --from=builder /app/node_modules ./node_modules
COPY . .

USER apiuser

EXPOSE 3001

CMD ["npm", "start"]
