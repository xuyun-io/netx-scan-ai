# NetX Agent 后端框架设计（ADK-Go v2）

> ⚠️ **本文档是技术框架设计草案，已按 `requirements.md` 统一决策修正。最终需求以 `requirements.md` 为准。**
>
> 目标：先搭通用框架，不深入业务；预留业务扩展包空间，使该 Agent 可被任意业务复用。
> 技术栈：**Google ADK-Go v2** + **React + shadcn/ui + Tailwind CSS 前端** + **单容器 Docker 部署**
>
> 统一决策：全 POST API、文本文件持久化、多 AgentSpace、Conversation+Turn、Record 模型。

---

## 一、AWS FinOps Agent 的 Task 实现方案分析

### 1.1 Task 是什么？

在 FinOps Agent 中，**Task 是用户意图的持久化执行单元**。用户说一句自然语言，Agent 不是立刻在聊天框里跑完，而是：

1. 把自然语言解析成一个 **Task 定义**
2. 把 Task 持久化到数据库/队列
3. 异步执行
4. 前端通过 Task 列表查看进度、结果、产物

### 1.2 Task 状态机

从 UI 截图可见的状态：

```
        ┌─────────────────┐
        │    pending      │  待执行（刚创建）
        └────────┬────────┘
                 ▼
        ┌─────────────────┐
        │ awaiting_approval│  需要人工审批（高风险操作）
        └────────┬────────┘
                 │ 用户批准
                 ▼
        ┌─────────────────┐
        │   in_progress   │  执行中
        └────────┬────────┘
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│  completed  │     │   failed    │
└─────────────┘     └─────────────┘
```

### 1.3 Task 与 Automation 的区别

| 维度 | Task | Automation |
|------|------|------------|
| 触发 | 用户即时创建 | 定时 / 事件触发 |
| 生命周期 | 一次执行，结束后归档 | 长期存在，反复触发 |
| 审批 | 可以 | 配置后触发 Task 时审批 |
| 产物 | 生成 Artifacts | 生成 Artifacts |
| 例子 | "查一下 v4 为什么不出块" | "每小时检查一次 validator 健康" |

### 1.4 Task 执行流程

```
用户输入
   │
   ▼
Intent Parser（LLM）
   │
   ▼
生成 Task 对象
   │
   ├── 需要审批？ → awaiting_approval → 用户审批 → in_progress
   └── 不需要审批 → in_progress
   │
   ▼
Agent 编排 Tools 执行
   │
   ▼
更新 Task 状态（completed / failed）
   │
   ▼
生成 Artifacts
   │
   ▼
推送结果到前端（轮询，SSE 后续优化）
```

### 1.5 关键设计点

1. **异步执行**：Task 不能阻塞聊天响应，要立即返回"已创建 Task #123"
2. **可观测**：执行过程中前端能看到进度、中间日志
3. **产物中心**：报告/文件统一放 Artifacts
4. **审批安全**：涉及写操作/资金/配置的 Task 必须人工确认
5. **幂等重试**：失败后可以重跑，避免重复副作用

---

## 二、ADK-Go v2 关键特性（框架设计依据）

ADK-Go v2 两大核心变化：

### 2.1 Workflow Runtime（图执行引擎）

v2 把 Agent、Tool、Function 都看作 **workflow graph 中的 node**，而不是 v1 的层级执行器。

```
START ──► intent_parser ──► planner ──► tool_a ──► tool_b ──► END
                              │
                              ▼
                           tool_c
```

对 NetX Agent 的意义：
- Task 的执行过程就是一个 workflow graph
- 每个 Tool 是一个 node
- 可以可视化、可追踪、可重放

### 2.2 Task API（三种委托模式）

