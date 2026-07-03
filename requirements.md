# NetX SRE Agent 统一需求文档

> 基于 `netx-ai/` 目录下所有分析文档整理，汇总已确认决策。
> 本文档是项目当前阶段的唯一需求来源。

---

## 一、项目定位

NetX SRE Agent 是一个面向 **NetX Chain287** 的 AI 运维助手，采用 **all-in-one 单容器**部署，包含：

- **管理功能**：创建/配置 Agent、管理上下文文件、查看任务历史
- **Agent 后端**：基于 Google ADK-Go v2 的 Task 调度、Tool 执行、LLM 编排
- **Web Agent UI**：基于 shadcn/ui + Tailwind CSS 的交互界面

核心目标：让运维人员通过自然语言完成链上/节点巡检、诊断、报告生成，并支持高危操作审批。

---

## 二、技术栈

| 层级 | 技术 |
|------|------|
| 后端语言/框架 | **Go + Google ADK-Go v2** |
| 前端框架 | React 18 + TypeScript + Vite |
| 前端组件/样式 | **shadcn/ui + Tailwind CSS + Radix UI** |
| 持久化 | **文本文件**（YAML/JSONL/Markdown） |
| 部署 | 单容器 Docker |
| 进程方案 | Go server 同时 serve API + 静态前端 |
| 第三方集成 | 企业微信群机器人 webhook |
| LLM | 创建 Agent 时指定，支持多模型切换 |

---

## 三、部署形态

### 3.1 all-in-one 单容器

一个 Docker 镜像包含：

- Agent 后端服务（Go）
- 前端静态文件（React build）
- 文本持久化数据（挂载 volume）

```text
┌─────────────────────────────────────┐
│         NetX SRE Agent 容器          │
│  ┌─────────────┐  ┌───────────────┐ │
│  │  React UI   │  │  Go Server    │ │
│  │  (静态文件)  │  │  (ADK-Go v2)  │ │
│  └──────┬──────┘  └───────┬───────┘ │
│         │                 │         │
│         └────────┬────────┘         │
│                  HTTP               │
│         ┌────────┴────────┐         │
│         ▼                 ▼         │
│  /data/agents/{agentSpaceId}/       │
│  (文本持久化，挂载到宿主机)           │
└─────────────────────────────────────┘
```

### 3.2 Docker 运行示例

```yaml
services:
  netx-sre-agent:
    image: netx-sre-agent:latest
    container_name: netx-sre-agent
    volumes:
      - ./data/agents:/data/agents
    ports:
      - "8080:8080"
    environment:
      - NETX_DATA_DIR=/data/agents
```

---

## 四、核心实体

```text
AgentSpace（Agent 工作空间）
    │
    ├── Conversation（会话）
    │       └── Turn（轮次）
    │
    ├── Task（任务）
    │       └── Record（执行记录）
    │
    ├── Artifact（产物）
    │
    └── Document（上下文文件 / Context files）
```

### 4.1 AgentSpace

- 每个 Agent 对应一个 AgentSpace。
- 创建 Agent 时生成唯一的 `agentSpaceId`。
- 每个 AgentSpace 拥有独立的目录、配置、凭证、历史。
- 支持多 AgentSpace（多 Agent）。

### 4.2 Conversation + Turn

- 聊天以 Conversation 组织。
- 每个 Conversation 包含多个 Turn。
- Turn 是用户与 Agent 的一次交互轮次。
- **并非每个 Turn 都会创建 Task**：
  - 简单问答：Agent 直接在当前 Turn 中回复，Turn 状态变为 COMPLETED。
  - 复杂执行：Agent 在 Turn 内部创建 Task，返回 `taskId`，前端展示 "已创建任务 #xxx"，用户可在 Tasks workspace 查看进度。
- Turn 的执行记录也写入 `records.jsonl`。

**示例**：
- 用户："现在链上块高多少？" → 直接回复，不创建 Task。
- 用户："帮我生成一份 validator 健康巡检报告" → 创建 Task，异步执行。

### 4.3 Task + Record

- Task 是持久化执行单元。
- Task 来源：
  - **On-demand**：用户从聊天或 Tasks workspace 创建。
  - **Scheduled**：定时触发（v2 实现）。
  - **Event-based**：事件触发（v2 实现）。
