# ── Stage 1: Build Frontend ──
FROM node:22-alpine AS web-builder
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-workspace
COPY web/ ./
RUN pnpm run build

# ── Stage 2: Build Backend Server ──
FROM node:22-alpine AS server-builder
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN pnpm run build

# ── Stage 3: Production Runner ──
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11 --activate \
    && apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=server-builder /app/dist ./dist/
COPY --from=web-builder /web/dist ./web/dist/

# PG 为唯一数据源，无需挂载目录
USER node

EXPOSE 3600

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3600/api/v1/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
