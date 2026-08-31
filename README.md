# NewAPI Analytics (NewAPI 实时日志分析与风控平台)

专为 [NewAPI](https://github.com/QuantumNexus/NewAPI) / One API 量身打造的企业级实时大模型日志分析、多维聚合监控与智能风控告警平台。

---

## ✨ 核心特性

- ⚡ **实时日志摄取与流式解析**：毫秒级监听 NewAPI 日志目录，秒级双向关联 GIN 网关请求与消费计费记录。
- 📊 **企业级多维分析看板**：
  - **总览看板**：核心业务 KPI、LLM 效率胶囊（Prompt 缓存命中率、流式比例、首字延迟 FRT、取消中断率）、三合一分时复合趋势图、模型与租户分组 Token 环形占比。
  - **多维深度分析**：大模型、上游渠道（含故障归因）、分组租户 (Group)、客户端 IP、API Key 令牌、平台用户 6 大维度聚合透视与服务端分页。
  - **NewAPI 标杆日志检索**：支持多条件即时筛选、客户端 IP 与归属地解析、真实吐字速度（t/s）、Tokens 与费用拆解及 JSON 详情抽屉。
  - **智能告警与风控中心**：覆盖上游渠道熔断故障（503 账号池耗尽/404）、模型通道枯竭、恶意 IP 暴力扫描与防刷探测、大额异常单次调用。
- 🌍 **离线 IP 归属地精准解析**：内置高性能纯离线 IP 地理位置解析库，精准识别客户端国家、省份、城市与运营商。
- 🌓 **极致交互体验**：默认清新白色浅色主题，支持左下角与顶栏一键切换纯黑暗色主题；全屏响应式设计。
- 🔒 **轻量安全认证**：支持可选的 API Key 认证（HTTP Bearer / X-API-Key 与 WebSocket 统一校验）。

---

## 🚀 快速开始 (Docker Compose 推荐)

### 1. 准备配置文件

克隆仓库后，复制环境配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 中的 `LOG_PATH`，填入宿主机上的真实 NewAPI 日志目录路径：

```env
# 宿主机上 NewAPI 的日志目录（将被只读挂载到容器内的 /logs）
LOG_PATH=/guolei/new-api/logs

# 可选：设置访问密钥（多个用逗号分隔，留空表示不开启认证）
API_KEYS=
```

### 2. 启动服务

```bash
docker compose up -d --build
```

启动完成后，在浏览器中访问：**`http://localhost:3600`** 即可使用。

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

## ⚙️ 环境变量配置说明

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `3600` |
| `HOST` | 监听主机地址 | `0.0.0.0` |
| `LOG_PATH` | 宿主机日志绝对路径 (docker-compose 映射源) | `/guolei/new-api/logs` |
| `LOG_DIR` | 容器内或本地日志读取路径 | `/logs` (Docker) |
| `LOG_PATTERN` | 日志文件名匹配通配符 | `oneapi-*.log` |
| `API_KEYS` | 访问密钥（逗号分隔，留空不开启认证） | 留空 |
| `MAX_ENTRIES` | 内存中保留的最大消费记录数 | `500000` |
| `RETENTION_HOURS` | 聚合分时桶保留时长（小时） | `72` |

---

## 📄 开源许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
