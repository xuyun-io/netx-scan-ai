# AWS FinOps Agent 创建流程与权限模型分析

> 来源：`agent-admin-images/` 控制台截图 + 创建完成后的 webapp URL
> 目的：理解 AWS FinOps Agent 从控制台创建到可用状态的完整流程、权限分配方式，以及 AgentSpaceId 的来源，为 NetX all-in-one Agent 设计提供参考

---

## 一、概述

AWS FinOps Agent 在 AWS 控制台中通过**五步引导式向导**创建。每个 Agent 是**完全独立的实例**，拥有自己独立的：

- IAM 权限（访问 AWS 资源）
- Web app 操作权限
- Context files（上下文文件）
- Memory（记忆）
- Task queue（任务队列）
- Third-party integrations（第三方集成）

创建完成后，AWS 会为该 Agent 分配一个唯一的 **`agentSpaceId`**，并生成对应的独立 webapp 入口 URL。

示例创建完成后的 URL：

```text
https://{agentSpaceId}.webapp.finops-agent.global.app.aws/#/context?mode=schedule&c={contextId}
```

URL 解析：

| 部分 | 含义 |
|------|------|
| `0c1x0dgp8ob6kkjkpa0currh` | **AgentSpaceId**，Agent 的唯一空间标识 |
| `webapp.finops-agent.global.app.aws` | FinOps Agent Webapp 统一域名 |
| `#/context` | 当前页面：Context files（上下文文件） |
| `mode=schedule` | 页面视图模式参数 |
| `c=mmbnwg3yisoqpjkv641f1fiv` | ConversationId，当前会话 ID |

---

## 二、Agent 创建向导（5 步）

### Step 1：Name your agent（命名 Agent）

- **Agent name**：1-128 字符，只允许字母、数字、空格、连字符 `-`
- **Description**：可选，512 字符以内
- 这是 Agent 在控制台列表中的显示名称

### Step 2：Give this Agent AWS resources access（授予 AWS 资源访问权限）

- 选择 IAM Role 配置方式：
  - **Auto-create a new FinOps Agent role（推荐）**：自动创建服务角色
  - **Use an existing role**：使用已有 IAM Role
- 自动创建的 Role 名示例：`FinOpsAgentRole-ea570fcd`
- **该 Role 决定 Agent 能访问哪些 AWS 资源**，如 Cost Explorer、CloudTrail、Compute Optimizer 等
- 默认策略为**只读**

### Step 3：Give the web app access to your agent（授予 Web App 访问 Agent 的权限）

- 启用 web app 体验
- 需要一个独立的 IAM Role 控制 web app 对 Agent 的操作权限：
  - 创建任务（creating tasks）
  - 查看执行历史（viewing execution history）
  - 管理上下文文件（managing context files）
- 自动创建的 Role 名示例：`FinOpsAgentOperatorRole-03bac355`
- **Web app 认证通过 AWS Console 处理**

### Step 4：第三方集成（可选）

- **仅支持企业微信群机器人 webhook**
- 允许 Agent：
  - 向指定群发送告警通知
  - 推送任务结果摘要
  - 发送审批提醒（引导到 Web UI 处理）
- 可以稍后从 Agent settings 中配置

> NetX 版本不需要 Jira/Slack，统一用企业微信作为唯一外部集成通道。

### Step 5：Review and create（审核并创建）

- 汇总显示：
  - Agent name / Description
  - IAM role configuration（Agent 资源访问角色）
  - Web app role configuration（Web app 操作角色）
  - Connected integrations
- 点击 **Create agent** 完成创建

---

## 三、创建完成后的产物

创建完成后，在 AWS 控制台 Agents 列表中会出现新 Agent，例如：

| 字段 | 示例值 |
|------|--------|
| Agent name | Demo |
| Open agent | 外部链接图标 |
| Create date | June 30, 2026, 17:22 (UTC+8:00) |
| Update date | June 30, 2026, 17:22 (UTC+8:00) |

