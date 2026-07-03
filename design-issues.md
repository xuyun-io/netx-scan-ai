# NetX SRE Agent 设计分歧与待确认问题

> 目的：整理 `netx-ai/` 目录下多份设计文档之间的重复内容、冲突点和待决策事项，便于统一需求后进入实现。

---

## 一、当前文档清单

| 文档 | 主题 | 状态 |
|------|------|------|
| `finops-api-analysis.md` | AWS FinOps Agent API 分析 + API 设计风格规范 | 已完成分析 |
| `aws-finops-agent-analysis.md` | AWS FinOps Agent 产品形态/UI/功能借鉴 | 已完成分析 |
| `finops-agent-creation-analysis.md` | Agent 创建流程、权限模型、NetX all-in-one 容器设计 | 已完成分析 |
| `adk-framework-design.md` | NetX Agent 后端框架设计（ADK-Go v2） | 已有初稿 |
| `agent-ui/README.md` | 前端 UI 技术栈与已实现功能 | 已有初稿 |

---

## 二、已确认的需求（无分歧）

以下需求在多份文档中一致，可直接作为 baseline：

1. **产品形态**：all-in-one 单容器部署（管理 + Agent + Web UI）。
2. **核心实体**：AgentSpace / Task / Record / Artifact / Document（Context file）。
3. **Task 状态机**：PENDING → IN_PROGRESS → COMPLETED / FAILED；AWAITING_INPUT 用于审批。
4. **默认只读**：Agent 后端默认只读，高危操作需审批。
5. **第三方集成**：仅支持企业微信群机器人 webhook URL（告警、结果推送、审批提醒）。
6. **审批确认**：通过 Web UI 完成，企业微信仅作提醒。
7. **持久化**：Docker 启停数据不丢失，每个 Agent 独立目录。
8. **文本化历史**：参考 OpenClaw，用 YAML/JSONL/Markdown 存储历史，不引入 SQLite。
9. **凭证**：第一版明文 YAML 存储，后续按需加密。
10. **产物中心**：Artifacts 统一归档管理。

---

## 三、待确认的分歧与问题

### Issue 1：后端技术栈选 Go 还是 Python？

**分歧**：
- `adk-framework-design.md` 明确使用 **Google ADK-Go v2**。
- `agent-ui/README.md` 中提到后端预留为 **FastAPI + Google ADK**（Python）。

**影响**：
- 决定后端语言、框架、工具生态。
- 影响 Docker 镜像、依赖管理、开发环境。

**建议**：
- 如果团队更熟悉 Go 且 ADK-Go v2 已可用，统一用 Go。
- 如果 Google ADK Python 更成熟、工具更多，可改用 Python。

**✅ 已确认**：使用 **Go + Google ADK-Go v2**。

---

### Issue 2：持久化用文本文件还是 PostgreSQL？

**分歧**：
- `finops-agent-creation-analysis.md`：参考 OpenClaw，**纯文本文件**（YAML/JSONL），每个 Agent 一个目录。
- `adk-framework-design.md`：`Store` 是 interface，**开发用 memory，生产换 PostgreSQL**。

**影响**：
- 决定数据存储、查询、备份、迁移方案。
- 影响 Docker volume 设计和性能。

**建议**：
- 第一版按用户要求用文本文件（已确认）。
- `adk-framework-design.md` 中的 Store interface 可保留，但默认实现改为 FileStore。

**✅ 已确认**：第一版完全使用文本文件。PostgreSQL 作为后续可选扩展。需要设计索引文件（如 `index.yaml` 或 `index.jsonl`）加速 Task/Conversation/Document 列表查询。

---

### Issue 3：API 风格用 AWS 全 POST 还是 RESTful？

**分歧**：
- `finops-api-analysis.md` 第 11 节：总结 FinOps 风格为 **全 POST + 动词命名 + body 传 ID**（如 `/createTask`、`/listDocuments`）。
- `adk-framework-design.md` 和 `agent-ui/README.md`：使用 **RESTful 风格**（如 `GET /api/tasks`、`POST /api/tasks`）。

**影响**：
- 决定前后端接口契约。
- 影响前端请求代码生成。

**建议**：
- NetX 是内部 Web 工具，推荐 **RESTful 风格**，更符合前端习惯。
- FinOps 全 POST 风格作为参考即可，不强制照搬。