- Task 状态机：PENDING → IN_PROGRESS → COMPLETED / FAILED。
- 涉及 read-write 操作的 Task 进入 AWAITING_INPUT，等待 Web UI 审批后继续。
- Record 是 Task/Turn 执行过程的细粒度事件流。
- Record 类型：RESPONSE、TOOL_CALL、TOOL_RESULT、MEMORY_ACCESS、STATUS、ERROR。

### 4.4 Artifact

- Agent 生成的产物文件。
- **第一版支持格式**：Markdown、HTML、JSON、CSV、纯文本。
- **v2 支持**：PDF、PPT（需要额外库）。
- 平铺存储在 `/data/agents/{agentSpaceId}/artifacts/`。
- Task 通过 artifact IDs 引用产物。

### 4.5 Document（Context files）

- 用户上传的上下文文件，为 Agent 提供组织特定知识。
- 内部实体/API 称为 `document`，前端菜单显示为 "Context files"。

**典型用途**：

| 类型 | 作用 |
|------|------|
| 节点到团队/责任人映射 | 将节点归属到负责团队 |
| 链上部署架构 | 让 Agent 理解 chain287 拓扑 |
| 巡检规则/例外 | 定义忽略条件和优先级 |
| 报告模板 | 复用现有报告格式 |
| 自定义指令 | 每次运行都遵循的规则 |

**限制（第一版）**：

| 限制 | 值 |
|------|-----|
| 支持文件类型 | `.txt`, `.csv`, `.json`, `.md`, `.html`, `.yaml`, `.yml` |
| 单个文件最大 | 10 MB |
| 每个 Agent 总计 | 100 MB |

**行为**：
- Agent 对 Document **只读**，不能通过对话修改或删除。
- 支持 **soft-delete + restore**。
- 文件内容 Base64 编码上传，存储为原始文件。

---

## 五、持久化设计

### 5.1 原则

- 每个 AgentSpace 一个目录。
- 所有数据用文本文件存储（YAML/JSONL/Markdown）。
- 不引入 SQLite/PostgreSQL。
- Docker volume 挂载保证重启不丢失。

### 5.2 目录结构

```text
/data/agents/
├── {agentSpaceId-1}/
│   ├── agent.yaml                       # Agent 元数据 + LLM 配置 + 企业微信配置
│   │
│   ├── conversations/
│   │   └── {conversationId}/
│   │       ├── conversation.yaml        # 会话元数据
│   │       └── turns.jsonl              # 轮次历史
│   │
│   ├── tasks/
│   │   └── {taskId}/
│   │       ├── task.yaml                # 任务元数据
│   │       └── records.jsonl            # 执行记录流
│   │
│   ├── documents/                       # 上下文文件（原始文件）
│   │   ├── pod-list.json
│   │   └── chain287-runbook.md
│   │
│   ├── artifacts/                       # 产物文件（平铺）
│   │   ├── {artifactId}-daily-report.md
│   │   └── {artifactId}-node-status.json
│   │
│   ├── memory/
│   │   ├── memories.jsonl               # 记忆记录
│   │   └── index/                       # 可选向量索引
│   │
│   ├── credentials/                     # 凭证文件（明文 YAML，后续可加密）
│   │   └── rpc-credentials.yaml
│   │
│   ├── index/                           # 索引文件（加速列表查询）
│   │   ├── tasks.jsonl
│   │   ├── conversations.jsonl
│   │   └── documents.jsonl
│   │
│   ├── logs/
│   │   └── agent.log
│   │
│   └── tmp/                             # 临时文件
│
└── {agentSpaceId-2}/
    └── ...
```

### 5.3 文件格式

| 数据 | 格式 | 示例 |
|------|------|------|
| Agent / Task / Conversation 元数据 | YAML | `agent.yaml`、`task.yaml` |
| Turns / Records / Memories | JSONL | `turns.jsonl`、`records.jsonl` |
| Artifacts | MD / JSON / CSV / HTML | `xxx-report.md` |
| Documents | 原始格式 | `pod-list.json` |
| 索引 | JSONL | `index/tasks.jsonl` |
| 凭证 | YAML | `rpc-credentials.yaml` |

