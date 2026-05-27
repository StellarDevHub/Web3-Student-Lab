# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm and prisma globally
RUN npm install -g pnpm prisma

# Copy package files first (for faster caching)
COPY package*.json ./

# Install dependencies
RUN pnpm install

# Install backend dependencies
WORKDIR /app/backend
RUN pnpm install

# Go back to app root to copy the rest of the files
WORKDIR /app
COPY . .

# Generate Prisma client with correct path
RUN npx prisma generate --schema=prisma/schema.prisma

# Change to backend directory and build
WORKDIR /app/backend
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Copy production dependencies and built files from backend
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start the application
CMD ["npm", "run", "start:prod"]
