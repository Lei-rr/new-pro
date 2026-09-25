# New-Pro

<p align="center">
  <strong>面向 NewAPI 的现代化高性能实时监控大屏与智能风控分析系统</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.x-42b883?logo=vuedotjs" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify" alt="Fastify" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ed?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

## 核心特性

- **毫秒级实时推流，数据库零额外压力**
  - 后端单例广播引擎：无订阅者时完全休眠；有订阅者时全局仅一次脉冲查询（默认 3 秒），无论多少客户端，数据库开销恒定。
  - 前端接收推流后本地平滑累加指标，配合 ECharts 缓动数字，避免高频轮询与数字跳变。
  - WebSocket 断线自动指数退避重连，期间降级为 HTTP 轮询，恢复后自动切回。

- **多维宏观指标与专业图表**
  - 时序趋势：平滑面积流 / 柱状堆叠切换，双 Y 轴呈现吞吐与延迟，失败数与平均延迟全程可见。
  - 输入 / 输出 Token 拆解，SLA 延迟四级阶梯（`<500ms` / `500ms~1.5s` / `1.5s~3s` / `>3s`）。
  - TOP 5 模型消耗演变分布、渠道 Uptime 矩阵、性能健康度追踪。
  - 指标一律直接聚合 `logs`：`quota_data` 账本表仅记录成功扣费，不含失败与耗时，用它加速会导致趋势图长期区间的失败率与延迟恒为 0。

- **公益站专属风控（反爬 / 防刷 / 熔断）**
  - 规则以独立目录维护（`src/modules/analytics/risk-rules.ts`），**判定条件与告警文案同源**，杜绝"显示阈值与实际触发线不一致"。
  - 7 条内置规则，按优先级取首个命中，从结构上消除同一对象重复告警：
    | 规则 | 触发条件 | 级别 |
    | :--- | :--- | :--- |
    | `ip-brute-force` | 周期请求 ≥200 且失败率 ≥70%，或失败 ≥150 且失败率 ≥60% | high / critical |
    | `ip-brushing-burst` | 5 分钟 ≥30 次且失败率 ≥70%，或 1 分钟 ≥20 次且失败率 ≥75% | high / critical |
    | `ip-relay-hijack` | 1 分钟 ≥60 次 或 5 分钟 ≥200 次 | high / critical |
    | `ip-massive-volume` | 周期单 IP 请求 ≥5000 次（严重线 10000） | high / critical |
    | `channel-total-failure` | 请求 ≥15 次且全部失败 | critical |
    | `channel-severe-outage` | 请求 ≥30 次且失败率 ≥50% | high / critical |
    | `channel-high-latency` | 平均延迟 ≥15s 且失败率 ≥30% | high |
    | `global-extreme-slow` | 单次耗时 >45s 的请求超过 50 次 | medium |
  - 所有阈值均可通过 `RISK_*` 环境变量调整；完整规则清单与优先级可通过 `/api/system/diagnostics` 查询。
  - 本机反代与内网回环自动免疫，杜绝误报。

- **现代化 Clean Light 极简界面**
  - 深色 / 浅色模式、响应式移动端布局、⌘K 快捷指令面板、CSV 一键导出。

- **生产级可观测性**
  - `GET /api/system/healthz`：存活探针，仅反映进程状态，数据库抖动不会触发重启。
  - `GET /api/system/readyz`：就绪探针，数据库不可用时返回 503 供流量摘除。
  - `GET /api/system/metrics`：Prometheus 文本格式，覆盖 HTTP 延迟直方图、数据库查询、缓存命中率、WebSocket 订阅数、GeoIP 在线配额与进程内存。
  - `GET /api/system/diagnostics`：连接池、缓存、地理库内部状态快照。

