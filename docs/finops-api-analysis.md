# AWS FinOps Agent API 深度分析

> 来源：真实 API 抓包（普通 Chat + 立即执行 Task）
> 目的：完整理解 FinOps Agent 的实体关系，设计 NetX Agent API

---

## 一、核心实体关系

FinOps Agent 采用 **四层模型**：

```
AgentSpace（工作空间/租户）
    │
    ├── Conversation（会话）
    │       │
    │       └── Turn（轮次）
    │
    ├── Task（任务）
    │       │
    │       ├── Record（执行记录）
    │       └── Artifact（产物）
    │
    └── Document（上下文文件）
```

关键洞察：
- **Conversation + Turn** 是**聊天交互入口**
- **Task** 是**独立执行单元**
- **Turn 和 Task 共享底层执行引擎**，都产生 Records
- **Records** 是执行过程的细粒度事件流
- **Artifacts** 是产物文件

---

## 二、两种触发执行的方式

### 2.1 通过 Conversation/Turn（聊天模式）

```text
POST /api/v1/createConversation
POST /api/v1/createTurn        → 202, status=IN_PROGRESS
POST /api/v1/getTurn           → 轮询结果
POST /api/v1/listRecords       → 查执行记录
POST /api/v1/listArtifacts     → 查产物
```

### 2.2 通过 Task（任务模式）

```text
POST /api/v1/createTask        → 202, status=PENDING
POST /api/v1/getTask           → 查任务状态
POST /api/v1/listRecords       → 查执行记录（按 taskId）
POST /api/v1/listArtifacts     → 查产物（按 taskId）
```

**createTask 请求示例：**

```json
{
    "agentSpaceId": "asp-xxxxxxxxxxxxxxxx",
    "clientToken": "f8d130a1-bc5e-4528-b916-21db4b0f66b5",
    "priority": "NORMAL",
    "prompt": "hello"
}
```

**createTask 响应示例：**

```json
{
    "task": {
        "agentSpaceId": "asp-xxxxxxxxxxxxxxxx",
        "automationId": null,
        "completedAt": null,
        "createdAt": "2026-07-01T05:49:34.181991346Z",
        "documentIds": [],
        "output": null,
        "pendingAgentRequests": null,
        "priority": "NORMAL",
        "prompt": "hello",
        "startedAt": null,
        "status": "PENDING",
        "statusReason": null,
        "taskArn": "arn:aws:finops-agent:::agentspace/.../task/...",
        "taskId": "task-xxxxxxxxxxxxxxxx",
        "taskType": "ON_DEMAND",
        "triggerDetail": null,
        "updatedAt": null
    }
}
```

---

## 三、Task 模型详解

### 3.1 Task 字段

| 字段 | 说明 |
|------|------|
| `taskId` | 任务唯一 ID |
| `taskArn` | ARN 格式资源标识 |
| `agentSpaceId` | 所属空间 |
| `automationId` | 所属自动化（定时/事件触发时填充） |
| `taskType` | `ON_DEMAND` / `SCHEDULED` / `EVENT` |
| `priority` | `NORMAL` / `HIGH` / `LOW` |
| `prompt` | 用户原始指令 |
| `status` | `PENDING` / `IN_PROGRESS` / `COMPLETED` / `FAILED` / `AWAITING_INPUT` |
| `statusReason` | 状态说明/错误信息 |
| `output` | 最终输出摘要 |
| `pendingAgentRequests` | Agent 向用户的请求 |
| `documentIds` | 关联上下文文件 |
| `createdAt` / `startedAt` / `completedAt` / `updatedAt` | 时间戳 |

### 3.2 Task 状态机

```
PENDING
   │
   ▼
IN_PROGRESS
   │
   ├──► COMPLETED
   │
   ├──► FAILED
   │
   └──► AWAITING_INPUT ──► 用户响应 ──► IN_PROGRESS
```

---

## 四、Record 模型详解

**Record 是 Task/Turn 执行过程的细粒度事件流。**

### 4.1 Record 类型

从抓包可见 `recordType`：

| 类型 | 说明 |
|------|------|
| `RESPONSE` | LLM 回复 |
| `TOOL_CALL` | 工具调用 |
| `TOOL_RESULT` | 工具执行结果 |
| `MEMORY_ACCESS` | 记忆/上下文访问 |
| `LOAD_SKILL` | 加载 Skill |
| `LOAD_TOOL` | 加载 Tool |

### 4.2 Record 示例

