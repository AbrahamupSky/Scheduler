# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Needed for some node modules + prisma on alpine
RUN apk add --no-cache libc6-compat openssl

# Install deps first for better caching
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./

# Choose ONE package manager. This assumes pnpm.
RUN corepack enable && pnpm install

# Copy the rest
COPY . .

# Create a dedicated writable folder for sqlite + prisma
# (We'll also mount a Docker volume to /data to persist)
RUN mkdir -p /data/sqlite && chmod -R 777 /data

# Set Prisma SQLite path (absolute + volume-backed)
ENV DATABASE_URL="file:/data/sqlite/dev.db"

# Generate prisma client at build time (safe)
RUN pnpm prisma generate

EXPOSE 3000

# On container start: ensure folder exists, run migrations, then start dev server
CMD sh -c "mkdir -p /data/sqlite && pnpm prisma migrate dev && pnpm dev"