- **面向公网的健壮性设计**
  - 会话令牌（HMAC 签名 + 过期）仅经 `httpOnly` Cookie 下发，不回传响应体。
  - 登录接口独立限流，全局限流可按真实客户端 IP 计数（配合 `TRUST_PROXY`）。
  - 慢查询告警、优雅关闭超时兜底、`uncaughtException` / `unhandledRejection` 全程接管。
  - WebSocket 双向保活（ping/pong），半开连接自动剔除，订阅数不虚高。

---

## 接口一览

| 方法 | 路径 | 鉴权 | 说明 |
| :--- | :--- | :--- | :--- |
| POST | `/api/auth/login` | - | 登录（独立限流） |
| GET | `/api/auth/session` | - | 会话状态 |
| POST | `/api/auth/logout` | - | 登出 |
| GET | `/api/analytics/overview?range=` | 是 | 大屏概览聚合 |
| GET | `/api/analytics/dimensions?dimension=&range=&limit=` | 是 | 多维下钻分析 |
| GET | `/api/analytics/risks?range=` | 是 | 风控扫描报告 |
| GET | `/api/analytics/realtime` | 是 | 实时脉搏（HTTP 兜底） |
| WS | `/api/ws/realtime` | 是 | 实时推流通道 |
| GET | `/api/system/healthz` | - | 存活探针 |
| GET | `/api/system/readyz` | - | 就绪探针 |
| GET | `/api/system/metrics` | 内网/令牌 | Prometheus 指标 |
| GET | `/api/system/diagnostics` | 是 | 运行诊断快照 |

---

## 快速开始（Docker Compose）

### 1. 准备配置

```bash
mkdir -p new-pro && cd new-pro
curl -fsSLO https://raw.githubusercontent.com/Lei-rr/new-pro/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Lei-rr/new-pro/main/.env.example -o .env
```

编辑 `.env`，至少填写数据库连接与管理员凭据：

```bash
DATABASE_URL=postgresql://root:your_db_password@new-api-postgres:5432/new-api
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请替换为强密码
JWT_SECRET=请替换为随机字符串
```

生成随机密钥：`openssl rand -hex 32`

### 2. 启动

```bash
docker compose up -d
docker compose logs -f
```

### 3. 访问

浏览器打开 `http://<服务器IP>:3001`，使用 `.env` 中的管理员账号登录。

> 若通过域名或反向代理暴露到公网，请务必配置 HTTPS 并设置 `COOKIE_SECURE=true`。

---

## 环境变量

> 所有默认值均可被覆盖（优先级：进程环境变量 > `.env` > 各层内置默认值）。

