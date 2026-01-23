# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# generate prisma client + build next
RUN npx prisma generate
RUN npm run build

# ---- run ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy build output
COPY --from=builder /app ./

# Ensure prisma folder exists for sqlite file
RUN mkdir -p /app/prisma

EXPOSE 3000

# Run migrations on startup (safe for sqlite) then start
CMD sh -c "npx prisma migrate deploy && npm run start"
