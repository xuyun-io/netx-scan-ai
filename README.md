# NetX SRE Agent

面向 NetX Chain287 的 AI 运维助手，all-in-one 单容器部署。

- **后端**：Go + Google ADK-Go v2
- **前端**：React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **持久化**：文本文件（YAML/JSONL/Markdown）
- **部署**：单容器 Docker

## 快速开始

### 本地开发

```bash
# 启动后端
cd agent-server
go run .

# 启动前端（新终端）
cd agent-ui
npm install
npm run dev
```

前端开发服务器：`http://localhost:5173`  
后端 API：`http://127.0.0.1:8080`

### Docker 构建运行

先复制并编辑配置文件：

```bash
cp agent-server/config/app.yaml.example agent-server/config/app.yaml
# 本地开发保持 path.root: .
# Docker 部署时改为 path.root: /app，并配置 publicURL、auth 等
```

然后启动：

```bash
docker-compose up --build -d
```

服务暴露：`http://localhost:8080`

生产部署时请把 `config/app.yaml` 中的 `publicURL` 改成企业微信接收人可访问的域名或内网地址。

## 配置

所有服务端运行配置集中到 `agent-server/config/app.yaml`。复制示例文件并修改：

```bash
cp agent-server/config/app.yaml.example agent-server/config/app.yaml
```

### 服务端配置项

| 配置项 | 说明 | 默认值 |
|---|---|---|
| `httpAddr` | HTTP 监听地址 | `:8080` |
| `path.root` | 基础路径，其他相对路径都基于它解析 | `.` |
| `path.agents` | AgentSpace 文本数据目录（相对或绝对路径） | `data/agents` |
| `path.web` | 前端静态文件目录（相对或绝对路径） | `web/dist` |
| `path.skills` | Skill 脚本目录（相对或绝对路径） | `skills` |
| `publicURL` | 用户可访问的 Web UI 外部地址，例如 `https://netx-agent.example.com`。企业微信通知会用它生成任务详情链接；如果不配置，通知里不会出现可点击入口 | 空 |
| `logLevel` | 后端日志级别：`debug` / `info` / `warn` / `error` | `info` |
| `logFormat` | 后端日志格式：`json` / `console` | `json` |
| `auth.username` / `auth.password` | Basic Auth 登录凭据（均非空时启用登录） | 空 |

示例：

```yaml
httpAddr: :8080
path:
  root: .
  agents: data/agents
  web: web/dist
  skills: skills
publicURL: ""
logLevel: info
logFormat: json

auth:
  username: admin
  password: your-strong-password
```

启用 `auth` 后，所有 `/api/v1/*` 接口（除 `/api/v1/login` 用于校验）以及前端页面都需要登录。未配置 `auth` 时，系统不启用登录，与之前行为一致。

`publicURL` 必须填写企业微信接收人能够访问的地址，不要使用容器内部地址。常见示例：

```yaml
publicURL: https://netx-agent.example.com
publicURL: http://10.0.1.20:8080
```

配置后，自动化完成通知会包含类似：

```text
查看任务: 打开任务详情
```

点击后进入 `/{agentSpaceName}/#/task/{taskId}`，可以查看任务记录和 Artifacts 产物。

### Agent/Skill 执行环境变量

首次启动后进入 Admin 页面创建 AgentSpace，并在 AgentSpace 环境变量中配置：

| 环境变量 | 说明 |
|---|---|
| `CHAIN287_RPC_URL` | Chain287 RPC 节点地址 |
| `ETH_RPC_URL` | 兼容 Ethereum RPC 地址（fallback） |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Gemini LLM API Key |

## 项目结构

```text
netx-ai/
├── agent-server/      # Go 后端
├── agent-ui/          # React 前端
├── docs/              # 设计文档与需求
└── README.md          # 本文件
```

## 文档

详细设计、需求与参考分析见 [docs/](docs/)。
