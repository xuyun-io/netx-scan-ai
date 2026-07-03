import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronsUpDown,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AgentSpace, CreateAgentSpaceInput } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AgentsAdminPageProps {
  agentSpaces: AgentSpace[];
  booting: boolean;
  busy: boolean;
  error: string | null;
  onCreateAgent: (input: CreateAgentSpaceInput) => Promise<void>;
  onDeleteAgent: (agentSpace: AgentSpace) => Promise<void>;
  onOpenAgent: (agentSpace: AgentSpace) => Promise<void>;
  onUpdateAgent: (agentSpace: AgentSpace) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const wizardSteps = ['基础信息', '环境变量', '资源访问', 'Web 访问', '企业微信', '确认创建'] as const;

const defaultWizardState = {
  name: '',
  description: '',
  provider: 'gemini',
  model: 'gemini-2.5-pro',
  apiKey: '',
  baseUrl: '',
  envVars: [{ key: '', value: '' }],
  resourceAccess: 'readonly',
  credentialHint: '',
  webAccess: 'internal',
  webAccessNote: '',
  wecomEnabled: false,
  wecomWebhookUrl: '',
};

type EnvVarDraft = { key: string; value: string };
type WizardState = typeof defaultWizardState;
type SortKey = 'name' | 'updatedAt';
type SortDirection = 'asc' | 'desc';
type AdminView = 'list' | 'detail';

export function AgentsAdminPage({
  agentSpaces,
  booting,
  busy,
  error,
  onCreateAgent,
  onDeleteAgent,
  onOpenAgent,
  onUpdateAgent,
  onRefresh,
}: AgentsAdminPageProps) {
  const [view, setView] = useState<AdminView>('list');
  const [selectedAgent, setSelectedAgent] = useState<AgentSpace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleSelectAgent = (agentSpace: AgentSpace) => {
    setSelectedAgent(agentSpace);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedAgent(null);
  };

  const handleDelete = async (agentSpace: AgentSpace) => {
    await onDeleteAgent(agentSpace);
    if (selectedAgent?.agentSpaceId === agentSpace.agentSpaceId) {
      setView('list');
      setSelectedAgent(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f8fafc] text-[#1a2433]"
      style={{
        fontFamily:
          '"Aptos", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif',
      }}
    >
      {error && (
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {view === 'detail' && selectedAgent ? (
        <AgentDetailView
          agentSpace={selectedAgent}
          busy={busy}
          onBack={handleBack}
          onDelete={handleDelete}
          onOpen={onOpenAgent}
          onUpdate={onUpdateAgent}
        />
      ) : (
        <AgentListView
          agentSpaces={agentSpaces}
          booting={booting}
          busy={busy}
          onCreate={() => setCreateOpen(true)}
          onOpen={onOpenAgent}
          onRefresh={onRefresh}
          onSelect={handleSelectAgent}
        />
      )}

      <CreateAgentWizard
        busy={busy}
        open={createOpen}
        onCreate={async (input) => {
          await onCreateAgent(input);
          setCreateOpen(false);
        }}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

interface AgentListViewProps {
  agentSpaces: AgentSpace[];
  booting: boolean;
  busy: boolean;
  onCreate: () => void;
  onOpen: (agentSpace: AgentSpace) => void;
  onRefresh: () => Promise<void>;
  onSelect: (agentSpace: AgentSpace) => void;
}

function AgentListView({ agentSpaces, booting, busy, onCreate, onOpen, onRefresh, onSelect }: AgentListViewProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAgents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const searched = keyword
      ? agentSpaces.filter((agentSpace) =>
          [agentSpace.name, agentSpace.description, agentSpace.agentSpaceId, agentSpace.llm?.model]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword)),
        )
      : agentSpaces;
    return [...searched].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortKey === 'updatedAt') {
        return (Date.parse(a.updatedAt ?? '') - Date.parse(b.updatedAt ?? '')) * direction;
      }
      return a.name.localeCompare(b.name) * direction;
    });
  }, [agentSpaces, query, sortDirection, sortKey]);

  const handleSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'updatedAt' ? 'desc' : 'asc');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#e2e8f0] bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f766e]">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-base font-semibold text-[#111827]">
                AgentSpaces
                <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#047857]">
                  {agentSpaces.length}
                </span>
              </div>
              <div className="text-xs text-[#64748b]">选择 Agent 进入详情页，管理环境变量与集成配置。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-8 rounded-md border border-[#d1d5db] bg-white px-3 text-xs font-medium text-[#374151] hover:bg-[#f9fafb]"
              variant="outline"
              disabled={busy || booting}
              onClick={onRefresh}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              刷新
            </Button>
            <Button
              className="h-8 rounded-md bg-[#0f766e] px-3 text-xs font-medium text-white hover:bg-[#115e59]"
              disabled={busy}
              onClick={onCreate}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              创建 Agent
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-5">
        <div className="h-full rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
            <div className="flex items-center gap-1">
              {[
                { key: 'all', label: '全部', count: agentSpaces.length },
                { key: 'mine', label: '我的', count: agentSpaces.length },
                { key: 'archived', label: '已归档', count: 0 },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    activeTab === tab.key
                      ? 'bg-[#ecfdf5] text-[#047857]'
                      : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155]',
                  )}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px]',
                      activeTab === tab.key ? 'bg-white text-[#047857]' : 'bg-[#f1f5f9] text-[#64748b]',
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-[260px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94a3b8]" />
                <input
                  className="h-8 w-full rounded-md border border-[#d1d5db] bg-white pl-8 pr-3 text-xs text-[#111827] outline-none placeholder:text-[#94a3b8] focus:border-[#0f766e] focus:ring-2 focus:ring-[#ccfbf1]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索名称、ID、模型"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-8 rounded-md border border-[#d1d5db] bg-white px-3 text-xs font-medium text-[#374151] hover:bg-[#f9fafb]"
                    variant="outline"
                  >
                    <ChevronsUpDown className="mr-1.5 h-3.5 w-3.5" />
                    {sortKey === 'name' ? '按名称' : '最近活跃'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSort('updatedAt')}>
                    最近活跃 {sortKey === 'updatedAt' && (sortDirection === 'desc' ? '↓' : '↑')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSort('name')}>
                    按名称 {sortKey === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {booting ? (
            <TableMessage title="正在加载 AgentSpaces" description="正在读取后端文本持久化目录。" />
          ) : agentSpaces.length === 0 ? (
            <TableMessage title="暂无 AgentSpace">
              <Button
                className="mt-4 h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                onClick={onCreate}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                创建 Agent
              </Button>
            </TableMessage>
          ) : filteredAgents.length === 0 ? (
            <TableMessage title="没有匹配结果" description={`当前搜索：${query}`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold text-[#475569]">
                    <th className="px-4 py-3 font-medium">智能体</th>
                    <th className="w-[120px] px-4 py-3 font-medium">状态</th>
                    <th className="w-[180px] px-4 py-3 font-medium">运行时</th>
                    <th className="w-[180px] px-4 py-3 font-medium">最近活跃</th>
                    <th className="w-[100px] px-4 py-3 font-medium">运行次数</th>
                    <th className="w-[80px] px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agentSpace) => (
                    <tr
                      key={agentSpace.agentSpaceId}
                      className="cursor-pointer border-b border-[#f1f5f9] bg-white transition hover:bg-[#f8fafc]"
                      onClick={() => onSelect(agentSpace)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0f766e] to-[#115e59] text-sm font-bold text-white">
                            {agentSpace.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <button
                              className="block truncate text-sm font-semibold text-[#0f766e] hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelect(agentSpace);
                              }}
                            >
                              {agentSpace.name}
                            </button>
                            <div className="truncate text-xs text-[#64748b]">
                              {agentSpace.description || agentSpace.llm?.model || 'No description'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-semibold text-[#047857]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                          在线
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-sm text-[#334155]">{agentSpace.llm?.provider || '-'}</div>
                        <div className="truncate text-xs text-[#94a3b8]">{agentSpace.llm?.model || '-'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#64748b]">
                        {formatRelativeTime(agentSpace.updatedAt)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-[#64748b]">0</td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f766e]"
                          aria-label={`打开 ${agentSpace.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpen(agentSpace);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

interface AgentDetailViewProps {
  agentSpace: AgentSpace;
  busy: boolean;
  onBack: () => void;
  onDelete: (agentSpace: AgentSpace) => Promise<void>;
  onOpen: (agentSpace: AgentSpace) => Promise<void>;
  onUpdate: (agentSpace: AgentSpace) => Promise<void>;
}

function AgentDetailView({ agentSpace, busy, onBack, onDelete, onOpen, onUpdate }: AgentDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [editingEnv, setEditingEnv] = useState(false);
  const [envRows, setEnvRows] = useState<EnvVarDraft[]>([]);
  const [envError, setEnvError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingEnv) {
      setEnvError(null);
      return;
    }
    const rows = Object.entries(agentSpace.environment ?? {}).map(([key, value]) => ({ key, value }));
    setEnvRows(rows.length > 0 ? rows : [{ key: '', value: '' }]);
  }, [editingEnv, agentSpace.environment]);

  const updateEnvRow = (index: number, values: Partial<EnvVarDraft>) => {
    setEnvRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...values } : row)));
  };
  const addEnvRow = () => setEnvRows((current) => [...current, { key: '', value: '' }]);
  const removeEnvRow = (index: number) => {
    setEnvRows((current) => {
      const next = current.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ key: '', value: '' }];
    });
  };

  const handleSaveEnv = async () => {
    if (!envRowsAreValid(envRows)) {
      setEnvError('KEY 只能使用字母、数字和下划线，并且不能以数字开头。');
      return;
    }
    const environment = collectEnvironment(envRows);
    try {
      await onUpdate({
        ...agentSpace,
        environment: Object.keys(environment).length > 0 ? environment : undefined,
      });
      setEditingEnv(false);
      setEnvError(null);
    } catch (err) {
      setEnvError((err as Error).message);
    }
  };

  const handleCancelEnv = () => {
    setEditingEnv(false);
    setEnvError(null);
  };

  const initials = agentSpace.name.slice(0, 2).toUpperCase();
  const wecomEnabled = Boolean(agentSpace.integrations?.wecom?.enabled);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[#e2e8f0] bg-white">
        <div className="flex h-14 items-center gap-3 px-6">
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#334155]"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            AgentSpaces
          </button>
          <span className="text-[#d1d5db]">/</span>
          <span className="text-sm font-semibold text-[#111827]">{agentSpace.name}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-xs font-semibold text-[#047857]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            在线
          </span>
        </div>
      </header>

      <main className="flex flex-1 gap-5 overflow-hidden px-6 py-5">
        <aside className="w-[300px] shrink-0 overflow-auto">
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f766e] to-[#115e59] text-xl font-bold text-white">
                {initials}
              </div>
              <h1 className="mt-3 text-lg font-semibold text-[#111827]">{agentSpace.name}</h1>
              <p className="mt-1 text-xs text-[#64748b]">
                {agentSpace.description || agentSpace.llm?.model || 'No description'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-3 py-1 text-xs font-semibold text-[#047857]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                在线
              </span>
            </div>

            <div className="mt-6 border-t border-[#e2e8f0] pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">属性</h3>
              <dl className="mt-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">运行时</dt>
                  <dd className="font-medium text-[#334155]">{agentSpace.llm?.provider || '-'}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">模型</dt>
                  <dd className="font-medium text-[#334155]">{agentSpace.llm?.model || '-'}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">可见性</dt>
                  <dd className="font-medium text-[#334155]">Workspace</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">并发</dt>
                  <dd className="font-medium text-[#334155]">1</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 border-t border-[#e2e8f0] pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">详情</h3>
              <dl className="mt-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">所有者</dt>
                  <dd className="font-medium text-[#334155]">-</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">创建时间</dt>
                  <dd className="font-medium text-[#334155]">{formatDate(agentSpace.createdAt)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-[#64748b]">更新时间</dt>
                  <dd className="font-medium text-[#334155]">{formatDate(agentSpace.updatedAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 border-t border-[#e2e8f0] pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">外部集成</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {wecomEnabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#d1fae5] bg-[#ecfdf5] px-2.5 py-1.5 text-xs font-medium text-[#047857]">
                    企业微信
                  </span>
                ) : (
                  <span className="text-xs text-[#94a3b8]">未配置</span>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                className="h-8 rounded-md bg-[#0f766e] px-2 text-xs text-white hover:bg-[#115e59]"
                disabled={busy}
                onClick={() => onOpen(agentSpace)}
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                打开
              </Button>
              <Button
                className="h-8 rounded-md border-red-200 bg-white px-2 text-xs text-red-600 hover:bg-red-50"
                variant="outline"
                disabled={busy}
                onClick={() => onDelete(agentSpace)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                删除
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
            <TabsList className="h-10 w-full shrink-0 justify-start rounded-t-xl border-b border-[#e2e8f0] bg-white px-4 pt-2">
              <DetailTab value="overview" label="动态" active={activeTab === 'overview'} />
              <DetailTab value="tasks" label="Tasks" active={activeTab === 'tasks'} />
              <DetailTab value="env" label="环境变量" active={activeTab === 'env'} />
              <DetailTab value="skills" label="Skills" active={activeTab === 'skills'} />
              <DetailTab value="mcp" label="MCP" active={activeTab === 'mcp'} />
              <DetailTab value="integrations" label="集成" active={activeTab === 'integrations'} />
            </TabsList>

            <div className="min-h-0 flex-1 overflow-auto rounded-b-xl border-x border-b border-[#e2e8f0] bg-white p-5 shadow-sm">
              <TabsContent value="overview" className="mt-0">
                <EmptyState icon={LayoutGrid} title="暂无动态" description="Agent 运行记录将显示在这里。" />
              </TabsContent>
              <TabsContent value="tasks" className="mt-0">
                <EmptyState icon={Check} title="暂无 Tasks" description="创建 Task 后将显示在这里。" />
              </TabsContent>
              <TabsContent value="env" className="mt-0">
                <h2 className="text-sm font-semibold text-[#111827]">环境变量</h2>
                <p className="mt-1 text-xs text-[#64748b]">注入到 Agent runtime、ADK model 和 skill action 的进程环境。</p>
                <div className="mt-4">
                  {editingEnv ? (
                    <div className="space-y-2">
                      {envRows.map((row, index) => (
                        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_36px] gap-2 max-sm:grid-cols-1">
                          <input
                            className={controlClassName}
                            value={row.key}
                            onChange={(event) => updateEnvRow(index, { key: event.target.value })}
                            placeholder="KEY"
                          />
                          <input
                            className={controlClassName}
                            value={row.value}
                            onChange={(event) => updateEnvRow(index, { value: event.target.value })}
                            placeholder="值"
                          />
                          <button
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd5e1] bg-white text-[#64748b] hover:bg-red-50 hover:text-red-600 max-sm:w-full"
                            type="button"
                            aria-label="删除环境变量"
                            onClick={() => removeEnvRow(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 pt-2">
                        <Button
                          className="h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f9fafb]"
                          variant="outline"
                          type="button"
                          disabled={busy}
                          onClick={addEnvRow}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          添加
                        </Button>
                        <div className="flex items-center gap-2">
                          <Button
                            className="h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f9fafb]"
                            variant="outline"
                            type="button"
                            disabled={busy}
                            onClick={handleCancelEnv}
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            取消
                          </Button>
                          <Button
                            className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                            type="button"
                            disabled={busy || !envRowsAreValid(envRows)}
                            onClick={handleSaveEnv}
                          >
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                            保存
                          </Button>
                        </div>
                      </div>
                      {envError && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                          {envError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.keys(agentSpace.environment ?? {}).length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#d1d5db] bg-[#f9fafb] px-4 py-8 text-center text-sm text-[#64748b]">
                          未配置环境变量
                        </div>
                      ) : (
                        Object.entries(agentSpace.environment ?? {}).map(([key]) => (
                          <div
                            key={key}
                            className="flex items-center gap-2 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 font-mono text-xs"
                          >
                            <span className="text-[#334155]">{key}</span>
                            <span className="text-[#94a3b8]">=</span>
                            <span className="text-[#64748b]">****</span>
                          </div>
                        ))
                      )}
                      <Button
                        className="mt-2 h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f9fafb]"
                        variant="outline"
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingEnv(true)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        编辑环境变量
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="skills" className="mt-0">
                <EmptyState icon={ShieldCheck} title="暂无 Skills" description="Agent 可用技能将显示在这里。" />
              </TabsContent>
              <TabsContent value="mcp" className="mt-0">
                <EmptyState icon={ExternalLink} title="暂无 MCP" description="MCP 配置将显示在这里。" />
              </TabsContent>
              <TabsContent value="integrations" className="mt-0">
                <h2 className="text-sm font-semibold text-[#111827]">集成</h2>
                <div className="mt-4 rounded-md border border-[#e2e8f0] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[#111827]">企业微信</div>
                      <div className="mt-0.5 text-xs text-[#64748b]">第一版第三方集成仅支持群机器人 webhook。</div>
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                        wecomEnabled ? 'bg-[#d1fae5] text-[#047857]' : 'bg-[#f3f4f6] text-[#6b7280]',
                      )}
                    >
                      {wecomEnabled ? '已启用' : '未配置'}
                    </span>
                  </div>
                  {wecomEnabled && (
                    <div className="mt-3 break-all font-mono text-xs text-[#64748b]">
                      {maskWebhook(agentSpace.integrations?.wecom?.webhookUrl)}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function DetailTab({ active, label, value }: { active: boolean; label: string; value: string }) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition',
        active
          ? 'border-[#0f766e] text-[#0f766e]'
          : 'border-transparent text-[#64748b] hover:text-[#334155]',
      )}
    >
      {label}
    </TabsTrigger>
  );
}

function EmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof LayoutGrid;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[#d1d5db] bg-[#f9fafb] px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#94a3b8]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-semibold text-[#374151]">{title}</div>
      <p className="mt-1 max-w-xs text-xs text-[#64748b]">{description}</p>
    </div>
  );
}

function TableMessage({
  children,
  description,
  title,
}: {
  children?: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
      <div className="text-sm font-semibold text-[#374151]">{title}</div>
      {description && <p className="mt-2 max-w-md text-xs text-[#64748b]">{description}</p>}
      {children}
    </div>
  );
}

interface CreateAgentWizardProps {
  busy: boolean;
  open: boolean;
  onCreate: (input: CreateAgentSpaceInput) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

function CreateAgentWizard({ busy, open, onCreate, onOpenChange }: CreateAgentWizardProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(defaultWizardState);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setForm(defaultWizardState);
    }
  }, [open]);

  const canCreate = form.name.trim().length > 0 && form.name.trim().length <= 128 && form.model.trim().length > 0;
  const canContinue = step === 0 ? canCreate : step === 1 ? envRowsAreValid(form.envVars) : true;

  const update = (values: Partial<WizardState>) => {
    setForm((current) => ({ ...current, ...values }));
  };

  const createInput = (): CreateAgentSpaceInput => {
    const environment = collectEnvironment(form.envVars);
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      llm: {
        provider: form.provider,
        model: form.model.trim(),
        apiKey: form.apiKey.trim() || undefined,
        baseUrl: form.baseUrl.trim() || undefined,
      },
      environment: Object.keys(environment).length > 0 ? environment : undefined,
      integrations: {
        wecom: {
          enabled: form.wecomEnabled,
          webhookUrl: form.wecomEnabled ? form.wecomWebhookUrl.trim() : undefined,
        },
      },
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(980px,calc(100vw-32px))] overflow-hidden rounded-md border-[#cbd5e1] bg-white text-[#1a2433] shadow-2xl">
        <DialogHeader className="border-b border-[#d8dee6] px-5 pb-4 pt-5">
          <DialogTitle className="text-lg font-semibold text-[#111827]">创建 Agent</DialogTitle>
          <DialogDescription className="text-sm text-[#64748b]">
            配置 AgentSpace 基础信息、访问边界和企业微信通知。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[540px] grid-cols-[220px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
          <WizardRail step={step} />
          <div className="agent-scrollbar overflow-auto px-6 py-5">
            {step === 0 && <StepName form={form} onChange={update} />}
            {step === 1 && <StepEnvironment form={form} onChange={update} />}
            {step === 2 && <StepResource form={form} onChange={update} />}
            {step === 3 && <StepWebAccess form={form} onChange={update} />}
            {step === 4 && <StepIntegrations form={form} onChange={update} />}
            {step === 5 && <StepReview form={form} />}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#d8dee6] bg-[#f8fafc] px-5 py-3">
          <Button
            className="h-8 rounded-md border-[#cbd5e1] bg-white px-3 text-xs text-[#334155] hover:bg-[#f8fafc]"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <div className="flex items-center gap-2">
            <Button
              className="h-8 rounded-md border-[#cbd5e1] bg-white px-3 text-xs text-[#334155] hover:bg-[#f8fafc]"
              variant="outline"
              disabled={busy || step === 0}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              上一步
            </Button>
            {step < wizardSteps.length - 1 ? (
              <Button
                className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                disabled={busy || !canContinue}
                onClick={() => setStep((current) => Math.min(wizardSteps.length - 1, current + 1))}
              >
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                disabled={busy || !canCreate}
                onClick={() => onCreate(createInput())}
              >
                创建 Agent
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WizardRail({ step }: { step: number }) {
  return (
    <aside className="border-r border-[#d8dee6] bg-[#f8fafc] px-3 py-5 max-lg:hidden">
      <div className="px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#64748b]">Create</div>
      <div className="mt-4 space-y-1">
        {wizardSteps.map((label, index) => (
          <div
            key={label}
            className={cn(
              'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium',
              step === index ? 'bg-white text-[#0f766e] shadow-sm ring-1 ring-[#d8dee6]' : 'text-[#475569]',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border text-[11px]',
                index < step
                  ? 'border-[#0f766e] bg-[#0f766e] text-white'
                  : step === index
                    ? 'border-[#0f766e] text-[#0f766e]'
                    : 'border-[#cbd5e1] text-[#64748b]',
              )}
            >
              {index < step ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            {label}
          </div>
        ))}
      </div>
    </aside>
  );
}

function StepName({ form, onChange }: StepProps) {
  return (
    <WizardSection eyebrow="Step 1" title="基础信息" description="创建 AgentSpace 并绑定 LLM 配置。">
      <div className="grid gap-4">
        <LightField label="Agent 名称" hint="1-128 个字符。">
          <input
            className={controlClassName}
            maxLength={128}
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="请输入 Agent 名称"
          />
        </LightField>
        <LightField label="描述" hint={`${form.description.length}/512`}>
          <textarea
            className="h-24 w-full resize-none rounded-md border border-[#cbd5e1] bg-white px-3 py-2 text-sm text-[#111827] outline-none placeholder:text-[#94a3b8] focus:border-[#0f766e] focus:ring-2 focus:ring-[#ccfbf1]"
            maxLength={512}
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="请输入描述"
          />
        </LightField>
        <div className="grid gap-4 md:grid-cols-2">
          <LightField label="LLM Provider">
            <Select value={form.provider} onValueChange={(provider) => onChange({ provider })}>
              <SelectTrigger className="border-[#cbd5e1] bg-white text-[#111827] focus:ring-[#ccfbf1]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[#cbd5e1] bg-white text-[#111827]">
                <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="gemini">
                  Gemini
                </SelectItem>
                <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="openai">
                  OpenAI compatible
                </SelectItem>
                <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="local">
                  Local endpoint
                </SelectItem>
              </SelectContent>
            </Select>
          </LightField>
          <LightField label="Model">
            <input
              className={controlClassName}
              value={form.model}
              onChange={(event) => onChange({ model: event.target.value })}
              placeholder="请输入模型名称"
            />
          </LightField>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <LightField label="API Key" hint="可留空，后端使用运行环境变量。">
            <input
              className={controlClassName}
              type="password"
              value={form.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="Optional"
            />
          </LightField>
          <LightField label="Base URL" hint="兼容 OpenAI 或本地模型网关时使用。">
            <input
              className={controlClassName}
              value={form.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="Optional"
            />
          </LightField>
        </div>
      </div>
    </WizardSection>
  );
}

function StepEnvironment({ form, onChange }: StepProps) {
  const updateRow = (index: number, values: Partial<EnvVarDraft>) => {
    onChange({
      envVars: form.envVars.map((row, rowIndex) => (rowIndex === index ? { ...row, ...values } : row)),
    });
  };
  const addRow = () => {
    onChange({ envVars: [...form.envVars, { key: '', value: '' }] });
  };
  const removeRow = (index: number) => {
    const nextRows = form.envVars.filter((_, rowIndex) => rowIndex !== index);
    onChange({ envVars: nextRows.length > 0 ? nextRows : [{ key: '', value: '' }] });
  };
  const hasInvalidKey = !envRowsAreValid(form.envVars);

  return (
    <WizardSection eyebrow="Step 2" title="环境变量" description="注入到 Agent runtime、ADK model 和 skill action 的进程环境。">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[#334155]">Variables</div>
        <Button
          className="h-8 rounded-md border-[#cbd5e1] bg-white px-3 text-xs text-[#334155] hover:bg-[#f8fafc]"
          variant="outline"
          type="button"
          onClick={addRow}
        >
          <Plus className="h-3.5 w-3.5" />
          添加
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {form.envVars.map((row, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_36px] gap-2 max-sm:grid-cols-1">
            <input
              className={controlClassName}
              value={row.key}
              onChange={(event) => updateRow(index, { key: event.target.value })}
              placeholder="KEY"
            />
            <input
              className={controlClassName}
              type="password"
              value={row.value}
              onChange={(event) => updateRow(index, { value: event.target.value })}
              placeholder="值"
            />
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cbd5e1] bg-white text-[#64748b] hover:bg-red-50 hover:text-red-600 max-sm:w-full"
              type="button"
              aria-label="删除环境变量"
              onClick={() => removeRow(index)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {hasInvalidKey && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          KEY 只能使用字母、数字和下划线，并且不能以数字开头。
        </div>
      )}
    </WizardSection>
  );
}

function StepResource({ form, onChange }: StepProps) {
  return (
    <WizardSection eyebrow="Step 3" title="资源访问" description="定义 Agent 的默认执行边界。">
      <RadioGroup value={form.resourceAccess} onValueChange={(resourceAccess) => onChange({ resourceAccess })}>
        <OptionCard
          active={form.resourceAccess === 'readonly'}
          description="默认配置，只允许诊断、查询和读取上下文文件。"
          icon={ShieldCheck}
          label="Read-only execution profile"
          value="readonly"
        />
        <OptionCard
          active={form.resourceAccess === 'local'}
          description="记录本地凭证说明；第一版不引入凭证加密。"
          icon={KeyRound}
          label="Local credential hint"
          value="local"
        />
      </RadioGroup>
      {form.resourceAccess === 'local' && (
        <div className="mt-4">
          <LightField label="Credential hint" hint="仅作为创建流程说明。">
            <input
              className={controlClassName}
              value={form.credentialHint}
              onChange={(event) => onChange({ credentialHint: event.target.value })}
              placeholder="请输入凭证说明"
            />
          </LightField>
        </div>
      )}
    </WizardSection>
  );
}

function StepWebAccess({ form, onChange }: StepProps) {
  return (
    <WizardSection eyebrow="Step 4" title="Web 访问" description="确认工作台访问方式。">
      <RadioGroup value={form.webAccess} onValueChange={(webAccess) => onChange({ webAccess })}>
        <OptionCard
          active={form.webAccess === 'internal'}
          description="内部网络访问，适合 v1 all-in-one 单容器部署。"
          icon={Workflow}
          label="Internal web access"
          value="internal"
        />
        <OptionCard
          active={form.webAccess === 'planned-auth'}
          description="保留未来接入 SSO 或 token 的说明。"
          icon={KeyRound}
          label="Auth planned later"
          value="planned-auth"
        />
      </RadioGroup>
      <div className="mt-4">
        <LightField label="Access note" hint="可选。">
          <input
            className={controlClassName}
            value={form.webAccessNote}
            onChange={(event) => onChange({ webAccessNote: event.target.value })}
            placeholder="请输入访问说明"
          />
        </LightField>
      </div>
    </WizardSection>
  );
}

function StepIntegrations({ form, onChange }: StepProps) {
  return (
    <WizardSection eyebrow="Step 5" title="企业微信" description="第一版第三方集成仅支持企业微信群机器人 webhook。">
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#d8dee6] bg-[#f8fafc] p-4">
        <input
          checked={form.wecomEnabled}
          className="mt-1 h-4 w-4 accent-[#0f766e]"
          type="checkbox"
          onChange={(event) => onChange({ wecomEnabled: event.target.checked })}
        />
        <span>
          <span className="block text-sm font-semibold text-[#111827]">启用企业微信 webhook</span>
          <span className="mt-1 block text-sm leading-6 text-[#64748b]">用于发送任务状态和审批等待通知。</span>
        </span>
      </label>
      {form.wecomEnabled && (
        <div className="mt-4">
          <LightField label="Webhook URL">
            <input
              className={controlClassName}
              value={form.wecomWebhookUrl}
              onChange={(event) => onChange({ wecomWebhookUrl: event.target.value })}
              placeholder="请输入企业微信机器人 webhook"
            />
          </LightField>
        </div>
      )}
    </WizardSection>
  );
}

function StepReview({ form }: { form: WizardState }) {
  const rows = [
    ['Agent 名称', form.name || '-'],
    ['描述', form.description || '-'],
    ['LLM', `${form.provider} / ${form.model || '-'}`],
    ['环境变量', describeEnvironment(form.envVars)],
    ['资源访问', form.resourceAccess === 'readonly' ? 'Read-only execution profile' : 'Local credential hint'],
    ['Web 访问', form.webAccess === 'internal' ? 'Internal web access' : 'Auth planned later'],
    ['企业微信', form.wecomEnabled ? '已启用' : '未启用'],
  ];

  return (
    <WizardSection eyebrow="Step 6" title="确认创建" description="确认后会创建 AgentSpace。">
      <div className="overflow-hidden rounded-md border border-[#d8dee6]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[160px_minmax(0,1fr)] border-b border-[#eef2f7] last:border-b-0">
            <div className="bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569]">{label}</div>
            <div className="min-w-0 break-words px-4 py-3 text-sm text-[#1f2937]">{value}</div>
          </div>
        ))}
      </div>
    </WizardSection>
  );
}

interface StepProps {
  form: WizardState;
  onChange: (values: Partial<WizardState>) => void;
}

function WizardSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f766e]">{eyebrow}</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#111827]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LightField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#334155]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-medium text-[#64748b]">{hint}</span>}
    </label>
  );
}

function OptionCard({
  active,
  description,
  icon: Icon,
  label,
  value,
}: {
  active: boolean;
  description: string;
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <label
      className={cn(
        'mb-3 flex cursor-pointer items-start gap-3 rounded-md border p-4 transition',
        active ? 'border-[#0f766e] bg-[#ecfdf5]' : 'border-[#d8dee6] bg-white hover:bg-[#f8fafc]',
      )}
    >
      <RadioGroupItem value={value} className="mt-1 border-[#94a3b8] text-[#0f766e] data-[state=checked]:border-[#0f766e]" />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#d8dee6] bg-white text-[#0f766e]">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#111827]">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-[#64748b]">{description}</span>
      </span>
    </label>
  );
}

const controlClassName =
  'h-9 w-full rounded-md border border-[#cbd5e1] bg-white px-3 text-sm text-[#111827] outline-none placeholder:text-[#94a3b8] focus:border-[#0f766e] focus:ring-2 focus:ring-[#ccfbf1]';

const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function collectEnvironment(rows: EnvVarDraft[]) {
  return rows.reduce<Record<string, string>>((environment, row) => {
    const key = row.key.trim();
    if (key) {
      environment[key] = row.value;
    }
    return environment;
  }, {});
}

function envRowsAreValid(rows: EnvVarDraft[]) {
  return rows.every((row) => {
    const key = row.key.trim();
    if (!key && !row.value) {
      return true;
    }
    return envKeyPattern.test(key);
  });
}

function describeEnvironment(rows: EnvVarDraft[]) {
  const keys = Object.keys(collectEnvironment(rows));
  if (keys.length === 0) return '未配置';
  return keys.join(', ');
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelativeTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`;
  return `${Math.floor(diffDay / 365)} 年前`;
}

function maskWebhook(value?: string) {
  if (!value) return '-';
  if (value.length <= 18) return '已配置';
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}
