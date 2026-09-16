# New-Pro

<p align="center">
  <strong>面向 NewAPI 的现代化高性能实时大屏监控与智能风控分析系统</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.x-42b883?logo=vuedotjs" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify" alt="Fastify" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

## 🌟 核心特性

- ⚡ **毫秒级实时流式推流（零数据库查询压力）**
  - 后端采用**单例广播引擎（Broadcaster）**：无连接时全自动休眠，有连接时全局唯一 3 秒极速心跳探针（仅查最近数十条日志，耗时 < 1ms），无论多少人同时打开网页，数据库开销始终只有 1 次轻量心跳。
  - 前端监听实时流推流自增累加，数字像电表一样平滑滚动（硬件加速缓动），彻底解决高频查库痛点。

- 📊 **多维宏观指标与专业 ECharts 图表**
  - **时序分布趋势图**：支持【平滑面积流】与【柱状堆叠】一键切换，双 Y 轴呈现调用吞吐与延迟走势。
  - **输入 / 输出 Token 拆解**：清晰展现长文本 Prompt（输入）与 Completion（输出）的真实消耗结构。
  - **SLA 延迟分级阶梯**：划分 `<500ms`（极速）、`500ms~1.5s`（正常）、`1.5s~3s`（较慢）、`>3s`（超时）四级可用性看板。
  - **模型消耗演变分布**：直观对比各大模型在各时段的算力与额度占比。
  - **渠道 Uptime 矩阵**：上游各渠道状态、响应耗时、优先级权重及在线健康状态实时呈现。

- 🛡️ **公益站专属实战风控（反爬 / 防刷 / 熔断）**
  - **中转站套娃接走侦测（Relay Hijack）**：持续每分钟 60+ 次（或 5 分钟 200+ 次）高频抓取，识别套娃中转站薅羊毛行为。
  - **单 IP 极端天量请求告警（Massive Volume）**：单 IP 周期内狂干几千上万次（≥ 5,000 次），防止单个黑产脚本独占资源。
  - **持续恶意死循环刷接口拦截（Malicious Brute-Force）**：累计数百次请求且失败率 ≥ 70%，无视报错持续死循环刷接口，支持一键复制高危 IP 封禁。
  - **主力渠道严重故障熔断**：放宽偶发错误容忍，只抓真正大面积瘫痪（≥ 50% 失败率）的主力渠道。
  - **系统回环白名单免疫**：自动免死本机反代与内部网络，杜绝误报。

- 🎨 **现代化 Clean Light 极简美学**
  - 深度适配 NewAPI 官方轻量视觉规范，提供精致的色彩微调、移动端横向平滑滑动适配与深浅色模式切换。

---

## 🚀 快速开始 (Docker Compose 部署)

### 1. 获取配置文件

在服务器新建目录并下载或创建配置：

```bash
mkdir -p new-pro && cd new-pro
```

创建 `.env` 配置文件（填入您自己的数据库连接串）：

```bash
# 复制示例或直接新建 .env：
cat << 'EOF' > .env
NODE_ENV=production
HOST=0.0.0.0
PORT=3033
LOG_LEVEL=info

# 填入您的 NewAPI PostgreSQL 连接地址
DATABASE_URL=postgresql://root:your_db_password@new-api-postgres:5432/new-api

# 控制台管理员账号密码与会话密钥
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=your_jwt_secret_random_key_change_me

# 实时推流与宏观校准周期 (秒)
PULSE_INTERVAL_SEC=3
CALIBRATION_INTERVAL_SEC=60
EOF
```

创建 `docker-compose.yml`：

```yaml
services:
  new-pro:
    image: ghcr.io/lei-rr/new-pro:latest
    container_name: new-pro
    restart: always
    ports:
      - "${PORT:-3033}:${PORT:-3033}"
    env_file:
      - .env
    networks:
      - new-api_network

networks:
  new-api_network:
    external: true
    name: new-api_default # 改为您真实的 new-api 容器网络名（可通过 docker network ls 查看）
```

### 2. 启动服务

```bash
docker compose up -d
```

### 3. 登录访问

在浏览器打开 `http://<服务器IP>:3033`，输入在 `.env` 中配置的用户名和密码即可进入控制台大屏。

---

## ⚙️ 环境变量配置说明

| 变量名 | 必填 | 默认值 | 说明 |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **是** | - | NewAPI 对应的 PostgreSQL 数据库连接地址 |
| `ADMIN_USERNAME` | 否 | `admin` | 大屏控制台管理员登录用户名 |
| `ADMIN_PASSWORD` | 否 | `admin123` | 大屏控制台管理员登录密码 |
| `JWT_SECRET` | 否 | `new-pro-secret...` | 会话签名密钥（建议生产环境配置随机字符串） |
| `PORT` | 否 | `3033` | 后端服务监听端口 |
| `HOST` | 否 | `0.0.0.0` | 后端服务监听地址 |
| `PULSE_INTERVAL_SEC` | 否 | `3` | WebSocket 实时心跳推流间隔 (秒) |
| `CALIBRATION_INTERVAL_SEC` | 否 | `60` | 图表聚合与宏观指标全量静默校准间隔 (秒) |
| `LOG_LEVEL` | 否 | `info` | 日志输出级别 (`debug`, `info`, `warn`, `error`) |

---

## 🛠️ 本地开发与二次构建

本项目采用 Monorepo 结构，前端为 Vite + Vue 3，后端为 Fastify + TypeScript。

```bash
# 1. 克隆代码
git clone https://github.com/Lei-rr/new-pro.git
cd new-pro

# 2. 安装依赖 (推荐 pnpm)
pnpm install

# 3. 启动开发模式
# 终端 1 (后端):
pnpm --workspace-root dev
# 终端 2 (前端):
cd web && pnpm dev

# 4. 生产打包
pnpm build
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