| 变量名 | 必填 | 默认值 | 说明 |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **是** | - | NewAPI 的 PostgreSQL 连接串 |
| `DB_POOL_MAX` | 否 | `20` | 数据库连接池上限 |
| `ADMIN_USERNAME` | 否 | `admin` | 控制台登录用户名 |
| `ADMIN_PASSWORD` | 否 | `admin123` | 控制台登录密码（生产环境必须修改） |
| `JWT_SECRET` | 否 | 内置开发值 | 会话签名密钥（生产环境必须替换） |
| `SESSION_TTL_SEC` | 否 | `604800` | 会话有效期（秒） |
| `COOKIE_SECURE` | 否 | `false` | HTTPS 环境请设为 `true` |
| `HOST` / `PORT` | 否 | `0.0.0.0` / `3001` | 监听地址与端口 |
| `LOG_LEVEL` | 否 | `info` | 日志级别 `fatal`~`trace` / `silent` |
| `TRUST_PROXY` | 否 | `false` | 反向代理后设为 `true` 以获取真实客户端 IP |
| `CORS_ORIGINS` | 否 | - | 允许跨域的来源，逗号分隔；同源部署留空 |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | 否 | `600` / `1 minute` | 全局接口限流 |
| `LOGIN_RATE_LIMIT_MAX` | 否 | `10` | 登录接口单位窗口最大尝试次数 |
| `PULSE_INTERVAL_SEC` | 否 | `3` | WebSocket 实时推流间隔（秒） |
| `CALIBRATION_INTERVAL_SEC` | 否 | `60` | 大屏全量静默校准间隔（秒） |
| `OVERVIEW_CACHE_TTL_MS` | 否 | `4000` | 概览聚合缓存（毫秒） |
| `OVERVIEW_LONG_CACHE_TTL_MS` | 否 | `60000` | 3 天及以上区间的概览缓存（扫描全表，用更长 TTL 摊薄） |
| `DIMENSION_CACHE_TTL_MS` | 否 | `4000` | 多维分析缓存（毫秒） |
| `RISK_CACHE_TTL_MS` | 否 | `5000` | 风控扫描缓存（毫秒） |
| `DB_STATEMENT_TIMEOUT_MS` | 否 | `15000` | 单条 SQL 最长执行时间 |
| `SLOW_QUERY_WARN_MS` | 否 | `2000` | 慢查询告警阈值（毫秒） |
| `SHUTDOWN_TIMEOUT_MS` | 否 | `10000` | 优雅关闭最长等待时间 |
| `KNOWN_IP_LIST_LIMIT` | 否 | `2000` | 概览返回的已知 IP 上限 |
| `METRICS_TOKEN` | 否 | - | Prometheus 指标端点令牌；留空则仅内网可访问 |
| `GEO_OFFLINE_ENABLED` | 否 | `true` | 启用 ip2region 本地库（优先查询） |
| `GEO_ONLINE_ENABLED` | 否 | `true` | 本地库未命中时是否降级查询在线接口 |
| `GEO_ONLINE_DAILY_QUOTA` | 否 | `2000` | 在线查询每日上限，0 表示不限 |
| `GEO_LOOKUP_TIMEOUT_MS` | 否 | `1800` | 在线 IP 归属地查询超时（毫秒） |
| `GEO_CACHE_TTL_MS` | 否 | `604800000` | 归属地命中结果缓存时长（7 天） |
| `GEO_NEGATIVE_CACHE_TTL_MS` | 否 | `3600000` | 归属地未命中结果缓存时长（1 小时） |
| `INTERNAL_IP_LIST` | 否 | - | 风控豁免的额外 IP，逗号分隔 |
| `RISK_*` | 否 | 见 `.env.example` | 风控阈值微调项 |

---

## 本地开发

```bash
pnpm install

# 终端 1：后端（默认 3001，读取根目录 .env）
pnpm dev:server

# 终端 2：前端（默认 5173，/api 自动代理到后端）
pnpm dev:web
```

质量校验与构建：

```bash
pnpm typecheck   # 前后端类型检查
pnpm build       # 构建 dist/server.js 与 web/dist
pnpm start       # 运行生产产物
```

---

## 架构说明

```
src/
├── server.ts              # 进程入口：配置校验、优雅关闭、异常兜底
├── config.ts              # 环境变量解析与启动期体检
├── core/                  # 基础设施：Fastify 装配、数据库、缓存、鉴权、日志
├── modules/               # 业务模块（路由 + 服务/查询分层）
│   ├── auth/              # 登录会话
│   ├── analytics/         # 概览、多维分析、风控、实时脉搏
│   ├── realtime/          # WebSocket 通道
│   └── system/            # 健康检查
├── services/              # 跨模块能力：广播引擎、IP 归属地
└── shared/                # 无状态工具：SQL 片段、配额换算、错误码解析

web/src/
├── app/                   # 应用装配：路由、布局、全局样式
├── features/              # 业务特性：会话状态、大屏数据编排与实时累加
├── pages/                 # 页面与页面级组件
└── shared/                # 跨页面复用：API 客户端、UI 组件库、工具与组合式函数
```

**数据流**：PostgreSQL（NewAPI 只读）→ Fastify 聚合服务（TTL 缓存 + 并发合并）→ REST / WebSocket → Vue 大屏。浏览器仅读取聚合结果，不对生产库产生写入压力。

---

## 开源许可

本项目基于 [MIT License](LICENSE) 开源。
