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
go run .
```

默认配置在 `config/app.yaml.example` 中，复制后使用：

```bash
cp config/app.yaml.example config/app.yaml
```

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
```

`publicURL` 是 Go 后端应用级配置，不属于任何 AgentSpace。它用于生成企业微信通知中的 Web UI 深链接，例如：

```yaml
publicURL: https://netx-agent.example.com
publicURL: http://10.0.1.20:8080
```

配置后，自动化结果和审批提醒会包含 `/{agentSpaceName}/#/task/{taskId}` 任务详情链接，接收人可以直接查看 Task 记录和 Artifacts。该地址必须是企业微信接收人能访问的公网或内网地址；不要填写容器内部地址。

运行日志使用结构化 JSON 输出，适合容器日志采集和检索：

```yaml
logFormat: json   # json 或 console
logLevel: info    # debug、info、warn、error
```

当前会记录服务启动/停止、HTTP 请求、自动化注册与触发、任务执行结果、企业微信通知发送状态等关键运行事件。日志只记录运行诊断字段，不记录 API Key、企业微信 webhook 或完整任务指令。

Agent/Skill 执行环境变量可以在进程环境中配置，也可以按 AgentSpace 单独配置：

```text
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
go run .
```

Windows PowerShell 可用：

```powershell
cd netx-ai/agent-ui
npm run build

cd ..\agent-server
New-Item -ItemType Directory -Force web\dist | Out-Null
Copy-Item -Recurse -Force ..\agent-ui\dist\* web\dist
go run .
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
{dataDir}/{agentSpaceName}/
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
# 编辑 agent-server/config/app.yaml，容器内工作目录为 /app，建议：
#   path:
#     root: /app
#     agents: data/agents
#     web: web/dist
#     skills: skills
# 同时配置 publicURL、auth、AgentSpace 环境变量等
docker compose up --build
```

访问 http://127.0.0.1:8080/

容器镜像会从 Foundry 官方镜像带入 `cast`，并把 `agent-server/skills` 只读挂载到 `/app/skills`，方便更新 skill 后直接重试。