```json
{
    "recordId": "11d076ec-011c-49d8-ae02-db87471e4dfd",
    "recordType": "RESPONSE",
    "taskId": "task-xxxxxxxxxxxxxxxx",
    "content": "Hello! I'm your AWS FinOps Agent...",
    "modelId": "us.anthropic.claude-sonnet-4-6",
    "createdAt": "2026-07-01T05:49:52.750282494Z",
    "tokenCount": null,
    "artifact": null,
    "toolCall": null,
    "toolResult": null,
    "memoryAccess": null,
    "loadSkill": null,
    "loadTool": null
}
```

### 4.3 Record 的作用

1. **流式进度展示**：前端按时间顺序展示 Records，用户能看到 Agent 思考过程
2. **审计追踪**：完整记录 Agent 做了什么
3. **调试**：TOOL_CALL / TOOL_RESULT 帮助排查问题
4. **成本分析**：tokenCount 用于计费

---

## 五、Artifact 模型

Artifact 是 Task 产生的文件/产物：

```json
{
    "artifacts": [],
    "nextToken": null
}
```

可能的字段：

| 字段 | 说明 |
|------|------|
| `artifactId` | 产物 ID |
| `taskId` | 所属任务 |
| `name` | 文件名 |
| `type` | `HTML` / `MARKDOWN` / `CSV` / `PPT` |
| `size` | 大小 |
| `url` | 下载地址 |
| `createdAt` | 创建时间 |

---

## 六、Document 模型与 API（Context Files）

Document 是用户上传到 AgentSpace 的上下文文件，用于给 Agent 提供额外领域知识（如成本分摊规则、标签标准、节点清单、Pod 列表等）。在 UI 中对应 **Context files** 菜单。

### 6.1 Document 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `documentId` | string | 文件唯一 ID |
| `agentSpaceId` | string | 所属空间 |
| `name` | string | 文件名，如 `Pod list.json` |
| `contentType` | string | MIME 类型，如 `application/json` |
| `fileSize` | int | 文件大小（字节） |
| `status` | string | `ACTIVE` / `PENDING` / `PROCESSING` / `FAILED` |
| `version` | int | 版本号，从 1 开始 |
| `description` | string? | 文件描述 |
| `createdAt` | string | 创建时间（RFC3339，含纳秒） |
| `updatedAt` | string | 更新时间 |
| `processedAt` | string? | 处理完成时间 |
| `restorableUntil` | string? | 可恢复截止时间 |

### 6.2 创建文件：POST /api/v1/createDocument

**说明**：上传一个上下文文件。文件内容使用 Base64 编码放在 `content` 字段中。

**状态码**：`202 Accepted`（表示已接受，后台可能还需异步处理/索引）

**请求示例**：

```json
{
    "agentSpaceId": "asp-xxxxxxxxxxxxxxxx",
    "clientToken": "569f7b1b-8ec9-4ea7-adf7-418fba205700",
    "name": "Pod list.json",
    "contentType": "application/json",
    "content": "Q=="
}
```

**响应示例**：

```json
{
    "document": {
        "agentSpaceId": "asp-xxxxxxxxxxxxxxxx",
        "contentType": "application/json",
        "createdAt": "2026-07-01T05:54:20.702574958Z",
        "description": null,
        "documentId": "doc-xxxxxxxxxxxxxxxx",
        "fileSize": 557479,
        "name": "Pod list.json",
        "processedAt": null,
        "restorableUntil": null,
        "status": "ACTIVE",
        "updatedAt": "2026-07-01T05:54:20.702574958Z",
        "version": 1
    }
}
```

### 6.3 列出文件：POST /api/v1/listDocuments

**说明**：按空间列出上下文文件。支持 `maxResults` + `nextToken` 游标分页。

**状态码**：`200 OK`

**请求示例**：

```json
{
    "agentSpaceId": "asp-xxxxxxxxxxxxxxxx",
    "maxResults": 100
}
```

**响应示例**：

```json
{
    "documents": [
        {
            "contentType": "application/json",
            "createdAt": "2026-07-01T05:54:20Z",
            "documentId": "doc-xxxxxxxxxxxxxxxx",
            "fileSize": 557479,
            "name": "Pod list.json",
            "status": "ACTIVE",
            "updatedAt": "2026-07-01T05:54:20Z"
        }
    ],
    "nextToken": null
}
```

### 6.4 Document 与 Task/Turn 的关系

- `createTask` / `createTurn` 可通过 `documentIds` 字段引用一个或多个 Document
- Document 作为 Agent 的额外上下文，影响工具调用和最终回复
- Document 独立管理，不随单次 Task 销毁

---

## 七、API 端点汇总