| 模式 | 用途 | NetX 对应 |
|------|------|----------|
| **Chat mode** | 子 Agent 可与用户交互，完成后返回 | 复杂诊断，需要多轮确认 |
| **Task mode** | 子 Agent 执行一个任务，自动返回父 Agent | 大多数 SRE 运维任务 |
| **Single-turn mode** | 子 Agent 只处理一次输入输出，可并行 | 批量查询、并行检查多个节点 |

### 2.3 核心包

```
google.golang.org/adk/v2
├── agent/      # Agent 定义
├── runner/     # Agent 运行时
├── server/     # REST/A2A 服务暴露
├── tool/       # Tool 接口
├── session/    # 会话状态
└── workflow/   # Workflow graph
```

---

## 三、通用框架目录结构

```
netx-ai/
├── agent-ui/                    # React + shadcn/ui + Tailwind CSS 前端（已有）
│   └── ...
│
├── agent-server/                # ADK-Go v2 后端
│   ├── cmd/
│   │   └── server/
│   │       └── main.go          # 入口：启动 HTTP + Agent Runner
│   │
│   ├── internal/
│   │   ├── agent/               # 通用 Agent 编排
│   │   │   ├── root.go          # Root Agent 定义
│   │   │   ├── planner.go       # 任务规划器
│   │   │   └── callbacks.go     # 生命周期回调
│   │   │
│   │   ├── task/                # Task 调度与状态机（核心）
│   │   │   ├── model.go         # Task 实体定义
│   │   │   ├── store.go         # Task 存储接口
│   │   │   ├── memory_store.go  # 内存实现（开发用）
│   │   │   ├── scheduler.go     # Task 调度器
│   │   │   └── state_machine.go # 状态转换逻辑
│   │   │
│   │   ├── tools/               # 通用工具注册框架
│   │   │   ├── registry.go      # Tool Registry
│   │   │   ├── base.go          # Tool 基础接口
│   │   │   └── executor.go      # Tool 执行器
│   │   │
│   │   ├── business/            # 业务扩展包（预留空包）
│   │   │   ├── sre/             # NetX SRE 业务实现
│   │   │   │   ├── tools/       # SRE 专用 tools
│   │   │   │   ├── prompts/     # SRE 专用 prompts
│   │   │   │   └── handlers/    # SRE 专用 handlers
│   │   │   │
│   │   │   └── finops/          # FinOps 业务实现（示例）
│   │   │       ├── tools/
│   │   │       ├── prompts/
│   │   │       └── handlers/
│   │   │
│   │   ├── api/                 # HTTP API（全 POST，AWS FinOps 风格）
│   │   │   ├── server.go        # HTTP server 初始化
│   │   │   ├── agent_space.go   # AgentSpace 管理
│   │   │   ├── conversation.go  # Conversation + Turn
│   │   │   ├── task.go          # Task CRUD + 审批
│   │   │   ├── record.go        # 执行记录
│   │   │   ├── artifact.go      # 产物接口
│   │   │   └── document.go      # 上下文文件接口
│   │   │
│   │   ├── conversation/        # Conversation + Turn 管理
│   │   │   ├── model.go
│   │   │   └── store.go
│   │   │
│   │   ├── document/            # Context files 管理
│   │   │   ├── model.go
│   │   │   └── store.go
│   │   │
│   │   ├── store/               # 通用存储接口
│   │   │   ├── interfaces.go
│   │   │   ├── file_store.go    # 文本文件实现（默认）
│   │   │   └── memory.go        # 内存实现（测试用）
│   │   │
│   │   ├── events/              # 事件通知（企业微信 webhook / 轮询状态变更）
│   │   │   ├── notifier.go
│   │   │   └── bus.go
│   │   │
│   │   └── config/              # 配置
│   │       └── config.go
│   │
│   ├── pkg/                     # 可复用公共库
│   │   └── logger/
│   │
│   ├── web/                     # 构建后的前端静态文件
│   │   └── dist/
│   │
│   ├── go.mod
│   └── go.sum
│
├── Dockerfile                   # 单容器多阶段构建
├── docker-compose.yml           # 容器编排
└── docs/
    └── architecture.md
```