**✅ 已确认**：统一使用 **AWS FinOps 风格的全 POST API**（`/createTask`、`/listTasks`、`/getTask` 等），不采用 RESTful 路径方法。

---

### Issue 4：是否支持多 Agent（多 AgentSpace）？

**分歧**：
- `finops-agent-creation-analysis.md`：强调每个 Agent 一个 `agentSpaceId`，一个独立目录 `/data/agents/{agentSpaceId}/`。
- `adk-framework-design.md`：目录结构和 API 似乎默认单 Agent 实例，未体现 AgentSpaceId。

**影响**：
- 决定数据目录结构、API 路径、是否需要 space 隔离。
- 影响第一版复杂度。

**建议**：
- 第一版支持单 AgentSpace（简化），但目录结构预留 `/data/agents/{agentSpaceId}/`，便于后续扩展。
- API 路径可先用 `/api/...`，后续如需多 space 再加 `/api/spaces/{spaceId}/...`。

**✅ 已确认**：第一版支持 **多 Agent（多 AgentSpace）**。API 采用扁平路径，spaceId 放在请求 body 中，不体现在 URL 路径里。

---

### Issue 5：Conversation/Turn 模型是否第一版实现？

**分歧**：
- `finops-api-analysis.md`：推荐完整的 Conversation + Turn + Task + Record + Artifact + Document 六层模型。
- `adk-framework-design.md`：以 Task 为主，Chat 通过 `POST /api/chat` 和 `GET /api/chat/stream` 处理，未明确 Conversation/Turn。

**影响**：
- 决定聊天历史的存储结构。
- 影响前端 Chat 面板的实现。

**建议**：
- 第一版优先实现 Task + Record + Artifact + Document。
- Chat 可先简化为 single-turn 或简单多轮，Conversation/Turn 作为后续增强。

**✅ 已确认**：第一版实现完整的 **Conversation + Turn** 多轮聊天，并持久化保存历史。

---

### Issue 6：执行记录用 Record 模型还是 TaskLog？

**分歧**：
- `finops-api-analysis.md`：详细的 **Record 模型**（RESPONSE / TOOL_CALL / TOOL_RESULT / MEMORY_ACCESS / STATUS / ERROR）。
- `adk-framework-design.md`：`Task` 结构体中包含 `Logs []TaskLog`，字段为 timestamp / level / message / metadata。

**影响**：
- 决定执行过程的数据结构和前端展示方式。
- Record 模型更细粒度，TaskLog 更偏向日志。

**建议**：
- 统一采用 **Record 模型**（`records.jsonl`），它既是执行日志，也是聊天消息来源。
- 前端展示时把 Record 渲染为消息/工具调用/结果。

**✅ 已确认**：统一使用 **Record 模型**。`TaskLog` 概念废弃，执行过程全部用 `records.jsonl` 记录。

---

### Issue 7：前端技术栈用 Cloudscape 还是 shadcn/Tailwind？

**分歧**：
- `adk-framework-design.md`：提到 **Cloudscape React 前端**。
- `agent-ui/README.md`：实际使用 **React + Vite + Tailwind CSS + shadcn/Radix**。

**影响**：
- 决定前端组件库和 UI 风格。
- `agent-ui` 已经用 shadcn/ui 实现了大部分界面。

**建议**：
- 以 `agent-ui/README.md` 为准，继续使用 shadcn/ui + Tailwind。
- `adk-framework-design.md` 中的 Cloudscape 描述需要修正。

**✅ 已确认**：统一使用 **shadcn/ui + Tailwind CSS**，不再使用 Cloudscape。

---

### Issue 8：事件推送用 SSE/WebSocket 还是轮询？

**分歧**：
- `finops-api-analysis.md`：FinOps 使用轮询（`getTask`、`getTurn`）。
- `adk-framework-design.md` 和 `agent-ui/README.md`：使用 **SSE/WebSocket**（`/api/chat/stream`）。

**影响**：
- 决定前端获取任务进度和聊天流的方式。

**建议**：
- 聊天输出用 SSE 流式返回。
- Task 状态更新可先用轮询，后续增强为 SSE/WebSocket。
- 第一版不要同时维护多种推送机制。

