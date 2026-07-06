# NetX SRE Agent Server

Go + Google ADK-Go v2 的后端骨架，按 `requirements.md` 的第一版范围实现：

- AWS FinOps 风格全 POST API
- 多 AgentSpace
- Conversation + Turn
- Task + Record 状态机
- Artifact 生成与读取
- Document / Context files 上传、列表、soft-delete
- 文本文件持久化（YAML / JSONL / 原始文件）
- all-in-one 单容器静态前端托管

当前 `createTurn` 主流程通过 ADK-Go v2 runner/session 执行 LLM Agent；`internal/agent.Service` 负责把 ADK 事件落到 Turn/Record/Artifact 状态机。

已接入第一版 Agent Skills 查询链路：ADK-Go v2 `SkillToolset` 从 `skills/` 发现 skill，`execute_skill_action` ADK FunctionTool 调用 `internal/skills.Runner` 按 `tools.yaml` 执行 skill action。`chain287-chain-query/latest_block` 通过 Foundry `cast block-number` 查询最新块高。

## 本地运行

```bash
cd netx-ai/agent-server
go test ./...
go run ./cmd/server
```

默认配置：

```text
NETX_HTTP_ADDR=:8080
NETX_DATA_DIR=./data/agents
NETX_WEB_DIST=./web/dist
NETX_SKILLS_DIR=./skills
GOOGLE_API_KEY=<Gemini API key, or configure per AgentSpace environment>
CHAIN287_RPC_URL=<Chain287 RPC endpoint>
```

也可以在创建 AgentSpace 时写入环境变量。它们会随该 AgentSpace 的 ADK model/tool 执行上下文注入，适合隔离不同根管理 Agent 的 `GOOGLE_API_KEY`、`GEMINI_API_KEY`、`CHAIN287_RPC_URL` 等配置。

如果要让 Go server 托管前端：

```bash
cd netx-ai/agent-ui
npm run build

cd ../agent-server
mkdir -p web/dist
cp -r ../agent-ui/dist/* web/dist/
go run ./cmd/server
```

Windows PowerShell 可用：

```powershell
cd netx-ai/agent-ui
npm run build

cd ..\agent-server
New-Item -ItemType Directory -Force web\dist | Out-Null
Copy-Item -Recurse -Force ..\agent-ui\dist\* web\dist
go run .\cmd\server
```

## API 示例

```bash
curl -X POST http://127.0.0.1:8080/api/v1/createAgentSpace \\
  -H 'content-type: application/json' \
  -d '{"name":"NetX Chain287 SRE","llm":{"provider":"gemini","model":"gemini-2.5-pro"},"environment":{"GOOGLE_API_KEY":"...","CHAIN287_RPC_URL":"https://your-chain287-rpc.example"}}'
```

异步接口：

- `POST /api/v1/createTurn` 返回 `202`
- `POST /api/v1/createTask` 返回 `202`
- 前端轮询 `getTurn` / `getTask`

## 数据目录

```text
{NETX_DATA_DIR}/{agentSpaceId}/
├── agent.yaml
├── conversations/{conversationId}/
│   ├── conversation.yaml
│   ├── turns.jsonl
│   └── records.jsonl
├── tasks/{taskId}/
│   ├── task.yaml
│   └── records.jsonl
├── documents/
│   ├── .meta/{documentId}.yaml
│   └── {documentId}-{filename}
├── artifacts/{artifactId}-{name}
├── memory/memories.jsonl
└── index/*.jsonl
```

## Docker

```bash
cd netx-ai
export CHAIN287_RPC_URL=https://your-chain287-rpc.example
docker compose up --build
```

访问 http://127.0.0.1:8080/

容器镜像会从 Foundry 官方镜像带入 `cast`，并把 `agent-server/skills` 只读挂载到 `/app/skills`，方便更新 skill 后直接重试。