同时系统会分配：

1. **`agentSpaceId`**：Agent 的唯一空间 ID，例如 `0c1x0dgp8ob6kkjkpa0currh`
2. **独立 webapp URL**：`https://{agentSpaceId}.webapp.finops-agent.global.app.aws/`
3. **两个 IAM Role**：
   - `FinOpsAgentRole-xxx`：Agent 访问 AWS 资源
   - `FinOpsAgentOperatorRole-xxx`：Web app 操作 Agent

---

## 四、权限模型：两个 Role 的职责分离

FinOps Agent 的权限设计采用 **Agent 执行权限** 与 **Web App 操作权限** 分离的模型：

```text
┌─────────────────────────────────────────────────────────────┐
│                      AWS Console User                        │
│                  （通过 AWS Console 认证）                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              FinOpsAgentOperatorRole-xxx                    │
│  Web app 操作 Agent 的权限：                                 │
│  - 创建 Task/Turn                                          │
│  - 查看执行历史 / Records                                   │
│  - 管理 Context files（Documents）                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      FinOps Agent Service                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                FinOpsAgentRole-xxx                          │
│  Agent 访问 AWS 资源的权限：                                 │
│  - Cost Explorer（读成本数据）                              │
│  - CloudTrail（读 API 调用记录）                            │
│  - Compute Optimizer（读优化建议）                          │
│  - 其他只读 AWS 服务                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   AWS 资源（只读访问）                       │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Agent Role（FinOpsAgentRole）

- **用途**：Agent 后端服务以该 Role 身份访问 AWS 资源
- **默认策略**：**只读**
- **关键权限**：
  - `ce:*`（Cost Explorer）
  - `cloudtrail:LookupEvents`
  - `compute-optimizer:*`
  - `sns:Publish`（可能用于告警）
  - 对企业微信等外部集成的写权限（如果配置）

### 4.2 Operator Role（FinOpsAgentOperatorRole）

- **用途**：Web App（前端用户）通过该 Role 调用 Agent 的 Control Plane API
- **关键权限**：
  - 调用 FinOps Agent 服务 API（如 `createTask`、`listDocuments`）
  - 管理 AgentSpace 内的资源
  - **不直接访问底层 AWS 资源**

### 4.3 为什么需要分离？

| 优点 | 说明 |
|------|------|
| **最小权限** | Web app 用户无法直接操作 AWS 资源，只能通过 Agent 服务发起任务 |
| **审计清晰** | Agent 对 AWS 资源的访问统一通过 Agent Role，便于 CloudTrail 审计 |
| **安全隔离** | 即使 Web app 凭证泄露，攻击者也无法直接读取敏感 AWS 数据 |
| **多租户隔离** | 每个 Agent 有独立的 Role 和权限边界 |

---

## 五、Agent 的独立性

从控制台首页的描述可知：

> An agent is an independent instance. Each agent operates with its own IAM permissions, context files, memory, task queue, and integrations. No data, resources, or permissions are shared across agents.

这意味着：

- 每个 Agent 对应一个独立的 **`AgentSpace`**
- 不同 Agent 之间的数据、资源、权限完全隔离
- 删除一个 Agent 不会影响其他 Agent
- 适合按团队/项目/环境拆分 Agent 实例

---

## 六、对 NetX all-in-one 容器化设计的启示

AWS FinOps Agent 的管理台、Agent 服务、Web App 是 AWS 托管的分离组件。NetX 如果要构建 **all-in-one 三合一容器**（管理 + Agent + Web Agent），可以借鉴其思想但简化部署：

### 6.1 组件映射

| AWS FinOps Agent | NetX all-in-one 容器 |
|------------------|----------------------|
| AWS 控制台创建向导 | 容器首次启动时的初始化/配置脚本 |
| AgentSpaceId | 容器实例 ID / 租户 ID |
| FinOpsAgentRole | 访问链上 RPC / SSM / Docker / 日志的只读凭证 |
| FinOpsAgentOperatorRole | Web UI / API 访问 Agent 服务的认证 Token/Role |
| Web app URL | 容器暴露的 Web UI 地址 |

### 6.2 权限设计建议

```text
NetX SRE Agent 容器
├── Agent 执行权限（只读）
│   ├── 链上 RPC 查询（块高、出块、validator）
│   ├── SSM 只读命令（查看节点状态）
│   ├── Docker 只读查看（容器状态、日志）
│   └── 日志只读读取
│
└── Web/App 操作权限
    ├── 创建 Task / Turn
    ├── 查看 Records / Artifacts
    ├── 上传 / 管理 Context files
    └── 配置企业微信群机器人 webhook URL