**✅ 已确认**：采用 **FinOps 风格轮询**。
- Chat 也先使用轮询获取 Turn 结果。
- Task 进度通过轮询 `getTask` 获取。
- SSE 作为后续可选优化。

---

### Issue 9：Automation（自动化）是否第一版实现？

**分歧**：
- `aws-finops-agent-analysis.md`：Automations 是 FinOps 的重要模块（定时/事件触发）。
- `adk-framework-design.md`：规划了 `/api/automations` 接口。
- `finops-api-analysis.md`：未将 Automation 作为核心实体。

**影响**：
- 决定第一版范围。
- 自动化需要定时调度器（cron / scheduler）。

**建议**：
- 第一版先实现手动 Task 和 Chat，Automation 作为第二版。
- 但 API 和数据库模型可预留 Automation 字段（如 Task.automationId）。

**✅ 已确认**：第一版**不包含 Automation**。模型中可预留 `automationId` 字段，但 UI 和调度器暂不实现。

---

### Issue 10：LLM 后端用哪个模型？

**分歧**：
- `adk-framework-design.md`：启动命令示例用 `GEMINI_API_KEY`。
- 其他文档未明确 LLM 选型。

**影响**：
- 决定 Agent 推理能力、成本、部署环境。
- 影响是否需要翻墙、API 稳定性等。

**建议**：
- 第一版支持 OpenAI-compatible API，便于切换不同模型。
- 可优先试用 Gemini / Claude / 国产大模型。

**✅ 已确认**：LLM 在**创建 Agent 时指定**（如 Gemini、Claude、OpenAI-compatible 等）。后端需要支持多模型切换，每个 Agent 独立绑定一个 LLM 配置。

---

### Issue 11：Context Files / Documents 命名统一

**分歧**：
- `finops-api-analysis.md`：使用 **Document**。
- `adk-framework-design.md` 和 `agent-ui/README.md`：使用 **Context files** / `context-files`。

**影响**：
- API 路径、数据库表名、前端代码命名。

**建议**：
- 对外产品概念用 **Context files**（贴近 UI）。
- 内部实体/API 可用 **Document**（如 `documents` 表/目录）。
- 或统一为 `documents`，前端菜单仍显示 Context files。

**✅ 已确认**：
- 内部实体/API/目录使用 `documents`。
- 前端 UI 菜单显示为 "Context files"。

---

### Issue 12：Artifact 存储路径和访问方式

**分歧**：
- `finops-agent-creation-analysis.md`：Artifacts 作为文件放在 `/data/agents/{agentSpaceId}/tasks/{taskId}/artifacts/`。
- `adk-framework-design.md`：API 规划为 `GET /api/artifacts` 和 `GET /api/artifacts/{id}`。

**影响**：
- Artifact 是否按 task 分组存储？
- API 中 artifact ID 如何映射到文件路径？

**建议**：
- 文件按 `/data/agents/{agentSpaceId}/artifacts/{artifactId}-{name}` 平铺存储。
- `task.yaml` 中记录关联的 artifact IDs。
- 便于按 task 过滤，也便于全局产物列表。

**✅ 已确认**：Artifacts 文件按 `/data/agents/{agentSpaceId}/artifacts/{artifactId}-{name}` 平铺存储。`task.yaml` 中记录关联的 artifact IDs。

---

### Issue 13：容器进程方案

**分歧**：
- `adk-framework-design.md`：推荐 Go server 直接 serve 静态文件（方案 A），也提到 supervisord + nginx（方案 B）。
- 其他文档未涉及。

**影响**：
- Dockerfile 和进程管理。

**建议**：
- 第一版用方案 A：Go server 同时提供 API 和静态文件。
- 最简单，端口最少。

**✅ 已确认**：使用方案 A，Go server 同时 serve API 和静态前端文件。

---

## 四、文档整理建议

1. **`adk-framework-design.md` 需要大修**：
   - 后端语言/框架最终确认后统一描述。
   - 存储方案从 PostgreSQL 改为 FileStore（文本文件）。
   - 前端技术栈从 Cloudscape 改为 shadcn/ui。
   - Task 模型中 Logs 改为 Records。
   - API 路径从 RESTful 细化并与 FinOps 参考区分。
   - 明确第一版范围（是否含 Automation、Conversation/Turn、多 Agent）。

