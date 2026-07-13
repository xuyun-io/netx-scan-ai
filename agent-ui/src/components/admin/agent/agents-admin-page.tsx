import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BellRing,
  Bot,
  Check,
  ChevronsUpDown,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Link2,
  LogOut,
  MessageSquare,
  Pencil,
  Plug2,
  Plus,
  RefreshCw,
  Search,
  Settings,
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
import { cn, formatDateTimeWithTimezone } from '@/lib/utils';

interface AgentsAdminPageProps {
  agentSpaces: AgentSpace[];
  booting: boolean;
  busy: boolean;
  error: string | null;
  onCreateAgent: (input: CreateAgentSpaceInput) => Promise<void>;
  onDeleteAgent: (agentSpace: AgentSpace) => Promise<void>;
  onOpenAgent: (agentSpace: AgentSpace) => void | Promise<void>;
  onUpdateAgent: (agentSpace: AgentSpace) => Promise<void>;
  onRefresh: () => Promise<void>;
  onLogout?: () => void;
}

const wizardSteps = ['基础信息', '环境变量', '资源访问', 'Web 访问', '企业微信', '确认创建'] as const;
const wecomSetupSteps = ['Getting started', 'Configure webhook', 'Complete'] as const;

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
  onLogout,
}: AgentsAdminPageProps) {
  const [view, setView] = useState<AdminView>('list');
  const [selectedAgent, setSelectedAgent] = useState<AgentSpace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // 当 agentSpaces 列表刷新时，同步更新当前详情页中的 AgentSpace 数据
  useEffect(() => {
    if (!selectedAgent) return;
    const updated = agentSpaces.find((space) => space.name === selectedAgent.name);
    if (updated && updated.updatedAt !== selectedAgent.updatedAt) {
      setSelectedAgent(updated);
    }
  }, [agentSpaces, selectedAgent]);

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
    if (selectedAgent?.name === agentSpace.name) {
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
          onLogout={onLogout}
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
          onLogout={onLogout}
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
  onLogout?: () => void;
}

function AgentListView({ agentSpaces, booting, busy, onCreate, onOpen, onRefresh, onSelect, onLogout }: AgentListViewProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const filteredAgents = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const searched = keyword
      ? agentSpaces.filter((agentSpace) =>
          [agentSpace.name, agentSpace.description, agentSpace.llm?.model]
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
            {onLogout && (
              <Button
                className="h-8 rounded-md border border-[#d1d5db] bg-white px-3 text-xs font-medium text-[#374151] hover:bg-[#f9fafb] hover:text-red-600"
                variant="outline"
                onClick={onLogout}
                title="退出登录"
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                退出
              </Button>
            )}
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
                    <th className="w-[270px] px-4 py-3 font-medium">最近活跃</th>
                    <th className="w-[100px] px-4 py-3 font-medium">运行次数</th>
                    <th className="w-[80px] px-4 py-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agentSpace) => (
                    <tr
                      key={agentSpace.name}
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
  onOpen: (agentSpace: AgentSpace) => void;
  onUpdate: (agentSpace: AgentSpace) => Promise<void>;
  onLogout?: () => void;
}

function AgentDetailView({ agentSpace, busy, onBack, onDelete, onOpen, onUpdate, onLogout }: AgentDetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [editingEnv, setEditingEnv] = useState(false);
  const [envRows, setEnvRows] = useState<EnvVarDraft[]>([]);
  const [envError, setEnvError] = useState<string | null>(null);
  const [wecomSetupOpen, setWecomSetupOpen] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [editingLLM, setEditingLLM] = useState(false);
  const [llmForm, setLlmForm] = useState({
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    apiKey: '',
    baseUrl: '',
  });
  const [llmError, setLlmError] = useState<string | null>(null);

  useEffect(() => {
    if (!editingLLM) {
      setLlmError(null);
      return;
    }
    setLlmForm({
      provider: agentSpace.llm?.provider ?? 'gemini',
      model: agentSpace.llm?.model ?? 'gemini-2.5-pro',
      apiKey: '',
      baseUrl: agentSpace.llm?.baseUrl ?? '',
    });
  }, [editingLLM, agentSpace.llm]);

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

  const updateLlmForm = (values: Partial<typeof llmForm>) => {
    setLlmForm((current) => ({ ...current, ...values }));
  };

  const handleSaveLLM = async () => {
    const model = llmForm.model.trim();
    const provider = llmForm.provider.trim();
    if (!provider || !model) {
      setLlmError('Provider 和 Model 不能为空。');
      return;
    }
    try {
      await onUpdate({
        ...agentSpace,
        llm: {
          provider,
          model,
          apiKey: llmForm.apiKey.trim() || undefined,
          baseUrl: llmForm.baseUrl.trim() || undefined,
        },
      });
      setEditingLLM(false);
      setLlmError(null);
    } catch (err) {
      setLlmError((err as Error).message);
    }
  };

  const handleCancelLLM = () => {
    setEditingLLM(false);
    setLlmError(null);
  };

  const handleSaveWeCom = async (input: { enabled: boolean; webhookUrl?: string }) => {
    const currentWebhook = agentSpace.integrations?.wecom?.webhookUrl;
    const nextWebhook = input.webhookUrl?.trim() || currentWebhook;
    if (input.enabled && !nextWebhook) {
      setIntegrationError('请输入企业微信群机器人 webhook。');
      return;
    }
    try {
      await onUpdate({
        ...agentSpace,
        integrations: {
          ...agentSpace.integrations,
          wecom: {
            enabled: input.enabled,
            webhookUrl: input.enabled ? nextWebhook : undefined,
          },
        },
      });
      setIntegrationError(null);
      setWecomSetupOpen(false);
    } catch (err) {
      setIntegrationError((err as Error).message);
    }
  };

  const initials = agentSpace.name.slice(0, 2).toUpperCase();
  const wecomEnabled = Boolean(agentSpace.integrations?.wecom?.enabled);
  const wecomWebhook = agentSpace.integrations?.wecom?.webhookUrl;

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
          <div className="ml-auto flex items-center gap-2">
            {onLogout && (
              <Button
                className="h-8 rounded-md border border-[#d1d5db] bg-white px-3 text-xs font-medium text-[#374151] hover:bg-[#f9fafb] hover:text-red-600"
                variant="outline"
                onClick={onLogout}
                title="退出登录"
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                退出
              </Button>
            )}
          </div>
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
              <DetailTab value="llm" label="模型" active={activeTab === 'llm'} />
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
              <TabsContent value="llm" className="mt-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">LLM 配置</h2>
                    <p className="mt-1 text-xs leading-5 text-[#64748b]">
                      为当前 AgentSpace 指定模型、Provider 和 API Key。
                    </p>
                  </div>
                  {!editingLLM && (
                    <Button
                      className="h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f9fafb]"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditingLLM(true)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      编辑
                    </Button>
                  )}
                </div>

                {llmError && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {llmError}
                  </div>
                )}

                <div className="mt-4 space-y-4">
                  {editingLLM ? (
                    <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <LightField label="LLM Provider">
                          <Select
                            value={llmForm.provider}
                            onValueChange={(provider) => updateLlmForm({ provider })}
                          >
                            <SelectTrigger className="border-[#cbd5e1] bg-white text-[#111827] focus:ring-[#ccfbf1]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-[#cbd5e1] bg-white text-[#111827]">
                              <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="gemini">
                                Gemini
                              </SelectItem>
                              <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="gemini-relay">
                                Gemini Relay
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </LightField>
                        <LightField label="Model">
                          <input
                            className={controlClassName}
                            value={llmForm.model}
                            onChange={(event) => updateLlmForm({ model: event.target.value })}
                            placeholder="例如 gemini-2.5-pro"
                          />
                        </LightField>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <LightField label="API Key" hint="留空表示保持不变。">
                          <input
                            className={controlClassName}
                            type="password"
                            value={llmForm.apiKey}
                            onChange={(event) => updateLlmForm({ apiKey: event.target.value })}
                            placeholder="输入新的 API Key"
                          />
                        </LightField>
                        <LightField label="Base URL" hint="gemini-relay 必填，例如 https://www.tokenstars.ai。">
                          <input
                            className={controlClassName}
                            value={llmForm.baseUrl}
                            onChange={(event) => updateLlmForm({ baseUrl: event.target.value })}
                            placeholder="例如 https://www.tokenstars.ai"
                          />
                        </LightField>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <Button
                          className="h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f9fafb]"
                          variant="outline"
                          type="button"
                          disabled={busy}
                          onClick={handleCancelLLM}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          取消
                        </Button>
                        <Button
                          className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                          type="button"
                          disabled={busy}
                          onClick={handleSaveLLM}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          保存
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs text-[#64748b]">Provider</div>
                        <div className="mt-1 text-sm font-medium text-[#334155]">{agentSpace.llm?.provider || '-'}</div>
                      </div>
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs text-[#64748b]">Model</div>
                        <div className="mt-1 text-sm font-medium text-[#334155]">{agentSpace.llm?.model || '-'}</div>
                      </div>
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs text-[#64748b]">API Key</div>
                        <div className="mt-1 text-sm font-medium text-[#334155]">
                          {agentSpace.llm?.apiKey ? '••••••••' : '-'}
                        </div>
                      </div>
                      <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs text-[#64748b]">Base URL</div>
                        <div className="mt-1 break-all text-sm font-medium text-[#334155]">
                          {agentSpace.llm?.baseUrl || '-'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">外部集成</h2>
                    <p className="mt-1 text-xs leading-5 text-[#64748b]">
                      为当前 AgentSpace 连接通知渠道。企业微信启用后，Agent 系统工具和自动化结果推送会使用这里的配置。
                    </p>
                  </div>
                  <Button
                    className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                    disabled={busy}
                    onClick={() => setWecomSetupOpen(true)}
                  >
                    <Plug2 className="mr-1.5 h-3.5 w-3.5" />
                    {wecomEnabled ? '编辑集成' : '添加集成'}
                  </Button>
                </div>

                {integrationError && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {integrationError}
                  </div>
                )}

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <IntegrationCard
                    description="将任务结果、自动化执行状态和审批提醒发送到企业微信群。"
                    enabled={wecomEnabled}
                    iconLabel="企微"
                    title="企业微信"
                    onConfigure={() => setWecomSetupOpen(true)}
                  />
                  <IntegrationCard
                    description="后续可接入审批应用、工单系统或更多企业通知渠道。"
                    enabled={false}
                    iconLabel="+"
                    title="更多集成"
                    disabled
                    onConfigure={() => undefined}
                  />
                </div>

                <div className="mt-5 overflow-hidden rounded-md border border-[#e2e8f0] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-[#111827]">Connections ({wecomEnabled ? 1 : 0})</div>
                      <div className="mt-0.5 text-xs text-[#64748b]">当前 AgentSpace 可用的外部连接。</div>
                    </div>
                    <Button
                      className="h-8 rounded-md border-[#0f766e] bg-white px-3 text-xs text-[#0f766e] hover:bg-[#ecfdf5]"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setWecomSetupOpen(true)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      添加连接
                    </Button>
                  </div>
                  {wecomEnabled ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="border-b border-[#e2e8f0] bg-[#f8fafc] text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                          <tr>
                            <th className="px-4 py-2.5">Connection name</th>
                            <th className="px-4 py-2.5">Type</th>
                            <th className="px-4 py-2.5">Configuration</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-[#eef2f7] last:border-b-0">
                            <td className="px-4 py-3 font-medium text-[#111827]">企业微信通知</td>
                            <td className="px-4 py-3 text-[#475569]">Group robot webhook</td>
                            <td className="max-w-[280px] break-all px-4 py-3 font-mono text-xs text-[#64748b]">
                              {maskWebhook(wecomWebhook)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-xs font-semibold text-[#047857]">
                                <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                                Enabled
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                className="h-8 rounded-md border-[#d1d5db] bg-white px-3 text-xs text-[#374151] hover:bg-[#f8fafc]"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setWecomSetupOpen(true)}
                              >
                                <Settings className="mr-1.5 h-3.5 w-3.5" />
                                配置
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex min-h-[180px] flex-col items-center justify-center px-6 py-8 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8fafc] text-[#94a3b8]">
                        <Link2 className="h-5 w-5" />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-[#374151]">No connections</div>
                      <p className="mt-1 max-w-lg text-xs leading-5 text-[#64748b]">
                        添加企业微信连接后，定时任务完成、失败或等待审批时会向配置的群机器人发送通知。
                      </p>
                      <Button
                        className="mt-4 h-8 rounded-md border-[#0f766e] bg-white px-3 text-xs text-[#0f766e] hover:bg-[#ecfdf5]"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setWecomSetupOpen(true)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        添加连接
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </section>
      </main>
      <WeComIntegrationDialog
        agentSpace={agentSpace}
        busy={busy}
        open={wecomSetupOpen}
        onOpenChange={(open) => {
          setWecomSetupOpen(open);
          if (!open) {
            setIntegrationError(null);
          }
        }}
        onSave={handleSaveWeCom}
      />
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

function IntegrationCard({
  description,
  disabled,
  enabled,
  iconLabel,
  onConfigure,
  title,
}: {
  description: string;
  disabled?: boolean;
  enabled: boolean;
  iconLabel: string;
  onConfigure: () => void;
  title: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border bg-white p-5 transition',
        enabled ? 'border-[#99f6e4] bg-[#f0fdfa]' : 'border-[#e2e8f0]',
        disabled ? 'opacity-70' : 'hover:border-[#99f6e4]',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
              enabled ? 'bg-[#0f766e] text-white' : 'bg-[#eef2f7] text-[#475569]',
            )}
          >
            {iconLabel}
          </div>
          <div>
            <div className="text-sm font-semibold text-[#111827]">{title}</div>
            <p className="mt-1 max-w-md text-xs leading-5 text-[#64748b]">{description}</p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold',
            enabled ? 'bg-[#d1fae5] text-[#047857]' : 'bg-[#f3f4f6] text-[#6b7280]',
          )}
        >
          {enabled ? '已连接' : disabled ? '未开放' : '未配置'}
        </span>
      </div>
      <Button
        className={cn(
          'mt-5 h-8 rounded-md px-3 text-xs',
          enabled
            ? 'border-[#0f766e] bg-white text-[#0f766e] hover:bg-[#ecfdf5]'
            : 'bg-[#0f766e] text-white hover:bg-[#115e59]',
        )}
        variant={enabled ? 'outline' : 'default'}
        disabled={disabled}
        onClick={onConfigure}
      >
        {enabled ? <Settings className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
        {enabled ? '管理连接' : '添加集成'}
      </Button>
    </div>
  );
}

function WeComIntegrationDialog({
  agentSpace,
  busy,
  onOpenChange,
  onSave,
  open,
}: {
  agentSpace: AgentSpace;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: { enabled: boolean; webhookUrl?: string }) => Promise<void>;
  open: boolean;
}) {
  const existingEnabled = Boolean(agentSpace.integrations?.wecom?.enabled);
  const existingWebhook = agentSpace.integrations?.wecom?.webhookUrl;
  const [step, setStep] = useState(0);
  const [enabled, setEnabled] = useState(existingEnabled);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setError(null);
      setWebhookUrl('');
      return;
    }
    setEnabled(existingEnabled);
    setWebhookUrl('');
    setError(null);
  }, [existingEnabled, open]);

  const hasExistingWebhook = Boolean(existingWebhook);
  const hasUsableWebhook = !enabled || webhookUrl.trim().length > 0 || hasExistingWebhook;
  const canContinue = step === 1 ? hasUsableWebhook : true;

  const handleNext = () => {
    if (step === 1 && !hasUsableWebhook) {
      setError('请输入企业微信群机器人 webhook，或先关闭启用开关。');
      return;
    }
    setError(null);
    setStep((current) => Math.min(wecomSetupSteps.length - 1, current + 1));
  };

  const handleSave = async () => {
    if (enabled && !hasUsableWebhook) {
      setError('请输入企业微信群机器人 webhook。');
      return;
    }
    setError(null);
    await onSave({
      enabled,
      webhookUrl: webhookUrl.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1080px,calc(100vw-32px))] overflow-hidden rounded-md border-[#cbd5e1] bg-white p-0 text-[#111827] shadow-2xl">
        <DialogHeader className="border-b border-[#d8dee6] px-6 pb-4 pt-5">
          <DialogTitle className="text-lg font-semibold text-[#111827]">企业微信集成设置</DialogTitle>
          <DialogDescription className="text-sm text-[#64748b]">
            允许 Agent 向企业微信群推送任务、自动化和审批提醒。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-[460px] grid-cols-[230px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
          <aside className="border-r border-[#d8dee6] bg-[#f8fafc] px-5 py-6 max-lg:hidden">
            <div className="space-y-1">
              {wecomSetupSteps.map((label, index) => (
                <div key={label} className="relative flex gap-3 pb-7 last:pb-0">
                  {index < wecomSetupSteps.length - 1 && (
                    <span className="absolute left-[9px] top-5 h-full w-px bg-[#cbd5e1]" />
                  )}
                  <span
                    className={cn(
                      'relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-white',
                      index < step
                        ? 'border-[#0f766e] bg-[#0f766e] text-white'
                        : index === step
                          ? 'border-[#0f766e] text-[#0f766e] ring-2 ring-[#ccfbf1]'
                          : 'border-[#cbd5e1] text-[#94a3b8]',
                    )}
                  >
                    {index < step ? <Check className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </span>
                  <span>
                    <span className="block text-xs text-[#64748b]">Step {index + 1}</span>
                    <span className={cn('block text-sm font-semibold', index === step ? 'text-[#0f766e]' : 'text-[#475569]')}>
                      {label}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </aside>

          <div className="agent-scrollbar overflow-auto px-6 py-6">
            {step === 0 && <WeComGettingStarted />}
            {step === 1 && (
              <WeComConfigureStep
                enabled={enabled}
                existingWebhook={existingWebhook}
                webhookUrl={webhookUrl}
                onEnabledChange={setEnabled}
                onWebhookUrlChange={setWebhookUrl}
              />
            )}
            {step === 2 && (
              <WeComCompleteStep
                enabled={enabled}
                existingWebhook={existingWebhook}
                webhookUrl={webhookUrl}
              />
            )}
            {error && (
              <div className="mt-5 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-[#d8dee6] bg-[#f8fafc] px-6 py-3">
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
            {step < wecomSetupSteps.length - 1 ? (
              <Button
                className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                disabled={busy || !canContinue}
                onClick={handleNext}
              >
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                className="h-8 rounded-md bg-[#0f766e] px-3 text-xs text-white hover:bg-[#115e59]"
                disabled={busy || !hasUsableWebhook}
                onClick={handleSave}
              >
                保存连接
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WeComGettingStarted() {
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f766e]">Step 1</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#111827]">Getting started</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[#334155]">
        连接企业微信后，Agent 可以把自动化结果、任务失败原因和审批等待提醒发送到指定群聊。
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-[#d8dee6] bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <KeyRound className="h-4 w-4 text-[#0f766e]" />
            你需要准备
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-[#334155]">
            <li>企业微信群机器人 webhook URL</li>
            <li>确认群成员知道该机器人会接收运维通知</li>
          </ul>
        </div>
        <div className="rounded-md border border-[#d8dee6] bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            <BellRing className="h-4 w-4 text-[#0f766e]" />
            Agent 可发送
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-[#334155]">
            <li>自动化执行成功、失败、取消结果</li>
            <li>任务审批提醒和关键状态摘要</li>
          </ul>
        </div>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-md border border-[#7dd3fc] bg-[#f0f9ff] px-4 py-3 text-sm leading-6 text-[#075985]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        webhook 是敏感地址。系统会把它保存在 AgentSpace 配置中，页面只显示掩码，模型也不会看到真实 URL。
      </div>
    </section>
  );
}

function WeComConfigureStep({
  enabled,
  existingWebhook,
  onEnabledChange,
  onWebhookUrlChange,
  webhookUrl,
}: {
  enabled: boolean;
  existingWebhook?: string;
  onEnabledChange: (enabled: boolean) => void;
  onWebhookUrlChange: (value: string) => void;
  webhookUrl: string;
}) {
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f766e]">Step 2</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#111827]">Configure webhook</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[#334155]">
        粘贴企业微信群机器人 webhook。已有连接留空表示沿用当前地址；输入新地址会替换旧连接。
      </p>
      <div className="mt-5 rounded-md border border-[#d8dee6] bg-white p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            checked={enabled}
            className="mt-1 h-4 w-4 accent-[#0f766e]"
            type="checkbox"
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-[#111827]">启用企业微信通知</span>
            <span className="mt-1 block text-sm leading-6 text-[#64748b]">
              启用后，Agent 会获得企业微信系统工具，自动化完成后也会触发结果通知。
            </span>
          </span>
        </label>

        {enabled && (
          <div className="mt-5">
            <LightField
              label="Webhook URL"
              hint={existingWebhook ? `当前已配置：${maskWebhook(existingWebhook)}。留空则沿用当前地址。` : '必填。示例：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...'}
            >
              <input
                className={controlClassName}
                type="password"
                value={webhookUrl}
                onChange={(event) => onWebhookUrlChange(event.target.value)}
                placeholder={existingWebhook ? '粘贴新 webhook 以替换当前连接' : '请输入企业微信机器人 webhook'}
              />
            </LightField>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        企业微信群机器人没有 OAuth 授权过程，保存前请确认 webhook 来自正确群聊。
      </div>
    </section>
  );
}

function WeComCompleteStep({
  enabled,
  existingWebhook,
  webhookUrl,
}: {
  enabled: boolean;
  existingWebhook?: string;
  webhookUrl: string;
}) {
  const effectiveWebhook = webhookUrl.trim() ? webhookUrl : existingWebhook;
  return (
    <section>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0f766e]">Step 3</div>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#111827]">Complete</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-[#334155]">确认配置后保存，当前 Agent 会立即使用新的企业微信连接。</p>
      <div className="mt-5 overflow-hidden rounded-md border border-[#d8dee6] bg-white">
        <div className="grid grid-cols-[160px_minmax(0,1fr)] border-b border-[#eef2f7]">
          <div className="bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569]">Status</div>
          <div className="px-4 py-3 text-sm text-[#111827]">{enabled ? 'Enabled' : 'Disabled'}</div>
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)] border-b border-[#eef2f7]">
          <div className="bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569]">Type</div>
          <div className="px-4 py-3 text-sm text-[#111827]">Enterprise WeChat group robot webhook</div>
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)]">
          <div className="bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569]">Webhook</div>
          <div className="min-w-0 break-all px-4 py-3 font-mono text-xs text-[#475569]">
            {enabled ? maskWebhook(effectiveWebhook) : '-'}
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm leading-6 text-[#166534]">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
        保存后，自动化任务的成功、失败、取消结果会由后端兜底推送，不依赖模型主动调用工具。
      </div>
    </section>
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

  const trimmedName = form.name.trim();
  const nameValid = /^[a-zA-Z0-9_-]{1,64}$/.test(trimmedName);
  const canCreate =
    nameValid && trimmedName.length > 0 && trimmedName.length <= 128 && form.model.trim().length > 0;
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
  const trimmedName = form.name.trim();
  const nameTouched = trimmedName.length > 0;
  const nameValid = /^[a-zA-Z0-9_-]{1,64}$/.test(trimmedName);
  const nameError = nameTouched && !nameValid;

  return (
    <WizardSection eyebrow="Step 1" title="基础信息" description="创建 AgentSpace 并绑定 LLM 配置。">
      <form onSubmit={(event) => event.preventDefault()} className="grid gap-4">
        <LightField label="Agent 名称" hint="全局唯一，仅字母、数字、下划线和连字符，1-64 个字符，用于 URL 访问。">
          <input
            className={cn(
              controlClassName,
              nameError && 'border-red-300 focus:border-red-500 focus:ring-red-100',
            )}
            maxLength={64}
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="例如 finopsprod"
          />
          {nameError && (
            <div className="mt-1.5 text-xs font-medium text-red-600">
              名称只能包含字母、数字、下划线（_）和连字符（-），长度 1-64 个字符。
            </div>
          )}
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
                <SelectItem className="focus:bg-[#ecfdf5] focus:text-[#111827]" value="gemini-relay">
                  Gemini Relay
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
          <LightField label="API Key" hint="可留空，后端使用运行环境变量。创建时明文显示，保存后不再返回前端。">
            <input
              className={controlClassName}
              value={form.apiKey}
              onChange={(event) => onChange({ apiKey: event.target.value })}
              placeholder="Optional"
            />
          </LightField>
          <LightField label="Base URL" hint="gemini-relay 必填，例如 https://www.tokenstars.ai。">
            <input
              className={controlClassName}
              value={form.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder="Optional"
            />
          </LightField>
        </div>
      </form>
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
  return formatDateTimeWithTimezone(value);
}

function formatRelativeTime(value?: string) {
  return formatDateTimeWithTimezone(value);
}

function maskWebhook(value?: string) {
  if (!value) return '-';
  if (value.length <= 18) return '已配置';
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}
