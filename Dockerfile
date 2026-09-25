# ==========================================
# 阶段 1: 前后端构建 (Builder)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

# 先复制依赖清单以复用构建缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# ==========================================
# 阶段 2: 精简生产运行时 (Runner)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    TZ=Asia/Shanghai

RUN apk add --no-cache tzdata ca-certificates && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

RUN corepack enable

# 仅安装运行时依赖
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/VERSION ./VERSION

USER node

EXPOSE 3001

# 存活探针只反映进程状态，避免数据库抖动触发无谓重启
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/system/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
