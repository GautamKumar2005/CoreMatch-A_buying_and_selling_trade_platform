# ============================================================
# CoreMatch Exchange — Production Dockerfile
# Architecture: Next.js (static) + Node.js + C++ Engine
# ============================================================

# ── Stage 1: Compile C++ matching engine for Linux ──────────
FROM gcc:13 AS cpp-builder
WORKDIR /cpp

# Copy only the files needed to compile the CLI engine
COPY backend/src/main_cli.cpp ./src/
COPY backend/src/engine/ ./src/engine/

RUN g++ -std=c++20 -O3 -o matching_engine \
    src/main_cli.cpp \
    src/engine/order_book.cpp \
    src/engine/matching_engine.cpp \
    && strip matching_engine

# ── Stage 2: Build Next.js frontend (static export) ─────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./

# Build Next.js — output static files for export
RUN npm run build

# ── Stage 3: Prepare Node.js backend ────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --only=production

COPY backend/ ./

# ── Stage 4: Final runtime image ─────────────────────────────
FROM node:20-alpine AS runtime

# Install libstdc++ for C++ binary
RUN apk add --no-cache libstdc++ libgcc

WORKDIR /app/backend

# Copy Node.js backend + node_modules
COPY --from=backend-builder /app/backend ./

# Copy compiled C++ engine (Linux binary, not .exe)
COPY --from=cpp-builder /cpp/matching_engine ./matching_engine
RUN chmod +x ./matching_engine

# Copy built Next.js static files into backend/public
#   so Express can serve them via express.static()
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /app/frontend/.next/standalone ./
COPY --from=frontend-builder /app/frontend/public ./public 2>/dev/null || true

# Patch: if Next.js export is used instead of standalone,
# copy 'out' into backend/public for Express static serving
# (this handles the static export mode)
COPY --from=frontend-builder /app/frontend/out ./public 2>/dev/null || true

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Start the Node.js server
CMD ["node", "server.js"]
