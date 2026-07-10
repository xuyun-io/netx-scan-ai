import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { type CreateMode, type WorkspaceView } from '@/data/promptTemplates';
import {
  cancelTask,
  createAutomation,
  createDocument,
  createTask,
  deleteArtifact,
  deleteAutomation,
  deleteTask,
  getArtifact,
  triggerAutomation,
  updateAutomation,
  updateAutomationEnabled,
  type Artifact,
  type Automation,
  type AutomationSchedule,
  type CreateAutomationInput,
  type RecordEntry,
  type Task,
} from '@/lib/api';
import { pollTask } from '@/lib/tasks';

type ResourceView = Exclude<WorkspaceView, 'chat'>;

interface WorkspaceActionRoutes {
  cancelCreate: () => void;
  closeArtifactDetail: () => void;
  closeAutomationDetail: () => void;
  closeTaskDetail: () => void;
  openArtifactDetail: (artifactId: string) => void;
  openAutomationDetail: (automationId: string) => void;
  openTaskDetail: (taskId: string) => void;
  openTasks: () => void;
  startCreate: (mode: Exclude<CreateMode, 'none'>) => void;
}

interface UseWorkspaceActionsParams {
  agentSpaceName?: string | null;
  closeInlineChat: () => void;
  loadArtifactDetail: (artifactId: string) => Promise<{ artifact: Artifact; content: string } | null>;
  loadAutomationDetail: (automationId: string) => Promise<Automation | null>;
  loadTaskDetail: (taskId: string) => Promise<{ task: Task; records: RecordEntry[] } | null>;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  refresh: (agentSpaceName?: string) => Promise<void>;
  routes: WorkspaceActionRoutes;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  setAutomationDetail: Dispatch<SetStateAction<Automation | null>>;
  setAutomations: Dispatch<SetStateAction<Automation[]>>;
  setSelectedArtifactId: Dispatch<SetStateAction<string | null>>;
  setSelectedAutomationId: Dispatch<SetStateAction<string | null>>;
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>;
  viewingArtifactId: string | null;
  viewingAutomationId: string | null;
  viewingTaskId: string | null;
}

