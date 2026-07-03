# AWS FinOps Agent 学习总结

> 来源：Agent UI 截图 + AWS 官方文档/公开预览资料
> 目的：借鉴其产品形态与交互框架，用于后续 NetX Chain SRE Agent 设计

---

## 一、产品定位

AWS FinOps Agent 是一个 **基于自然语言的云成本运维 AI Agent**，构建在 Amazon Bedrock 之上。它把原本分散在多个 AWS 控制台的成本工具（Cost Explorer、Cost Anomaly Detection、Cost Optimization Hub、Compute Optimizer、CloudTrail）统一到一个对话式界面中，让 FinOps/工程/财务人员用自然语言完成成本分析、异常调查、报告生成和自动化任务。

核心特点：
- **只读访问 AWS 资源**：默认 IAM Role 为只读，不修改基础设施
- **外部写操作可控**：仅向企业微信等集成点发送通知/创建工单
- **多账户可见**：部署在 Management Account 可看所有 member account
- **无需模型知识**：底层 Bedrock 对用户透明

---

## 二、前端 UI 结构与功能模块

从 UI 截图可看出，整体采用 **左侧导航 + 中间聊天 + 右侧详情面板** 的三栏布局。

### 2.1 左侧导航

| 菜单项 | 功能 |
|--------|------|
| **New chat** | 新建一个自然语言会话 |
| **Tasks** | 查看所有已委托任务（含状态、优先级、触发方式） |
| **Automations** | 管理定时/事件驱动的自动化任务 |
| **Artifacts** | 查看 Agent 生成的产物（HTML 报告、PPT、CSV 等） |
| **Context files** | 上传环境相关文档，作为 Agent 的额外上下文 |
| **Recent** | 最近会话/任务快捷入口 |

### 2.2 中间主面板：Chat / Delegate Work

核心入口是一个**自然语言输入框**，上方标题为 **"Delegate work to FinOps Agent"**。

输入框特性：
- 最大 1000 字符
- 支持直接发送或选择下方预设 Prompt
- 结果在聊天流中展示

预设常见任务模板（图片中可见）：

1. Find EC2 rightsizing opportunities and create an HTML report.
2. Check my S3 costs daily at 12 PM EST.
3. Investigate cost anomalies in the last 7 days. Correlate with CloudTrail to identify the API calls and IAM principals behind them.
4. Automate Cost Anomaly Detection events for anomalies over $100 and post to 企业微信成本告警群.
5. What was my cost in May 2026, and how did it change compared to the prior month?
6. Summarize cost trends and savings opportunities in an executive-ready report in ppt.
7. Do I have any idle RDS instances? What are the procedures if I want to delete them?
8. Create a 企业微信运维工单 in space ENG summarizing idle RDS findings and recommended actions per instance.

### 2.3 右侧详情面板

根据左侧菜单切换，展示不同功能的详情页：

#### Tasks 页面
- 显示 **Recent request updates**
- 任务队列支持筛选：
  - All tasks
  - Awaiting approval
  - In progress
  - Completed
- 列表字段：Task name、Status、Priority、Type、Automation、Last updated at
- 支持搜索、批量 Actions、Create tasks

#### Create Task 页面
- **Instructions**：详细描述想让 Agent 做什么，提示需要指定 account、service、time range、output format
- **When to run**：
  - Run once（立即执行一次）
  - Run on a schedule（定时重复）
  - Run when an event occurs（事件触发，如成本异常检测）
- **Priority**：Normal / 可配置

#### Automations 页面
- 列出所有循环/事件触发的自动化
- 字段：Name、Trigger、Status、Enabled、Last triggered、Created
- 支持 Create automation

#### Create Automation 页面
- 同样包含 Instructions
- **When to run**：
  - Run once
  - Run on a schedule（可设置频率 Weekly/Daily、Delivery day、Delivery time、时区）
  - Run when an event occurs（如 cost anomaly detected）
- **Name / Description**：命名和描述自动化
- **Schedule**：
  - Frequency
  - Delivery day（Mon-Sun 多选）
  - Delivery time + 时区
- **Priority**

#### Artifacts 页面
- 显示 Agent 生成的所有产物
- 字段：Name、Type、Size、Created at
- 支持搜索、Actions

#### Context Files 页面
- 用于上传环境相关文档，让 Agent 更了解当前环境
- 支持格式：`.txt, .csv, .json, .md, .html, .yaml, .yml`
- 最大文件大小：10 MB
- 用途示例：上传 cost policies、tagging standards、组织成本分摊规则等

---

## 三、核心功能逻辑

```
用户输入（自然语言）
    │
    ▼
┌─────────────────┐
│  Intent 理解    │  ← Bedrock LLM 解析用户意图
└────────┬────────┘
         ▼
┌─────────────────┐
│  Skill/Tool 编排 │  ← 决定调用哪些 AWS 服务/工具
└────────┬────────┘
         ▼
┌─────────────────┐
│  数据查询与关联  │  ← Cost Explorer + CloudTrail + Anomaly + ...
└────────┬────────┘
         ▼
┌─────────────────┐
│  分析与推理     │  ← 找出根因、节省机会、异常来源
└────────┬────────┘
         ▼
┌─────────────────┐
│  生成输出       │  ← 聊天回复 / HTML报告 / PPT / 企业微信通知/工单
└─────────────────┘
```

