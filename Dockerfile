# ── Stage 1: Build Frontend ──
FROM node:20-alpine AS web-builder
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --ignore-workspace
COPY web/ ./
RUN pnpm run build

# ── Stage 2: Build Backend Server ──
FROM node:20-alpine AS server-builder
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN pnpm run build

# ── Stage 3: Production Runner ──
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod && pnpm store prune

COPY --from=server-builder /app/dist ./dist/
COPY --from=web-builder /web/dist ./web/dist/

# Create logs mount point
RUN mkdir -p /logs

EXPOSE 3600

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3600/api/health || exit 1

CMD ["node", "dist/index.js"]