export function useWorkspaceActions({
  agentSpaceName,
  closeInlineChat,
  loadArtifactDetail,
  loadAutomationDetail,
  loadTaskDetail,
  onBusyChange,
  onError,
  refresh,
  routes,
  selectedArtifactId,
  selectedTaskId,
  setAutomationDetail,
  setAutomations,
  setSelectedArtifactId,
  setSelectedAutomationId,
  setSelectedTaskId,
  viewingArtifactId,
  viewingAutomationId,
  viewingTaskId,
}: UseWorkspaceActionsParams) {
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const runBusyAction = useCallback(async (action: (currentAgentSpaceName: string) => Promise<void>) => {
    if (!agentSpaceName) return;

    onBusyChange(true);
    onError(null);
    try {
      await action(agentSpaceName);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [agentSpaceName, onBusyChange, onError]);

  const startCreate = useCallback((mode: Exclude<CreateMode, 'none'>) => {
    routes.startCreate(mode);
  }, [routes]);

  const cancelCreate = useCallback(() => {
    routes.cancelCreate();
  }, [routes]);

  const openArtifactDetail = useCallback(async (artifact: Artifact) => {
    await runBusyAction(async () => {
      const detail = await loadArtifactDetail(artifact.artifactId);
      if (detail) {
        routes.openArtifactDetail(detail.artifact.artifactId);
      }
    });
  }, [loadArtifactDetail, routes, runBusyAction]);

  const closeArtifactDetail = useCallback(() => {
    routes.closeArtifactDetail();
  }, [routes]);

  const openTaskDetail = useCallback(async (task: Task) => {
    await runBusyAction(async () => {
      const detail = await loadTaskDetail(task.taskId);
      if (detail) {
        routes.openTaskDetail(detail.task.taskId);
      }
    });
  }, [loadTaskDetail, routes, runBusyAction]);

  const closeTaskDetail = useCallback(() => {
    routes.closeTaskDetail();
  }, [routes]);

  const downloadArtifact = useCallback(async (artifact: Artifact) => {
    if (!agentSpaceName) return;

    onError(null);
    try {
      const detail = await getArtifact(agentSpaceName, artifact.artifactId);
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
      onError((err as Error).message);
    }
  }, [agentSpaceName, onError]);

  const handleDeleteArtifact = useCallback(async (artifact: Artifact) => {
    if (!agentSpaceName) return;

    const confirmed = window.confirm(`确定删除产物 "${artifact.name}" 吗？`);
    if (!confirmed) return;

    await runBusyAction(async (currentAgentSpaceName) => {
      await deleteArtifact(currentAgentSpaceName, artifact.artifactId);
      if (selectedArtifactId === artifact.artifactId) {
        setSelectedArtifactId(null);
      }
      if (viewingArtifactId === artifact.artifactId) {
        routes.closeArtifactDetail();
      }
      await refresh(currentAgentSpaceName);
    });
  }, [
    agentSpaceName,
    refresh,
    routes,
    runBusyAction,
    selectedArtifactId,
    setSelectedArtifactId,
    viewingArtifactId,
  ]);

  const openTaskFromArtifact = useCallback((taskId: string) => {
    closeInlineChat();
    routes.openTasks();
    setHighlightTaskId(taskId);
  }, [closeInlineChat, routes]);

  const clearHighlightTask = useCallback(() => {
    setHighlightTaskId(null);
  }, []);

  const handleCreateTask = useCallback(async (instruction: string) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      const created = await createTask(currentAgentSpaceName, instruction);
      routes.openTasks();
      await refresh(currentAgentSpaceName);
      if (created.entity.status !== 'AWAITING_INPUT') {
        await pollTask(currentAgentSpaceName, created.entity.taskId);
        await refresh(currentAgentSpaceName);
      }
    });
  }, [refresh, routes, runBusyAction]);

  const handleCreateAutomation = useCallback(async (input: Omit<CreateAutomationInput, 'agentSpaceName'>) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      const created = await createAutomation({
        ...input,
        agentSpaceName: currentAgentSpaceName,
      });
      setAutomationDetail(created.entity);
      setSelectedAutomationId(created.entity.automationId);
      routes.openAutomationDetail(created.entity.automationId);
      await refresh(currentAgentSpaceName);
    });
  }, [refresh, routes, runBusyAction, setAutomationDetail, setSelectedAutomationId]);

  const openAutomationDetail = useCallback(async (automation: Automation) => {
    await runBusyAction(async () => {
      const detail = await loadAutomationDetail(automation.automationId);
      if (detail) {
        routes.openAutomationDetail(detail.automationId);
      }
    });
  }, [loadAutomationDetail, routes, runBusyAction]);

  const closeAutomationDetail = useCallback(() => {
    routes.closeAutomationDetail();
  }, [routes]);

  const handleToggleAutomationEnabled = useCallback(async (automation: Automation) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      const updated = await updateAutomationEnabled(
        currentAgentSpaceName,
        automation.automationId,
        !automation.enabled,
      );
      setAutomationDetail(updated.entity);
      setAutomations((prev) =>
        prev.map((item) => (item.automationId === updated.entity.automationId ? updated.entity : item)),
      );
    });
  }, [runBusyAction, setAutomationDetail, setAutomations]);

  const handleDeleteAutomation = useCallback(async (automation: Automation) => {
    const confirmed = window.confirm(`确定删除自动化 "${automation.name || automation.automationId}" 吗？`);
    if (!confirmed) return;

    await runBusyAction(async (currentAgentSpaceName) => {
      await deleteAutomation(currentAgentSpaceName, automation.automationId);
      if (viewingAutomationId === automation.automationId) {
        routes.closeAutomationDetail();
      }
      setSelectedAutomationId(null);
      await refresh(currentAgentSpaceName);
    });
  }, [refresh, routes, runBusyAction, setSelectedAutomationId, viewingAutomationId]);

  const handleTriggerAutomation = useCallback(async (automation: Automation) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      await triggerAutomation(currentAgentSpaceName, automation.automationId);
      await refresh(currentAgentSpaceName);
    });
  }, [refresh, runBusyAction]);

  const handleUpdateAutomation = useCallback(async (
    automation: Automation,
    input: { name: string; description: string; instruction: string; schedule: AutomationSchedule },
  ) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      const updated = await updateAutomation(currentAgentSpaceName, automation.automationId, input);
      setAutomationDetail(updated.entity);
      setAutomations((prev) =>
        prev.map((item) => (item.automationId === updated.entity.automationId ? updated.entity : item)),
      );
    });
  }, [runBusyAction, setAutomationDetail, setAutomations]);

  const handleCancelTask = useCallback(async (taskId: string) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      await cancelTask(currentAgentSpaceName, taskId);
      await refresh(currentAgentSpaceName);
    });
  }, [refresh, runBusyAction]);

  const handleDeleteTask = useCallback(async (task: Task) => {
    const confirmed = window.confirm(`确定删除任务 "${task.name || task.taskId}" 吗？`);
    if (!confirmed) return;

    await runBusyAction(async (currentAgentSpaceName) => {
      await deleteTask(currentAgentSpaceName, task.taskId);
      if (selectedTaskId === task.taskId) {
        setSelectedTaskId(null);
      }
      if (viewingTaskId === task.taskId) {
        routes.closeTaskDetail();
      }
      await refresh(currentAgentSpaceName);
    });
  }, [refresh, routes, runBusyAction, selectedTaskId, setSelectedTaskId, viewingTaskId]);

  const handleDocumentUploaded = useCallback(async (file: File) => {
    await runBusyAction(async (currentAgentSpaceName) => {
      await createDocument(currentAgentSpaceName, file);
      await refresh(currentAgentSpaceName);
      setUploadOpen(false);
    });
  }, [refresh, runBusyAction]);

  const handlePrimaryAction = useCallback((view: ResourceView) => {
    if (view === 'tasks') {
      routes.startCreate('task');
      return;
    }
    if (view === 'automations') {
      routes.startCreate('automation');
      return;
    }
    if (view === 'context-files') {
      setUploadOpen(true);
    }
  }, [routes]);

  const expandWorkspace = useCallback(() => {
    closeInlineChat();
  }, [closeInlineChat]);

  const refreshWorkspace = useCallback(() => {
    if (!agentSpaceName) return Promise.resolve();
    return refresh(agentSpaceName);
  }, [agentSpaceName, refresh]);

  return {
    cancelCreate,
    clearHighlightTask,
    closeArtifactDetail,
    closeAutomationDetail,
    closeTaskDetail,
    downloadArtifact,
    expandWorkspace,
    handleCancelTask,
    handleCreateAutomation,
    handleCreateTask,
    handleDeleteArtifact,
    handleDeleteAutomation,
    handleDeleteTask,
    handleDocumentUploaded,
    handlePrimaryAction,
    handleToggleAutomationEnabled,
    handleTriggerAutomation,
    handleUpdateAutomation,
    highlightTaskId,
    openArtifactDetail,
    openAutomationDetail,
    openTaskDetail,
    openTaskFromArtifact,
    refreshWorkspace,
    setUploadOpen,
    startCreate,
    uploadOpen,
  };
}