2. **`finops-api-analysis.md` 作为参考文档保留**：
   - 不直接作为 NetX API 规范，只作为 FinOps API 分析参考。
   - 第 11 节设计风格规范可保留，但注明 NetX 可能不完全遵循。

3. **`finops-agent-creation-analysis.md` 作为部署/权限参考**：
   - 已较完整，后续根据技术栈确认后微调。

4. **`agent-ui/README.md` 作为前端事实来源**：
   - 已实现的 UI 为准，后端 API 与之对接。

---

## 五、待用户确认问题清单（按优先级）

1. **后端技术栈**：Go（ADK-Go v2）还是 Python（FastAPI + ADK Python）？
2. **第一版范围**：是否包含 Automation、Conversation/Turn、多 AgentSpace？
3. **API 风格**：RESTful 还是 AWS 全 POST？
4. **事件推送**：SSE 用于 Chat，Task 用轮询还是 SSE？
5. **LLM 选型**：Gemini / Claude / 其他？
6. **Artifact 目录结构**：平铺还是按 task 分组？

确认以上问题后，可整理出一份统一的 `netx-ai/requirements.md` 或更新 `adk-framework-design.md` 作为最终设计文档。

---

## 六、已确认决策汇总

| # | 问题 | 决策 |
|---|------|------|
| 1 | 后端技术栈 | **Go + Google ADK-Go v2** |
| 2 | 持久化 | **文本文件**（YAML/JSONL/Markdown），需设计索引文件 |
| 3 | API 风格 | **AWS FinOps 全 POST 风格**（`/createTask`、`/listTasks`） |
| 4 | 多 Agent | 第一版支持 **多 AgentSpace** |
| 5 | Conversation/Turn | 第一版实现完整 **Conversation + Turn** |
| 6 | 执行记录 | **Record 模型**（RESPONSE/TOOL_CALL/TOOL_RESULT/...） |
| 7 | 前端技术栈 | **shadcn/ui + Tailwind CSS** |
| 8 | 事件推送 | **FinOps 风格轮询**（SSE 后续优化） |
| 9 | Automation | 第一版**不包含** |
| 10 | LLM 选型 | **创建 Agent 时指定**，支持多模型 |
| 11 | Documents 命名 | 内部用 `documents`，前端显示 "Context files" |
| 12 | Artifact 存储 | **平铺存储**在 `/data/agents/{agentSpaceId}/artifacts/` |
| 13 | 容器进程 | Go server 同时 serve API + 静态前端 |

---

## 七、下一步

基于以上确认决策，整理统一需求文档 `netx-ai/requirements.md`，并据此修正 `adk-framework-design.md`、`agent-ui/README.md` 等文档中的冲突。

---

## 八、基于官方文档的新发现与待确认问题

详细分析见：`finops-official-features-analysis.md`

### 新增 Issue 14：Turn 与 Task 的关系

**官方行为**：简单问答直接在 conversation 中回复，不创建 Task；只有需要长时间处理或用户明确要求时才创建 Task。

**NetX 当前设计**：`createTurn` 返回 202，但未明确是否每次 turn 都创建 Task。

**✅ 已确认**：
- `createTurn` 统一返回 202，但简单问题 Agent 快速处理，Turn 直接 COMPLETED。
- 复杂执行时，Turn 内部创建 Task，返回 `taskId`。
- LLM 根据用户意图和工具调用复杂度决定是否创建 Task。

---

### 新增 Issue 15：审批模型需要细化

**官方行为**：
- Read-only：无需审批
- Slack 发送：无需审批
- Jira 写操作：chat/on-demand 需要审批；automation 预授权

**NetX 当前设计**："默认只读，高危操作需审批"，未区分动作和触发方式。

**✅ 已确认**：
- 企业微信发送消息：**不需要审批**，仅作为通知渠道。
- 审批必须回到 **Web UI** 完成，企业微信不支持直接审批按钮。
- Read-write 高风险操作：重启节点、执行 SSM 命令、修改配置等，在 chat/on-demand 中需审批。
- Automation 中的高风险操作可 **预授权**。

---

### 新增 Issue 16：Context files 限制和 soft-delete