### 5.4 Memory 存储

- Memory 是 Agent 跨会话记住的用户偏好、修正和已知事实。
- 存储在 `/data/agents/{agentSpaceId}/memory/memories.jsonl`。
- 用户可以通过自然语言管理 memory：
  - "记住 data platform 团队拥有账户 123456789012"
  - "更新默认巡检时间范围为 24 小时"
  - "忘记我之前说的那个例外规则"

**Memory 内容示例**：

```jsonl
{"type":"preference","key":"default_time_range","value":"24h","source":"user","createdAt":"2026-07-01T10:00:00Z"}
{"type":"fact","key":"account_123_owner","value":"Data Platform / Jane Smith","source":"user","createdAt":"2026-07-01T10:05:00Z"}
{"type":"correction","key":"ignore_production_rightsizing","value":"true","source":"user","createdAt":"2026-07-01T10:10:00Z"}
```

### 5.5 索引文件

为加速列表查询，需要维护索引文件：

```text
/data/agents/{agentSpaceId}/index/
├── tasks.jsonl          # 每行一个 task 摘要
├── conversations.jsonl  # 每行一个 conversation 摘要
└── documents.jsonl      # 每行一个 document 摘要
```

索引文件在创建/更新/删除实体时同步更新。

---

## 六、API 设计规范

### 6.1 风格

采用 **AWS FinOps 风格**：

- 全部使用 **POST**
- URL 使用 **动词 + 名词**：`/createTask`、`/listTasks`、`/getTask`
- 资源 ID 放在请求 body 中
- 不使用 RESTful 路径参数

### 6.2 通用请求约定

- 几乎所有请求都需要 `agentSpaceId`。
- 创建类操作带 `clientToken` 保证幂等。
- 列表接口使用 `maxResults` + `nextToken` 游标分页。

### 6.3 通用响应约定

- 单资源返回 `{ "entity": { ... } }`。
- 列表返回 `{ "entities": [...], "nextToken": null }`。
- 字段命名 camelCase。
- 时间戳 RFC3339。

### 6.4 API 端点

#### AgentSpace 管理

| 端点 | 说明 |
|------|------|
| `POST /createAgentSpace` | 创建 Agent |
| `POST /listAgentSpaces` | 列出 Agent |
| `POST /getAgentSpace` | 获取 Agent 信息 |
| `POST /deleteAgentSpace` | 删除 Agent |

#### Conversation / Turn

| 端点 | 说明 |
|------|------|
| `POST /createConversation` | 创建会话 |
| `POST /listConversations` | 列出会话 |
| `POST /getConversation` | 获取会话 |
| `POST /createTurn` | 创建轮次（异步，202） |
| `POST /getTurn` | 获取轮次状态/结果 |

#### Task

| 端点 | 说明 |
|------|------|
| `POST /createTask` | 创建任务（异步，202） |
| `POST /getTask` | 获取任务状态 |
| `POST /listTasks` | 列出任务 |
| `POST /respondToTask` | 审批/响应任务（从 AWAITING_INPUT 继续） |

#### Record

| 端点 | 说明 |
|------|------|
| `POST /listRecords` | 列出执行记录 |

#### Artifact

| 端点 | 说明 |
|------|------|
| `POST /listArtifacts` | 列出产物 |
| `POST /getArtifact` | 获取产物（返回下载 URL 或内容） |

#### Document（Context files）

| 端点 | 说明 |
|------|------|
| `POST /createDocument` | 上传上下文文件（202） |
| `POST /listDocuments` | 列出上下文文件 |
| `POST /getDocument` | 获取上下文文件信息 |
| `POST /deleteDocument` | 删除上下文文件 |

---

## 七、事件推送与轮询

第一版采用 **轮询** 获取异步结果：

- `createTurn`、`createTask` 返回 202 Accepted。
- 前端轮询 `getTurn` / `getTask` 获取状态。
- 状态变为 COMPLETED / FAILED 后，调用 `listRecords` 展示结果。
- SSE/WebSocket 作为后续优化。

---

## 八、Task 状态机与审批

```text
PENDING
   │
   ▼
IN_PROGRESS
   │
   ├──► COMPLETED
   │
   ├──► FAILED
   │
   └──► AWAITING_INPUT ──► Web UI 审批 ──► IN_PROGRESS
```

