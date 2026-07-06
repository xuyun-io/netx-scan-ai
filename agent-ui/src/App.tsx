import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Clock,
  Columns3,
  Copy,
  Expand,
  FileText,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  UserRound,
  Wrench,
  XCircle,
} from 'lucide-react';
import { AgentsAdminPage } from '@/components/agents-admin-page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  createAgentSpace,
  createConversation,
  createDocument,
  createTask,
  createTurn,
  deleteAgentSpace,
  deleteConversation,
  getConversation,
  getTask,
  getTurn,
  listArtifacts,
  listAgentSpaces,
  listConversations,
  listDocuments,
  listRecords,
  listTasks,
  respondToTask,
  updateAgentSpace,
  type AgentSpace,
  type Artifact,
  type Conversation,
  type DocumentFile,
  type RecordEntry,
  type Status,
  type Task,
  type Turn,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  emptyTableConfig,
  navigationItems,
  promptTemplates,
  resourceColumns,
  type CreateMode,
  type WorkspaceView,
} from '@/data/promptTemplates';

type ResourceView = Exclude<WorkspaceView, 'chat'>;
type ChatSurfaceVariant = 'full' | 'inline';
type ChatEvent =
  | { id: string; type: 'user'; content: string; createdAt?: string }
  | { id: string; type: 'status'; content: string; state: 'running' | 'complete' | 'error'; createdAt?: string }
  | {
      id: string;
      type: 'tool';
      kind: 'tool' | 'skill' | 'resource';
      name: string;
      status: 'called' | 'result' | 'error';
      request?: string;
      response?: string;
      skill?: string;
      action?: string;
      createdAt?: string;
    }
  | { id: string; type: 'task'; taskId: string; title: string; status: Status; description?: string; createdAt?: string }
  | { id: string; type: 'approval'; taskId: string; title: string; risk: string; target: string; command: string; status: Status }
  | { id: string; type: 'artifact'; artifactId: string; name: string; artifactType: string; createdAt?: string }
  | { id: string; type: 'answer'; content: string; taskId?: string; status: Status; createdAt?: string };
type TimelineItem =
  | { id: string; kind: 'event'; event: ChatEvent }
  | { id: string; kind: 'assistant'; scopeKey: string; events: ChatEvent[] };

const MAX_PROMPT_LENGTH = 1000;

const viewCopy: Record<
  ResourceView,
  {
    eyebrow: string;
    title: string;
    description: string;
    search: string;
    action: string;
  }
> = {
  tasks: {
    eyebrow: 'Tasks',
    title: 'Tasks queue',
    description: 'View and manage tasks delegated to the NetX SRE Agent',
    search: 'Find tasks',
    action: 'Create tasks',
  },
  automations: {
    eyebrow: 'Automations',
    title: 'Automations',
    description: 'Automation is reserved for v2; first version uses manual tasks and chat turns.',
    search: 'Find automations',
    action: 'Create automation',
  },
  artifacts: {
    eyebrow: 'Artifacts',
    title: 'Artifacts',
    description: 'Generated reports, analysis files, and task outputs',
    search: 'Find artifacts',
    action: 'Upload artifact',
  },
  'context-files': {
    eyebrow: 'Context',
    title: 'Context files',
    description: 'Help NetX SRE Agent learn your environment by uploading relevant documents.',
    search: 'Search files',
    action: 'Upload file',
  },
};