### 3.1 交互模式

| 模式 | 说明 |
|------|------|
| **Ad-hoc 问答** | 用户在聊天框直接提问，Agent 即时回答 |
| **任务委托** | 用户描述任务，Agent 创建 Task 并异步执行 |
| **自动化** | 用户配置重复规则，Agent 按 schedule/event 自动执行 |
| **产物管理** | 报告/文件统一归档到 Artifacts，便于后续查看 |
| **上下文增强** | 通过 Context files 注入领域知识，提升回答质量 |

### 3.2 触发机制

1. **Run once**：一次性即时任务
2. **Run on a schedule**：定时重复（如每周一上午 8 点发送成本报告）
3. **Run when an event occurs**：事件驱动（如 Cost Anomaly Detection 触发后自动调查）

### 3.3 审批机制

从 Tasks 页面的 **"Awaiting approval"** 标签页可见：
- 某些动作（尤其是涉及外部系统写入、自动化执行）需要等待用户审批
- 这是 Agent 安全设计的重要组成部分

---

## 四、后端数据来源（AWS 服务集成）

| AWS 服务 | 用途 |
|----------|------|
| **Cost Explorer** | 成本与使用趋势分析 |
| **Cost Anomaly Detection** | 异常检测与告警 |
| **Cost Optimization Hub** | 节省机会汇总 |
| **Compute Optimizer** | EC2/RDS/Lambda/EBS 等右移建议 |
| **CloudTrail** | 把成本异常与 API 调用、IAM Principal 关联 |
| **企业微信** | 外部通知、告警、工单、审批（需配置集成） |

---

## 五、安全与权限模型

- **IAM Role based**：通过 IAM Role 控制 Agent 能访问哪些数据
- **默认只读**：不修改 AWS 资源
- **写操作可配置**：仅企业微信等外部集成，且需人工触发/审批
- **CloudTrail 审计**：所有活动可审计
- **数据不离开 AWS**：Bedrock 在 AWS 内部处理

---

## 六、对 NetX SRE Agent 的借鉴点

### 6.1 产品形态可借鉴

| FinOps Agent 模块 | NetX SRE Agent 对应模块 |
|-------------------|------------------------|
| New chat / 自然语言输入 | SRE 自然语言运维入口 |
| Tasks | 运维任务队列（巡检、诊断、变更） |
| Automations | 定时巡检、异常告警自动化 |
| Artifacts | 巡检报告、日志分析结果、配置快照 |
| Context files | 上传 chain287 部署文档、运行手册、节点清单 |
| Awaiting approval | 高危操作（重启、配置变更、链上注册）人工确认 |

### 6.2 交互设计可借鉴

1. **三栏布局**：导航 + 聊天 + 详情/任务面板
2. **预设 Prompt 模板**：把常见 SRE 问题做成快捷入口
3. **任务化执行**：自然语言 → Task → 异步执行 → 结果展示
4. **自动化与审批分离**：只读任务自动跑，写操作需审批
5. **产物中心化管理**：报告/日志/配置统一归档

### 6.3 技术架构可借鉴

1. **Skill + Tool 分层**：Skill 负责意图理解与编排，Tool 负责具体执行
2. **多数据源关联**：链上 RPC + 节点本地状态 + 云平台 API + 日志
3. **最小权限 IAM**：只读 Agent 常驻，写操作 Agent 临时启动
4. **上下文注入**：通过上传文档让 Agent 理解 chain287 的特殊约束

### 6.4 NetX 特有的扩展点

| FinOps 场景 | NetX SRE 场景 |
|-------------|---------------|
| 查成本 | 查块高、查出块、查 P2P |
| EC2 rightsizing | Validator 资源使用/磁盘/CPU |
| Cost anomaly | 链上异常（不出块、peerCount=0、unauthorized validator） |
| CloudTrail 关联 | 日志分析 + SSM 命令审计 |
| Jira/Slack 外部集成 | 企业微信告警/工单/审批 |
| 生成 HTML/PPT 报告 | 生成 Markdown/JSON 巡检报告 |

---

## 七、关键结论

1. **AWS FinOps Agent 不是简单的 ChatBot**，而是一个包含 **聊天、任务、自动化、产物、上下文** 的完整 Agent 框架。
2. **安全设计是核心**：默认只读、写操作需审批、IAM 最小权限、CloudTrail 审计。
3. **自然语言是入口，Task 是执行单元，Automation 是生产力放大器**。
4. **Context files 很重要**：让通用 Agent 变成懂特定环境的专用 Agent。
5. **Artifacts 中心化管理**：把 AI 输出变成可复用、可审计的资产。

NetX SRE Agent 可以直接复用这套框架，把 FinOps 的"成本"替换为"链健康+节点健康"，把 AWS 服务替换为 RPC/SSM/Docker/日志即可。

---

## 八、下一步可落地清单

- [ ] 定义 NetX SRE Agent 的 Skill 边界与 Tool 清单
- [ ] 设计前端三栏 UI 原型
- [ ] 确定 Agent 部署位置（Admin Host / 本地堡垒机）
- [ ] 选定 LLM 后端（Bedrock / Claude / 自托管）
- [ ] 实现第一个 PoC：自然语言查询所有 validator 健康状态
- [ ] 设计审批工作流（高危操作人工确认）