---

## 三、AgentSpace 与 Conversation 设计

### 3.1 AgentSpace

- 每个 Agent 对应一个 `AgentSpace`，拥有唯一的 `agentSpaceId`。
- 创建 Agent 时指定 LLM 配置、企业微信 webhook 等。
- 每个 AgentSpace 数据隔离，存储在独立的文件目录中。
- API 中 `agentSpaceId` 放在请求 body 中，不体现在 URL 路径。

### 3.2 Conversation + Turn

- 聊天以 `Conversation` 组织，每个 Conversation 包含多个 `Turn`。
- Turn 是用户与 Agent 的一次交互轮次。
- Turn 可以触发 Task（复杂执行），也可以直接返回响应。
- Conversation 和 Turn 历史以 JSONL 文本文件持久化。

```go
package conversation

type Conversation struct {
    ID            string    `json:"id"`
    AgentSpaceID  string    `json:"agentSpaceId"`
    Title         string    `json:"title"`
    CreatedAt     time.Time `json:"createdAt"`
    UpdatedAt     time.Time `json:"updatedAt"`
}

type Turn struct {
    ID              string    `json:"id"`
    ConversationID  string    `json:"conversationId"`
    AgentSpaceID    string    `json:"agentSpaceId"`
    Status          string    `json:"status"`       // IN_PROGRESS / COMPLETED / FAILED
    Prompt          string    `json:"prompt"`
    TaskID          string    `json:"taskId,omitempty"`
    CreatedAt       time.Time `json:"createdAt"`
    UpdatedAt       time.Time `json:"updatedAt"`
}
```

---

## 四、Task 核心设计

### 4.1 Task 模型

```go
package task

type Status string

const (
    StatusPending           Status = "pending"
    StatusAwaitingApproval  Status = "awaiting_approval"
    StatusInProgress        Status = "in_progress"
    StatusCompleted         Status = "completed"
    StatusFailed            Status = "failed"
    StatusCancelled         Status = "cancelled"
)

type Task struct {
    ID            string                 `json:"id"`
    Name          string                 `json:"name"`
    Description   string                 `json:"description"`
    Status        Status                 `json:"status"`
    Priority      string                 `json:"priority"`
    Type          string                 `json:"type"`          // e.g. "monitoring", "diagnosis", "remediation"
    Source        string                 `json:"source"`        // "chat", "manual", "scheduled", "event"
    AutomationID  string                 `json:"automation_id,omitempty"`
    
    Instruction   string                 `json:"instruction"`   // 给 Agent 的原始指令
    Input         map[string]any         `json:"input"`
    Output        map[string]any         `json:"output"`
    Artifacts     []string               `json:"artifacts"`
    RequiresApproval bool                `json:"requires_approval"`
    PreAuthorized bool                   `json:"pre_authorized"` // automation 中预授权，跳过审批
    
    Records       []string               `json:"records"`     // 关联的 record IDs
    ApprovedBy    string                 `json:"approved_by,omitempty"`
    ApprovedAt    *time.Time             `json:"approved_at,omitempty"`
    
    CreatedAt     time.Time              `json:"created_at"`
    UpdatedAt     time.Time              `json:"updated_at"`
    StartedAt     *time.Time             `json:"started_at,omitempty"`
    CompletedAt   *time.Time             `json:"completed_at,omitempty"`
}

type Record struct {
    ID        string    `json:"id"`
    TaskID    string    `json:"taskId,omitempty"`
    TurnID    string    `json:"turnId,omitempty"`
    Type      string    `json:"type"`      // RESPONSE, TOOL_CALL, TOOL_RESULT, MEMORY_ACCESS, STATUS, ERROR
    Content   string    `json:"content"`
    Metadata  map[string]any `json:"metadata,omitempty"`
    CreatedAt time.Time `json:"createdAt"`
}
```

