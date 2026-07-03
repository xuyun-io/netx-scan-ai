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
go run ./cmd/server

# 启动前端（新终端）
cd agent-ui
npm install
npm run dev
```

前端开发服务器：`http://localhost:5173`  
后端 API：`http://127.0.0.1:8080`

### Docker 构建运行

```bash
cd agent-server
docker-compose up --build -d
```

服务暴露：`http://localhost:8080`

## 配置

首次启动后进入 Admin 页面创建 AgentSpace，并在环境变量中配置：

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
