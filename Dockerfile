# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 – install production dependencies
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 – runtime image
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

# Copy app source and installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove any local .env so the container must rely on environment variables
# passed at runtime (e.g. via docker compose environment: or -e flags).
RUN rm -f .env

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "server.js"]