| 端点 | 方法 | 说明 |
|------|------|------|
| `/createConversation` | POST | 创建会话 |
| `/listConversations` | POST | 列会话 |
| `/createTurn` | POST | 创建轮次（异步） |
| `/getTurn` | POST | 获取轮次 |
| `/createTask` | POST | 创建任务（异步） |
| `/getTask` | POST | 获取任务 |
| `/listTasks` | POST | 列任务 |
| `/listRecords` | POST | 列执行记录 |
| `/listArtifacts` | POST | 列产物 |
| `/createDocument` | POST | 上传上下文文件 |
| `/listDocuments` | POST | 列上下文文件 |
| `/api/events` | POST | 前端事件上报 |
| `/authorizer/credentials` | POST | 获取临时凭证 |

---

## 八、执行流程对比

### 7.1 聊天模式流程

```text
用户输入 "hello"
   │
   ▼
POST /api/v1/createTurn
   │
   ▼
返回 202, turnId, status=IN_PROGRESS
   │
   ▼
轮询 POST /api/v1/getTurn
   │
   ▼
status=COMPLETED
   │
   ▼
POST /api/v1/listRecords (按 turnId)
   │
   ▼
展示 RESPONSE 记录
```

### 7.2 任务模式流程

```text
用户点击 Create Task，输入 "hello"
   │
   ▼
POST /api/v1/createTask
   │
   ▼
返回 202, taskId, status=PENDING
   │
   ▼
轮询 POST /api/v1/getTask
   │
   ▼
status=COMPLETED
   │
   ▼
POST /api/v1/listRecords (按 taskId)
POST /api/v1/listArtifacts (按 taskId)
   │
   ▼
展示结果和产物
```

---

## 九、对 NetX Agent 的设计启示

### 9.1 推荐的 NetX 实体模型

```
AgentSpace
    │
    ├── Conversation
    │       └── Turn
    │
    ├── Task
    │       ├── Record
    │       └── Artifact
    │
    └── Document
```

### 9.2 Turn 和 Task 的关系

| 场景 | 模型 |
|------|------|
| 聊天中问一个问题 | 创建 Turn，不创建 Task |
| 聊天中要求执行 | 创建 Turn，Turn 内部创建 Task |
| 从 Tasks 页面直接创建 | 直接创建 Task，不创建 Turn |
| 自动化触发 | 直接创建 Task |

即：
- **Task 是执行单元**
- **Turn 是聊天会话中的交互轮次**
- Turn 可以引用 Task，Task 不依赖 Turn

### 9.3 Record 的设计

NetX Agent 应该也采用 Record 模型：

```go
type RecordType string

const (
    RecordTypeResponse    RecordType = "RESPONSE"
    RecordTypeToolCall    RecordType = "TOOL_CALL"
    RecordTypeToolResult  RecordType = "TOOL_RESULT"
    RecordTypeMemoryAccess RecordType = "MEMORY_ACCESS"
    RecordTypeStatus      RecordType = "STATUS"
    RecordTypeError       RecordType = "ERROR"
)

type Record struct {
    RecordID    string
    TaskID      string
    TurnID      string
    RecordType  RecordType
    Content     string
    Metadata    map[string]any
    CreatedAt   time.Time
}
```

### 9.4 推荐的 NetX API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/spaces/{spaceId}/conversations` | 创建会话 |
| GET | `/api/spaces/{spaceId}/conversations` | 列会话 |
| GET | `/api/spaces/{spaceId}/conversations/{convId}` | 获取会话 |
| POST | `/api/spaces/{spaceId}/conversations/{convId}/turns` | 创建轮次 |
| GET | `/api/spaces/{spaceId}/conversations/{convId}/turns/{turnId}` | 获取轮次 |
| POST | `/api/spaces/{spaceId}/tasks` | 创建任务 |
| GET | `/api/spaces/{spaceId}/tasks` | 列任务 |
| GET | `/api/spaces/{spaceId}/tasks/{taskId}` | 获取任务 |
| GET | `/api/spaces/{spaceId}/records` | 列记录（可按 taskId/turnId 过滤） |
| GET | `/api/spaces/{spaceId}/artifacts` | 列产物 |
| GET | `/api/spaces/{spaceId}/artifacts/{artifactId}` | 下载产物 |
| POST | `/api/spaces/{spaceId}/documents` | 上传上下文文件 |
| GET | `/api/spaces/{spaceId}/documents` | 列上下文文件 |
| POST | `/api/spaces/{spaceId}/tasks/{taskId}/respond` | 响应 Agent 请求（审批/补充） |
| POST | `/api/events` | 前端事件上报 |

### 9.5 前端如何展示

- **Chat 面板**：展示 Conversation 的 Turns 和 Records
- **Tasks 面板**：展示独立创建的 Tasks
- **Artifacts 面板**：展示所有 Task 的产物
- **Records 既是执行日志，也是聊天消息的来源**

