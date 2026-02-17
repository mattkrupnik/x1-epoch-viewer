# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build server
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# Stage 3: Runtime
FROM node:22-alpine AS runtime
WORKDIR /app

# Copy server production dependencies
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built server
COPY --from=server-build /app/server/dist ./server/dist
# schema.sql must be next to compiled db/init.js
COPY server/src/db/schema.sql ./server/dist/db/schema.sql

# Copy built frontend (nginx will serve this)
COPY --from=frontend-build /app/dist ./frontend-dist

# Copy server .env is handled via docker-compose env
WORKDIR /app/server

EXPOSE 3001

CMD ["node", "dist/index.js"]