### 4.2 Task Store 接口

```go
package task

type Store interface {
    Create(ctx context.Context, agentSpaceID string, t *Task) error
    Get(ctx context.Context, agentSpaceID string, id string) (*Task, error)
    List(ctx context.Context, agentSpaceID string, filter Filter) ([]*Task, error)
    Update(ctx context.Context, agentSpaceID string, t *Task) error
    UpdateStatus(ctx context.Context, agentSpaceID string, id string, status Status) error
    Delete(ctx context.Context, agentSpaceID string, id string) error
}
```

> 第一版默认实现为 **FileStore**，数据以 YAML/JSONL 文本文件存储在 `/data/agents/{agentSpaceId}/`。PostgreSQL 作为后续可选扩展。

### 4.3 Task Scheduler

```go
package task

// Scheduler 负责把 Task 分配给 Agent 执行
type Scheduler interface {
    Submit(ctx context.Context, task *Task) error
    Approve(ctx context.Context, taskID, userID string) error
    Cancel(ctx context.Context, taskID string) error
}
```

### 4.4 Task 执行流程

```go
func (s *scheduler) Submit(ctx context.Context, t *Task) error {
    if t.RequiresApproval {
        return s.setStatus(t.ID, StatusAwaitingApproval)
    }
    
    return s.execute(ctx, t)
}

func (s *scheduler) execute(ctx context.Context, t *Task) error {
    s.setStatus(t.ID, StatusInProgress)
    
    // 1. 构建 workflow graph
    workflow := s.planner.Plan(t)
    
    // 2. 运行 Agent
    events := s.runner.Run(ctx, workflow, t.Input)
    
    // 3. 收集结果，生成 Records
    for event := range events {
        s.appendRecord(agentSpaceID, t.ID, event)
    }
    
    // 4. 更新状态
    if success {
        s.setStatus(t.ID, StatusCompleted)
    } else {
        s.setStatus(t.ID, StatusFailed)
    }
    
    return nil
}
```

---

## 五、通用 Tool 框架

### 5.1 Tool 接口

```go
package tools

type Tool interface {
    Name() string
    Description() string
    Schema() ToolSchema
    Execute(ctx context.Context, input map[string]any) (any, error)
}

type Registry interface {
    Register(tool Tool) error
    Get(name string) (Tool, bool)
    List() []Tool
}
```

### 5.2 业务 Tool 注册示例

```go
// internal/business/sre/tools/node_health.go
package sretools

func Register(registry tools.Registry) {
    registry.Register(&NodeHealthTool{})
    registry.Register(&BlockHeightTool{})
    registry.Register(&LogAnalyzerTool{})
}
```

### 5.3 Root Agent 动态发现 Tool

```go
// internal/agent/root.go
func NewRootAgent(registry tools.Registry) *agent.Agent {
    return agent.NewLLMAgent("netx_root",
        agent.WithInstruction(rootPrompt),
        agent.WithTools(convertToADKTools(registry.List())...),
    )
}
```

---

## 六、单容器 Docker 打包方案

### 6.1 为什么单容器？

- 简化部署：一个镜像跑整个 Agent UI + Server
- 适合内部工具/私有部署
- 前后端通过 localhost 通信

### 6.2 多阶段 Dockerfile

```dockerfile
# ===== Stage 1: Build frontend =====
FROM node:20-alpine AS ui-builder
WORKDIR /app/agent-ui
COPY agent-ui/package*.json ./
RUN npm ci
COPY agent-ui/ ./
RUN npm run build

# ===== Stage 2: Build backend =====
FROM golang:1.24-alpine AS server-builder
WORKDIR /app/agent-server
COPY agent-server/go.mod agent-server/go.sum ./
RUN go mod download
COPY agent-server/ ./
COPY --from=ui-builder /app/agent-ui/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/server ./cmd/server

# ===== Stage 3: Runtime =====
FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=server-builder /bin/server /app/server
COPY --from=server-builder /app/agent-server/web/dist /app/web/dist

EXPOSE 8080
ENTRYPOINT ["/app/server"]
```

