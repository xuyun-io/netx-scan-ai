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
  Clock,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Columns3,
  Copy,
  Download,
  Expand,
  FileText,
  Info,
  Menu,
  MoreHorizontal,
  Play,
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
import { CreatePageFrame, InstructionsPanel, Panel, RunModeRadioGroup } from '@/components/create-common';
import { CreateAutomationForm } from '@/components/automations/create';
import { AutomationDetailView } from '@/components/automations/detail';
import { AutomationRow } from '@/components/automations/list';
import { StatusBadge } from '@/components/status-badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  cancelTask,
  createAgentSpace,
  createAutomation,
  createConversation,
  createDocument,
  createTask,
  createTurn,
  deleteAgentSpace,
  deleteArtifact,
  deleteAutomation,
  deleteConversation,
  getArtifact,
  getAgentSpace,
  getAutomation,
  getConversation,
  getTask,
  getTurn,
  listArtifacts,
  listAgentSpaces,
  listAutomations,
  listConversations,
  listDocuments,
  listRecords,
  listTasks,
  respondToTask,
  triggerAutomation,
  updateAgentSpace,
  updateAutomation,
  updateAutomationEnabled,
  type AgentSpace,
  type Automation,
  type AutomationSchedule,
  type Artifact,
  type Conversation,
  type CreateAutomationInput,
  type DocumentFile,
  type RecordEntry,
  type SkillOutput,
  type Status,
  type Task,
  type Turn,
} from '@/lib/api';
import { marked } from 'marked';
import { setHash, parseAgentSpaceNameFromPath, navigateToAgent, navigateToRoot } from '@/lib/routing';
import { cn, formatPriority, formatShortTime, formatTime, humanizeToken } from '@/lib/utils';
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
      rawResponse?: string;
      output?: SkillOutput;
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
const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

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
    action: 'Create task',
  },
  automations: {
    eyebrow: 'Automations',
    title: 'Automations',
    description: 'Recurring tasks managed by the NetX SRE Agent',
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
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [viewingArtifactId, setViewingArtifactId] = useState<string | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<{ artifact: Artifact; content: string } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<{ task: Task; records: RecordEntry[] } | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [viewingAutomationId, setViewingAutomationId] = useState<string | null>(null);
  const [automationDetail, setAutomationDetail] = useState<Automation | null>(null);

  const resourceView = activeView === 'chat' ? 'tasks' : activeView;
  const isFullChat = activeView === 'chat';
  const hasInlineChat = !isFullChat && inlineChatOpen;

  const loadAgentSpaces = useCallback(async () => {
    const page = await listAgentSpaces();
    setAgentSpaces(page.entities ?? []);
  }, []);

  const refresh = useCallback(async (agentSpaceName: string) => {
    const [taskPage, automationPage, artifactPage, documentPage] = await Promise.all([
      listTasks(agentSpaceName),
      listAutomations(agentSpaceName),
      listArtifacts(agentSpaceName),
      listDocuments(agentSpaceName),
    ]);
    setTasks(taskPage.entities ?? []);
    setAutomations(automationPage.entities ?? []);
    setArtifacts(artifactPage.entities ?? []);
    setDocuments(documentPage.entities ?? []);
  }, []);

  const loadConversations = useCallback(async (agentSpaceName: string) => {
    const page = await listConversations(agentSpaceName, 50);
    const nextConversations = page.entities ?? [];
    setConversations(nextConversations);
    return nextConversations;
  }, []);

  const loadConversationTimeline = useCallback(async (agentSpaceName: string, nextConversation: Conversation) => {
    const detail = await getConversation(agentSpaceName, nextConversation.conversationId);
    setConversation(detail.entity);
    setChatEvents(await turnsToChatEvents(agentSpaceName, detail.turns ?? []));
  }, []);

  const applyHashRoute = useCallback(() => {
    const hash = window.location.hash || '#/chat';
    if (hash.startsWith('#/task/create')) {
      const [, query = ''] = hash.split('?');
      const params = new URLSearchParams(query);
      const schedule = params.get('mode') === 'schedule';
      setActiveView(schedule ? 'automations' : 'tasks');
      setCreateMode(schedule ? 'automation' : 'task');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
      return;
    }
    if (hash.startsWith('#/automations/') || hash.startsWith('#/automation/')) {
      const automationId = decodeURIComponent(hash.replace('#/automations/', '').replace('#/automation/', '').split('?')[0]);
      setActiveView('automations');
      setCreateMode('none');
      setViewingAutomationId(automationId || null);
      setViewingArtifactId(null);
      return;
    }
    if (hash === '#/tasks') {
      setActiveView('tasks');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
      setViewingTaskId(null);
      setTaskDetail(null);
      return;
    }
    if (hash.startsWith('#/tasks/') || hash.startsWith('#/task/')) {
      const taskId = decodeURIComponent(hash.replace('#/tasks/', '').replace('#/task/', '').split('?')[0]);
      setActiveView('tasks');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
      setViewingTaskId(taskId || null);
      return;
    }
    if (hash === '#/automations') {
      setActiveView('automations');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
      return;
    }
    if (hash === '#/artifacts' || hash === '#/artifact') {
      setActiveView('artifacts');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      return;
    }
    if (hash.startsWith('#/artifact/')) {
      const artifactId = decodeURIComponent(hash.replace('#/artifact/', '').split('?')[0]);
      setActiveView('artifacts');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(artifactId || null);
      return;
    }
    if (hash === '#/context-files') {
      setActiveView('context-files');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
      return;
    }
    if (hash === '#/chat') {
      setActiveView('chat');
      setCreateMode('none');
      setViewingAutomationId(null);
      setAutomationDetail(null);
      setViewingArtifactId(null);
    }
  }, []);

  useEffect(() => {
    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, [applyHashRoute]);

  useEffect(() => {
    if (!agentSpace || !viewingAutomationId) {
      return;
    }
    let alive = true;
    let timer: number | undefined;
    setError(null);

    const load = async () => {
      if (!alive) return;
      try {
        const [automationResp, tasksResp] = await Promise.all([
          getAutomation(agentSpace.name, viewingAutomationId),
          listTasks(agentSpace.name),
        ]);
        if (!alive) return;
        setAutomationDetail(automationResp.entity);
        setSelectedAutomationId(automationResp.entity.automationId);
        setTasks(tasksResp.entities ?? []);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };

    load();
    timer = window.setInterval(load, 5000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [agentSpace, viewingAutomationId]);

  useEffect(() => {
    if (!agentSpace || !viewingTaskId) {
      return;
    }
    let alive = true;
    let timer: number | undefined;
    setError(null);

    const isFinalStatus = (status: string) =>
      ['COMPLETED', 'SUCCESS', 'FAILED', 'CANCELLED'].includes(status);

    const load = async () => {
      if (!alive) return;
      try {
        const [detail, recordsResp] = await Promise.all([
          getTask(agentSpace.name, viewingTaskId),
          listRecords({ agentSpaceName: agentSpace.name, taskId: viewingTaskId, maxResults: 500 }),
        ]);
        if (!alive) return;
        setTaskDetail({ task: detail.entity, records: recordsResp.records ?? [] });
        setSelectedTaskId(detail.entity.taskId);
        if (isFinalStatus(detail.entity.status) && timer) {
          clearInterval(timer);
          timer = undefined;
        }
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };

    const startPolling = async () => {
      await load();
      if (!alive) return;
      timer = window.setInterval(load, 2000);
    };

    startPolling();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [agentSpace, viewingTaskId]);

  useEffect(() => {
    if (!agentSpace || activeView !== 'automations') {
      return;
    }
    let alive = true;
    const load = async () => {
      if (!alive) return;
      try {
        const page = await listAutomations(agentSpace.name);
        if (!alive) return;
        setAutomations(page.entities ?? []);
      } catch (err) {
        if (alive) setError((err as Error).message);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [agentSpace, activeView]);

  useEffect(() => {
    let alive = true;
    const bootstrap = async () => {
      try {
        await loadAgentSpaces();
        if (!alive) return;
        const agentSpaceName = parseAgentSpaceNameFromPath();
        if (agentSpaceName) {
          const detail = await getAgentSpace(agentSpaceName);
          if (!alive) return;
          setAgentSpace(detail.entity);
          setAdminView(false);
          applyHashRoute();
          const nextConversations = await loadConversations(agentSpaceName);
          if (!alive) return;
          if (nextConversations.length === 0 && window.location.hash === '#/chat') {
            const created = await createConversation(agentSpaceName, '新的会话');
            if (!alive) return;
            setConversations([created.entity]);
            setConversation(created.entity);
            setChatEvents([]);
          } else if (nextConversations.length > 0) {
            await loadConversationTimeline(agentSpaceName, nextConversations[0]);
          }
          await refresh(agentSpaceName);
        } else {
          setAdminView(true);
        }
      } catch (err) {
        if (alive) setError((err as Error).message);
      } finally {
        if (alive) setBooting(false);
      }
    };
    bootstrap();
    return () => {
      alive = false;
    };
  }, [loadAgentSpaces, applyHashRoute, loadConversations, createConversation, loadConversationTimeline, refresh]);

  const selectView = (view: WorkspaceView) => {
    setActiveView(view);
    setInlineChatOpen(false);
    setCreateMode('none');
    setViewingAutomationId(null);
    setAutomationDetail(null);
    setViewingTaskId(null);
    setTaskDetail(null);
    setHash(`#/${view}`);
  };

  const startCreate = (mode: Exclude<CreateMode, 'none'>) => {
    setCreateMode(mode);
    setActiveView(mode === 'task' ? 'tasks' : 'automations');
    setViewingAutomationId(null);
    setAutomationDetail(null);
    setHash(mode === 'task' ? '#/task/create' : '#/task/create?mode=schedule');
  };

  const openAgent = (nextSpace: AgentSpace) => {
    const agentSpaceName = nextSpace.name;
    navigateToAgent(agentSpaceName, '#/chat');
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
        name: target.name,
        description: target.description,
        llm: target.llm,
        environment: target.environment,
        integrations: target.integrations,
      });
      await loadAgentSpaces();
      if (agentSpace?.name === target.name) {
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
      await deleteAgentSpace(target.name);
      if (agentSpace?.name === target.name) {
        navigateToRoot();
        return;
      }
      await loadAgentSpaces();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAdmin = () => {
    navigateToRoot();
  };

  const handleNewChat = async () => {
    if (!agentSpace || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextConversation = await createConversation(agentSpace.name, '新的会话');
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
      await loadConversationTimeline(agentSpace.name, nextConversation);
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
      await deleteConversation(agentSpace.name, target.conversationId);
      const nextConversations = conversations.filter(
        (item) => item.conversationId !== target.conversationId,
      );
      setConversations(nextConversations);
      if (conversation?.conversationId === target.conversationId) {
        if (nextConversations.length > 0) {
          await loadConversationTimeline(agentSpace.name, nextConversations[0]);
        } else {
          const created = await createConversation(agentSpace.name, '新的会话');
          setConversations([created.entity]);
          setConversation(created.entity);
          setChatEvents([]);
        }
      }
      await loadConversations(agentSpace.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openArtifactDetail = async (artifact: Artifact) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await getArtifact(agentSpace.name, artifact.artifactId);
      setArtifactDetail({ artifact: detail.entity, content: detail.content });
      setViewingArtifactId(artifact.artifactId);
      setSelectedArtifactId(artifact.artifactId);
      setHash(`#/artifact/${encodeURIComponent(artifact.artifactId)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closeArtifactDetail = () => {
    setArtifactDetail(null);
    setViewingArtifactId(null);
  };

  const openTaskDetail = async (task: Task) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const [detail, recordsResp] = await Promise.all([
        getTask(agentSpace.name, task.taskId),
        listRecords({ agentSpaceName: agentSpace.name, taskId: task.taskId, maxResults: 500 }),
      ]);
      setTaskDetail({ task: detail.entity, records: recordsResp.records ?? [] });
      setViewingTaskId(detail.entity.taskId);
      setSelectedTaskId(detail.entity.taskId);
      setActiveView('tasks');
      setCreateMode('none');
      setHash(`#/task/${encodeURIComponent(detail.entity.taskId)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closeTaskDetail = () => {
    setTaskDetail(null);
    setViewingTaskId(null);
  };

  const downloadArtifact = async (artifact: Artifact) => {
    if (!agentSpace) return;
    setError(null);
    try {
      const detail = await getArtifact(agentSpace.name, artifact.artifactId);
      const blob = new Blob([detail.content], { type: artifact.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteArtifact = async (artifact: Artifact) => {
    if (!agentSpace) return;
    const confirmed = window.confirm(`确定删除产物 "${artifact.name}" 吗？`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteArtifact(agentSpace.name, artifact.artifactId);
      if (selectedArtifactId === artifact.artifactId) {
        setSelectedArtifactId(null);
      }
      if (viewingArtifactId === artifact.artifactId) {
        closeArtifactDetail();
      }
      await refresh(agentSpace.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openTaskFromArtifact = (taskId: string) => {
    closeArtifactDetail();
    setActiveView('tasks');
    setInlineChatOpen(false);
    setCreateMode('none');
    setViewingAutomationId(null);
    setAutomationDetail(null);
    setHash('#/tasks');
    setHighlightTaskId(taskId);
  };

  const clearHighlightTask = () => setHighlightTaskId(null);

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
      const created = await createTurn(agentSpace.name, conversation.conversationId, userPrompt);
      scopeKey = turnScope(created.turn.turnId);
      const finalTurn = await pollTurnRecords({
        agentSpaceName: agentSpace.name,
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
        const task = await pollTask(agentSpace.name, finalTurn.taskId);
        const [recordPage, artifactPage] = await Promise.all([
          listRecords({ agentSpaceName: agentSpace.name, taskId: finalTurn.taskId, maxResults: 100 }),
          listArtifacts(agentSpace.name),
        ]);
        const taskEvents = [
          ...recordsToChatEvents(recordPage.records ?? [], { scopeKey }),
          taskToChatEvent(task, scopeKey),
          ...(task.status === 'AWAITING_INPUT' ? [taskToApprovalEvent(task, scopeKey)] : []),
          ...artifactsToChatEvents((artifactPage.entities ?? []).filter((artifact) => artifact.taskId === task.taskId), scopeKey),
        ];
        setChatEvents((prev) => replaceScopedEvents(prev, statusId, scopeKey, taskEvents));
      }
      await refresh(agentSpace.name);
      await loadConversations(agentSpace.name);
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

  const handleCreateTask = async (instruction: string) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTask(agentSpace.name, instruction);
      setCreateMode('none');
      setHash('#/tasks');
      await refresh(agentSpace.name);
      if (created.entity.status !== 'AWAITING_INPUT') {
        await pollTask(agentSpace.name, created.entity.taskId);
        await refresh(agentSpace.name);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAutomation = async (input: Omit<CreateAutomationInput, 'agentSpaceName'>) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createAutomation({
        ...input,
        agentSpaceName: agentSpace.name,
      });
      setCreateMode('none');
      setActiveView('automations');
      setViewingAutomationId(created.entity.automationId);
      setAutomationDetail(created.entity);
      setSelectedAutomationId(created.entity.automationId);
      setHash(`#/automations/${encodeURIComponent(created.entity.automationId)}`);
      await refresh(agentSpace.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openAutomationDetail = async (automation: Automation) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await getAutomation(agentSpace.name, automation.automationId);
      setAutomationDetail(detail.entity);
      setViewingAutomationId(detail.entity.automationId);
      setSelectedAutomationId(detail.entity.automationId);
      setActiveView('automations');
      setCreateMode('none');
      setHash(`#/automation/${encodeURIComponent(detail.entity.automationId)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closeAutomationDetail = () => {
    setAutomationDetail(null);
    setViewingAutomationId(null);
    setHash('#/automations');
  };

  const handleToggleAutomationEnabled = async (automation: Automation) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAutomationEnabled(
        agentSpace.name,
        automation.automationId,
        !automation.enabled,
      );
      setAutomationDetail(updated.entity);
      setAutomations((prev) =>
        prev.map((item) => (item.automationId === updated.entity.automationId ? updated.entity : item)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAutomation = async (automation: Automation) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAutomation(agentSpace.name, automation.automationId);
      if (viewingAutomationId === automation.automationId) {
        closeAutomationDetail();
      }
      setSelectedAutomationId(null);
      await refresh(agentSpace.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerAutomation = async (automation: Automation) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      await triggerAutomation(agentSpace.name, automation.automationId);
      await refresh(agentSpace.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAutomation = async (
    automation: Automation,
    input: { name: string; description: string; instruction: string; schedule: AutomationSchedule },
  ) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAutomation(agentSpace.name, automation.automationId, input);
      setAutomationDetail(updated.entity);
      setAutomations((prev) =>
        prev.map((item) => (item.automationId === updated.entity.automationId ? updated.entity : item)),
      );
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
      const task = await respondToTask(agentSpace.name, taskId, response);
      await refresh(agentSpace.name);
      setChatEvents((prev) => updateTaskEvents(prev, task.entity));
      if (response === 'approve') {
        const completed = await pollTask(agentSpace.name, task.entity.taskId);
        setChatEvents((prev) => updateTaskEvents(prev, completed));
        await refresh(agentSpace.name);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (!agentSpace) return;
    setBusy(true);
    setError(null);
    try {
      await cancelTask(agentSpace.name, taskId);
      await refresh(agentSpace.name);
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
      await createDocument(agentSpace.name, file);
      await refresh(agentSpace.name);
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
      startCreate('automation');
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
    setViewingAutomationId(null);
    setAutomationDetail(null);
    setHash('#/chat');
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
              automations={automations}
              automationDetail={automationDetail}
              artifacts={artifacts}
              artifactDetail={artifactDetail}
              busy={busy}
              createMode={createMode}
              documents={documents}
              error={error}
              highlightTaskId={highlightTaskId}
              selectedAutomationId={selectedAutomationId}
              selectedArtifactId={selectedArtifactId}
              tasks={tasks}
              viewingAutomationId={viewingAutomationId}
              viewingArtifactId={viewingArtifactId}
              view={resourceView}
              onApproveTask={handleApproveTask}
              onCancelCreate={() => {
                setCreateMode('none');
                setHash(activeView === 'automations' ? '#/automations' : '#/tasks');
              }}
              onCancelTask={handleCancelTask}
              onClearHighlightTask={clearHighlightTask}
              onCloseAutomationDetail={closeAutomationDetail}
              onCloseArtifactDetail={closeArtifactDetail}
              onCreate={startCreate}
              onCreateAutomation={handleCreateAutomation}
              onCreateTask={handleCreateTask}
              onDeleteArtifact={handleDeleteArtifact}
              onDownloadArtifact={downloadArtifact}
              onExpandWorkspace={expandWorkspace}
              onOpenAutomationDetail={openAutomationDetail}
              onOpenArtifactDetail={openArtifactDetail}
              onOpenTaskDetail={openTaskDetail}
              onOpenTaskFromArtifact={openTaskFromArtifact}
              onPrimaryAction={handlePrimaryAction}
              onRefresh={() => agentSpace && refresh(agentSpace.name)}
              onToggleAutomationEnabled={handleToggleAutomationEnabled}
              onDeleteAutomation={handleDeleteAutomation}
              onTriggerAutomation={handleTriggerAutomation}
              onUpdateAutomation={handleUpdateAutomation}
              setSelectedAutomationId={setSelectedAutomationId}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
              taskDetail={taskDetail}
              viewingTaskId={viewingTaskId}
              onCloseTaskDetail={closeTaskDetail}
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
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#c3c9d3] transition hover:bg-[#202936] hover:text-white"
            onClick={onOpenAdmin}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Agents
          </button>
          <span className="text-sm font-semibold text-[#f2f4f8]">{agentSpaceName}</span>
          <span className="rounded bg-[#6b7079] px-2 py-0.5 text-[11px] font-medium text-white">
            v1 Preview
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[#8f82ff]">
        <Columns3 className="h-4 w-4" />
        <Circle className="h-4 w-4 fill-current opacity-85" />
        <button className="text-xs font-medium hover:text-white">Sign out</button>
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
                  'flex w-full items-center gap-2 rounded-md px-0.5 py-1 text-left text-sm font-medium transition-colors',
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
        <div className="mb-4 text-sm font-semibold text-[#d9dee8]">Recent</div>
        <div className="space-y-2">
          {conversations.length === 0 && (
            <div className="text-xs font-normal text-[#788291]">No conversations yet</div>
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
                    'min-w-0 flex-1 truncate text-left text-xs font-normal',
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

      <div className="mt-auto flex items-center gap-2 border-t border-[#202936] px-5 py-4 text-xs font-normal text-[#aab2bf]">
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
            <h1 className="truncate text-sm font-semibold text-[#f2f4f8]">{title}</h1>
            <button className="shrink-0 text-xs font-medium text-[#8f82ff] hover:text-[#aaa2ff]">
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
      <div className={cn('text-xs font-medium text-[#8f98a6]', compact ? '' : 'text-center')}>
        Get started with a common task
      </div>
      <h2
        className={cn(
          'agent-gradient-title mt-3 font-bold',
          compact ? 'text-xl leading-7' : 'text-center text-3xl',
        )}
      >
        Delegate work to NetX SRE Agent
      </h2>
      <div className={cn('mt-6 grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {promptTemplates.slice(0, compact ? 4 : 8).map((template) => (
          <button
            key={template.id}
            className="rounded-md border border-[#3b3480] bg-[#121922] px-3 py-2 text-left text-sm font-medium leading-5 text-[#9a91ff] transition hover:border-[#958bff] hover:bg-[#8378ff]/10 hover:text-[#b9b3ff]"
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
            <div className="whitespace-pre-wrap text-[15px] font-normal">{event.content}</div>
            <div className="mt-1 text-xs font-normal text-[#9ca6b5]">{formatTime(event.createdAt)}</div>
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
  const processEvents = events.filter((event) => event.type === 'tool');
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
          className="mb-4 text-sm font-semibold text-[#8f82ff] hover:text-[#b8b0ff]"
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
          className="mt-4 text-sm font-semibold text-[#8f82ff] hover:text-[#b8b0ff]"
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
    <div className="flex min-w-0 items-start gap-2 text-sm font-normal leading-6 text-[#aeb7c5]">
      <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90">{icon}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{event.content}</span>
    </div>
  );
}

function RunningProcess({ label }: { label: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-[#aeb7c5]">
        <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
        {label}
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[#242d3a]">
        <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
      </div>
      <button className="mt-4 text-sm font-semibold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
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
      <div className="flex items-center gap-2 text-sm font-medium text-[#cbd3df]">
        {icon}
        {event.content}
      </div>
      {event.state === 'running' && (
        <>
          <div className="mt-3 h-[3px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[#242d3a]">
            <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
          </div>
          <button className="mt-3 text-sm font-semibold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
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
  const output = event.output;
  const hasDetails = Boolean(event.request || event.rawResponse || output?.data);
  const statusStyle =
    output?.status === 'ok'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : output?.status === 'error'
        ? 'bg-red-500/10 text-red-300 border-red-500/20'
        : output?.status === 'partial' || output?.status === 'pending'
          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
          : '';
  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden', embedded ? '' : 'rounded-md border border-[#202936] bg-[#0d131b] px-4 py-3')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-6">
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
        {output && output.status && (
          <span className={cn('rounded border px-2 py-0.5 text-[11px]', statusStyle)}>
            {output.status}
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
      {output?.message && (
        <div className={cn('mt-2 text-sm leading-6 text-[#aeb7c5]', embedded ? 'ml-6' : '')}>
          {output.message}
        </div>
      )}
      {output?.error && (
        <div className={cn('mt-2 text-sm leading-6 text-red-300', embedded ? 'ml-6' : '')}>
          {output.error.code}{output.error.detail ? `: ${output.error.detail}` : ''}
        </div>
      )}
      {expanded && hasDetails && (
        <div className={cn('mt-3 grid min-w-0 max-w-full gap-3 overflow-hidden', embedded ? 'ml-6 max-w-[calc(100%-1.5rem)]' : '')}>
          {event.request && <PayloadBlock label="Request" value={event.request} />}
          {output?.data && <PayloadBlock label="Data" value={JSON.stringify(output.data, null, 2)} />}
          {event.rawResponse && <PayloadBlock label="Response" value={prettyPayload(event.rawResponse)} />}
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#aab2bf]">{label}</div>
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
          <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Task created</div>
          <div className="mt-1 text-sm font-semibold text-[#eef2f8]">{event.title}</div>
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
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldCheck className="h-4 w-4" />
        {pending ? 'Waiting for approval' : `Approval ${event.status.toLowerCase()}`}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[#e7d7b7]">
        <div><span className="font-semibold">操作：</span>{event.title}</div>
        <div><span className="font-semibold">风险：</span>{event.risk}</div>
        <div><span className="font-semibold">目标：</span>{event.target}</div>
        <div><span className="font-semibold">摘要：</span>{event.command}</div>
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
          <div className="truncate text-sm font-semibold text-[#eef2f8]">{event.name}</div>
          <div className="font-mono text-xs text-[#aab2bf]">{event.artifactType} · {event.artifactId}</div>
        </div>
      </div>
      <button className="text-xs font-medium text-[#8f82ff] hover:text-[#aaa2ff]">View</button>
    </div>
  );
}

function AnswerEvent({ event, embedded = false }: { event: Extract<ChatEvent, { type: 'answer' }>; embedded?: boolean }) {
  const body = (
    <>
      <div className="prose-netx min-w-0 max-w-full whitespace-pre-wrap break-words text-sm font-normal leading-6 text-[#b8c1cf] [overflow-wrap:anywhere]">{event.content}</div>
      {event.taskId && (
        <div className="mt-3 inline-flex rounded border border-[#8378ff]/40 px-2 py-1 text-xs font-medium text-[#9a91ff]">
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
              'block w-full resize-none border-0 bg-transparent px-3 py-3 text-sm font-normal leading-6 text-[#dce1eb] outline-none placeholder:text-[#a2a9b4] focus:outline-none',
              compact ? 'h-[68px]' : 'h-[84px]',
            )}
          />
          <div className="flex h-10 items-center justify-end gap-3 border-t border-[#232d39] px-3">
            <div className="text-xs font-medium text-[#aab2bf]">
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
  automations: Automation[];
  automationDetail: Automation | null;
  artifacts: Artifact[];
  artifactDetail: { artifact: Artifact; content: string } | null;
  busy: boolean;
  createMode: CreateMode;
  documents: DocumentFile[];
  error: string | null;
  highlightTaskId: string | null;
  selectedAutomationId: string | null;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  taskDetail: { task: Task; records: RecordEntry[] } | null;
  tasks: Task[];
  viewingAutomationId: string | null;
  viewingArtifactId: string | null;
  viewingTaskId: string | null;
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCancelCreate: () => void;
  onCancelTask: (taskId: string) => void;
  onClearHighlightTask: () => void;
  onCloseAutomationDetail: () => void;
  onCloseArtifactDetail: () => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onCreateAutomation: (input: Omit<CreateAutomationInput, 'agentSpaceName'>) => void;
  onCreateTask: (instruction: string) => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onExpandWorkspace: () => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onOpenTaskFromArtifact: (taskId: string) => void;
  onPrimaryAction: (view: ResourceView) => void;
  onRefresh: () => void;
  onToggleAutomationEnabled: (automation: Automation) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onTriggerAutomation: (automation: Automation) => void;
  onUpdateAutomation: (automation: Automation, input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
  onCloseTaskDetail: () => void;
  setSelectedAutomationId: (automationId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

function WorkspacePanel({
  automations,
  automationDetail,
  artifacts,
  artifactDetail,
  busy,
  createMode,
  documents,
  error,
  highlightTaskId,
  selectedAutomationId,
  selectedArtifactId,
  selectedTaskId,
  taskDetail,
  tasks,
  viewingAutomationId,
  viewingArtifactId,
  viewingTaskId,
  view,
  onApproveTask,
  onCancelCreate,
  onCancelTask,
  onClearHighlightTask,
  onCloseAutomationDetail,
  onCloseArtifactDetail,
  onCreate,
  onCreateAutomation,
  onCreateTask,
  onDeleteArtifact,
  onDownloadArtifact,
  onExpandWorkspace,
  onOpenAutomationDetail,
  onOpenArtifactDetail,
  onOpenTaskDetail,
  onOpenTaskFromArtifact,
  onPrimaryAction,
  onRefresh,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onTriggerAutomation,
  onUpdateAutomation,
  onCloseTaskDetail,
  setSelectedAutomationId,
  setSelectedTaskId,
}: WorkspacePanelProps) {
  return (
    <section className="agent-scrollbar h-full min-w-0 overflow-auto px-5 py-4">
      {error && (
        <div className="mb-3 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}
      {createMode === 'task' && (
        <CreateTaskForm busy={busy} onCancel={onCancelCreate} onSchedule={() => onCreate('automation')} onSubmit={onCreateTask} />
      )}
      {createMode === 'automation' && (
        <CreateAutomationForm
          busy={busy}
          onCancel={onCancelCreate}
          onRunOnce={() => onCreate('task')}
          onSubmit={onCreateAutomation}
        />
      )}
      {createMode === 'none' && (
        <ResourceList
          automations={automations}
          automationDetail={automationDetail}
          artifacts={artifacts}
          artifactDetail={artifactDetail}
          busy={busy}
          documents={documents}
          highlightTaskId={highlightTaskId}
          selectedAutomationId={selectedAutomationId}
          selectedArtifactId={selectedArtifactId}
          selectedTaskId={selectedTaskId}
          taskDetail={taskDetail}
          tasks={tasks}
          viewingAutomationId={viewingAutomationId}
          viewingArtifactId={viewingArtifactId}
          viewingTaskId={viewingTaskId}
          view={view}
          onApproveTask={onApproveTask}
          onCancelTask={onCancelTask}
          onClearHighlightTask={onClearHighlightTask}
          onCloseAutomationDetail={onCloseAutomationDetail}
          onCloseArtifactDetail={onCloseArtifactDetail}
          onCreate={onCreate}
          onDeleteArtifact={onDeleteArtifact}
          onDownloadArtifact={onDownloadArtifact}
          onExpandWorkspace={onExpandWorkspace}
          onOpenAutomationDetail={onOpenAutomationDetail}
          onOpenArtifactDetail={onOpenArtifactDetail}
          onOpenTaskDetail={onOpenTaskDetail}
          onOpenTaskFromArtifact={onOpenTaskFromArtifact}
          onPrimaryAction={() => onPrimaryAction(view)}
          onRefresh={onRefresh}
          onToggleAutomationEnabled={onToggleAutomationEnabled}
          onDeleteAutomation={onDeleteAutomation}
          onTriggerAutomation={onTriggerAutomation}
          onUpdateAutomation={onUpdateAutomation}
          onCloseTaskDetail={onCloseTaskDetail}
          setSelectedAutomationId={setSelectedAutomationId}
          setSelectedTaskId={setSelectedTaskId}
        />
      )}
    </section>
  );
}

interface ResourceListProps {
  automations: Automation[];
  automationDetail: Automation | null;
  artifacts: Artifact[];
  artifactDetail: { artifact: Artifact; content: string } | null;
  busy: boolean;
  documents: DocumentFile[];
  highlightTaskId: string | null;
  selectedAutomationId: string | null;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  taskDetail: { task: Task; records: RecordEntry[] } | null;
  tasks: Task[];
  viewingAutomationId: string | null;
  viewingArtifactId: string | null;
  viewingTaskId: string | null;
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCancelTask: (taskId: string) => void;
  onClearHighlightTask: () => void;
  onCloseAutomationDetail: () => void;
  onCloseArtifactDetail: () => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onExpandWorkspace: () => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onOpenTaskFromArtifact: (taskId: string) => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
  onToggleAutomationEnabled: (automation: Automation) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onTriggerAutomation: (automation: Automation) => void;
  onUpdateAutomation: (automation: Automation, input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
  onCloseTaskDetail: () => void;
  setSelectedAutomationId: (automationId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

function ResourceList({
  automations,
  automationDetail,
  artifacts,
  artifactDetail,
  documents,
  highlightTaskId,
  selectedAutomationId,
  selectedArtifactId,
  selectedTaskId,
  taskDetail,
  tasks,
  viewingAutomationId,
  viewingArtifactId,
  viewingTaskId,
  view,
  onApproveTask,
  onCancelTask,
  onClearHighlightTask,
  onCloseAutomationDetail,
  onCloseArtifactDetail,
  onCreate,
  onDeleteArtifact,
  onDownloadArtifact,
  onExpandWorkspace,
  onOpenAutomationDetail,
  onOpenArtifactDetail,
  onOpenTaskDetail,
  onOpenTaskFromArtifact,
  onPrimaryAction,
  onRefresh,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onTriggerAutomation,
  onUpdateAutomation,
  onCloseTaskDetail,
  setSelectedAutomationId,
  setSelectedTaskId,
  busy,
}: ResourceListProps) {
  const copy = viewCopy[view];
  const isTasks = view === 'tasks';
  const count =
    view === 'tasks'
      ? tasks.length
      : view === 'automations'
        ? automations.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;

  if (view === 'artifacts' && viewingArtifactId && artifactDetail) {
    return (
      <ArtifactDetailView
        artifact={artifactDetail.artifact}
        content={artifactDetail.content}
        onBack={onCloseArtifactDetail}
        onDelete={() => onDeleteArtifact(artifactDetail.artifact)}
        onDownload={() => onDownloadArtifact(artifactDetail.artifact)}
        onOpenTask={onOpenTaskFromArtifact}
      />
    );
  }

  if (view === 'automations' && viewingAutomationId && automationDetail) {
    return (
      <AutomationDetailView
        automation={automationDetail}
        busy={busy}
        tasks={tasks.filter((task) => task.automationId === automationDetail.automationId)}
        onBack={onCloseAutomationDetail}
        onDelete={() => onDeleteAutomation(automationDetail)}
        onOpenTask={onOpenTaskDetail}
        onRunOnce={() => onTriggerAutomation(automationDetail)}
        onToggleEnabled={() => onToggleAutomationEnabled(automationDetail)}
        onUpdate={(input) => onUpdateAutomation(automationDetail, input)}
      />
    );
  }

  if (view === 'tasks' && viewingTaskId && taskDetail) {
    return (
      <TaskDetailView
        artifacts={artifacts.filter((a) => a.taskId === taskDetail.task.taskId)}
        records={taskDetail.records}
        task={taskDetail.task}
        onBack={onCloseTaskDetail}
        onOpenArtifact={onOpenArtifactDetail}
      />
    );
  }

  const taskTabs = [
    { value: 'all', label: 'All tasks', rows: tasks },
    { value: 'approval', label: 'Awaiting approval', rows: tasks.filter((task) => task.status === 'AWAITING_INPUT') },
    { value: 'progress', label: 'In progress', rows: tasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'PENDING') },
    { value: 'completed', label: 'Completed', rows: tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'SUCCESS') },
  ];

  return (
    <div className="min-w-[720px]">
      <WorkspaceTopLine eyebrow={copy.eyebrow} onExpand={onExpandWorkspace} />
      {isTasks && <RequestUpdatesCard tasks={tasks} />}
      {isTasks ? (
        <Tabs defaultValue="all" className="mt-5">
          <TabsList className="gap-3">
            {taskTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4">
                <span>{tab.label}</span>
                {tab.rows.length > 0 && (
                  <span className="ml-2 rounded bg-[#747984] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                    {tab.rows.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {taskTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <ResourceTable
                actionLabel={copy.action}
                automations={automations}
                artifacts={artifacts}
                busy={busy}
                description={copy.description}
                documents={documents}
                highlightTaskId={highlightTaskId}
                searchPlaceholder={copy.search}
                selectedAutomationId={selectedAutomationId}
                selectedArtifactId={selectedArtifactId}
                selectedTaskId={selectedTaskId}
                tasks={tab.rows}
                title={`${copy.title} (${tab.rows.length})`}
                view={view}
                onApproveTask={onApproveTask}
                onCancelTask={onCancelTask}
                onClearHighlightTask={onClearHighlightTask}
                onDeleteArtifact={onDeleteArtifact}
                onDownloadArtifact={onDownloadArtifact}
                onOpenAutomationDetail={onOpenAutomationDetail}
                onOpenArtifactDetail={onOpenArtifactDetail}
                onOpenTaskDetail={onOpenTaskDetail}
                onDeleteAutomation={onDeleteAutomation}
                onTriggerAutomation={onTriggerAutomation}
                onUpdateAutomation={onUpdateAutomation}
                onToggleAutomationEnabled={onToggleAutomationEnabled}
                onPrimaryAction={() => onCreate('task')}
                onRefresh={onRefresh}
                setSelectedAutomationId={setSelectedAutomationId}
                setSelectedTaskId={setSelectedTaskId}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="mt-4">
          <ResourceTable
            actionLabel={copy.action}
            automations={automations}
            artifacts={artifacts}
            description={copy.description}
            documents={documents}
            highlightTaskId={highlightTaskId}
            searchPlaceholder={copy.search}
            selectedAutomationId={selectedAutomationId}
            selectedArtifactId={selectedArtifactId}
            selectedTaskId={selectedTaskId}
            tasks={tasks}
            title={`${copy.title} (${count})`}
            view={view}
            onApproveTask={onApproveTask}
            onCancelTask={onCancelTask}
            onClearHighlightTask={onClearHighlightTask}
            onDeleteArtifact={onDeleteArtifact}
            onDownloadArtifact={onDownloadArtifact}
            onOpenAutomationDetail={onOpenAutomationDetail}
            onOpenArtifactDetail={onOpenArtifactDetail}
            onOpenTaskDetail={onOpenTaskDetail}
            onDeleteAutomation={onDeleteAutomation}
            onTriggerAutomation={onTriggerAutomation}
            onUpdateAutomation={onUpdateAutomation}
            onToggleAutomationEnabled={onToggleAutomationEnabled}
            onPrimaryAction={onPrimaryAction}
            onRefresh={onRefresh}
            setSelectedAutomationId={setSelectedAutomationId}
            setSelectedTaskId={setSelectedTaskId}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}

function CreateTaskForm({
  busy,
  onCancel,
  onSchedule,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSchedule: () => void;
  onSubmit: (instruction: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [runMode, setRunMode] = useState('once');

  const handleRunModeChange = (value: string) => {
    if (value === 'schedule') {
      onSchedule();
      return;
    }
    setRunMode(value);
  };

  return (
    <CreatePageFrame
      parent="Tasks"
      title="Create task"
      footer={
        <>
          <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="h-8 px-5 text-xs" disabled={!instructions.trim() || busy} onClick={() => onSubmit(instructions)}>
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
        <RunModeRadioGroup value={runMode} onChange={handleRunModeChange} />
      </Panel>
    </CreatePageFrame>
  );
}

function WorkspaceTopLine({ eyebrow, onExpand }: { eyebrow: string; onExpand: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="text-xs font-medium text-[#8f98a6]">{eyebrow}</div>
      <button className="text-[#c4cad5] hover:text-white" aria-label="Expand workspace" onClick={onExpand}>
        <Expand className="h-4 w-4" />
      </button>
    </div>
  );
}

function RequestUpdatesCard({ tasks }: { tasks: Task[] }) {
  const recentTasks = tasks.slice(0, 4);
  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922] px-5 py-5">
      <h2 className="text-lg font-semibold leading-tight text-[#eef2f8]">Recent request updates</h2>
      <p className="mt-1 text-sm font-normal text-[#9aa3b2]">
        Latest status changes from your delegated tasks
      </p>
      <div className="mt-4 min-h-[84px] space-y-3">
        {recentTasks.length > 0 ? (
          recentTasks.map((task) => (
            <div key={task.taskId} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-[#8f82ff]">{task.name}</span>
              <StatusBadge status={task.status} />
              <span className="shrink-0 text-xs font-normal text-[#8f98a6]">{formatShortTime(task.updatedAt)}</span>
            </div>
          ))
        ) : (
          <div className="flex min-h-[72px] items-center text-sm font-normal text-[#a4adbb]">
            Status changes from tasks delegated to the NetX SRE Agent will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

interface ResourceTableProps {
  actionLabel: string;
  automations: Automation[];
  artifacts: Artifact[];
  busy: boolean;
  description: string;
  documents: DocumentFile[];
  highlightTaskId: string | null;
  searchPlaceholder: string;
  selectedAutomationId: string | null;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  tasks: Task[];
  title: string;
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCancelTask: (taskId: string) => void;
  onClearHighlightTask: () => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
  onToggleAutomationEnabled: (automation: Automation) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onTriggerAutomation: (automation: Automation) => void;
  onUpdateAutomation: (automation: Automation, input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
  setSelectedAutomationId: (automationId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

function ResourceTable({
  actionLabel,
  automations,
  artifacts,
  description,
  documents,
  highlightTaskId,
  searchPlaceholder,
  selectedAutomationId,
  selectedArtifactId,
  selectedTaskId,
  tasks,
  title,
  view,
  onApproveTask,
  onCancelTask,
  onClearHighlightTask,
  onDeleteArtifact,
  onDownloadArtifact,
  onOpenAutomationDetail,
  onOpenArtifactDetail,
  onOpenTaskDetail,
  onPrimaryAction,
  onRefresh,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onTriggerAutomation,
  onUpdateAutomation,
  setSelectedAutomationId,
  setSelectedTaskId,
  busy,
}: ResourceTableProps) {
  const columns = resourceColumns[view];
  const empty = emptyTableConfig[view];
  const rowCount =
    view === 'tasks'
      ? tasks.length
      : view === 'automations'
        ? automations.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;
  const gridTemplateColumns = useMemo(
    () => `34px ${columns.map((column) => column.width ?? '1fr').join(' ')} 26px`,
    [columns],
  );
  const isTaskTable = view === 'tasks';

  return (
    <section className={cn('rounded-lg border border-[#222b36] bg-[#121922]', isTaskTable && 'mt-4')}>
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-[#eef2f8]">{title}</h2>
          <p className="mt-1 text-sm font-normal text-[#9aa3b2]">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button className="h-8 w-8 border-2 p-0" variant="outline" aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <ResourceActionsDropdown
            artifacts={artifacts}
            selectedArtifactId={selectedArtifactId}
            selectedTaskId={selectedTaskId}
            tasks={tasks}
            view={view}
            onCancelTask={onCancelTask}
            onDeleteArtifact={onDeleteArtifact}
            onDownloadArtifact={onDownloadArtifact}
            onRefresh={onRefresh}
          />
          {view !== 'artifacts' && (
            <Button className="h-8 px-5 text-sm font-medium" onClick={onPrimaryAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-5">
        <div className={cn('relative', isTaskTable ? 'w-[640px] max-w-[68%]' : 'w-[520px]')}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d97a6]" />
          <input
            className="h-8 w-full rounded-md border border-[#3a4654] bg-[#121922] pl-9 pr-3 text-sm font-normal italic text-[#dce1eb] outline-none placeholder:text-[#8f98a6] focus:border-[#8378ff]"
            placeholder={searchPlaceholder}
          />
        </div>

        <div className="flex items-center gap-4 text-sm font-medium text-[#c5ccd7]">
          <ChevronLeft className="h-4 w-4 text-[#667180]" />
          <span>1</span>
          <ChevronRight className="h-4 w-4 text-[#667180]" />
          <Settings className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border-t border-[#222b36]">
        <div
          className="grid h-9 items-center border-b border-[#222b36] px-5 text-[13px] font-semibold text-[#d3d8e2]"
          style={{ gridTemplateColumns }}
        >
          <input aria-label="Select all rows" className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
          {columns.map((column) => (
            <div key={column.id} className="flex min-w-0 items-center justify-between border-l border-[#303b49] px-3">
              <span className="truncate">{column.label}</span>
              {isTaskTable ? (
                <ChevronDown className="h-3.5 w-3.5 text-[#8f98a6]" />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 text-[#9aa3b2]" />
              )}
            </div>
          ))}
          <MoreHorizontal className="mx-auto h-4 w-4 text-[#9aa3b2]" />
        </div>

        {rowCount === 0 ? (
          <div className="flex min-h-[96px] flex-col items-center justify-center px-6 py-8 text-center">
            <div className="text-sm font-semibold text-[#d3d8e2]">{empty.title}</div>
            <p className="mt-2 max-w-[560px] text-sm font-normal text-[#9fa8b7]">{empty.description}</p>
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
                <TaskRow
                  key={task.taskId}
                  gridTemplateColumns={gridTemplateColumns}
                  highlighted={highlightTaskId === task.taskId}
                  selected={selectedTaskId === task.taskId}
                  task={task}
                  onApproveTask={onApproveTask}
                  onHighlightSeen={onClearHighlightTask}
                  onOpenDetail={onOpenTaskDetail}
                  onSelect={setSelectedTaskId}
                />
              ))}
            {view === 'automations' &&
              automations.map((automation) => (
                <AutomationRow
                  key={automation.automationId}
                  automation={automation}
                  busy={busy}
                  gridTemplateColumns={gridTemplateColumns}
                  selected={selectedAutomationId === automation.automationId}
                  onDelete={onDeleteAutomation}
                  onOpen={onOpenAutomationDetail}
                  onRunOnce={onTriggerAutomation}
                  onSelect={setSelectedAutomationId}
                  onToggleEnabled={onToggleAutomationEnabled}
                  onUpdate={onUpdateAutomation}
                />
              ))}
            {view === 'artifacts' &&
              artifacts.map((artifact) => (
                <ArtifactRow
                  key={artifact.artifactId}
                  artifact={artifact}
                  gridTemplateColumns={gridTemplateColumns}
                  selected={selectedArtifactId === artifact.artifactId}
                  onOpen={onOpenArtifactDetail}
                  onSelect={onOpenArtifactDetail}
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

function formatTaskRunType(task: Task) {
  switch (task.source) {
    case 'automation_schedule':
      return 'Scheduled';
    case 'automation_event':
      return 'Event';
    case 'automation_once':
    case 'manual':
    case 'chat':
      return 'One-time';
    default:
      return humanizeToken(task.type || task.source || 'task');
  }
}

function formatAutomationLabel(task: Task) {
  return task.automationId ? task.automationId : '-';
}

function TaskRow({
  gridTemplateColumns,
  highlighted,
  selected,
  task,
  onApproveTask,
  onHighlightSeen,
  onOpenDetail,
  onSelect,
}: {
  gridTemplateColumns: string;
  highlighted: boolean;
  selected: boolean;
  task: Task;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onHighlightSeen: () => void;
  onOpenDetail: (task: Task) => void;
  onSelect: (taskId: string | null) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = window.setTimeout(() => onHighlightSeen(), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [highlighted, onHighlightSeen]);

  return (
    <div
      ref={rowRef}
      className={cn(
        'grid min-h-[38px] cursor-pointer items-center border-b px-5 text-[13px] text-[#dce1eb]',
        highlighted ? 'border-[#8f82ff]/40 bg-[#8f82ff]/10' : selected ? 'border-[#8f82ff]/40 bg-[#8f82ff]/10' : 'border-[#202936] hover:bg-[#151f2b]',
      )}
      style={{ gridTemplateColumns }}
      onClick={() => onSelect(selected ? null : task.taskId)}
    >
      <input
        aria-label={`Select ${task.name}`}
        checked={selected}
        className="h-3.5 w-3.5 accent-[#8f82ff]"
        type="checkbox"
        onChange={() => onSelect(selected ? null : task.taskId)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] underline-offset-2 hover:underline">
        <button
          className="text-left"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(task);
          }}
        >
          {task.name}
        </button>
      </div>
      <div className="min-w-0 border-l border-[#303b49] px-3">
        <StatusBadge status={task.status} />
      </div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">{formatPriority(task.priority)}</div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#aeb7c5]">{formatTaskRunType(task)}</div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#aeb7c5]">{formatAutomationLabel(task)}</div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">{formatShortTime(task.updatedAt)}</div>
      <div className="flex justify-center">
        {task.status === 'AWAITING_INPUT' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-[#f1b54c]">
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
        <div key={index} className="truncate border-l border-[#303b49] px-3 font-normal">
          {value}
        </div>
      ))}
      <MoreHorizontal className="mx-auto h-4 w-4 text-[#9aa3b2]" />
    </div>
  );
}

function ResourceActionsDropdown({
  artifacts,
  selectedArtifactId,
  selectedTaskId,
  tasks,
  view,
  onCancelTask,
  onDeleteArtifact,
  onDownloadArtifact,
  onRefresh,
}: {
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  tasks: Task[];
  view: ResourceView;
  onCancelTask: (taskId: string) => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onRefresh: () => void;
}) {
  const selectedArtifact = selectedArtifactId ? artifacts.find((a) => a.artifactId === selectedArtifactId) : undefined;
  const selectedTask = selectedTaskId ? tasks.find((t) => t.taskId === selectedTaskId) : undefined;
  const isArtifacts = view === 'artifacts';
  const isTasks = view === 'tasks';
  const canCancel = selectedTask && !isTaskFinished(selectedTask.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 border-2 px-4" variant="outline">
          Actions
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isArtifacts ? (
          <>
            <DropdownMenuItem
              disabled={!selectedArtifact}
              onClick={() => selectedArtifact && onDownloadArtifact(selectedArtifact)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!selectedArtifact}
              className="text-red-400 focus:text-red-400"
              onClick={() => selectedArtifact && onDeleteArtifact(selectedArtifact)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : isTasks ? (
          <DropdownMenuItem
            disabled={!canCancel}
            className="text-red-400 focus:text-red-400"
            onClick={() => selectedTask && onCancelTask(selectedTask.taskId)}
          >
            <XCircle className="mr-2 h-4 w-4" />
            取消
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={onRefresh}>Refresh</DropdownMenuItem>
            <DropdownMenuItem>Copy table link</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Export current view</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isTaskFinished(status: Status) {
  return status === 'COMPLETED' || status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED';
}

function ArtifactRow({
  artifact,
  gridTemplateColumns,
  selected,
  onOpen,
  onSelect,
}: {
  artifact: Artifact;
  gridTemplateColumns: string;
  selected: boolean;
  onOpen: (artifact: Artifact) => void;
  onSelect: (artifact: Artifact) => void;
}) {
  return (
    <div
      className={cn(
        'grid min-h-12 cursor-pointer items-center border-b px-4 text-sm text-[#dce1eb] transition',
        selected
          ? 'border-[#8f82ff]/40 bg-[#8f82ff]/15'
          : 'border-[#202936] hover:bg-[#1a2330]',
      )}
      style={{ gridTemplateColumns }}
      onClick={() => onOpen(artifact)}
    >
      <input
        aria-label={`Select ${artifact.name}`}
        checked={selected}
        className="h-3.5 w-3.5 accent-[#8f82ff]"
        type="checkbox"
        onChange={() => onSelect(artifact)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] hover:underline">
        {artifact.name}
      </div>
      <div className="truncate border-l border-[#303b49] px-3">{artifact.type}</div>
      <div className="truncate border-l border-[#303b49] px-3">{formatSize(artifact.size)}</div>
      <div className="truncate border-l border-[#303b49] px-3">{formatTime(artifact.createdAt)}</div>
      <MoreHorizontal className="mx-auto h-4 w-4 text-[#9aa3b2]" />
    </div>
  );
}

function ArtifactDetailView({
  artifact,
  content,
  onBack,
  onDelete,
  onDownload,
  onOpenTask,
}: {
  artifact: Artifact;
  content: string;
  onBack: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const previewDoc = useMemo(() => buildArtifactPreviewDoc(artifact, content), [artifact, content]);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const [previewHeight, setPreviewHeight] = useState(520);

  const handlePreviewLoad = useCallback(() => {
    previewCleanupRef.current?.();
    previewCleanupRef.current = bindArtifactPreviewHeight(previewFrameRef.current, setPreviewHeight);
  }, []);

  useEffect(() => {
    setPreviewHeight(520);
    previewCleanupRef.current?.();
    previewCleanupRef.current = null;
  }, [previewDoc]);

  useEffect(() => {
    return () => {
      previewCleanupRef.current?.();
    };
  }, []);

  return (
    <div className="agent-scrollbar min-h-full min-w-0 overflow-y-auto px-5 py-4">
      <div className="min-w-[720px] pb-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button className="text-[#8f82ff] underline underline-offset-2" onClick={onBack}>
              Artifacts
            </button>
            <ChevronRight className="h-4 w-4 text-[#657080]" />
            <span className="text-[#aab2bf]">Artifact details</span>
          </div>
          <button className="text-[#c4cad5] hover:text-white" aria-label="Back to artifacts" onClick={onBack}>
            <Expand className="h-4 w-4" />
          </button>
        </div>

        <section className="rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-[#eef2f8]">{artifact.name}</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 border-2 px-4" variant="outline">
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Artifact ID</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#f2f4f8]">
                {artifact.artifactId}
                <button
                  className="text-[#8f82ff] hover:text-[#aaa2ff]"
                  aria-label="Copy artifact ID"
                  onClick={() => navigator.clipboard.writeText(artifact.artifactId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Type</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{artifact.type}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Size</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{formatSize(artifact.size)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Created</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{formatTime(artifact.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Version</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{artifact.version ?? 1}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Source task</div>
              <div className="mt-1 text-sm">
                {artifact.taskId ? (
                  <button
                    className="font-mono text-[#8f82ff] hover:text-[#aaa2ff] hover:underline"
                    onClick={() => onOpenTask(artifact.taskId!)}
                  >
                    {artifact.taskId}
                  </button>
                ) : (
                  <span className="text-[#dce1eb]">-</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
          <div className="border-b border-[#222b36] px-5 py-4">
            <h3 className="text-base font-semibold text-[#eef2f8]">Preview</h3>
            <div className="mt-1 text-xs font-normal text-[#9aa3b2]">
              {artifact.type} · {formatSize(artifact.size)}
            </div>
          </div>
          <div className="bg-white" style={{ height: previewHeight }}>
            <iframe
              ref={previewFrameRef}
              srcDoc={previewDoc}
              title={artifact.name}
              className="block h-full w-full border-0 bg-white"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              onLoad={handlePreviewLoad}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function TaskDetailView({
  task,
  records,
  artifacts,
  onBack,
  onOpenArtifact,
}: {
  task: Task;
  records: RecordEntry[];
  artifacts: Artifact[];
  onBack: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
}) {
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());
  const resultContent = useMemo(() => {
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].recordType === 'RESPONSE' && records[i].content) {
        return records[i].content;
      }
    }
    return '';
  }, [records]);

  const activities = useMemo(() => groupRecordsIntoActivities(records), [records]);

  const expandAllActivities = useCallback(() => {
    setActivitiesExpanded(true);
    setExpandedActivityIds(new Set(activities.map((a) => a.id)));
  }, [activities]);

  const collapseAllActivities = useCallback(() => {
    setExpandedActivityIds(new Set());
  }, []);

  const toggleActivity = useCallback((id: string) => {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setActivitiesExpanded(false);
    setExpandedActivityIds(new Set());
  }, [task.taskId]);

  return (
    <div className="agent-scrollbar min-h-full min-w-0 overflow-y-auto px-5 py-4">
      <div className="min-w-[720px] pb-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button className="text-[#8f82ff] underline underline-offset-2" onClick={onBack}>
              Tasks
            </button>
            <ChevronRight className="h-4 w-4 text-[#657080]" />
            <span className="text-[#aab2bf]">Task details</span>
          </div>
          <button className="text-[#c4cad5] hover:text-white" aria-label="Back to tasks" onClick={onBack}>
            <Expand className="h-4 w-4" />
          </button>
        </div>

        <h1 className="mb-5 text-xl font-semibold text-[#eef2f8]">{task.name || '未命名任务'}</h1>

        <section className="rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <h2 className="text-base font-semibold text-[#eef2f8]">Task overview</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Status</div>
              <div className="mt-1">
                <StatusBadge status={task.status} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Task ID</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#e2e8f0]">
                {task.taskId}
                <button
                  className="text-[#8f82ff] hover:text-[#aaa2ff]"
                  aria-label="Copy task ID"
                  onClick={() => navigator.clipboard.writeText(task.taskId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Priority</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{formatPriority(task.priority)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Created at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{formatTime(task.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Started at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{task.startedAt ? formatTime(task.startedAt) : '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Completed at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">
                {task.completedAt ? formatTime(task.completedAt) : '-'}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <h2 className="text-base font-semibold text-[#eef2f8]">Instructions</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-[#aab2bf]">{task.instruction || '-'}</p>
        </section>

        {resultContent && (
          <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
            <div className="border-b border-[#222b36] px-5 py-4">
              <h2 className="text-base font-semibold text-[#eef2f8]">Result</h2>
            </div>
            <div
              className="prose prose-invert max-w-none px-5 py-4 text-sm text-[#aab2bf]"
              dangerouslySetInnerHTML={{ __html: marked.parse(resultContent, { async: false }) as string }}
            />
          </section>
        )}

        <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
          <div
            className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left"
            onClick={() => setActivitiesExpanded((prev) => !prev)}
          >
            <div className="flex items-center gap-2">
              {activitiesExpanded ? (
                <ChevronDown className="h-4 w-4 text-[#c4cad5]" />
              ) : (
                <Play className="h-3 w-3 text-[#c4cad5]" />
              )}
              <h2 className="text-base font-semibold text-[#eef2f8]">Activities</h2>
              <span className="rounded bg-[#5a6270] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#f2f4f8]">
                {activities.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="h-8 border-2 text-xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  expandAllActivities();
                }}
              >
                Expand all
              </Button>
              <Button
                className="h-8 border-2 text-xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  collapseAllActivities();
                }}
              >
                Collapse all
              </Button>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[#c4cad5] transition-transform',
                  activitiesExpanded && 'rotate-180',
                )}
              />
            </div>
          </div>
          {activitiesExpanded && (
            <div className="border-t border-[#222b36]">
              {activities.map((activity) => {
                const expanded = expandedActivityIds.has(activity.id);
                return (
                  <div key={activity.id} className="border-b border-[#222b36] last:border-b-0">
                    <div className="flex items-start gap-3 px-5 py-3">
                      <div className="mt-0.5 shrink-0 text-[#8f82ff]">
                        <Info className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm text-[#f2f4f8]">
                          <span className="shrink-0 text-[#8f98a6]">{formatTime(activity.timestamp)}</span>
                          <span className="font-medium text-[#f2f4f8]">{activity.title}</span>
                          <span className="text-[#8f82ff]">{activity.subtitle}</span>
                        </div>
                        {expanded && (
                          <div className="mt-3 space-y-3">
                            {activity.request && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-[#8f98a6]">Request</div>
                                <pre className="max-h-96 overflow-auto rounded-md bg-[#0b0f14] p-3 text-xs text-[#f2f4f8]">
                                  {activity.request}
                                </pre>
                              </div>
                            )}
                            {activity.response && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-[#8f98a6]">Response</div>
                                <pre className="max-h-96 overflow-auto rounded-md bg-[#0b0f14] p-3 text-xs text-[#f2f4f8]">
                                  {activity.response}
                                </pre>
                              </div>
                            )}
                            {activity.content && (
                              <div
                                className="prose prose-invert max-w-none text-sm text-[#f2f4f8]"
                                dangerouslySetInnerHTML={{
                                  __html: marked.parse(activity.content, { async: false }) as string,
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        className="shrink-0 text-xs text-[#8f82ff] hover:text-[#aaa2ff]"
                        onClick={() => toggleActivity(activity.id)}
                      >
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {artifacts.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
            <div className="border-b border-[#222b36] px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#eef2f8]">Generated files</h2>
                <span className="rounded bg-[#5a6270] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#f2f4f8]">
                  {artifacts.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#222b36] text-xs font-semibold uppercase tracking-wide text-[#9aa3b2]">
                    <th className="px-5 py-3 font-medium">File name</th>
                    <th className="w-[140px] px-5 py-3 font-medium">Type</th>
                    <th className="w-[100px] px-5 py-3 font-medium">Size</th>
                    <th className="w-[260px] whitespace-nowrap px-5 py-3 font-medium">Created at</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr
                      key={artifact.artifactId}
                      className="cursor-pointer border-b border-[#222b36] last:border-b-0 hover:bg-[#1a222c]"
                      onClick={() => onOpenArtifact(artifact)}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-[#8f82ff] hover:text-[#aaa2ff] hover:underline">
                          {artifact.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#e2e8f0]">{artifact.type}</td>
                      <td className="px-5 py-3 text-[#e2e8f0]">{formatSize(artifact.size)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-[#e2e8f0]">{formatTime(artifact.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function groupRecordsIntoActivities(records: RecordEntry[]) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const grouped = new Map<
    string,
    { call?: RecordEntry; result?: RecordEntry; loadSkill?: RecordEntry; loadTool?: RecordEntry }
  >();

  for (const record of sorted) {
    const toolUseId =
      record.toolCall?.toolUseId ??
      record.toolResult?.toolUseId ??
      record.loadSkill?.toolUseId ??
      record.loadTool?.toolUseId;
    if (!toolUseId) continue;
    const entry = grouped.get(toolUseId) ?? {};
    switch (record.recordType) {
      case 'TOOL_CALL':
        entry.call = record;
        break;
      case 'TOOL_RESULT':
        entry.result = record;
        break;
      case 'LOAD_SKILL':
        entry.loadSkill = record;
        break;
      case 'LOAD_TOOL':
        entry.loadTool = record;
        break;
    }
    grouped.set(toolUseId, entry);
  }

  const processed = new Set<string>();
  const activities: Array<{
    id: string;
    timestamp: string;
    title: string;
    subtitle: string;
    content?: string;
    request?: string;
    response?: string;
  }> = [];

  for (const record of sorted) {
    const toolUseId =
      record.toolCall?.toolUseId ??
      record.toolResult?.toolUseId ??
      record.loadSkill?.toolUseId ??
      record.loadTool?.toolUseId;

    if (toolUseId && ['TOOL_CALL', 'TOOL_RESULT', 'LOAD_SKILL', 'LOAD_TOOL'].includes(record.recordType)) {
      if (processed.has(toolUseId)) continue;
      processed.add(toolUseId);
      const entry = grouped.get(toolUseId);
      if (!entry) continue;

      if (entry.call || entry.result) {
        const call = entry.call;
        const result = entry.result;
        const name =
          call?.toolCall?.action ||
          call?.toolCall?.toolName ||
          result?.toolResult?.action ||
          result?.toolResult?.skill ||
          'tool';
        activities.push({
          id: `tool-${toolUseId}`,
          timestamp: (call ?? result)!.createdAt,
          title: 'Called tool',
          subtitle: name,
          request: call?.toolCall?.input ? prettyJson(call.toolCall.input) : undefined,
          response: result?.toolResult?.output ? prettyJson(result.toolResult.output) : undefined,
        });
      } else if (entry.loadSkill) {
        const r = entry.loadSkill;
        activities.push({
          id: r.recordId,
          timestamp: r.createdAt,
          title: 'Loaded skill',
          subtitle: r.loadSkill?.skillName || '',
          request: r.loadSkill?.input ? prettyJson(r.loadSkill.input) : undefined,
          response: r.loadSkill?.output ? prettyJson(r.loadSkill.output) : undefined,
        });
      } else if (entry.loadTool) {
        const r = entry.loadTool;
        activities.push({
          id: r.recordId,
          timestamp: r.createdAt,
          title: 'Loaded tool',
          subtitle: r.loadTool?.toolName || '',
          request: r.loadTool?.input ? prettyJson(r.loadTool.input) : undefined,
          response: r.loadTool?.output ? prettyJson(r.loadTool.output) : undefined,
        });
      }
      continue;
    }

    if (record.recordType === 'RESPONSE') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Agent responded',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'STATUS') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: record.content || 'Status update',
        subtitle: '',
      });
    } else if (record.recordType === 'ERROR') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Error',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'THINKING') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Thinking',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'MEMORY_ACCESS') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Memory access',
        subtitle: '',
        content: record.content,
      });
    }
  }

  return activities;
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function bindArtifactPreviewHeight(
  frame: HTMLIFrameElement | null,
  setHeight: (height: number) => void,
) {
  const doc = frame?.contentDocument;
  if (!doc) {
    return null;
  }
  const root = doc.documentElement;
  const body = doc.body;
  let raf = 0;

  const measure = () => {
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => {
      const bodyHeight = body
        ? Math.max(body.scrollHeight, body.offsetHeight, body.getBoundingClientRect().height)
        : 0;
      const rootHeight = root
        ? Math.max(root.scrollHeight, root.offsetHeight, root.getBoundingClientRect().height)
        : 0;
      setHeight(Math.max(360, Math.ceil(bodyHeight || rootHeight || 360)));
    });
  };

  measure();
  window.setTimeout(measure, 80);
  window.setTimeout(measure, 300);

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  if (resizeObserver) {
    if (root) {
      resizeObserver.observe(root);
    }
    if (body) {
      resizeObserver.observe(body);
    }
  }

  const mutationObserver = body ? new MutationObserver(measure) : null;
  mutationObserver?.observe(body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  body?.addEventListener('toggle', measure, true);
  frame?.contentWindow?.addEventListener('resize', measure);

  return () => {
    window.cancelAnimationFrame(raf);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    body?.removeEventListener('toggle', measure, true);
    frame?.contentWindow?.removeEventListener('resize', measure);
  };
}

function buildArtifactPreviewDoc(artifact: Artifact, content: string) {
  if (isHTMLArtifact(artifact, content)) {
    return normalizeHTMLArtifact(content);
  }
  if (isMarkdownArtifact(artifact, content)) {
    return renderMarkdownArtifact(content);
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #ffffff;
        color: #1f2937;
        font: 14px/1.55 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      }
      body { padding: 24px; }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body><pre>${escapeHTML(content)}</pre></body>
</html>`;
}

function isHTMLArtifact(artifact: Artifact, content: string) {
  const name = artifact.name.toLowerCase();
  const type = artifact.type.toLowerCase();
  return (
    name.endsWith('.html') ||
    name.endsWith('.htm') ||
    type.includes('html') ||
    /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(content)
  );
}

function isMarkdownArtifact(artifact: Artifact, _content: string) {
  const name = artifact.name.toLowerCase();
  const type = artifact.type.toLowerCase();
  return name.endsWith('.md') || name.endsWith('.markdown') || type.includes('markdown');
}

function renderMarkdownArtifact(content: string) {
  const html = marked.parse(content, { async: false }) as string;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>
      html, body { margin: 0; min-height: 100%; background: #ffffff; color: #1f2937; font: 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { padding: 24px; max-width: 980px; margin: 0 auto; }
      h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 12px; line-height: 1.3; }
      p { margin: 0 0 12px; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.9em; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 4px solid #e5e7eb; margin: 0 0 12px; padding-left: 16px; color: #4b5563; }
      ul, ol { margin: 0 0 12px; padding-left: 24px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
      th { background: #f9fafb; }
      img { max-width: 100%; height: auto; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      hr { border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0; }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

function normalizeHTMLArtifact(content: string) {
  const trimmed = content.trimStart();
  const hasDocument = /^\s*(<!doctype\s+html|<html[\s>])/i.test(content);
  if (!hasDocument) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <base target="_blank">
    <style>html, body { margin: 0; min-height: 100%; }</style>
  </head>
  <body>${content}</body>
</html>`;
  }
  let doc = trimmed;
  if (!/<base\s/i.test(doc) && /<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
  }
  if (!/<meta\s+charset=/i.test(doc) && /<head[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">');
  }
  return doc;
}

function escapeHTML(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
            <div className="mt-2 text-xs font-normal text-[#9fa8b7]">
              {selectedFile ? `${selectedFile.name} (${formatSize(selectedFile.size)})` : 'Maximum file size: 10 MB'}
            </div>
          </div>
          <div className="mt-2 text-xs font-normal text-[#a4adbb]">
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

async function turnsToChatEvents(agentSpaceName: string, turns: Turn[]): Promise<ChatEvent[]> {
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
        agentSpaceName,
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
          getTask(agentSpaceName, turn.taskId),
          listRecords({ agentSpaceName, taskId: turn.taskId, maxResults: 100 }),
          listArtifacts(agentSpaceName),
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
      const output = parseSkillOutput(record.toolResult.output);
      const resultStatus: Extract<ChatEvent, { type: 'tool' }>['status'] =
        record.toolResult.isError || output?.status === 'error' ? 'error' : 'result';
      const event = processById.get(id);
      if (event) {
        event.status = resultStatus;
        event.rawResponse = record.toolResult.output;
        event.output = output;
        event.skill = event.skill || record.toolResult.skill;
        event.action = event.action || record.toolResult.action;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'tool',
          name: record.toolResult.action || 'tool',
          status: resultStatus,
          rawResponse: record.toolResult.output,
          output,
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
        event.rawResponse = event.rawResponse || record.loadSkill.output;
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
          rawResponse: record.loadSkill.output,
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
        event.rawResponse = event.rawResponse || record.loadTool.output;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'resource',
          name: record.loadTool.toolName || 'resource',
          status: record.loadTool.output ? 'result' : 'called',
          request: prettyPayload(record.loadTool.input),
          rawResponse: record.loadTool.output,
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
  agentSpaceName,
  conversationId,
  turnId,
  onUpdate,
}: {
  agentSpaceName: string;
  conversationId: string;
  turnId: string;
  onUpdate: (turn: Turn, records: RecordEntry[]) => void;
}) {
  let latestTurn: Turn | null = null;
  let latestRecords: RecordEntry[] = [];
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [turnPage, recordPage] = await Promise.all([
      getTurn(agentSpaceName, conversationId, turnId),
      listRecords({ agentSpaceName, conversationId, turnId, maxResults: 100 }),
    ]);
    latestTurn = turnPage.turn;
    latestRecords = recordPage.records ?? [];
    onUpdate(latestTurn, latestRecords);
    if (isTurnDone(latestTurn)) {
      return latestTurn;
    }
    await sleep(POLL_INTERVAL_MS);
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

function parseSkillOutput(response?: string): SkillOutput | undefined {
  if (!response) return undefined;
  try {
    const parsed = JSON.parse(response) as { output?: SkillOutput };
    const output = parsed.output;
    if (output && typeof output.version === 'string' && typeof output.status === 'string' && typeof output.message === 'string') {
      return output;
    }
  } catch {
    // Not a skill action response or invalid envelope.
  }
  return undefined;
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

async function pollTask(agentSpaceName: string, taskId: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const task = await getTask(agentSpaceName, taskId);
    if (task.entity.status === 'COMPLETED' || task.entity.status === 'FAILED' || task.entity.status === 'AWAITING_INPUT') {
      return task.entity;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Task polling timed out');
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}


function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default App;