### 8.1 动作分类

| 动作类型 | 示例 | 是否需要审批 |
|----------|------|-------------|
| **Read-only** | 查询块高、节点状态、日志、读取 context files/memory、生成报告 | 否 |
| **Read-write（低风险）** | 发送企业微信消息 | 否 |
| **Read-write（高风险）** | 重启节点、执行 SSM 命令、修改配置 | 是（仅 chat/on-demand） |

### 8.2 按 Task 类型的审批行为

| Task 类型 | Read-write 高风险动作 | 说明 |
|-----------|---------------------|------|
| **On-demand** | 需要 Web UI 审批 | 用户在 chat 或 Tasks workspace 创建 |
| **Scheduled / Event-based（v2）** | 预授权，无需每次审批 | 创建 automation 时一次性授权 |

### 8.3 审批流程

```text
Task 执行到 AWAITING_INPUT
    │
    ▼
Agent 发送企业微信审批提醒
    │
    ▼
管理员登录 Web UI 查看并确认
    │
    ▼
Task 状态变为 IN_PROGRESS，继续执行
```

### 8.4 预授权（v2）

- Automation 创建时可以勾选预授权某些 read-write 动作。
- 预授权后，该 automation 每次触发执行这些动作时无需审批。
- Task 模型中保留 `automationId` 和 `preAuthorized` 字段。

---

## 九、Quotas 与 Limits

| 限制 | 值 | 说明 |
|------|-----|------|
| 单个聊天消息长度 | 1,000 字符 | 与 FinOps 一致 |
| 单个 Context file 大小 | 10 MB | |
| 每个 Agent 的 Context files 总存储 | 100 MB | |
| 每个 Agent 的 Artifacts 总存储 | 100 MB | |
| 每个 Agent 的 Conversation 数量 | 无硬性限制 | 由存储决定 |
| 每个 Agent 同时运行的 Task 数量 | 10 | 可配置 |

---

## 十、Web 应用认证

第一版采用**内网登录**方案：

- **默认**：部署在内网，无需登录即可访问（适合私有部署）。
- **可选**：通过环境变量配置简单 token 或 basic auth，作为额外保护。
- **v2**：增加用户登录和 session 管理。

> 不采用 AWS Console session 认证，因为 NetX 是独立容器部署。

---

## 十一、领域约束与语言

- Agent 被约束在 **NetX Chain287 SRE 运维领域**。
- 对于非 SRE/chain 相关问题，礼貌拒绝并引导用户。
- 第一版默认语言为 **中文**（用户界面和 Agent 输出均为中文），后续支持英文。
- Root prompt 中明确领域边界和输出语言。

---

## 十二、数据删除策略

| 数据类型 | 删除方式 | 说明 |
|----------|---------|------|
| Context files | soft-delete + restore | 删除后标记为 INACTIVE，可恢复 |
| Artifacts | 硬删除 | 从 artifacts/ 目录和索引中移除 |
| Conversations | 硬删除 | 第一版允许删除单个 conversation |
| Tasks | 硬删除 | 第一版允许删除单个 task |
| AgentSpace | 硬删除 | 删除整个 `/data/agents/{agentSpaceId}/` 目录 |

---

## 十三、企业微信集成

- 唯一第三方集成通道。
- 仅支持群机器人 webhook URL。
- Agent 通过 POST 发送 markdown/文本消息。

### 13.1 使用场景

| 场景 | 示例 |
|------|------|
| 告警通知 | "Validator-01 10 分钟未出块" |
| 结果推送 | "每日巡检完成，发现 2 个风险点" |
| 审批提醒 | "任务 #123 等待审批，请登录 Web UI 处理" |

> 企业微信仅作为通知渠道，**不支持在企业微信中直接审批**。所有审批必须回到 Web UI 完成。

### 13.2 配置

```yaml
# agent.yaml
integrations:
  wecom:
    enabled: true
    webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
```

---

## 十四、LLM 配置

- 在创建 Agent 时指定 LLM。
- 每个 AgentSpace 独立绑定一个 LLM 配置。
- 支持多模型切换（Gemini、Claude、OpenAI-compatible 等）。