```

### 6.3 简化点

在 all-in-one 容器中，可以省略 AWS 控制台向导：

1. **AgentSpaceId**：容器启动时自动生成或从配置文件读取
2. **IAM Role**：映射为容器内的服务账户 / 本地凭证文件
3. **Web app URL**：就是容器暴露的地址，无需子域名分配
4. **第三方集成**：通过环境变量或配置文件初始化

### 6.4 需要保留的核心思想

| AWS 设计 | NetX 对应设计 |
|----------|---------------|
| Agent 是独立实例 | 每个容器实例是独立 Agent，数据隔离 |
| 执行权限与操作权限分离 | Agent 后端只读凭证 vs Web/API 操作凭证分离 |
| 默认只读 | Agent 默认只读，高危操作需审批 |
| Context files 增强上下文 | 上传 chain287 部署文档、节点清单、运行手册 |
| Web app 统一入口 | 容器 Web UI 作为统一入口 |

### 6.5 企业微信集成设计（NetX 唯一第三方集成）

NetX SRE Agent **仅需支持企业微信群机器人 webhook** 作为外部通知通道，替代 AWS FinOps 的 Jira/Slack 组合。

#### 企业微信在 Agent 中的角色

| 角色 | 场景 | 示例 |
|------|------|------|
| **告警通知** | Agent 发现异常后主动推送到群 | "Validator-01 10 分钟未出块，请检查" |
| **结果推送** | 任务完成后推送摘要 | "每日巡检完成：发现 2 个风险点，详情见 Web UI" |
| **审批提醒** | 高危操作需人工确认时提醒 | "任务 #123 等待审批，请登录 Web UI 处理" |

> 审批确认本身通过 Web UI 完成，企业微信只作为通知/提醒通道。

#### 技术实现

- 仅支持企业微信群机器人 **webhook URL**
- Agent 通过 POST 发送 markdown/文本消息到该 URL
- 配置简单，只需一个 URL

#### 与 Agent 状态机的结合

```text
Task 执行到 AWAITING_INPUT（等待审批）
    │
    ▼
Agent 发送企业微信消息提醒管理员
    │
    ▼
管理员登录 Web UI 点击【确认】
    │
    ▼
Task 状态变为 IN_PROGRESS，继续执行
```

#### 配置示例

```yaml
# agent.yaml
integrations:
  wecom:
    enabled: true
    webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
```

也可以支持多个 webhook：

```yaml
integrations:
  wecom:
    enabled: true
    webhooks:
      - name: "sre-alerts"
        url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
      - name: "ops-daily"
        url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=yyyy"
