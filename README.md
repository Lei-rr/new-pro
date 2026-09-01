# new-pro (NewAPI 实时日志分析与智能风控平台)

专为 [NewAPI](https://github.com/QuantumNexus/NewAPI) / One API 量身打造的企业级实时大模型日志分析、多维聚合监控与智能风控告警平台。

---

## ✨ 核心特性

- ⚡ **实时日志监听与流式解析**：毫秒级监听 NewAPI 日志目录，自动双向关联 GIN 网关请求与消费计费记录。
- 📊 **现代化企业级控制台**（Vite + Vue3 + Tailwind v4 + shadcn-vue）：
  - **总览**：核心 KPI（含环比）、请求/错误复合趋势图、Top 模型榜、实时日志流。
  - **实时日志**：模型/渠道/用户筛选（候选值下拉）、桌面表格 / 移动卡片自适应、详情抽屉（Tokens、成本、倍率、FRT 全字段）。
  - **维度分析**：模型 / 渠道 / 令牌 / 用户 / IP / 分组 6 大维度 Tab、Top10 条形图、多指标排序与服务端分页。
  - **成本分析**：总/今日成本、日均价、30 日趋势、Token 与模型消耗 Top 榜。
  - **告警中心**：严重度筛选、实时告警推送（WS）。
- 🌓 **双主题 + 响应式**：亮/暗一键切换（跟随系统偏好），桌面侧栏 / 移动抽屉导航。
- 🛡️ **安全基线**：可选 API Key 认证（Bearer / X-API-Key / WS 子协议）、CORS 白名单、Helmet 安全头、每 IP 限流、5xx 错误掩码。
- 📡 **可观测性**：Prometheus `/metrics`、liveness/readiness 分离探针、结构化 JSON 日志（URL 脱敏）。
- 🌍 **离线 IP 归属地精准解析**：内置高性能纯离线 IP 地理位置解析库，精准识别客户端国家、省份、城市与运营商。

---

## 🚀 快速开始 (Docker Compose 推荐)

### 1. 准备环境配置

克隆仓库后，复制环境配置文件：

```bash
cp .env.example .env
```

在 `.env` 中设置宿主机上的 NewAPI 日志目录路径：

```env
# 宿主机上 NewAPI 的日志目录（直接只读挂载到容器的 /logs）
LOG_PATH=/guolei/new-api/logs

# 可选：设置访问密钥（多个用逗号分隔，留空表示不开启认证）
API_KEYS=

# 日志源服务器时区（'local' 或 IANA 时区名，如 Asia/Shanghai）
LOG_TZ=local

# CORS 允许来源（逗号分隔；留空 = 仅同源）
CORS_ORIGINS=
```

### 2. 启动服务

```bash
docker compose up -d --build
```

启动完成后，在浏览器中访问：**`http://localhost:3600`** 即可使用。

> **API 约定**：REST 接口挂载在 `/api/v1/*`（旧 `/api/*` 前缀保留兼容）；健康探针 `/api/v1/health/live`（存活）与 `/api/v1/health/ready`（就绪，历史日志加载完成前返回 503）；Prometheus 指标 `/api/v1/metrics`；WebSocket 入口 `/ws`（API Key 优先通过子协议 `api_key.<token>` 传递）。

---

## 🛠️ 本地开发环境启动

### 环境要求
- Node.js >= 20.0.0
- pnpm >= 9.0.0

### 后端服务
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev
```

### 前端开发
```bash
cd web

# 安装前端依赖
pnpm install --ignore-workspace

# 启动前端开发调试（自动代理至 3600 后端）
pnpm run dev
```

---

## 📄 开源许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