---

## 十、关键结论

1. **FinOps Agent 有完整的 Conversation + Turn + Task + Record + Artifact + Document 六层模型。**
2. **Task 是独立执行单元**，可以从聊天 Turn 触发，也可以独立创建。
3. **Record 是执行过程的细粒度事件流**，是展示 Agent 思考过程的关键。
4. **Artifact 是产物**，与 Task 关联。
5. **Document 是上下文文件**，独立存储，可被多个 Task/Turn 引用。
6. **NetX Agent 应该采用相同模型**：Conversation/Turn 管聊天，Task/Record/Artifact 管执行，Document 管上下文注入。
7. **优先实现 Task + Record 模型**，Conversation/Turn 与 Document 可后续添加。

---

## 十一、FinOps API 设计风格规范

基于以上抓包分析，可总结出 FinOps Agent API 的一致性设计规范。

### 11.1 端点与 HTTP 方法

| 规范 | 说明 |
|------|------|
| **全部使用 POST** | 无论创建、查询、列表、获取，统一使用 `POST`。RESTful 动词体现在 URL path 中 |
| **动词 + 名词命名** | 端点名称为 `/createXxx`、`/listXxx`、`/getXxx`、`/deleteXxx` |
| **扁平路径** | 无路径参数，资源 ID 放在请求体中，如 `{"agentSpaceId": "..."}` |
| **裸根路径** | 端点直接挂在根域名下，如 `https://finops-agent.us-east-1.api.aws/createDocument` |

### 11.2 请求体约定

| 规范 | 说明 |
|------|------|
| **空间隔离** | 几乎所有请求都需要 `agentSpaceId` |
| **幂等键** | 创建类操作带 `clientToken`（UUID），用于幂等/重试 |
| **分页参数** | 列表接口使用 `maxResults` + `nextToken` 游标分页 |
| **过滤参数放 body** | 如 `taskId`、`turnId` 等过滤条件放在 POST body 中 |
| **文件内容 Base64 编码** | `createDocument` 的 `content` 字段为 Base64 字符串 |

### 11.3 响应体约定

| 规范 | 说明 |
|------|------|
| **单资源包装** | 创建/获取返回 `{ "entity": { ... } }`，如 `{ "task": {...} }`、`{ "document": {...} }` |
| **列表包装** | 列表返回 `{ "entities": [...], "nextToken": "... }`，如 `{ "documents": [...], "nextToken": null }` |
| **camelCase 字段** | 全小写驼峰，如 `agentSpaceId`、`documentId`、`createdAt`、`fileSize` |
| **时间戳** | RFC3339 格式；创建/更新响应常带纳秒精度，列表中简化为秒级 |
| **可为 null 的字段显式返回** | 如 `description`、`processedAt`、`restorableUntil`、`nextToken` |

### 11.4 状态码与异步

| 规范 | 说明 |
|------|------|
| **202 Accepted** | 异步创建/启动类操作返回 202，如 `createTask`、`createTurn`、`createDocument` |
| **200 OK** | 查询、列表、获取返回 200 |
| **状态字段驱动轮询** | 资源对象内含 `status` 字段，客户端通过轮询 `getXxx` 获取最终状态 |
| **状态枚举** | 如 `ACTIVE`、`PENDING`、`IN_PROGRESS`、`COMPLETED`、`FAILED`、`AWAITING_INPUT` |

### 11.5 资源对象通用字段

几乎所有资源对象都包含：

```text
<idField>          // 如 taskId、documentId、turnId
agentSpaceId
createdAt
updatedAt
status
<arnField>?       // 部分资源如 Task 有 taskArn
version?          // Document 等支持版本
```

### 11.6 对 NetX API 设计的借鉴

FinOps 这种 **"全 POST + 动词命名 + 请求体传 ID"** 的风格，本质上是 **AWS SDK 风格的 HTTP API**（类似 AWS 各种 Control Plane API）。其优点是：

1. **与 AWS SDK 生成工具兼容**：便于用 Smithy/SDK 生成客户端
2. **强一致性**：所有接口调用方式类似，降低学习成本
3. **幂等友好**：`clientToken` 天然适合网络不稳定场景
4. **前后端解耦**：前端无需关心 HTTP 方法语义，统一 POST 即可

但 NetX 如果面向 Web 前端和 RESTful 习惯，可考虑 **混合风格**：

- **对外前端 API** 使用 RESTful 路径 + HTTP 方法区分（GET/POST/PUT/DELETE）
- **对 AWS 风格后端** 可保留全 POST 的内部 RPC 风格

或者统一采用 AWS 风格，以保持与 FinOps 参考实现一致，便于未来迁移或复用 AWS 生态工具。