```

### 6.6 Agent 持久化与目录结构设计

NetX all-in-one 容器必须保证 **Docker 启停不影响 Agent 数据**。参考 OpenClaw 的文本化设计理念，**所有历史记录用文本文件存储，不引入 SQLite 等数据库**。

#### 持久化原则

| 原则 | 说明 |
|------|------|
| **一 Agent 一目录** | 每个 Agent 拥有独立的文件系统命名空间 |
| **宿主机挂载** | 容器内数据目录通过 Docker volume 映射到宿主机 |
| **文本即历史** | Conversations、Tasks、Records、Memories 全部用 YAML/JSONL/Markdown 存储 |
| **人类可读** | 便于调试、审计、版本控制（可纳入 git） |
| **文件即产物** | Context files、Artifacts、Logs 直接以原始文件形式存放 |
| **易迁移/备份/删除** | 迁移 Agent = 复制一个目录；删除 Agent = 删除一个目录 |

#### 推荐目录结构

```text
/data/agents/                                    # 所有 Agent 根目录（宿主机挂载点）
├── {agentSpaceId-1}/                            # 第一个 Agent
│   ├── agent.yaml                               # Agent 元数据配置
│   ├── conversations/                           # 聊天会话
│   │   └── {conversationId}/
│   │       ├── conversation.yaml                # 会话元数据
│   │       └── turns.jsonl                      # 轮次历史（JSON Lines，按时间追加）
│   │
│   ├── tasks/                                   # 任务
│   │   └── {taskId}/
│   │       ├── task.yaml                        # 任务元数据
│   │       ├── records.jsonl                    # 执行记录流（RESPONSE/TOOL_CALL/TOOL_RESULT...）
│   │       └── artifacts/                       # 该任务生成的产物
│   │           ├── validator-report-20260701.md
│   │           └── node-status-20260701.json
│   │
│   ├── documents/                               # Context files（用户上传的上下文文件）
│   │   ├── pod-list.json
│   │   └── chain287-runbook.md
│   │
│   ├── memory/                                  # Agent memory / 记忆
│   │   ├── memories.jsonl                       # 记忆记录
│   │   └── index/                               # 可选：向量索引文件（如需要 RAG）
│   │
│   ├── credentials/                             # 凭证文件（如 RPC API key 等；企业微信 webhook 可直接配在 agent.yaml）
│   │   └── rpc-credentials.yaml
│   │
│   ├── logs/
│   │   └── agent.log                            # Agent 运行日志
│   │
│   └── tmp/                                     # 临时文件（可定期清理）
│
├── {agentSpaceId-2}/                            # 第二个 Agent
│   ├── agent.yaml
│   ├── conversations/
│   ├── tasks/
│   ├── documents/
│   ├── memory/
│   ├── credentials/
│   ├── logs/
│   └── tmp/
│
└── global.yaml                                  # 全局配置（可选）
```

#### 文件格式约定

| 数据类型 | 文件格式 | 说明 |
|----------|---------|------|
| Agent / Task / Conversation 元数据 | `YAML` | 人类可读，便于手动查看和修改 |
| Turns / Records / Memories | `JSONL` | 每行一条记录，适合追加写入和流式读取 |
| Artifacts | `MD / JSON / CSV / HTML` | 根据产物类型选择原生格式 |
| Context files | 原始格式 | 用户上传什么就是什么 |
| 凭证 | `YAML` | 第一版先用明文存储，后续按需考虑加密 |

#### 示例文件内容

**`agent.yaml`**：

```yaml
agentSpaceId: 0c1x0dgp8ob6kkjkpa0currh
name: chain287-sre-agent
description: NetX Chain287 SRE Agent
createdAt: 2026-07-01T05:54:20Z
updatedAt: 2026-07-01T05:54:20Z
integrations:
  wecom:
    enabled: true
    webhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
