# new-pro (NewAPI 实时日志分析与智能风控平台)

专为 [NewAPI](https://github.com/QuantumNexus/NewAPI) / One API 量身打造的企业级实时大模型日志分析、多维聚合监控与智能风控告警平台。

---

## ✨ 核心特性

- ⚡ **实时日志监听与流式解析**：毫秒级监听 NewAPI 日志目录，自动双向关联 GIN 网关请求与消费计费记录。
- 📊 **企业级多维看板**：
  - **总览看板**：核心业务 KPI、LLM 效率指标（Prompt 缓存命中率、流式比例、首字延迟 FRT、取消中断率）、分时复合趋势图、模型与租户分组 Token 环形占比、Top 渠道健康度、Top IP 来源与安全画像。
  - **多维深度分析**：模型、渠道（含 503/500/404 故障归因）、分组租户 (Group)、客户端 IP（含物理归属地）、API Key 令牌、平台用户 6 大维度聚合透视与服务端分页。
  - **NewAPI 标杆日志检索**：多条件即时筛选、客户端 IP 与归属地解析、真实吐字速度（t/s）、Tokens 与费用拆解及 JSON 详情抽屉。
  - **智能告警与风控中心**：覆盖上游渠道熔断故障（503 账号池耗尽/404）、模型通道枯竭、恶意 IP 暴力扫描与防刷探测、大额异常单次调用。
- 🌍 **离线 IP 归属地精准解析**：内置高性能纯离线 IP 地理位置解析库，精准识别客户端国家、省份、城市与运营商。
- 🌓 **双主题切换**：默认白色浅色主题，支持一键切换暗色主题；全屏响应式设计。
- 🔒 **轻量安全认证**：支持可选的 API Key 认证（HTTP Bearer / X-API-Key 与 WebSocket 统一校验）。

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

> **API 约定**：REST 接口挂载在 `/api/v1/*`（旧 `/api/*` 前缀保留兼容）；健康探针 `/api/v1/health/live`（存活）与 `/api/v1/health/ready`（就绪，历史日志加载完成前返回 503）；Prometheus 指标 `/api/v1/metrics`；WebSocket 入口 `/ws`（API Key 优先通过子协议 `api_key.<token>` 传递）。摄入进度持久化在 `CHECKPOINT_PATH`（默认 `./data/checkpoint.json`，容器内为 `/app/data` 卷），重启后增量恢复，不再全量重放历史日志。

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