function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('chat');
  const [createMode, setCreateMode] = useState<CreateMode>('none');
  const [prompt, setPrompt] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [inlineChatOpen, setInlineChatOpen] = useState(false);
  const [adminView, setAdminView] = useState(true);
  const [agentSpaces, setAgentSpaces] = useState<AgentSpace[]>([]);
  const [agentSpace, setAgentSpace] = useState<AgentSpace | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resourceView = activeView === 'chat' ? 'tasks' : activeView;
  const isFullChat = activeView === 'chat';
  const hasInlineChat = !isFullChat && inlineChatOpen;

  const loadAgentSpaces = useCallback(async () => {
    const page = await listAgentSpaces();
    setAgentSpaces(page.entities ?? []);
  }, []);

  const refresh = useCallback(async (agentSpaceId: string) => {
    const [taskPage, artifactPage, documentPage] = await Promise.all([
      listTasks(agentSpaceId),
      listArtifacts(agentSpaceId),
      listDocuments(agentSpaceId),
    ]);
    setTasks(taskPage.entities ?? []);
    setArtifacts(artifactPage.entities ?? []);
    setDocuments(documentPage.entities ?? []);
  }, []);

  const loadConversations = useCallback(async (agentSpaceId: string) => {
    const page = await listConversations(agentSpaceId, 50);
    const nextConversations = page.entities ?? [];
    setConversations(nextConversations);
    return nextConversations;
  }, []);

  const loadConversationTimeline = useCallback(async (agentSpaceId: string, nextConversation: Conversation) => {
    const detail = await getConversation(agentSpaceId, nextConversation.conversationId);
    setConversation(detail.entity);
    setChatEvents(await turnsToChatEvents(agentSpaceId, detail.turns ?? []));
  }, []);

  useEffect(() => {
    let alive = true;
    loadAgentSpaces()
      .catch((err: Error) => setError(err.message))
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, [loadAgentSpaces]);

  const selectView = (view: WorkspaceView) => {
    setActiveView(view);
    setInlineChatOpen(false);
    setCreateMode('none');
  };

  const startCreate = (mode: Exclude<CreateMode, 'none'>) => {
    setCreateMode(mode);
    setActiveView(mode === 'task' ? 'tasks' : 'automations');
  };

  const openAgent = async (nextSpace: AgentSpace) => {
    setBusy(true);
    setError(null);
    try {
      const nextConversations = await loadConversations(nextSpace.agentSpaceId);
      const nextConversation =
        nextConversations[0] ??
        (await createConversation(nextSpace.agentSpaceId, '新的会话')).entity;
      setAgentSpace(nextSpace);
      if (nextConversations.length === 0) {
        setConversations([nextConversation]);
        setConversation(nextConversation);
        setChatEvents([]);
      } else {
        await loadConversationTimeline(nextSpace.agentSpaceId, nextConversation);
      }
      setPrompt('');
      setCreateMode('none');
      setActiveView('chat');
      setInlineChatOpen(false);
      setAdminView(false);
      await refresh(nextSpace.agentSpaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAgent = async (input: Parameters<typeof createAgentSpace>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const created = await createAgentSpace(input);
      await loadAgentSpaces();
      await openAgent(created.entity);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAgent = async (target: AgentSpace) => {
    setBusy(true);
    setError(null);
    try {
      await updateAgentSpace({
        agentSpaceId: target.agentSpaceId,
        name: target.name,
        description: target.description,
        llm: target.llm,
        environment: target.environment,
        integrations: target.integrations,
      });
      await loadAgentSpaces();
      if (agentSpace?.agentSpaceId === target.agentSpaceId) {
        setAgentSpace((prev) => (prev ? { ...prev, environment: target.environment } : prev));
      }
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAgent = async (target: AgentSpace) => {
    const confirmed = window.confirm(`确定删除 Agent "${target.name}" 吗？这会删除对应 AgentSpace 的文本数据目录。`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAgentSpace(target.agentSpaceId);
      if (agentSpace?.agentSpaceId === target.agentSpaceId) {
        setAgentSpace(null);
        setConversation(null);
        setConversations([]);
        setChatEvents([]);
        setTasks([]);
        setArtifacts([]);
        setDocuments([]);
        setActiveView('chat');
        setInlineChatOpen(false);
        setAdminView(true);
      }
      await loadAgentSpaces();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAdmin = async () => {
    setAdminView(true);
    setError(null);
    try {
      await loadAgentSpaces();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNewChat = async () => {
    if (!agentSpace || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextConversation = await createConversation(agentSpace.agentSpaceId, '新的会话');
      setConversation(nextConversation.entity);
      setConversations((prev) => [nextConversation.entity, ...prev.filter((item) => item.conversationId !== nextConversation.entity.conversationId)]);
      setChatEvents([]);
      setCreateMode('none');
      if (activeView === 'chat') {
        setInlineChatOpen(false);
      } else {
        setInlineChatOpen(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenConversation = async (nextConversation: Conversation) => {
    if (!agentSpace || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loadConversationTimeline(agentSpace.agentSpaceId, nextConversation);
      setActiveView('chat');
      setInlineChatOpen(false);
      setCreateMode('none');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConversation = async (target: Conversation) => {
    if (!agentSpace || busy) return;
    const confirmed = window.confirm(`确定删除会话 "${target.title || '新的会话'}" 吗？`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteConversation(agentSpace.agentSpaceId, target.conversationId);
      const nextConversations = conversations.filter(
        (item) => item.conversationId !== target.conversationId,
      );
      setConversations(nextConversations);
      if (conversation?.conversationId === target.conversationId) {
        if (nextConversations.length > 0) {
          await loadConversationTimeline(agentSpace.agentSpaceId, nextConversations[0]);
        } else {
          const created = await createConversation(agentSpace.agentSpaceId, '新的会话');
          setConversations([created.entity]);
          setConversation(created.entity);
          setChatEvents([]);
        }
      }
      await loadConversations(agentSpace.agentSpaceId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!agentSpace || !conversation || !prompt.trim() || busy) return;
    const userPrompt = prompt.trim();
    const statusId = crypto.randomUUID();
    setPrompt('');
    setBusy(true);
    setError(null);
    setChatEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: 'user', content: userPrompt, createdAt: new Date().toISOString() },
      {
        id: statusId,
        type: 'status',
        content: 'Agent 处理中...',
        state: 'running',
        createdAt: new Date().toISOString(),
      },
    ]);
    const nextTitle = titleFromPrompt(userPrompt);
    setConversation((current) => (current ? { ...current, title: current.title === '新的会话' ? nextTitle : current.title } : current));
    setConversations((prev) =>
      prev.map((item) =>
        item.conversationId === conversation.conversationId && item.title === '新的会话'
          ? { ...item, title: nextTitle, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    let scopeKey = '';
    try {
      const created = await createTurn(agentSpace.agentSpaceId, conversation.conversationId, userPrompt);
      scopeKey = turnScope(created.turn.turnId);
      const finalTurn = await pollTurnRecords({
        agentSpaceId: agentSpace.agentSpaceId,
        conversationId: conversation.conversationId,
        turnId: created.turn.turnId,
        onUpdate: (turn, records) => {
          const nextEvents = recordsToChatEvents(records, { scopeKey });
          if (!isTurnDone(turn)) {
            nextEvents.push({
              id: scopedEventId(scopeKey, `${turn.turnId}-status`),
              type: 'status',
              content: inProgressLabel(records),
              state: 'running',
              createdAt: turn.updatedAt,
            });
          } else if (!nextEvents.some((event) => event.type === 'answer') && turn.output?.text) {
            const answerEvent = turnToAnswerEvent(turn, scopeKey);
            if (answerEvent.content) {
              nextEvents.push(answerEvent);
            }
          }
          setChatEvents((prev) => replaceScopedEvents(prev, statusId, scopeKey, nextEvents));
        },
      });
      if (finalTurn.taskId) {
        const task = await pollTask(agentSpace.agentSpaceId, finalTurn.taskId);
        const [recordPage, artifactPage] = await Promise.all([
          listRecords({ agentSpaceId: agentSpace.agentSpaceId, taskId: finalTurn.taskId, maxResults: 100 }),
          listArtifacts(agentSpace.agentSpaceId),
        ]);
        const taskEvents = [
          ...recordsToChatEvents(recordPage.records ?? [], { scopeKey }),
          taskToChatEvent(task, scopeKey),
          ...(task.status === 'AWAITING_INPUT' ? [taskToApprovalEvent(task, scopeKey)] : []),
          ...artifactsToChatEvents((artifactPage.entities ?? []).filter((artifact) => artifact.taskId === task.taskId), scopeKey),
        ];
        setChatEvents((prev) => replaceScopedEvents(prev, statusId, scopeKey, taskEvents));
      }
      await refresh(agentSpace.agentSpaceId);
      await loadConversations(agentSpace.agentSpaceId);
    } catch (err) {
      setError((err as Error).message);
      const errorEvents: ChatEvent[] = [
        {
          id: scopeKey ? scopedEventId(scopeKey, 'error-status') : statusId,
          type: 'status',
          content: `请求失败：${(err as Error).message}`,
          state: 'error',
          createdAt: new Date().toISOString(),
        },
        {
          id: scopeKey ? scopedEventId(scopeKey, 'error-answer') : crypto.randomUUID(),
          type: 'answer',
          content: `请求失败：${(err as Error).message}`,
          status: 'FAILED',
          createdAt: new Date().toISOString(),
        },
      ];
      setChatEvents((prev) =>
        scopeKey ? replaceScopedEvents(prev, statusId, scopeKey, errorEvents) : replaceEvent(prev, statusId, errorEvents),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTask = async (instruction: string, priority: string) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTask(agentSpace.agentSpaceId, instruction, priority);
      setCreateMode('none');
      await refresh(agentSpace.agentSpaceId);
      if (created.entity.status !== 'AWAITING_INPUT') {
        await pollTask(agentSpace.agentSpaceId, created.entity.taskId);
        await refresh(agentSpace.agentSpaceId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveTask = async (taskId: string, response: 'approve' | 'reject') => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const task = await respondToTask(agentSpace.agentSpaceId, taskId, response);
      await refresh(agentSpace.agentSpaceId);
      setChatEvents((prev) => updateTaskEvents(prev, task.entity));
      if (response === 'approve') {
        const completed = await pollTask(agentSpace.agentSpaceId, task.entity.taskId);
        setChatEvents((prev) => updateTaskEvents(prev, completed));
        await refresh(agentSpace.agentSpaceId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDocumentUploaded = async (file: File) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      await createDocument(agentSpace.agentSpaceId, file);
      await refresh(agentSpace.agentSpaceId);
      setUploadOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryAction = (view: ResourceView) => {
    if (view === 'tasks') {
      startCreate('task');
      return;
    }
    if (view === 'automations') {
      setCreateMode('automation');
      return;
    }
    if (view === 'context-files') {
      setUploadOpen(true);
    }
  };

  const openFullChat = () => {
    setActiveView('chat');
    setInlineChatOpen(false);
    setCreateMode('none');
  };

  const expandWorkspace = () => {
    setInlineChatOpen(false);
  };

  if (adminView || !agentSpace) {
    return (
      <AgentsAdminPage
        agentSpaces={agentSpaces}
        booting={booting}
        busy={busy}
        error={error}
        onCreateAgent={handleCreateAgent}
        onDeleteAgent={handleDeleteAgent}
        onOpenAgent={openAgent}
        onUpdateAgent={handleUpdateAgent}
        onRefresh={loadAgentSpaces}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#111821] text-[#d8dee9]">
      <div className="h-[2px] bg-[#70c4d5]" />
      <TopBar agentSpaceName={agentSpace.name} onOpenAdmin={handleOpenAdmin} />
      <div className="grid h-[calc(100vh-46px)] grid-cols-[190px_minmax(0,1fr)] max-lg:grid-cols-1">
        <Sidebar
          activeView={activeView}
          activeConversationId={conversation?.conversationId}
          conversations={conversations}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={handleNewChat}
          onOpenConversation={handleOpenConversation}
          onSelectView={selectView}
        />

        <main
          className={cn(
            'min-w-0 overflow-hidden bg-[#111821]',
            isFullChat
              ? 'h-full'
              : hasInlineChat
                ? 'grid h-full grid-cols-[minmax(450px,520px)_minmax(0,1fr)] max-xl:grid-cols-[430px_minmax(0,1fr)] max-lg:grid-cols-1'
                : 'h-full',
          )}
        >
          {isFullChat && (
            <AgentComposer
              booting={booting}
              busy={busy}
              conversation={conversation}
              events={chatEvents}
              prompt={prompt}
              variant="full"
              onApproveTask={handleApproveTask}
              onPromptChange={setPrompt}
              onSend={handleSend}
              onTemplateClick={setPrompt}
            />
          )}

          {hasInlineChat && (
            <AgentComposer
              booting={booting}
              busy={busy}
              conversation={conversation}
              events={chatEvents}
              prompt={prompt}
              variant="inline"
              onApproveTask={handleApproveTask}
              onExpand={openFullChat}
              onPromptChange={setPrompt}
              onSend={handleSend}
              onTemplateClick={setPrompt}
            />
          )}

          {!isFullChat && (
            <WorkspacePanel
              artifacts={artifacts}
              busy={busy}
              createMode={createMode}
              documents={documents}
              error={error}
              tasks={tasks}
              view={resourceView}
              onApproveTask={handleApproveTask}
              onCancelCreate={() => setCreateMode('none')}
              onCreate={startCreate}
              onCreateTask={handleCreateTask}
              onExpandWorkspace={expandWorkspace}
              onPrimaryAction={handlePrimaryAction}
              onRefresh={() => agentSpace && refresh(agentSpace.agentSpaceId)}
            />
          )}
        </main>
      </div>

      {error && isFullChat && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-red-400/30 bg-red-950/80 px-4 py-2 text-sm text-red-100">
          {error}
        </div>
      )}
      <UploadContextDialog
        busy={busy}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleDocumentUploaded}
      />
    </div>
  );
}

function TopBar({ agentSpaceName, onOpenAdmin }: { agentSpaceName: string; onOpenAdmin: () => void }) {
  return (
    <header className="flex h-11 items-center justify-between border-b border-[#222b36] bg-[#121922] px-3">
      <div className="flex items-center gap-3">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8f5cff] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-[#c3c9d3] transition hover:bg-[#202936] hover:text-white"
            onClick={onOpenAdmin}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Agents
          </button>
          <span className="text-sm font-bold text-[#f2f4f8]">{agentSpaceName}</span>
          <span className="rounded bg-[#6b7079] px-2 py-0.5 text-[11px] font-bold text-white">
            v1 Preview
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[#8f82ff]">
        <Columns3 className="h-4 w-4" />
        <Circle className="h-4 w-4 fill-current opacity-85" />
        <button className="text-xs font-bold hover:text-white">Sign out</button>
      </div>
    </header>
  );
}

interface SidebarProps {
  activeView: WorkspaceView;
  activeConversationId?: string;
  conversations: Conversation[];
  onDeleteConversation: (conversation: Conversation) => Promise<void>;
  onNewChat: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onSelectView: (view: WorkspaceView) => void;
}

function Sidebar({
  activeView,
  activeConversationId,
  conversations,
  onDeleteConversation,
  onNewChat,
  onOpenConversation,
  onSelectView,
}: SidebarProps) {
  return (
    <aside className="relative flex h-full flex-col border-r border-[#222b36] bg-[#121922] max-lg:hidden">
      <div className="border-b border-[#202936] px-5 pb-7 pt-4">
        <Button className="h-8 w-full border-2 text-[13px]" variant="outline" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-0.5 py-1 text-left text-sm font-semibold transition-colors',
                  active ? 'text-[#8f82ff]' : 'text-[#c3c9d3] hover:text-white',
                )}
                onClick={() => onSelectView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-5 py-4">
        <div className="mb-4 text-sm font-bold text-[#d9dee8]">Recent</div>
        <div className="space-y-2">
          {conversations.length === 0 && (
            <div className="text-xs font-semibold text-[#788291]">No conversations yet</div>
          )}
          {conversations.map((item) => {
            const active = activeConversationId === item.conversationId;
            return (
              <div
                key={item.conversationId}
                className={cn(
                  'group flex items-center justify-between rounded-sm px-1 py-0.5 transition',
                  active ? 'bg-[#1f2937]' : 'hover:bg-[#1f2937]/50',
                )}
              >
                <button
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-xs font-semibold',
                    active ? 'text-[#8f82ff]' : 'text-[#b8bfcc] hover:text-white',
                  )}
                  onClick={() => onOpenConversation(item)}
                >
                  {item.title || '新的会话'}
                </button>
                <button
                  className="ml-1 rounded p-0.5 text-[#64748b] opacity-0 transition hover:bg-[#374151] hover:text-red-400 group-hover:opacity-100"
                  aria-label={`删除 ${item.title || '新的会话'}`}
                  onClick={() => onDeleteConversation(item)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-[#202936] px-5 py-4 text-xs font-semibold text-[#aab2bf]">
        <Bot className="h-4 w-4" />
        FileStore
      </div>
    </aside>
  );
}

interface AgentComposerProps {
  booting: boolean;
  busy: boolean;
  conversation: Conversation | null;
  events: ChatEvent[];
  prompt: string;
  variant: ChatSurfaceVariant;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onExpand?: () => void;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onTemplateClick: (value: string) => void;
}

function AgentComposer({
  booting,
  busy,
  conversation,
  events,
  prompt,
  variant,
  onApproveTask,
  onExpand,
  onPromptChange,
  onSend,
  onTemplateClick,
}: AgentComposerProps) {
  const compact = variant === 'inline';
  const title = conversation?.title || '新的会话';

  return (
    <section
      className={cn(
        'grid h-full min-w-0 grid-rows-[48px_1fr_auto] bg-[#111821]',
        compact ? 'border-r border-[#222b36] max-lg:border-r-0' : '',
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-[#222b36] px-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-extrabold text-[#f2f4f8]">{title}</h1>
            <button className="shrink-0 text-xs font-bold text-[#8f82ff] hover:text-[#aaa2ff]">
              Show ID
            </button>
          </div>
        </div>
        {compact && (
          <button className="text-[#c4cad5] hover:text-white" aria-label="Open full chat" onClick={onExpand}>
            <Expand className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'agent-scrollbar min-h-0 overflow-y-auto overscroll-y-contain',
          compact ? 'px-5 py-5' : 'px-8 py-7',
        )}
      >
        {events.length === 0 ? (
          <ChatEmptyState compact={compact} onTemplateClick={onTemplateClick} />
        ) : (
          <ChatTimeline compact={compact} events={events} onApproveTask={onApproveTask} />
        )}
      </div>

      <ChatInput
        booting={booting}
        busy={busy}
        compact={compact}
        prompt={prompt}
        onPromptChange={onPromptChange}
        onSend={onSend}
      />
    </section>
  );
}

function ChatEmptyState({
  compact,
  onTemplateClick,
}: {
  compact: boolean;
  onTemplateClick: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-full flex-col',
        compact ? 'justify-start' : 'mx-auto max-w-[980px] justify-center pb-24',
      )}
    >
      <div className={cn('text-xs font-bold text-[#8f98a6]', compact ? '' : 'text-center')}>
        Get started with a common task
      </div>
      <h2
        className={cn(
          'agent-gradient-title mt-3 font-extrabold',
          compact ? 'text-xl leading-7' : 'text-center text-3xl',
        )}
      >
        Delegate work to NetX SRE Agent
      </h2>
      <div className={cn('mt-6 grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {promptTemplates.slice(0, compact ? 4 : 8).map((template) => (
          <button
            key={template.id}
            className="rounded-md border border-[#3b3480] bg-[#121922] px-3 py-2 text-left text-sm font-bold leading-5 text-[#9a91ff] transition hover:border-[#958bff] hover:bg-[#8378ff]/10 hover:text-[#b9b3ff]"
            onClick={() => onTemplateClick(template.text)}
          >
            {template.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatTimeline({
  compact,
  events,
  onApproveTask,
}: {
  compact: boolean;
  events: ChatEvent[];
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const timeline = useMemo(() => buildTimelineItems(events), [events]);
  return (
    <div className="w-full max-w-[1500px] space-y-7">
      {timeline.map((item) => (
        <TimelineItemRow key={item.id} compact={compact} item={item} onApproveTask={onApproveTask} />
      ))}
    </div>
  );
}

function TimelineItemRow({
  compact,
  item,
  onApproveTask,
}: {
  compact: boolean;
  item: TimelineItem;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  if (item.kind === 'assistant') {
    return (
      <div className={cn('grid min-w-0 gap-5', compact ? 'grid-cols-[30px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]')}>
        <EventAvatar type="answer" />
        <div className="min-w-0">
          <AssistantResponseEvent events={item.events} onApproveTask={onApproveTask} />
        </div>
      </div>
    );
  }

  const { event } = item;
  const isUser = event.type === 'user';
  return (
    <div className={cn('grid min-w-0 gap-5', compact ? 'grid-cols-[30px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]')}>
      <EventAvatar type={event.type} />
      <div className="min-w-0">
        {event.type === 'user' && (
          <div className="pt-0.5 text-sm leading-6 text-[#aeb7c5]">
            <div className="whitespace-pre-wrap text-[15px] font-semibold">{event.content}</div>
            <div className="mt-1 text-xs font-semibold text-[#9ca6b5]">{formatTime(event.createdAt)}</div>
          </div>
        )}
        {!isUser && event.type === 'status' && <StatusEvent event={event} />}
        {!isUser && event.type === 'tool' && <ToolEvent event={event} />}
        {!isUser && event.type === 'task' && <TaskEvent event={event} />}
        {!isUser && event.type === 'approval' && <ApprovalEvent event={event} onApproveTask={onApproveTask} />}
        {!isUser && event.type === 'artifact' && <ArtifactEvent event={event} />}
        {!isUser && event.type === 'answer' && <AnswerEvent event={event} />}
      </div>
    </div>
  );
}

function AssistantResponseEvent({
  events,
  onApproveTask,
}: {
  events: ChatEvent[];
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const answer = [...events].reverse().find((event): event is Extract<ChatEvent, { type: 'answer' }> => event.type === 'answer');
  const runningStatus = [...events]
    .reverse()
    .find((event): event is Extract<ChatEvent, { type: 'status' }> => event.type === 'status' && event.state === 'running');
  const running = Boolean(runningStatus);
  const processEvents = events.filter((event) => event.type !== 'answer' && !(event.type === 'status' && event.state === 'running'));
  const stepCount = processEvents.length;
  const [showSteps, setShowSteps] = useState(!answer || running);
  const userToggled = useRef(false);

  useEffect(() => {
    if (running) {
      userToggled.current = false;
      setShowSteps(true);
      return;
    }
    if (answer && !userToggled.current) {
      setShowSteps(false);
    }
  }, [running, Boolean(answer)]);

  const toggleSteps = () => {
    userToggled.current = true;
    setShowSteps((value) => !value);
  };

  return (
    <div className="box-border w-full max-w-[1360px] min-w-0 overflow-hidden rounded-md border border-[#1c2530] bg-[#0a0f15] px-4 py-4 text-[#b8c1cf] shadow-[0_18px_55px_rgba(0,0,0,0.16)]">
      {stepCount > 0 && !running && !showSteps && (
        <button
          className="mb-4 text-sm font-extrabold text-[#8f82ff] hover:text-[#b8b0ff]"
          onClick={toggleSteps}
        >
          Show thinking process ({stepCount} {stepCount === 1 ? 'step' : 'steps'})
        </button>
      )}

      {(showSteps || running) && stepCount > 0 && (
        <div className="grid min-w-0 gap-3">
          {processEvents.map((event) => (
            <AssistantStepEvent key={event.id} event={event} onApproveTask={onApproveTask} />
          ))}
        </div>
      )}

      {runningStatus && (
        <div className={cn(stepCount > 0 ? 'mt-5' : '')}>
          <RunningProcess label={runningStatus.content} />
        </div>
      )}

      {stepCount > 0 && !running && showSteps && (
        <button
          className="mt-4 text-sm font-extrabold text-[#8f82ff] hover:text-[#b8b0ff]"
          onClick={toggleSteps}
        >
          Hide thinking process
        </button>
      )}

      {answer && (
        <div className={cn(stepCount > 0 || runningStatus ? 'mt-5' : '')}>
          <AnswerEvent embedded event={answer} />
        </div>
      )}
    </div>
  );
}

function AssistantStepEvent({
  event,
  onApproveTask,
}: {
  event: ChatEvent;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  if (event.type === 'status') {
    return <StatusStep event={event} />;
  }
  if (event.type === 'tool') {
    return <ToolEvent embedded event={event} />;
  }
  if (event.type === 'task') {
    return <TaskEvent event={event} />;
  }
  if (event.type === 'approval') {
    return <ApprovalEvent event={event} onApproveTask={onApproveTask} />;
  }
  if (event.type === 'artifact') {
    return <ArtifactEvent event={event} />;
  }
  return null;
}

function StatusStep({ event }: { event: Extract<ChatEvent, { type: 'status' }> }) {
  const icon =
    event.state === 'error' ? (
      <XCircle className="h-4 w-4 text-red-400" />
    ) : event.state === 'complete' ? (
      <MoreHorizontal className="h-4 w-4 text-[#9aa4b3]" />
    ) : (
      <Clock className="h-4 w-4 animate-spin text-[#aeb7c5]" />
    );
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm font-semibold leading-6 text-[#aeb7c5]">
      <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90">{icon}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{event.content}</span>
    </div>
  );
}

function RunningProcess({ label }: { label: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-bold text-[#aeb7c5]">
        <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
        {label}
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[#242d3a]">
        <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
      </div>
      <button className="mt-4 text-sm font-extrabold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
    </div>
  );
}

function EventAvatar({ type }: { type: ChatEvent['type'] }) {
  if (type === 'user') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#454c57] text-[#eef2f8] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <UserRound className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#18b8ff] via-[#7267ff] to-[#9b46ff] text-white shadow-[0_8px_22px_rgba(114,103,255,0.22)]">
      {type === 'tool' ? <Wrench className="h-4 w-4" /> : type === 'approval' ? <ShieldAlert className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
    </div>
  );
}

function StatusEvent({ event }: { event: Extract<ChatEvent, { type: 'status' }> }) {
  const icon =
    event.state === 'complete' ? (
      <Check className="h-4 w-4 text-[#35d05d]" />
    ) : event.state === 'error' ? (
      <XCircle className="h-4 w-4 text-red-400" />
    ) : (
      <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
    );
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-bold text-[#cbd3df]">
        {icon}
        {event.content}
      </div>
      {event.state === 'running' && (
        <>
          <div className="mt-3 h-[3px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[#242d3a]">
            <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
          </div>
          <button className="mt-3 text-sm font-bold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
        </>
      )}
    </div>
  );
}

function ToolEvent({ event, embedded = false }: { event: Extract<ChatEvent, { type: 'tool' }>; embedded?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ok = event.status !== 'error';
  const complete = event.status === 'result';
  const label =
    event.kind === 'skill'
      ? `${complete ? 'Powered up skill' : 'Loading skill'}`
      : event.kind === 'resource'
        ? `${complete ? 'Loaded' : 'Loading'}`
        : `${complete ? 'Called tool' : 'Calling tool'}`;
  const hasDetails = Boolean(event.request || event.response);
  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden', embedded ? '' : 'rounded-md border border-[#202936] bg-[#0d131b] px-4 py-3')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-6">
        {complete ? (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#26d044] text-[#26d044]">
            <Check className="h-3 w-3 stroke-[3]" />
          </span>
        ) : event.status === 'error' ? (
          <XCircle className="h-4 w-4 text-red-400" />
        ) : (
          <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
        )}
        <span className={ok ? 'text-[#26d044]' : 'text-red-300'}>{label}</span>
        {event.kind !== 'skill' && <span className="min-w-0 max-w-full truncate text-[#c6ceda]">{event.name}</span>}
        {event.kind === 'skill' && <span className="min-w-0 max-w-full truncate text-[#c6ceda]">{event.name}</span>}
        {!embedded && event.skill && event.kind === 'tool' && (
          <span className="rounded border border-[#2a3b4d] px-2 py-0.5 text-[11px] text-[#aab2bf]">
            {event.skill}{event.action ? ` / ${event.action}` : ''}
          </span>
        )}
        {hasDetails && (
          <button
            className="text-[#9a91ff] underline underline-offset-2 hover:text-[#b8b0ff]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <div className={cn('mt-3 grid min-w-0 max-w-full gap-3 overflow-hidden', embedded ? 'ml-6 max-w-[calc(100%-1.5rem)]' : '')}>
          {event.request && <PayloadBlock label="Request" value={event.request} />}
          {event.response && <PayloadBlock label="Response" value={event.response} />}
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[#aab2bf]">{label}</div>
      <pre className="max-h-[260px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#202936] bg-[#101722] px-3 py-2 font-mono text-xs leading-5 text-[#d8dee8] [overflow-wrap:anywhere]">
        {value}
      </pre>
    </div>
  );
}

function TaskEvent({ event }: { event: Extract<ChatEvent, { type: 'task' }> }) {
  return (
    <div className="rounded-md border border-[#2e3b4d] bg-[#101820] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-[#8f98a6]">Task created</div>
          <div className="mt-1 text-sm font-extrabold text-[#eef2f8]">{event.title}</div>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <div className="mt-2 font-mono text-xs text-[#aab2bf]">{event.taskId}</div>
      {event.description && <div className="mt-2 text-sm leading-6 text-[#cbd3df]">{event.description}</div>}
    </div>
  );
}

function ApprovalEvent({
  event,
  onApproveTask,
}: {
  event: Extract<ChatEvent, { type: 'approval' }>;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const pending = event.status === 'AWAITING_INPUT';
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-950/20 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-amber-200">
        <ShieldCheck className="h-4 w-4" />
        {pending ? 'Waiting for approval' : `Approval ${event.status.toLowerCase()}`}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[#e7d7b7]">
        <div><span className="font-bold">操作：</span>{event.title}</div>
        <div><span className="font-bold">风险：</span>{event.risk}</div>
        <div><span className="font-bold">目标：</span>{event.target}</div>
        <div><span className="font-bold">摘要：</span>{event.command}</div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="h-8 px-4 text-xs" disabled={!pending} onClick={() => onApproveTask(event.taskId, 'approve')}>
          Approve
        </Button>
        <Button className="h-8 border-2 px-4 text-xs" disabled={!pending} variant="outline" onClick={() => onApproveTask(event.taskId, 'reject')}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function ArtifactEvent({ event }: { event: Extract<ChatEvent, { type: 'artifact' }> }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#26313e] bg-[#101820] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-4 w-4 shrink-0 text-[#8f82ff]" />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[#eef2f8]">{event.name}</div>
          <div className="font-mono text-xs text-[#aab2bf]">{event.artifactType} · {event.artifactId}</div>
        </div>
      </div>
      <button className="text-xs font-bold text-[#8f82ff] hover:text-[#aaa2ff]">View</button>
    </div>
  );
}

function AnswerEvent({ event, embedded = false }: { event: Extract<ChatEvent, { type: 'answer' }>; embedded?: boolean }) {
  const body = (
    <>
      <div className="prose-netx min-w-0 max-w-full whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-[#b8c1cf] [overflow-wrap:anywhere]">{event.content}</div>
      {event.taskId && (
        <div className="mt-3 inline-flex rounded border border-[#8378ff]/40 px-2 py-1 text-xs font-bold text-[#9a91ff]">
          Task: {event.taskId}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-3 text-[#9aa4b3]">
        <button aria-label="Thumbs up" className="hover:text-white"><ThumbsUp className="h-4 w-4" /></button>
        <button aria-label="Thumbs down" className="hover:text-white"><ThumbsDown className="h-4 w-4" /></button>
        <button aria-label="Copy response" className="hover:text-white"><Copy className="h-4 w-4" /></button>
      </div>
    </>
  );
  if (embedded) {
    return (
      <div className="text-[#cbd3df]">
        {body}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[#202936] bg-[#0d131b] px-4 py-3 text-[#cbd3df]">
      {body}
    </div>
  );
}

function ChatInput({
  booting,
  busy,
  compact,
  prompt,
  onPromptChange,
  onSend,
}: {
  booting: boolean;
  busy: boolean;
  compact: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className={cn('shrink-0 border-t border-[#222b36]', compact ? 'px-5 py-4' : 'px-8 py-5')}>
      <div>
        <div className="overflow-hidden rounded-md border border-[#3b4654] bg-[#121922] transition focus-within:border-[#8278ff] focus-within:ring-1 focus-within:ring-[#8278ff]">
          <textarea
            value={prompt}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                if (!booting && !busy && prompt.trim()) {
                  onSend();
                }
              }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                onSend();
              }
            }}
            placeholder="例如：现在链上块高多少？或生成一份 validator 健康巡检报告。"
            className={cn(
              'block w-full resize-none border-0 bg-transparent px-3 py-3 text-sm font-semibold leading-6 text-[#dce1eb] outline-none placeholder:text-[#a2a9b4] focus:outline-none',
              compact ? 'h-[68px]' : 'h-[84px]',
            )}
          />
          <div className="flex h-10 items-center justify-end gap-3 border-t border-[#232d39] px-3">
            <div className="text-xs font-bold text-[#aab2bf]">
              字数 {prompt.length}/{MAX_PROMPT_LENGTH}
            </div>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#8378ff] text-white shadow-sm transition hover:bg-[#968dff] disabled:bg-[#283241] disabled:text-[#788291]"
              aria-label="Send prompt"
              disabled={booting || busy || !prompt.trim()}
              onClick={onSend}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WorkspacePanelProps {
  artifacts: Artifact[];
  busy: boolean;
  createMode: CreateMode;
  documents: DocumentFile[];
  error: string | null;
  tasks: Task[];
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCancelCreate: () => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onCreateTask: (instruction: string, priority: string) => void;
  onExpandWorkspace: () => void;
  onPrimaryAction: (view: ResourceView) => void;
  onRefresh: () => void;
}

function WorkspacePanel({
  artifacts,
  busy,
  createMode,
  documents,
  error,
  tasks,
  view,
  onApproveTask,
  onCancelCreate,
  onCreate,
  onCreateTask,
  onExpandWorkspace,
  onPrimaryAction,
  onRefresh,
}: WorkspacePanelProps) {
  return (
    <section className="agent-scrollbar h-full min-w-0 overflow-auto px-5 py-4">
      {error && (
        <div className="mb-3 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}
      {createMode === 'task' && (
        <CreateTaskForm busy={busy} onCancel={onCancelCreate} onSubmit={onCreateTask} />
      )}
      {createMode === 'automation' && <AutomationReserved onCancel={onCancelCreate} />}
      {createMode === 'none' && (
        <ResourceList
          artifacts={artifacts}
          documents={documents}
          tasks={tasks}
          view={view}
          onApproveTask={onApproveTask}
          onCreate={onCreate}
          onExpandWorkspace={onExpandWorkspace}
          onPrimaryAction={() => onPrimaryAction(view)}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
}

interface ResourceListProps {
  artifacts: Artifact[];
  documents: DocumentFile[];
  tasks: Task[];
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onExpandWorkspace: () => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
}

function ResourceList({
  artifacts,
  documents,
  tasks,
  view,
  onApproveTask,
  onCreate,
  onExpandWorkspace,
  onPrimaryAction,
  onRefresh,
}: ResourceListProps) {
  const copy = viewCopy[view];
  const isTasks = view === 'tasks';
  const count =
    view === 'tasks'
      ? tasks.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;

  return (
    <div className="min-w-[720px]">
      <WorkspaceTopLine eyebrow={copy.eyebrow} onExpand={onExpandWorkspace} />
      {isTasks && <RequestUpdatesCard tasks={tasks} />}
      {isTasks ? (
        <Tabs defaultValue="all" className="mt-5">
          <TabsList>
            <TabsTrigger value="all">All tasks</TabsTrigger>
            <TabsTrigger value="approval">Awaiting approval</TabsTrigger>
            <TabsTrigger value="progress">In progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          {[
            ['all', tasks],
            ['approval', tasks.filter((task) => task.status === 'AWAITING_INPUT')],
            ['progress', tasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'PENDING')],
            ['completed', tasks.filter((task) => task.status === 'COMPLETED')],
          ].map(([tab, tabTasks]) => (
            <TabsContent key={String(tab)} value={String(tab)}>
              <ResourceTable
                actionLabel={copy.action}
                artifacts={artifacts}
                description={copy.description}
                documents={documents}
                searchPlaceholder={copy.search}
                tasks={tabTasks as Task[]}
                title={`${copy.title} (${(tabTasks as Task[]).length})`}
                view={view}
                onApproveTask={onApproveTask}
                onPrimaryAction={() => onCreate('task')}
                onRefresh={onRefresh}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="mt-4">
          <ResourceTable
            actionLabel={copy.action}
            artifacts={artifacts}
            description={copy.description}
            documents={documents}
            searchPlaceholder={copy.search}
            tasks={tasks}
            title={`${copy.title} (${count})`}
            view={view}
            onApproveTask={onApproveTask}
            onPrimaryAction={onPrimaryAction}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

function WorkspaceTopLine({ eyebrow, onExpand }: { eyebrow: string; onExpand: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="text-xs font-bold text-[#8f98a6]">{eyebrow}</div>
      <button className="text-[#c4cad5] hover:text-white" aria-label="Expand workspace" onClick={onExpand}>
        <Expand className="h-4 w-4" />
      </button>
    </div>
  );
}

function RequestUpdatesCard({ tasks }: { tasks: Task[] }) {
  const latest = tasks[0];
  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922] px-4 py-4">
      <h2 className="text-base font-extrabold text-[#eef2f8]">Recent request updates</h2>
      <p className="mt-1 text-xs font-semibold text-[#9aa3b2]">
        Latest status changes from your delegated tasks
      </p>
      <div className="flex h-[86px] flex-col items-center justify-center text-center">
        {latest ? (
          <>
            <div className="text-sm font-bold text-[#c8ced9]">{latest.name}</div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#a4adbb]">
              <StatusBadge status={latest.status} />
              <span>{formatTime(latest.updatedAt)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-bold text-[#c8ced9]">No updates yet</div>
            <div className="mt-2 text-sm font-semibold text-[#a4adbb]">
              Status changes from tasks delegated to the NetX SRE Agent will appear here.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

interface ResourceTableProps {
  actionLabel: string;
  artifacts: Artifact[];
  description: string;
  documents: DocumentFile[];
  searchPlaceholder: string;
  tasks: Task[];
  title: string;
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
}

function ResourceTable({
  actionLabel,
  artifacts,
  description,
  documents,
  searchPlaceholder,
  tasks,
  title,
  view,
  onApproveTask,
  onPrimaryAction,
  onRefresh,
}: ResourceTableProps) {
  const columns = resourceColumns[view];
  const empty = emptyTableConfig[view];
  const rowCount =
    view === 'tasks'
      ? tasks.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;
  const gridTemplateColumns = useMemo(
    () => `34px ${columns.map((column) => column.width ?? '1fr').join(' ')} 26px`,
    [columns],
  );

  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922]">
      <div className="flex items-start justify-between gap-4 px-4 pt-4">
        <div>
          <h2 className="text-base font-extrabold text-[#eef2f8]">{title}</h2>
          <p className="mt-1 text-xs font-semibold text-[#9aa3b2]">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button className="h-8 w-8 border-2 p-0" variant="outline" aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 border-2 px-4" variant="outline">
                Actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh}>Refresh</DropdownMenuItem>
              <DropdownMenuItem>Copy table link</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>Export current view</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {view !== 'artifacts' && (
            <Button className="h-8 px-5 text-xs" onClick={onPrimaryAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between px-4">
        <div className="relative w-[520px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d97a6]" />
          <input
            className="h-8 w-full rounded-md border border-[#3a4654] bg-[#121922] pl-9 pr-3 text-sm font-semibold italic text-[#dce1eb] outline-none placeholder:text-[#8f98a6] focus:border-[#8378ff]"
            placeholder={searchPlaceholder}
          />
        </div>

        <div className="flex items-center gap-4 text-sm font-bold text-[#c5ccd7]">
          <ChevronLeft className="h-4 w-4 text-[#667180]" />
          <span>1</span>
          <ChevronRight className="h-4 w-4 text-[#667180]" />
          <Settings className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 overflow-hidden border-t border-[#222b36]">
        <div
          className="grid h-10 items-center border-b border-[#222b36] px-4 text-xs font-extrabold text-[#d3d8e2]"
          style={{ gridTemplateColumns }}
        >
          <input aria-label="Select all rows" className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
          {columns.map((column) => (
            <div key={column.id} className="flex min-w-0 items-center justify-between border-l border-[#5b6574] px-3">
              <span className="truncate">{column.label}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[#9aa3b2]" />
            </div>
          ))}
          <MoreHorizontal className="mx-auto h-4 w-4 text-[#9aa3b2]" />
        </div>

        {rowCount === 0 ? (
          <div className="flex min-h-[96px] flex-col items-center justify-center px-6 py-8 text-center">
            <div className="text-sm font-bold text-[#d3d8e2]">{empty.title}</div>
            <p className="mt-2 max-w-[560px] text-sm font-semibold text-[#9fa8b7]">{empty.description}</p>
            {view !== 'artifacts' && (
              <Button className="mt-4 h-8 border-2 px-5 text-xs" variant="outline" onClick={onPrimaryAction}>
                {empty.action}
              </Button>
            )}
          </div>
        ) : (
          <div>
            {view === 'tasks' &&
              tasks.map((task) => (
                <TaskRow key={task.taskId} gridTemplateColumns={gridTemplateColumns} task={task} onApproveTask={onApproveTask} />
              ))}
            {view === 'artifacts' &&
              artifacts.map((artifact) => (
                <DataRow
                  key={artifact.artifactId}
                  gridTemplateColumns={gridTemplateColumns}
                  values={[artifact.name, artifact.type, formatSize(artifact.size), formatTime(artifact.createdAt)]}
                />
              ))}
            {view === 'context-files' &&
              documents.map((document) => (
                <DataRow
                  key={document.documentId}
                  gridTemplateColumns={gridTemplateColumns}
                  values={[document.name, document.status, formatTime(document.updatedAt)]}
                />
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TaskRow({
  gridTemplateColumns,
  task,
  onApproveTask,
}: {
  gridTemplateColumns: string;
  task: Task;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  return (
    <div className="grid min-h-12 items-center border-b border-[#202936] px-4 text-sm text-[#dce1eb]" style={{ gridTemplateColumns }}>
      <input aria-label={`Select ${task.name}`} className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
      <div className="truncate border-l border-[#303b49] px-3 font-semibold">{task.name}</div>
      <div className="border-l border-[#303b49] px-3">
        <StatusBadge status={task.status} />
      </div>
      <div className="truncate border-l border-[#303b49] px-3 capitalize">{task.priority}</div>
      <div className="truncate border-l border-[#303b49] px-3">{task.type}</div>
      <div className="truncate border-l border-[#303b49] px-3">{task.source}</div>
      <div className="truncate border-l border-[#303b49] px-3">{formatTime(task.updatedAt)}</div>
      <div className="flex justify-center">
        {task.status === 'AWAITING_INPUT' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-[#8f82ff]">
                <ShieldAlert className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onApproveTask(task.taskId, 'approve')}>Approve</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onApproveTask(task.taskId, 'reject')}>Reject</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <MoreHorizontal className="h-4 w-4 text-[#9aa3b2]" />
        )}
      </div>
    </div>
  );
}

function DataRow({ gridTemplateColumns, values }: { gridTemplateColumns: string; values: ReactNode[] }) {
  return (
    <div className="grid min-h-12 items-center border-b border-[#202936] px-4 text-sm text-[#dce1eb]" style={{ gridTemplateColumns }}>
      <input aria-label="Select row" className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
      {values.map((value, index) => (
        <div key={index} className="truncate border-l border-[#303b49] px-3 font-semibold">
          {value}
        </div>
      ))}
      <MoreHorizontal className="mx-auto h-4 w-4 text-[#9aa3b2]" />
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    PENDING: 'border-slate-400/30 text-slate-300',
    IN_PROGRESS: 'border-sky-400/30 text-sky-300',
    AWAITING_INPUT: 'border-amber-400/40 text-amber-300',
    COMPLETED: 'border-emerald-400/30 text-emerald-300',
    SUCCESS: 'border-emerald-400/30 text-emerald-300',
    FAILED: 'border-red-400/30 text-red-300',
  };
  const Icon = status === 'COMPLETED' || status === 'SUCCESS' ? Check : status === 'FAILED' ? XCircle : Clock;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold', styles[status])}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function CreateTaskForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (instruction: string, priority: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [runMode, setRunMode] = useState('once');
  const [priority, setPriority] = useState('normal');

  return (
    <CreatePageFrame
      parent="Tasks"
      title="Create task"
      footer={
        <>
          <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="h-8 px-5 text-xs" disabled={!instructions.trim() || busy} onClick={() => onSubmit(instructions, priority)}>
            Create task
          </Button>
        </>
      }
    >
      <InstructionsPanel
        value={instructions}
        onChange={setInstructions}
        placeholder="例如：分析最近 24 小时 validator peer count 和出块情况，生成 Markdown 巡检报告。"
      />

      <Panel title="When to run">
        <RunModeRadioGroup value={runMode} onChange={setRunMode} />
      </Panel>

      <Panel title="Additional settings">
        <Field label="Priority">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Panel>
    </CreatePageFrame>
  );
}

function AutomationReserved({ onCancel }: { onCancel: () => void }) {
  return (
    <CreatePageFrame
      parent="Automations"
      title="Automation reserved for v2"
      footer={
        <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={onCancel}>
          Back
        </Button>
      }
    >
      <Panel
        title="第一版不包含 Automation"
        description="requirements.md 明确第一版只实现 Chat、Task、Record、Artifact、Document 和 Web UI 审批。定时/事件触发、预授权 Automation 会在 v2 实现。"
      >
        <div className="text-sm font-semibold text-[#cbd3df]">
          你仍然可以通过 Chat 或 Tasks workspace 创建 on-demand task。高风险操作会进入 Web UI 审批。
        </div>
      </Panel>
    </CreatePageFrame>
  );
}

interface CreatePageFrameProps {
  parent: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

function CreatePageFrame({ parent, title, children, footer }: CreatePageFrameProps) {
  return (
    <div className="min-w-[760px] pb-8">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <button className="text-[#8f82ff] underline underline-offset-2">{parent}</button>
          <ChevronRight className="h-4 w-4 text-[#657080]" />
          <span className="text-[#aab2bf]">{title}</span>
        </div>
        <button className="text-[#c4cad5] hover:text-white" aria-label="Expand workspace">
          <Expand className="h-4 w-4" />
        </button>
      </div>
      <h2 className="mb-4 text-2xl font-extrabold text-[#eef2f8]">{title}</h2>
      <div className="space-y-4">{children}</div>
      <div className="mt-4 flex items-center gap-2">{footer}</div>
    </div>
  );
}

interface InstructionsPanelProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function InstructionsPanel({ value, onChange, placeholder }: InstructionsPanelProps) {
  return (
    <Panel
      title="Instructions"
      description="Describe in detail what you want the NetX SRE Agent to do. Be specific about services, time ranges, and desired output format."
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[106px] w-full resize-none rounded-md border border-[#3a4654] bg-[#121922] px-3 py-3 text-sm font-semibold leading-6 text-[#dce1eb] outline-none placeholder:text-[#a4adbb] focus:border-[#8378ff]"
      />
    </Panel>
  );
}

interface PanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function Panel({ title, description, children }: PanelProps) {
  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922] px-4 py-4">
      <h3 className="text-lg font-extrabold text-[#eef2f8]">{title}</h3>
      {description && <p className="mt-1 text-sm font-semibold text-[#9aa3b2]">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function RunModeRadioGroup({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange}>
      {[
        {
          value: 'once',
          label: 'Run once',
          detail: 'Execute immediately as a one-time task',
        },
        {
          value: 'schedule',
          label: 'Run on a schedule',
          detail: 'Reserved for v2 Automation',
        },
        {
          value: 'event',
          label: 'Run when an event occurs',
          detail: 'Reserved for v2 Automation',
        },
      ].map((item) => (
        <label key={item.value} className="flex cursor-pointer items-start gap-2">
          <RadioGroupItem value={item.value} className="mt-0.5" />
          <span>
            <span className="block text-sm font-extrabold text-[#d9dee8]">{item.label}</span>
            <span className="text-xs font-semibold text-[#8f98a6]">{item.detail}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[#d8dee9]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs font-semibold text-[#8f98a6]">{hint}</span>}
    </label>
  );
}

interface UploadContextDialogProps {
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => void;
}

function UploadContextDialog({ busy, open, onOpenChange, onUpload }: UploadContextDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload context file</DialogTitle>
          <DialogDescription className="sr-only">
            Upload a context file for NetX SRE Agent.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5">
          <input ref={inputRef} className="hidden" type="file" onChange={handleFileChange} />
          <div className="flex min-h-[78px] flex-col items-center justify-center rounded-lg border border-dashed border-[#485465] bg-[#121922]">
            <Button variant="outline" className="h-8 border-2 text-xs" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Choose file
            </Button>
            <div className="mt-2 text-xs font-semibold text-[#9fa8b7]">
              {selectedFile ? `${selectedFile.name} (${formatSize(selectedFile.size)})` : 'Maximum file size: 10 MB'}
            </div>
          </div>
          <div className="mt-2 text-xs font-semibold text-[#a4adbb]">
            Supported formats: .txt, .csv, .json, .md, .html, .yaml, .yml
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="h-8 px-4 text-xs">
              Cancel
            </Button>
          </DialogClose>
          <Button className="h-8 px-5 text-xs" disabled={!selectedFile || busy} onClick={() => selectedFile && onUpload(selectedFile)}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function buildTimelineItems(events: ChatEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const event of events) {
    const scopeKey = event.type === 'user' ? '' : scopeFromEventId(event.id);
    if (!scopeKey) {
      items.push({ id: event.id, kind: 'event', event });
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === 'assistant' && last.scopeKey === scopeKey) {
      last.events.push(event);
      continue;
    }
    items.push({ id: scopeKey, kind: 'assistant', scopeKey, events: [event] });
  }
  return items;
}

async function turnsToChatEvents(agentSpaceId: string, turns: Turn[]): Promise<ChatEvent[]> {
  const allEvents: ChatEvent[] = [];
  for (const turn of turns) {
    const scopeKey = turnScope(turn.turnId);
    const events: ChatEvent[] = [
      {
        id: `${turn.turnId}-user`,
        type: 'user',
        content: turn.prompt,
        createdAt: turn.createdAt,
      },
    ];
    try {
      const recordPage = await listRecords({
        agentSpaceId,
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        maxResults: 100,
      });
      events.push(...recordsToChatEvents(recordPage.records ?? [], { scopeKey }));
    } catch {
      events.push({
        id: scopedEventId(scopeKey, `${turn.turnId}-record-load-error`),
        type: 'status',
        content: `无法加载会话记录：${turn.turnId}`,
        state: 'error',
        createdAt: turn.updatedAt,
      });
    }
    if (turn.taskId) {
      try {
        const [task, recordPage, artifactPage] = await Promise.all([
          getTask(agentSpaceId, turn.taskId),
          listRecords({ agentSpaceId, taskId: turn.taskId, maxResults: 100 }),
          listArtifacts(agentSpaceId),
        ]);
        events.push(...recordsToChatEvents(recordPage.records ?? [], { scopeKey }));
        events.push(taskToChatEvent(task.entity, scopeKey));
        if (task.entity.status === 'AWAITING_INPUT') {
          events.push(taskToApprovalEvent(task.entity, scopeKey));
        }
        events.push(...artifactsToChatEvents((artifactPage.entities ?? []).filter((artifact) => artifact.taskId === turn.taskId), scopeKey));
      } catch {
        events.push({
          id: scopedEventId(scopeKey, `${turn.turnId}-task-load-error`),
          type: 'status',
          content: `无法加载任务记录：${turn.taskId}`,
          state: 'error',
          createdAt: turn.updatedAt,
        });
      }
    }
    if (!events.some((event) => event.type === 'answer') && (turn.output?.text || turn.status === 'FAILED')) {
      const answerEvent = turnToAnswerEvent(turn, scopeKey);
      if (answerEvent.content) {
        events.push(answerEvent);
      }
    } else if (!isTurnDone(turn) && !events.some((event) => event.type === 'status' && event.state === 'running')) {
      events.push({
        id: scopedEventId(scopeKey, `${turn.turnId}-status`),
        type: 'status',
        content: 'Thinking...',
        state: 'running',
        createdAt: turn.updatedAt,
      });
    }
    allEvents.push(...events);
  }
  return allEvents;
}

function recordsToChatEvents(records: RecordEntry[], options: { scopeKey?: string } = {}): ChatEvent[] {
  const events: ChatEvent[] = [];
  const processById = new Map<string, Extract<ChatEvent, { type: 'tool' }>>();

  for (const record of records) {
    if (record.recordType === 'TOOL_CALL' && record.toolCall) {
      const id = scopedEventId(options.scopeKey, `tool-${record.toolCall.toolUseId || record.recordId}`);
      const existing = processById.get(id);
      if (existing) {
        existing.name = record.toolCall.toolName || existing.name;
        existing.request = existing.request || prettyPayload(record.toolCall.input);
        existing.skill = existing.skill || record.toolCall.skill;
        existing.action = existing.action || record.toolCall.action;
        continue;
      }
      const event: Extract<ChatEvent, { type: 'tool' }> = {
        id,
        type: 'tool',
        kind: 'tool',
        name: record.toolCall.toolName || 'tool',
        status: 'called',
        request: prettyPayload(record.toolCall.input),
        skill: record.toolCall.skill,
        action: record.toolCall.action,
        createdAt: record.createdAt,
      };
      processById.set(id, event);
      events.push(event);
      continue;
    }

    if (record.recordType === 'TOOL_RESULT' && record.toolResult) {
      const id = scopedEventId(options.scopeKey, `tool-${record.toolResult.toolUseId || record.recordId}`);
      const event = processById.get(id);
      if (event) {
        event.status = record.toolResult.isError ? 'error' : 'result';
        event.response = prettyPayload(record.toolResult.output);
        event.skill = event.skill || record.toolResult.skill;
        event.action = event.action || record.toolResult.action;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'tool',
          name: record.toolResult.action || 'tool',
          status: record.toolResult.isError ? 'error' : 'result',
          response: prettyPayload(record.toolResult.output),
          skill: record.toolResult.skill,
          action: record.toolResult.action,
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'LOAD_SKILL' && record.loadSkill) {
      const id = scopedEventId(options.scopeKey, `skill-${record.loadSkill.toolUseId || record.recordId}`);
      const event = processById.get(id);
      if (event) {
        event.status = record.loadSkill.output ? 'result' : event.status;
        event.response = event.response || prettyPayload(record.loadSkill.output);
        event.skill = event.skill || record.loadSkill.skillName;
        event.name = record.loadSkill.skillName || event.name;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'skill',
          name: record.loadSkill.skillName || 'skill',
          status: record.loadSkill.output ? 'result' : 'called',
          request: prettyPayload(record.loadSkill.input),
          response: prettyPayload(record.loadSkill.output),
          skill: record.loadSkill.skillName,
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'LOAD_TOOL' && record.loadTool) {
      const id = scopedEventId(options.scopeKey, `load-tool-${record.loadTool.toolUseId || record.recordId}`);
      const event = processById.get(id);
      if (event) {
        event.status = record.loadTool.output ? 'result' : event.status;
        event.response = event.response || prettyPayload(record.loadTool.output);
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'resource',
          name: record.loadTool.toolName || 'resource',
          status: record.loadTool.output ? 'result' : 'called',
          request: prettyPayload(record.loadTool.input),
          response: prettyPayload(record.loadTool.output),
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'ERROR') {
      events.push({
        id: scopedEventId(options.scopeKey, record.recordId),
        type: 'status',
        content: record.content || '执行失败',
        state: 'error',
        createdAt: record.createdAt,
      });
      continue;
    }

    if (record.recordType === 'RESPONSE') {
      const content = cleanAnswerContent(record.content);
      if (!content) {
        continue;
      }
      events.push({
        id: scopedEventId(options.scopeKey, `${record.recordId}-answer`),
        type: 'answer',
        content,
        status: 'SUCCESS',
        createdAt: record.createdAt,
      });
      continue;
    }

    const content = hasToolDetailMarkup(record.content) ? '' : record.content || statusLabelForRecord(record.recordType);
    if (!content) {
      continue;
    }
    events.push({
      id: scopedEventId(options.scopeKey, record.recordId),
      type: 'status',
      content,
      state: 'complete',
      createdAt: record.createdAt,
    });
  }

  return events;
}

function taskToChatEvent(task: Task, scopeKey?: string): ChatEvent {
  return {
    id: scopedEventId(scopeKey, `${task.taskId}-task-card`),
    type: 'task',
    taskId: task.taskId,
    title: task.name || 'NetX SRE Task',
    status: task.status,
    description: task.description || task.instruction,
    createdAt: task.createdAt,
  };
}

function taskToApprovalEvent(task: Task, scopeKey?: string): ChatEvent {
  return {
    id: scopedEventId(scopeKey, `${task.taskId}-approval-card`),
    type: 'approval',
    taskId: task.taskId,
    title: task.name || '高风险操作审批',
    risk: 'High',
    target: 'NetX Chain287 / AgentSpace scope',
    command: task.instruction,
    status: task.status,
  };
}

function artifactsToChatEvents(artifacts: Artifact[], scopeKey?: string): ChatEvent[] {
  return artifacts.map((artifact) => ({
    id: scopedEventId(scopeKey, `${artifact.artifactId}-artifact-card`),
    type: 'artifact',
    artifactId: artifact.artifactId,
    name: artifact.name,
    artifactType: artifact.type,
    createdAt: artifact.createdAt,
  }));
}

function turnToAnswerEvent(turn: Turn, scopeKey?: string): Extract<ChatEvent, { type: 'answer' }> {
  return {
    id: scopedEventId(scopeKey, `${turn.turnId}-answer`),
    type: 'answer',
    content: cleanAnswerContent(turn.output?.text || turn.statusReason),
    taskId: turn.taskId,
    status: turn.status,
    createdAt: turn.completedAt || turn.updatedAt,
  };
}

function turnScope(turnId: string) {
  return `turn-${turnId}`;
}

function scopeFromEventId(id: string) {
  const index = id.indexOf(':');
  if (index <= 0) return '';
  const scopeKey = id.slice(0, index);
  return scopeKey.startsWith('turn-') ? scopeKey : '';
}

function scopedEventId(scopeKey: string | undefined, id: string) {
  return scopeKey ? `${scopeKey}:${id}` : id;
}

function replaceEvent(events: ChatEvent[], targetId: string, replacement: ChatEvent[]) {
  const index = events.findIndex((event) => event.id === targetId);
  if (index < 0) return [...events, ...replacement];
  return [...events.slice(0, index), ...replacement, ...events.slice(index + 1)];
}

function replaceScopedEvents(events: ChatEvent[], placeholderId: string, scopeKey: string, replacement: ChatEvent[]) {
  const isTarget = (event: ChatEvent) => event.id === placeholderId || event.id.startsWith(`${scopeKey}:`);
  const anchorIndex = events.findIndex(isTarget);
  if (anchorIndex < 0) return [...events, ...replacement];
  const before = events.slice(0, anchorIndex).filter((event) => !isTarget(event));
  const after = events.slice(anchorIndex + 1).filter((event) => !isTarget(event));
  return [...before, ...replacement, ...after];
}

function updateTaskEvents(events: ChatEvent[], task: Task) {
  return events.map((event) => {
    if (event.type === 'task' && event.taskId === task.taskId) {
      return { ...event, status: task.status, title: task.name || event.title, description: task.description || task.instruction };
    }
    if (event.type === 'approval' && event.taskId === task.taskId) {
      return { ...event, status: task.status };
    }
    return event;
  });
}

function titleFromPrompt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '新的会话';
  const runes = Array.from(trimmed);
  return runes.length > 34 ? `${runes.slice(0, 34).join('')}...` : trimmed;
}

function isTurnDone(turn: Turn) {
  return turn.status === 'SUCCESS' || turn.status === 'COMPLETED' || turn.status === 'FAILED';
}

async function pollTurnRecords({
  agentSpaceId,
  conversationId,
  turnId,
  onUpdate,
}: {
  agentSpaceId: string;
  conversationId: string;
  turnId: string;
  onUpdate: (turn: Turn, records: RecordEntry[]) => void;
}) {
  let latestTurn: Turn | null = null;
  let latestRecords: RecordEntry[] = [];
  for (let i = 0; i < 80; i += 1) {
    const [turnPage, recordPage] = await Promise.all([
      getTurn(agentSpaceId, conversationId, turnId),
      listRecords({ agentSpaceId, conversationId, turnId, maxResults: 100 }),
    ]);
    latestTurn = turnPage.turn;
    latestRecords = recordPage.records ?? [];
    onUpdate(latestTurn, latestRecords);
    if (isTurnDone(latestTurn)) {
      return latestTurn;
    }
    await sleep(400);
  }
  if (latestTurn) {
    onUpdate(latestTurn, latestRecords);
  }
  throw new Error('Turn polling timed out');
}

function inProgressLabel(records: RecordEntry[]) {
  const last = records[records.length - 1];
  if (!last) return 'Thinking...';
  if (last.recordType === 'TOOL_CALL') return 'Waiting for tool result...';
  if (last.recordType === 'LOAD_SKILL') return 'Preparing skill context...';
  if (last.recordType === 'LOAD_TOOL') return 'Loading supporting context...';
  if (last.recordType === 'TOOL_RESULT') return 'Working on the answer...';
  return 'Thinking...';
}

function prettyPayload(value?: string) {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function cleanAnswerContent(value?: string) {
  if (!value) return '';
  let cleaned = value
    .replace(/<details\b[^>]*>\s*<summary>\s*tool_code\s*<\/summary>[\s\S]*?(?:<\/details>|$)/gi, '')
    .replace(/<details\b[^>]*>\s*<summary>\s*tool_result\s*<\/summary>[\s\S]*?(?:<\/details>|$)/gi, '');
  if (!/<details\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/<\/details>/gi, '');
  }
  return cleaned.trim();
}

function hasToolDetailMarkup(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.includes('<details') && (lower.includes('tool_code') || lower.includes('tool_result'));
}

function statusLabelForRecord(recordType: RecordEntry['recordType']) {
  const labels: Record<RecordEntry['recordType'], string> = {
    RESPONSE: 'Response ready',
    TOOL_CALL: 'Tool called',
    TOOL_RESULT: 'Tool result received',
    MEMORY_ACCESS: 'Memory accessed',
    LOAD_SKILL: 'Skill loaded',
    LOAD_TOOL: 'Tool context loaded',
    THINKING: 'Thinking...',
    STATUS: 'Status updated',
    ERROR: 'Error',
  };
  return labels[recordType];
}

async function pollTask(agentSpaceId: string, taskId: string) {
  for (let i = 0; i < 40; i += 1) {
    const task = await getTask(agentSpaceId, taskId);
    if (task.entity.status === 'COMPLETED' || task.entity.status === 'FAILED' || task.entity.status === 'AWAITING_INPUT') {
      return task.entity;
    }
    await sleep(300);
  }
  throw new Error('Task polling timed out');
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatTime(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default App;
