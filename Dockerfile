# Stage 1: Build Frontend and Backend Bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies like typescript, esbuild, vite)
RUN npm ci

# Copy application source files
COPY . .

# Run production build (Vite static SPA build + esbuild server bundling)
RUN npm run build

# Stage 2: Production Runner
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHON_BIN=python3
ENV CRAWL4AI_BRIDGE_PATH=/app/scripts/crawl4ai_bridge.py
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Crawl4AI uses Playwright/Chromium for rendered pages. Keep Python isolated in
# a small venv so Node production dependencies remain straightforward.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files to install production-only dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Install crawler runtime and its browser dependencies
COPY requirements-crawler.txt ./
RUN python3 -m venv /opt/crawler-venv \
  && /opt/crawler-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/crawler-venv/bin/pip install --no-cache-dir -r requirements-crawler.txt \
  && /opt/crawler-venv/bin/crawl4ai-setup

ENV PATH="/opt/crawler-venv/bin:${PATH}"

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.cjs"]