### 6.3 容器内进程方案

方案 A：Go server 直接 serve 静态文件（推荐）

```go
// Go server 同时提供 API 和静态前端
mux.Handle("/api/", apiRouter)
mux.Handle("/", http.FileServer(http.Dir("./web/dist")))
```

方案 B：supervisord 管理两个进程
- nginx  serve 前端
- Go server 提供后端

**推荐方案 A**，更简单，端口更少。

### 6.4 启动命令

```bash
docker build -t netx-agent:latest .
docker run -p 8080:8080 -v ./data/agents:/data/agents netx-agent:latest
```

> LLM API key 等在创建 Agent 时配置到 `agent.yaml`，不通过环境变量硬编码。

---

## 七、HTTP API 规划（AWS FinOps 全 POST 风格）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/createAgentSpace` | 创建 AgentSpace |
| POST | `/listAgentSpaces` | 列出 AgentSpace |
| POST | `/getAgentSpace` | 获取 AgentSpace |
| POST | `/deleteAgentSpace` | 删除 AgentSpace |
| POST | `/createConversation` | 创建会话 |
| POST | `/listConversations` | 列出会话 |
| POST | `/getConversation` | 获取会话 |
| POST | `/createTurn` | 创建轮次（异步，202） |
| POST | `/getTurn` | 获取轮次状态/结果 |
| POST | `/createTask` | 创建任务（异步，202） |
| POST | `/getTask` | 获取任务状态 |
| POST | `/listTasks` | 列出任务 |
| POST | `/respondToTask` | 审批/响应任务（从 AWAITING_INPUT 继续） |
| POST | `/listRecords` | 列出执行记录 |
| POST | `/listArtifacts` | 列出产物 |
| POST | `/getArtifact` | 获取产物内容/下载 URL |
| POST | `/createDocument` | 上传上下文文件 |
| POST | `/listDocuments` | 列出上下文文件 |
| POST | `/getDocument` | 获取上下文文件信息 |
| POST | `/deleteDocument` | 删除上下文文件 |

所有请求都需要 `agentSpaceId`，资源 ID 放在请求 body 中。第一版采用轮询获取异步结果。

---

## 八、下一步落地清单

1. [ ] 创建 `agent-server/` 目录和 `go.mod`
2. [ ] 安装 ADK-Go v2：`go get google.golang.org/adk/v2`
3. [ ] 实现 `internal/task` 核心包（模型、存储、调度器）
4. [ ] 实现 `internal/tools` 通用注册框架
5. [ ] 实现 `internal/agent/root.go` Root Agent
6. [ ] 实现 `internal/api/server.go` HTTP API
7. [ ] 实现 `internal/events` 事件通知（企业微信 webhook + 轮询状态变更）
8. [ ] 实现 `internal/store/file_store.go` 文本文件存储
9. [ ] 实现 `internal/conversation` Conversation + Turn
10. [ ] 实现 `internal/document` Context files 管理
11. [ ] 创建 Dockerfile 单容器打包
12. [ ] 前端接入全 POST API 并采用轮询
13. [ ] 在 `internal/business/sre/` 添加第一个示例 Tool

---

## 九、关键设计原则

1. **业务无关**：框架层只关心 Task 调度、Tool 执行、API 暴露
2. **业务可插拔**：所有业务逻辑放在 `internal/business/{domain}/`
3. **存储可替换**：Store 都是 interface，默认 FileStore（文本文件），后续可换 PostgreSQL
4. **Agent 可组合**：Root Agent 动态加载业务 Tools
5. **单容器部署**：一个 Docker 镜像包含前后端，降低运维复杂度
6. **多 AgentSpace**：支持多个独立 Agent，数据按目录隔离
