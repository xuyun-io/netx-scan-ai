# NetX SRE Agent UI

基于 **React + TypeScript + Vite + Tailwind CSS + shadcn/Radix** 的 NetX SRE Agent 前端。界面按 `docs/agent-ui-images/` 和 `docs/agent-admin-images/` 中的 AWS FinOps Agent 风格重做：先进入 Agent 管理控制台，显式创建/打开 AgentSpace 后，再进入聊天、任务、产物和上下文文件工作台。

## 技术栈

- **React 18** + TypeScript
- **Vite**（构建工具）
- **Tailwind CSS 4**（样式与布局）
- **Radix UI primitives**（Dialog、Dropdown、RadioGroup、Select、Tabs）
- **shadcn/ui 风格组件**（本地 `src/components/ui/*`，可直接改源码）
- **lucide-react**（图标）
- 后端：Go + Google ADK-Go v2（通过 HTTP API 连接）

## 项目结构

```text
agent-ui/
├── components.json             # shadcn/ui 配置
├── src/
│   ├── components/ui/          # shadcn 风格基础组件
│   ├── components/
│   │   └── agents-admin-page.tsx # Agent 管理页与创建向导
│   ├── data/
│   │   └── promptTemplates.ts  # 导航、提示词、表格配置
│   ├── lib/
│   │   ├── api.ts              # 全 POST API 客户端与轮询类型
│   │   └── utils.ts            # cn() class 合并工具
│   ├── styles/
│   │   └── index.css           # Tailwind 入口与全局样式
│   ├── App.tsx                 # Agent 工作台布局和页面状态
│   └── main.tsx                # 入口
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## 本地运行

```bash
cd netx-ai/agent-ui
npm install
npm run dev
```

访问 http://localhost:5173/

开发模式会把全 POST API 代理到 `http://127.0.0.1:8080`，因此需要同时启动后端：

```bash
cd netx-ai/agent-server
go run ./cmd/server
```

## 构建生产包

```bash
npm run build
```

产物在 `dist/` 目录。

## 已实现功能

- [x] 顶部品牌栏与左侧导航
- [x] Agent 管理页：列表页与详情页分离布局，点击行进入详情；支持编辑环境变量
- [x] 固定聊天输入区和 prompt 模板列表
- [x] 启动时只加载 AgentSpace 列表，不自动创建默认 Agent
- [x] Chat 通过 `createTurn` / `getTurn` 轮询后端
- [x] Tasks 工作区、任务创建表单、审批入口
- [x] Artifacts 工作区，展示后端生成的 artifact
- [x] Context files 工作区和真实上传弹窗
- [x] Tailwind + Radix/shadcn 组件化基础
- [x] Automation 按 v2 预留，不接入第一版后端

## 后端连接

当前前端连接 Go + ADK-Go v2 后端：

```text
前端  <--HTTP 轮询-->  Go + Google ADK-Go v2  <--Tools-->  RPC/SSM/Docker
```

已使用 API（AWS FinOps 全 POST 风格）：

- `POST /createAgentSpace` - 创建 AgentSpace
- `POST /listAgentSpaces` - AgentSpace 列表
- `POST /updateAgentSpace` - 更新 AgentSpace（环境变量等）
- `POST /deleteAgentSpace` - 删除 AgentSpace
- `POST /createConversation` - 创建会话
- `POST /listConversations` - 会话列表
- `POST /createTurn` - 创建轮次（返回 202，轮询结果）
- `POST /getTurn` - 获取轮次状态/结果
- `POST /createTask` - 创建任务（返回 202，轮询结果）
- `POST /getTask` - 获取任务状态
- `POST /listTasks` - 任务列表
- `POST /listRecords` - 执行记录列表
- `POST /listArtifacts` - 产物列表
- `POST /createDocument` - 上传上下文文件
- `POST /listDocuments` - 上下文文件列表

第一版采用轮询获取异步结果，SSE 作为后续优化。
