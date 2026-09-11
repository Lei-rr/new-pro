# ==========================================
# 阶段 1: 前后端多阶段并行编译构建 (Builder)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 优先复制依赖声明以最大化 Docker 构建层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/

RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制全量项目代码
COPY . .

# 执行生产打包 (后端 esbuild 打包至 dist/server.js，前端 vite 打包至 web/dist)
RUN pnpm run build

# ==========================================
# 阶段 2: 极简轻量生产运行时 (Runner)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3033
ENV HOST=0.0.0.0
ENV TZ=Asia/Shanghai

# 配置时区
RUN apk add --no-cache tzdata ca-certificates && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

# 仅安装生产依赖
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# 从 builder 复制打包产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 3033

CMD ["node", "dist/server.js"]
