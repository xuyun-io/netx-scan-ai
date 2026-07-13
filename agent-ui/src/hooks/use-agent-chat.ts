import { useCallback, useState } from 'react';
import { type WorkspaceView } from '@/data/promptTemplates';
import {
  createConversation,
  createTurn,
  deleteConversation as deleteConversationApi,
  getConversation,
  listArtifacts,
  listConversations,
  listRecords,
  respondToTask,
  type Conversation,
} from '@/lib/api';
import {
  artifactsToChatEvents,
  inProgressLabel,
  isTurnDone,
  pollTurnRecords,
  recordsToChatEvents,
  replaceEvent,
  replaceScopedEvents,
  scopedEventId,
  taskToApprovalEvent,
  taskToChatEvent,
  titleFromPrompt,
  turnScope,
  turnToAnswerEvent,
  turnsToChatEvents,
  updateTaskEvents,
  type ChatEvent,
} from '@/lib/chat-events';
import { pollTask } from '@/lib/tasks';

interface InitializeConversationsOptions {
  createIfEmpty: boolean;
}

interface UseAgentChatParams {
  activeView: WorkspaceView;
  agentSpaceName?: string | null;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onOpenFullChat: () => void;
  onRefreshWorkspace: (agentSpaceName?: string) => Promise<void>;
  onSelectView: (view: WorkspaceView) => void;
}