```yaml
# agent.yaml
llm:
  provider: gemini
  model: gemini-2.5-pro
  apiKey: "${GEMINI_API_KEY}"
  baseUrl: ""  # 可选，用于兼容 OpenAI-compatible 服务
```

---

## 十五、安全模型

| 原则 | 说明 |
|------|------|
| 默认只读 | Agent 后端默认只读访问链/节点/日志 |
| 权限分离 | Agent 执行凭证 vs Web/App 操作凭证分离 |
| 审批机制 | 高危 read-write 操作在 chat/on-demand 中需 Web UI 审批；automation 可预授权 |
| 数据隔离 | 每个 AgentSpace 独立目录，互不访问 |
| 凭证明文 | 第一版明文 YAML，后续按需加密 |

---

## 十六、第一版范围

### 16.1 包含

- [x] all-in-one 单容器部署
- [x] 多 AgentSpace 管理
- [x] Conversation + Turn 聊天
- [x] Task 创建、执行、状态查询
- [x] Record 执行记录
- [x] Artifact 产物生成与下载
- [x] Document / Context files 上传与管理
- [x] 高危操作审批（Web UI）
- [x] 企业微信 webhook 通知
- [x] 文本文件持久化

### 16.2 不包含（后续版本）

- [ ] Automation（定时/事件触发任务）
- [ ] SSE/WebSocket 实时推送
- [ ] 凭证加密
- [ ] 向量检索/RAG（memory 先保留接口）
- [ ] 多用户权限管理（第一版单管理员）
- [ ] 长会话自动摘要
- [ ] Artifact 生成后 QA pass

---

## 十七、目录结构（项目代码）

```text
netx-ai/
├── agent-ui/                    # React + shadcn/ui 前端
│   └── ...
│
├── agent-server/                # Go + ADK-Go v2 后端
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── agent/               # Root Agent 编排
│   │   ├── api/                 # HTTP API（全 POST）
│   │   ├── business/
│   │   │   └── sre/             # SRE 业务 tools/prompts
│   │   ├── conversation/        # Conversation + Turn 管理
│   │   ├── document/            # Context files 管理
│   │   ├── events/              # 事件/通知（企业微信）
│   │   ├── store/               # 文本文件存储（FileStore）
│   │   ├── task/                # Task + Record + 状态机
│   │   └── tools/               # 通用 Tool 框架
│   ├── pkg/
│   ├── web/dist/                # 前端构建产物
│   ├── Dockerfile
│   └── docker-compose.yml
│
├── docs/
│   ├── requirements.md          # 本文档
│   ├── finops-api-analysis.md   # FinOps API 参考
│   ├── aws-finops-agent-analysis.md # FinOps 产品参考
│   ├── finops-agent-creation-analysis.md # 创建流程参考
│   ├── adk-framework-design.md  # 框架设计（待按本文档修正）
│   ├── finops-official-features-analysis.md # 官方功能分析
│   ├── design-issues.md         # 分歧记录与决策
│   └── codex-chat-prompt.md     # Codex 聊天提示词
│
└── data/agents/                 # 运行时持久化数据
```

---

## 十八、关键结论

1. NetX SRE Agent 是 **all-in-one 单容器** 部署的链上/节点运维助手。
2. 后端使用 **Go + ADK-Go v2**，前端使用 **shadcn/ui + Tailwind**。
3. 持久化采用 **文本文件**，每个 AgentSpace 一个目录。
4. API 采用 **AWS FinOps 全 POST 风格**。
5. 第一版支持 **多 AgentSpace、Conversation + Turn、Task + Record、Artifact、Document**。
6. **并非每个 Turn 都创建 Task**：简单问答直接回复，复杂执行才创建 Task。
7. 审批模型按动作和 Task 类型细分：read-only 全放行，企业微信发送不审批，高危写操作在 chat/on-demand 中需审批，automation 可预授权。
8. 第三方集成仅支持 **企业微信群机器人 webhook**。
9. Context files 有文件类型、大小限制，支持 soft-delete，Agent 只读。
10. Memory 是跨会话的用户偏好/修正/事实记忆，可通过自然语言管理。
11. **Automation、SSE、凭证加密、RAG、长会话自动摘要、PDF/PPT Artifact** 等放到后续版本。
