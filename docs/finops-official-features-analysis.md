# AWS FinOps Agent 官方功能分析与 NetX 设计对照

> 来源：[AWS FinOps Agent User Guide](https://docs.aws.amazon.com/finops-agent/latest/userguide/what-is.html)
> 目的：逐条理解官方功能和使用场景，检查 NetX SRE Agent 设计是否存在不合理或遗漏。

---

## 一、官方核心功能和使用场景

### 1.1 自然语言成本查询（Cost inquiry）

**使用场景**：用户在聊天中直接问成本相关问题，Agent 即时回答。

**示例**：
- "上个月 AWS 成本是多少？"
- "按服务 breakdown 前五大成本驱动因素"
- "未来一个月成本预测？"

**关键行为**：
- Agent 直接在当前 conversation 中回复，**不创建 Task**。
- 只有当请求需要长时间处理时，才会在对话中建议或应要求创建 Task。

---

### 1.2 成本异常调查（Cost anomaly investigation）

**使用场景**：发现成本异常后，Agent 进行根因分析。

**示例**：
- "过去 7 天有没有成本异常？调查一下。"
- "为什么这周成本突然涨了？"

**关键行为**：
- Agent 分析异常详情、影响、rate-vs-usage。
- 如果启用了 CloudTrail，会关联 API 活动。
- 结果可以直接在聊天中展示，也可以保存为文件、创建 Jira ticket、发到 Slack。

---

### 1.3 事件触发的异常调查（Event-triggered investigation）

**使用场景**：AWS Cost Anomaly Detection 产生异常事件时，自动触发 Agent 调查并通知。

**关键行为**：
- 用户在聊天中描述触发条件和响应动作，Agent 创建一个 **event-based automation**。
- 后台使用 AWS EventBridge managed rule 接收事件。
- 每次匹配事件到达，Agent 自动创建 Task 执行调查，并将摘要发到 Slack。
- 发到 Slack 不需要审批；如果包含 Jira ticket 创建，则在设置 automation 时**预授权**。

---

### 1.4 优化建议（Optimization recommendations）

**使用场景**：从多个 AWS 优化服务汇总节省机会。

**示例**：
- "列出所有优化机会，按节省金额排序"
- "每周一审查新优化机会并创建 Jira ticket"

**关键行为**：
- 聚合 Cost Optimization Hub 和 Compute Optimizer 建议。
- 支持按账户、Region、服务、操作类型、工作量、最低节省金额过滤。
- 可汇总为 Jira ticket。
- 可作为 scheduled automation 定期执行。

---

### 1.5 自定义成本报告（Custom cost reporting）

**使用场景**：生成可下载的财务报告。

**输出格式**：
- HTML（默认，浏览器查看）
- PDF（归档、邮件附件）
- PPT（高管汇报）

**关键行为**：
- Agent 从 Cost Explorer 和 Cost Anomaly Detection 取数。
- 生成图表、统计 callout、对比列等可视化元素。
- 生成后会做一次 QA pass，检查视觉问题。
- 报告作为 Artifact 交付。
- 可作为 scheduled automation 定期生成。

---

### 1.6 上下文文件（Context files）

**常见用途**：

| Context file 类型 | 作用 |
|------------------|------|
| Account-to-team mapping | 将成本归属到负责团队 |
| Organization structure | 跨业务单元分摊成本 |
| Custom instructions | 每次运行都遵循的规则 |
| Company background | 校准沟通风格 |
| Report templates | 复用现有报告格式 |

**限制**：
- 文件类型：`.txt`, `.csv`, `.json`, `.md`, `.html`, `.yaml`, `.yml`
- 单个文件最大：10 MB
- 每个 Agent 总计：100 MB
- **Context files 对 Agent 只读**，不能通过对话修改或删除。
- 支持 soft-delete + restore。

---

### 1.7 记忆（Memory）

**使用场景**：Agent 记住用户偏好和修正，在后续会话中自动应用。

**记忆内容示例**：
- 用户姓名和角色
- 账户 ID 和所有者
- 偏好的成本视图或报告格式
- Jira space keys 和团队分配
- 过去调查或任务的结果
- 用户在对话中提供的修正

**关键行为**：
- 用户可以通过自然语言让 Agent "remember"、"update"、"forget"。
- 记忆与会话无关，跨会话保留。

---

### 1.8 Task 管理

**三种 Task 类型**：

| 类型 | 触发方式 | 特点 |
|------|---------|------|
| On-demand | 用户即时创建 | 不阻塞对话，后台执行 |
| Scheduled | 定时触发 | 生成 recurring automation |
| Event-based | 事件触发 | 监听外部事件 |

**关键行为**：
- On-demand Task 可以从聊天中创建（"Create a task to..."），也可以从 Tasks workspace 创建。
- Agent **只在被要求时才创建 Task**，其他请求直接在对话中回答。
- Scheduled 和 Event-based 会创建 Automation，Automation 每次触发生成新的 Task。

---

### 1.9 审批模型（Agent guardrail controls）

官方将动作分为两类：

#### Read-only actions

以下操作自动执行，无需审批：
- 查询成本数据
- 获取优化建议
- 搜索 memory
- 读取 context files
- 生成报告
- 发送 Slack 消息

#### Read-write actions

- **创建 Jira issue / 添加 Jira comment**：
  - 从 chat 或 on-demand task 触发时**需要审批**。
  - 从 scheduled / event-based automation 触发时**预授权**，无需每次审批。
- **发送 Slack 消息**：
  - 不需要审批，包括从 chat 和 on-demand task。

---

### 1.10 Web 应用布局

- 左侧导航：New chat、Tasks、Automations、Artifacts、Context files、Recent
- 中间：聊天区
- 右侧：Workspace 面板
- 会话最大消息长度：1,000 字符
- 每个 conversation 保持独立上下文
- Recent 列表显示历史 conversation，可重新打开

---

### 1.11 数据隔离与保护

- 每个 Agent 是完全独立的实例。
- 不共享 context files、conversations、memory、artifacts、task data。
- Context files、memory、artifacts 使用 KMS 加密存储。
- Conversation history 和 task records 与每个 conversation/task 一起存储。
- 删除 Agent 会清除所有数据。
- Context files 可 soft-delete 和 restore。
- Conversations 和 Tasks 在 preview 期间不能单独删除，只能随 Agent 删除。

---

### 1.12 Quotas

| 配额 | 默认值 |
|------|--------|
| 每个账户每个 Region 的 Agent 数 | 1 |
| 每个 Agent 的 Artifact 存储 | 100 MB |
| 单个 Context file 大小 | 10 MB |
| 每个 Agent 的 Context file 总存储 | 100 MB |

---

## 二、NetX 设计对照与问题识别

### 问题 1：并非所有聊天都会创建 Task

**官方行为**：
- 简单问答直接在 conversation 中回复。
- 只有需要长时间处理或用户明确要求时才创建 Task。

**NetX 当前设计**：
- 设计了 Conversation + Turn + Task，但没有明确 LLM 如何决定是否创建 Task。
- `createTurn` 返回 202 可能暗示每次 turn 都是异步的。

**风险**：
- 如果每次聊天都走 Task，简单问答也会延迟，体验差。

**建议**：
- `createTurn` 202 表示轮次进入处理，但**大多数简单问题可以快速同步返回**。
- 或者 `createTurn` 后，Agent 判断是否需要创建 Task：
  - 简单查询：Turn 直接 COMPLETED，结果在 Turn output 中。
  - 复杂执行：Turn 内部创建 Task，返回 taskId，前端展示 "已创建任务 #xxx"。

**是否需要更新需求**：是，明确 Turn 与 Task 的关系。

---

### 问题 2：审批模型过于简单

**官方行为**：
- Read-only 全部自动执行。
- Slack 发送不需要审批。
- Jira 写操作在 chat/on-demand 中需要审批，在 automation 中预授权。

**NetX 当前设计**：
- "默认只读，高危操作需审批 via Web UI"。
- 没有区分 task 类型和具体动作。

**风险**：
- 企业微信消息被当作"写操作"可能会错误地要求审批。
- 自动化任务中的写操作如果也需要审批，就无法端到端自动运行。

**建议**：
- 定义 NetX 的 read-only / read-write 动作：
  - **Read-only**：查询链上数据、节点状态、日志、读取 context files/memory、生成报告。
  - **Read-write**：
    - 发送企业微信消息：**不需要审批**（类似 Slack）。
    - 重启节点、修改配置、执行 SSM 命令等：**chat/on-demand 中需要审批**；**automation 中可预授权**。

**是否需要更新需求**：是，细化审批模型。

---

### 问题 3：Context files 用途和限制未明确

**官方行为**：
- 明确推荐 account-to-team mapping 作为第一个上传文件。
- 支持 7 种文件类型，10 MB / 100 MB 限制。
- Agent 对 context files 只读。
- 支持 soft-delete + restore。

**NetX 当前设计**：
- 仅泛化地提到 "上传 chain287 部署文档、节点清单、运行手册"。
- 未定义文件类型限制、大小限制、soft-delete。

**建议**：
- 定义 NetX context files 的典型用途：
  - 节点到团队/责任人映射
  - 链上部署架构
  - 巡检规则/例外
  - 报告模板
  - 自定义指令
- 限制：与官方一致或根据实际调整。
- 实现 soft-delete。
- 明确 Agent 不能通过对话修改 context files。

**是否需要更新需求**：是。

---

### 问题 4：Memory 的定义模糊

**官方行为**：
- Memory 是用户偏好、修正、已知事实的跨会话记忆。
- 用户可以通过自然语言管理 memory。

**NetX 当前设计**：
- 有 `memory/memories.jsonl`，但没有说明具体记录什么、如何写入。

**建议**：
- Memory 记录：
  - 用户偏好（如 "默认显示最近 24 小时"）
  - 节点归属团队
  - 常见 false positive 的修正
  - 报告格式偏好
- 提供自然语言命令："记住 xxx"、"更新 xxx"、"忘记 xxx"。

**是否需要更新需求**：是，补充 memory 定义。

---

### 问题 5：缺少长会话自动摘要

**官方行为**：
- 当 conversation 接近 LLM 上下文窗口时，自动摘要旧消息，保留关键结论和当前状态。

**NetX 当前设计**：
- 未提及。

**建议**：
- 第一版可不做自动摘要，但 Conversation 模型应预留 summary 字段。
- 文档中标注为 v2 优化项。

**是否需要更新需求**：是，作为已知限制/v2 项。

---

### 问题 6：Artifact 生成和 QA 流程

**官方行为**：
- 支持 HTML/PDF/PPT。
- 生成报告后做 QA pass 检查视觉问题。
- 报告含图表、callout、对比列。

**NetX 当前设计**：
- 泛化的 Artifact 模型，未限定格式和 QA。

**建议**：
- 第一版优先支持 Markdown/HTML Artifact。
- PDF/PPT 作为 v2。
- QA pass 作为 v2。

**是否需要更新需求**：是，明确第一版 Artifact 格式。

---

### 问题 7：会话认证和过期

**官方行为**：
- Web app 通过 AWS Console session 认证。
- 每个 session 30 分钟，过期后重定向到 AWS Console 重新认证。

**NetX 当前设计**：
- 未涉及认证和 session 管理。

**建议**：
- 第一版可简化：内部网络访问，无认证或简单 token。
- 或采用登录页 + session cookie。
- 需要明确决策。

**是否需要更新需求**：是，新增待确认问题。

---

### 问题 8：缺少 Quotas/Limits

**官方行为**：
- 明确的文件大小和存储配额。

**NetX 当前设计**：
- 未定义。

**建议**：
- 定义第一版限制：
  - 单个 Context file：10 MB
  - 每个 Agent Context files 总计：100 MB
  - 每个 Agent Artifact 存储：100 MB
  - 单个消息：1,000 字符

**是否需要更新需求**：是。

---

### 问题 9：Automation 预授权模型

**官方行为**：
- Automation 中的 Jira 写操作在创建时预授权。
- 后续每次触发无需审批。

**NetX 当前设计**：
- Automation 被放到 v2，但审批模型没有为 automation 预留。

**建议**：
- 在审批模型设计时预留 automation 预授权机制。
- 即使 v1 不实现 automation，Task 模型中保留 `automationId` 和 `preAuthorized` 概念。

**是否需要更新需求**：是，在 Task 模型中体现。

---

### 问题 10：Domain constraint（领域约束）

**官方行为**：
- Agent 被约束在 FinOps 领域内，不回答外部问题，默认英文。

**NetX 当前设计**：
- 未明确领域约束。

**建议**：
- 在 root prompt 中约束 Agent 只回答 NetX Chain287 SRE 相关问题。
- 多语言支持：第一版中文，后续支持英文。

**是否需要更新需求**：是，补充到 prompt 设计。

---

### 问题 11：数据删除策略

**官方行为**：
- Context files：soft-delete + restore。
- Conversations/Tasks：preview 期间不能单独删除，只能随 Agent 删除。
- Artifacts：可单独删除。

**NetX 当前设计**：
- 未明确删除策略。

**建议**：
- Context files：soft-delete。
- Artifacts：可删除。
- Conversations/Tasks：第一版允许删除（比官方更灵活），或参考官方限制。

**是否需要更新需求**：是。

---

## 三、NetX 设计需要补充/修正的清单

| # | 问题 | 优先级 | 动作 |
|---|------|--------|------|
| 1 | Turn 与 Task 的关系 | 高 | 明确 LLM 决定是否创建 Task |
| 2 | 审批模型细化 | 高 | 区分 read-only/read-write/task 类型 |
| 3 | Context files 用途/限制 | 中 | 定义典型用途、文件类型、大小限制、soft-delete |
| 4 | Memory 定义 | 中 | 明确记忆内容和自然语言管理 |
| 5 | Quotas/Limits | 中 | 定义文件大小、存储、消息长度限制 |
| 6 | Domain constraint | 中 | Root prompt 约束领域 |
| 7 | Artifact 格式 | 中 | 第一版 Markdown/HTML，PDF/PPT v2 |
| 8 | 认证/Session | 中 | 决定 Web app 认证方式 |
| 9 | 长会话摘要 | 低 | v2 优化 |
| 10 | Artifact QA pass | 低 | v2 优化 |

---

## 四、关键结论

1. **官方 FinOps Agent 的核心体验是"聊天为主、Task 为辅"**：简单问题即时回答，复杂执行才创建 Task。
2. **审批模型是按动作和触发方式细分的**：read-only 全放行，Slack 发送不审批，Jira 写在 chat/on-demand 中审批、automation 中预授权。
3. **Context files 和 Memory 是两个独立概念**：Context files 是组织知识，Memory 是用户偏好和修正。
4. **Automation 是生产力放大器**：event-based 和 scheduled 自动化减少人工重复操作。
5. **NetX 设计大方向正确**，但需要在 **Task 创建逻辑、审批模型、Context files 细节、Memory 定义、Limits、认证** 等方面补充和细化。