**官方行为**：支持 7 种文件类型，10 MB/文件，100 MB/Agent，soft-delete + restore，Agent 只读。

**NetX 当前设计**：未明确限制和删除策略。

**✅ 已确认**：
- 采用官方相同限制：支持 `.txt`, `.csv`, `.json`, `.md`, `.html`, `.yaml`, `.yml`；10 MB/文件；100 MB/Agent。
- Context files 支持 **soft-delete + restore**。
- Agent 对 Context files **只读**，不能通过对话修改或删除。

---

### 新增 Issue 17：Memory 定义

**官方行为**：Memory 是用户偏好、修正、已知事实的跨会话记忆，可通过自然语言管理。

**NetX 当前设计**：有 memory/ 目录但无明确说明。

**✅ 已确认**：
- Memory 记录用户偏好、修正、已知事实（如默认时间范围、节点归属团队、常见例外规则）。
- 用户可通过自然语言管理："记住 xxx"、"更新 xxx"、"忘记 xxx"。

---

### 新增 Issue 18：Quotas / Limits

**官方行为**：明确的文件大小、存储、消息长度限制。

**NetX 当前设计**：未定义。

**✅ 已确认**：
- 单个消息最大长度：1,000 字符。
- 单个 Context file：10 MB。
- 每个 Agent Context files 总计：100 MB。
- 每个 Agent Artifacts 总计：100 MB。

---

### 新增 Issue 19：Web app 认证

**官方行为**：通过 AWS Console session 认证，30 分钟过期。

**NetX 当前设计**：未涉及认证。

**✅ 已确认**：
- 第一版采用 **内网登录** 方案：部署在内网，默认无需登录。
- 可选通过环境变量配置简单 token 或 basic auth。
- v2 增加用户登录和 session 管理。

---

### 新增 Issue 20：Artifact 格式

**官方行为**：HTML/PDF/PPT，生成后做 QA pass。

**NetX 当前设计**：泛化 Artifact，未限定格式。

**✅ 已确认**：
- 第一版 Artifact 支持 Markdown、HTML、JSON、CSV、纯文本。
- PDF/PPT 作为 v2。

---

### 新增 Issue 21：Domain constraint

**官方行为**：Agent 约束在 FinOps 领域，不回答外部问题。

**NetX 当前设计**：未明确领域约束。

**✅ 已确认**：
- Root prompt 约束 Agent 只回答 NetX Chain287 SRE 相关问题。
- 默认语言为 **中文**。

---

### 新增 Issue 22：长会话摘要

**官方行为**：接近上下文窗口时自动摘要旧消息。

**NetX 当前设计**：未提及。

**✅ 已确认**：
- 长会话自动摘要作为 **v2 优化**。
- Conversation 模型预留 `summary` 字段。

---

### 新增 Issue 23：数据删除策略

**官方行为**：
- Context files：soft-delete + restore
- Conversations/Tasks：preview 期间不能单独删除
- Artifacts：可单独删除

**NetX 当前设计**：未明确。

**✅ 已确认**：
- 允许删除单个 Conversation 和 Task。
- Context files 采用 soft-delete + restore。
- Artifacts 可硬删除。

---

## 九、全部问题已确认

所有分歧和待确认问题均已解决。最终决策汇总：

| # | 问题 | 最终决策 |
|---|------|---------|
| 14 | Turn vs Task | 简单问题直接回复，复杂执行创建 Task |
| 15 | 审批模型 | 企业微信不审批；高风险写操作 chat/on-demand 审批；automation 预授权 |
| 16 | Context files | 7 种类型，10 MB/100 MB，soft-delete，Agent 只读 |
| 17 | Memory | 用户偏好/修正/事实，自然语言管理 |
| 18 | Quotas | 消息 1,000 字符；Context/Artifact 各 100 MB |
| 19 | 认证 | 内网部署，默认无需登录，可选 token |
| 20 | Artifact 格式 | 第一版 MD/HTML/JSON/CSV/TXT；PDF/PPT v2 |
| 21 | 领域/语言 | Chain287 SRE 领域，中文 |
| 22 | 长会话摘要 | v2 |
| 23 | 删除策略 | Context soft-delete；Conversation/Task/Artifact 可删除 |

**需求文档 `requirements.md` 已据此定稿，可作为项目唯一需求来源。**