```

**`tasks/{taskId}/task.yaml`**：

```yaml
taskId: u0a7vsbn53o0nmeqeqcmkwnk
agentSpaceId: 0c1x0dgp8ob6kkjkpa0currh
prompt: "检查所有 validator 健康状态"
priority: NORMAL
status: COMPLETED
output: "所有 validator 正常运行"
createdAt: 2026-07-01T05:49:34Z
updatedAt: 2026-07-01T05:50:12Z
```

**`tasks/{taskId}/records.jsonl`**：

```jsonl
{"recordId":"r-001","recordType":"RESPONSE","content":"开始检查 validator 健康状态...","createdAt":"2026-07-01T05:49:35Z"}
{"recordId":"r-002","recordType":"TOOL_CALL","toolCall":{"name":"get_validator_status","args":{}},"createdAt":"2026-07-01T05:49:36Z"}
{"recordId":"r-003","recordType":"TOOL_RESULT","toolResult":{"status":"ok","data":{"validator-01":"healthy"}},"createdAt":"2026-07-01T05:49:37Z"}
```

**`conversations/{conversationId}/turns.jsonl`**：

```jsonl
{"turnId":"t-001","role":"user","content":"今天链上情况如何？","createdAt":"2026-07-01T06:00:00Z"}
{"turnId":"t-002","role":"assistant","content":"今日出块正常，无异常...","createdAt":"2026-07-01T06:00:05Z"}
```

#### Docker 部署示例

```yaml
# docker-compose.yml
services:
  netx-sre-agent:
    image: netx-sre-agent:latest
    container_name: netx-sre-agent
    volumes:
      # 关键：将 Agent 数据持久化到宿主机
      - ./data/agents:/data/agents
    ports:
      - "8080:8080"
    environment:
      - NETX_DATA_DIR=/data/agents
      - NETX_DEFAULT_AGENT_SPACE_ID=0c1x0dgp8ob6kkjkpa0currh
```

#### 数据生命周期

| 操作 | 文件系统操作 |
|------|-------------|
| 创建 Agent | `mkdir /data/agents/{agentSpaceId}` + 写入 `agent.yaml` |
| 创建 Task | `mkdir /data/agents/{agentSpaceId}/tasks/{taskId}` + `task.yaml` |
| 追加 Record | 向 `records.jsonl` 追加一行 |
| 删除 Agent | `rm -rf /data/agents/{agentSpaceId}` |
| 备份 Agent | `tar czf agent-{agentSpaceId}.tar.gz /data/agents/{agentSpaceId}` |
| 迁移 Agent | 复制目录到新宿主机，挂载到相同路径 |
| 升级容器 | 拉取新镜像，保留 `/data/agents` volume，文本数据不变 |

#### 为什么用文本而不是 SQLite

参考 OpenClaw 的设计思想：

| 优势 | 说明 |
|------|------|
| **人类可读** | 直接打开 YAML/JSONL/Markdown 即可查看历史和状态 |
| **便于调试** | 排查问题时无需数据库客户端 |
| **版本友好** | 可纳入 git，追踪 Agent 记忆和任务历史的变化 |
| **无数据库依赖** | 单容器即可运行，无需维护 SQLite/MySQL |
| **审计透明** | 所有 Agent 行为都以文本形式留痕 |
| **迁移简单** | 复制目录即可，无需导出导入数据库 |
| **凭证先明文** | 第一版凭证用 YAML 明文存储，后续按需加密 |

---

## 七、关键结论

1. **AWS FinOps Agent 创建是五步向导**：命名 → 授予 AWS 资源访问权限 → 授予 Web App 访问权限 → 第三方集成 → 审核创建。
2. **创建完成后分配 `agentSpaceId`**，并生成独立 webapp URL：`https://{agentSpaceId}.webapp.finops-agent.global.app.aws/`。
3. **权限模型采用双 Role 分离**：
   - `FinOpsAgentRole`：Agent 访问 AWS 资源（只读）
   - `FinOpsAgentOperatorRole`：Web app 操作 Agent 资源
4. **每个 Agent 是完全独立的实例**，数据、资源、权限不共享。
5. **NetX all-in-one 容器可以借鉴此模型**，但将控制台向导、Role、URL 等映射为容器初始化配置和本地凭证。
6. **第三方集成简化为企业微信群机器人 webhook**：替代 Jira/Slack，负责告警通知、结果推送、审批提醒。
7. **Agent 数据必须持久化**：每个 Agent 一个独立目录，Docker 启停数据不丢失。
8. **参考 OpenClaw 用文本作为历史**：YAML 存元数据、JSONL 存记录流、Markdown/JSON 存产物，不引入 SQLite。
9. **核心设计原则**：默认只读、执行与操作权限分离、按实例隔离、通过上下文文件增强 Agent 能力。
