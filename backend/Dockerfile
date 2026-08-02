# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install prisma globally
RUN npm install -g prisma

# Copy package files first for caching
# We assume the Docker build context is the repository root.
COPY backend/package*.json ./backend/

WORKDIR /app/backend
# Use npm ci for reliable builds
RUN npm ci

# Copy the rest of the backend source code
WORKDIR /app
COPY backend/ ./backend/

WORKDIR /app/backend
# Generate Prisma client
RUN npx prisma generate --schema=prisma/schema.prisma

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:22-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies and built files from the builder stage
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/prisma ./prisma
COPY --from=builder /app/backend/prisma.config.ts ./

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Switch to non-root user
USER nodejs

# Start the application with database migrations
CMD ["sh", "-c", "npx prisma db push --accept-data-loss --schema=prisma/schema.prisma && npm run start:prod"]
