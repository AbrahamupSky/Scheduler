FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Prisma client (dev)
RUN npx prisma generate

# Expose Next.js dev port
EXPOSE 3000

# Run Next.js in dev mode
CMD ["npm", "run", "dev"]