export function useAgentChat({
  activeView,
  agentSpaceName,
  busy,
  onBusyChange,
  onError,
  onOpenFullChat,
  onRefreshWorkspace,
  onSelectView,
}: UseAgentChatParams) {
  const [prompt, setPrompt] = useState('');
  const [inlineChatOpen, setInlineChatOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);

  const closeInlineChat = useCallback(() => {
    setInlineChatOpen(false);
  }, []);

  const openFullChat = useCallback(() => {
    setInlineChatOpen(false);
    onOpenFullChat();
  }, [onOpenFullChat]);

  const loadConversations = useCallback(async (targetAgentSpaceName: string) => {
    const page = await listConversations(targetAgentSpaceName, 50);
    const nextConversations = page.entities ?? [];
    setConversations(nextConversations);
    return nextConversations;
  }, []);

  const loadConversationTimeline = useCallback(async (
    targetAgentSpaceName: string,
    nextConversation: Conversation,
  ) => {
    const detail = await getConversation(targetAgentSpaceName, nextConversation.conversationId);
    setConversation(detail.entity);
    setChatEvents(await turnsToChatEvents(targetAgentSpaceName, detail.turns ?? []));
  }, []);

  const initializeConversations = useCallback(async (
    targetAgentSpaceName: string,
    options: InitializeConversationsOptions,
  ) => {
    const nextConversations = await loadConversations(targetAgentSpaceName);
    if (nextConversations.length === 0 && options.createIfEmpty) {
      const created = await createConversation(targetAgentSpaceName, '新的会话');
      setConversations([created.entity]);
      setConversation(created.entity);
      setChatEvents([]);
      return;
    }
    if (nextConversations.length > 0) {
      await loadConversationTimeline(targetAgentSpaceName, nextConversations[0]);
    }
  }, [loadConversationTimeline, loadConversations]);

  const handleNewChat = useCallback(async () => {
    if (!agentSpaceName || busy) return;

    onBusyChange(true);
    onError(null);
    try {
      const nextConversation = await createConversation(agentSpaceName, '新的会话');
      setConversation(nextConversation.entity);
      setConversations((prev) => [
        nextConversation.entity,
        ...prev.filter((item) => item.conversationId !== nextConversation.entity.conversationId),
      ]);
      setChatEvents([]);
      if (activeView === 'chat') {
        setInlineChatOpen(false);
      } else {
        onSelectView(activeView);
        setInlineChatOpen(true);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [activeView, agentSpaceName, busy, onBusyChange, onError, onSelectView]);

  const handleOpenConversation = useCallback(async (nextConversation: Conversation) => {
    if (!agentSpaceName || busy) return;

    onBusyChange(true);
    onError(null);
    try {
      await loadConversationTimeline(agentSpaceName, nextConversation);
      onOpenFullChat();
      setInlineChatOpen(false);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [agentSpaceName, busy, loadConversationTimeline, onBusyChange, onError, onOpenFullChat]);

  const handleDeleteConversation = useCallback(async (target: Conversation) => {
    if (!agentSpaceName || busy) return;

    const confirmed = window.confirm(`确定删除会话 "${target.title || '新的会话'}" 吗？`);
    if (!confirmed) return;

    onBusyChange(true);
    onError(null);
    try {
      await deleteConversationApi(agentSpaceName, target.conversationId);
      const nextConversations = conversations.filter(
        (item) => item.conversationId !== target.conversationId,
      );
      setConversations(nextConversations);
      if (conversation?.conversationId === target.conversationId) {
        if (nextConversations.length > 0) {
          await loadConversationTimeline(agentSpaceName, nextConversations[0]);
        } else {
          const created = await createConversation(agentSpaceName, '新的会话');
          setConversations([created.entity]);
          setConversation(created.entity);
          setChatEvents([]);
        }
      }
      await loadConversations(agentSpaceName);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [
    agentSpaceName,
    busy,
    conversation?.conversationId,
    conversations,
    loadConversationTimeline,
    loadConversations,
    onBusyChange,
    onError,
  ]);

  const handleSend = useCallback(async () => {
    if (!agentSpaceName || !conversation || !prompt.trim() || busy) return;

    const userPrompt = prompt.trim();
    const statusId = crypto.randomUUID();
    setPrompt('');
    onBusyChange(true);
    onError(null);
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
    setConversation((current) => (
      current ? { ...current, title: current.title === '新的会话' ? nextTitle : current.title } : current
    ));
    setConversations((prev) =>
      prev.map((item) =>
        item.conversationId === conversation.conversationId && item.title === '新的会话'
          ? { ...item, title: nextTitle, updatedAt: new Date().toISOString() }
          : item,
      ),
    );

    let scopeKey = '';
    try {
      const created = await createTurn(agentSpaceName, conversation.conversationId, userPrompt);
      scopeKey = turnScope(created.turn.turnId);
      const finalTurn = await pollTurnRecords({
        agentSpaceName,
        conversationId: conversation.conversationId,
        turnId: created.turn.turnId,
        onUpdate: (turn, records) => {
          const nextEvents = recordsToChatEvents(records, {
            scopeKey,
            traceScope: {
              agentSpaceName,
              conversationId: conversation.conversationId,
              turnId: turn.turnId,
            },
          });
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
        const task = await pollTask(agentSpaceName, finalTurn.taskId);
        const [recordPage, artifactPage] = await Promise.all([
          listRecords({ agentSpaceName, taskId: finalTurn.taskId, maxResults: 100 }),
          listArtifacts(agentSpaceName),
        ]);
        const taskEvents = [
          ...recordsToChatEvents(recordPage.records ?? [], { scopeKey }),
          taskToChatEvent(task, scopeKey),
          ...(task.status === 'AWAITING_INPUT' ? [taskToApprovalEvent(task, scopeKey)] : []),
          ...artifactsToChatEvents((artifactPage.entities ?? []).filter((artifact) => artifact.taskId === task.taskId), scopeKey),
        ];
        setChatEvents((prev) => replaceScopedEvents(prev, statusId, scopeKey, taskEvents));
      }

      await onRefreshWorkspace(agentSpaceName);
      await loadConversations(agentSpaceName);
    } catch (err) {
      onError((err as Error).message);
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
      onBusyChange(false);
    }
  }, [
    agentSpaceName,
    busy,
    conversation,
    loadConversations,
    onBusyChange,
    onError,
    onRefreshWorkspace,
    prompt,
  ]);

  const handleApproveTask = useCallback(async (taskId: string, response: 'approve' | 'reject') => {
    if (!agentSpaceName || busy) return;

    onBusyChange(true);
    onError(null);
    try {
      const task = await respondToTask(agentSpaceName, taskId, response);
      await onRefreshWorkspace(agentSpaceName);
      setChatEvents((prev) => updateTaskEvents(prev, task.entity));
      if (response === 'approve') {
        const completed = await pollTask(agentSpaceName, task.entity.taskId);
        setChatEvents((prev) => updateTaskEvents(prev, completed));
        await onRefreshWorkspace(agentSpaceName);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [agentSpaceName, busy, onBusyChange, onError, onRefreshWorkspace]);

  return {
    chatEvents,
    closeInlineChat,
    conversation,
    conversations,
    handleApproveTask,
    handleDeleteConversation,
    handleNewChat,
    handleOpenConversation,
    handleSend,
    initializeConversations,
    inlineChatOpen,
    openFullChat,
    prompt,
    setPrompt,
  };
}
