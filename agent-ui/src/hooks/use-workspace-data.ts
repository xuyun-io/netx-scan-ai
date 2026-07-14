import { useCallback, useEffect, useRef, useState } from 'react';
import { type WorkspaceView } from '@/data/promptTemplates';
import {
  getArtifact,
  getAutomation,
  getTask,
  listArtifacts,
  listAutomations,
  listDocuments,
  listRecords,
  listTasks,
  type Artifact,
  type Automation,
  type DocumentFile,
  type RecordEntry,
  type Task,
} from '@/lib/api';

type WorkspaceErrorHandler = (message: string | null) => void;

interface WorkspaceDataParams {
  activeView: WorkspaceView;
  agentSpaceName?: string | null;
  viewingAutomationId: string | null;
  viewingArtifactId: string | null;
  viewingTaskId: string | null;
  onError?: WorkspaceErrorHandler;
}

const FINAL_TASK_STATUSES = ['COMPLETED', 'SUCCESS', 'FAILED', 'CANCELLED'];
const TASK_LIST_REFRESH_INTERVAL_MS = 5000;

const isFinalTaskStatus = (status: string) => FINAL_TASK_STATUSES.includes(status);

export function useWorkspaceData({
  activeView,
  agentSpaceName,
  viewingAutomationId,
  viewingArtifactId,
  viewingTaskId,
  onError,
}: WorkspaceDataParams) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<{ artifact: Artifact; content: string } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<{ task: Task; records: RecordEntry[] } | null>(null);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [automationDetail, setAutomationDetail] = useState<Automation | null>(null);
  const agentSpaceNameRef = useRef(agentSpaceName);

  useEffect(() => {
    agentSpaceNameRef.current = agentSpaceName;
  }, [agentSpaceName]);

  const refresh = useCallback(async (targetAgentSpaceName?: string) => {
    targetAgentSpaceName = targetAgentSpaceName ?? agentSpaceNameRef.current ?? undefined;
    if (!targetAgentSpaceName) return;

    const [taskPage, automationPage, artifactPage, documentPage] = await Promise.all([
      listTasks(targetAgentSpaceName),
      listAutomations(targetAgentSpaceName),
      listArtifacts(targetAgentSpaceName),
      listDocuments(targetAgentSpaceName),
    ]);
    setTasks(taskPage.entities ?? []);
    setAutomations(automationPage.entities ?? []);
    setArtifacts(artifactPage.entities ?? []);
    setDocuments(documentPage.entities ?? []);
  }, []);

  const loadArtifactDetail = useCallback(async (artifactId: string) => {
    if (!agentSpaceName) return null;

    const detail = await getArtifact(agentSpaceName, artifactId);
    const nextDetail = { artifact: detail.entity, content: detail.content };
    setArtifactDetail(nextDetail);
    setSelectedArtifactId(detail.entity.artifactId);
    return nextDetail;
  }, [agentSpaceName]);

  const loadTaskDetail = useCallback(async (taskId: string) => {
    if (!agentSpaceName) return null;

    const [detail, recordsResp, artifactPage] = await Promise.all([
      getTask(agentSpaceName, taskId),
      listRecords({ agentSpaceName, taskId, maxResults: 500 }),
      listArtifacts(agentSpaceName),
    ]);
    const nextDetail = { task: detail.entity, records: recordsResp.records ?? [] };
    setTaskDetail(nextDetail);
    setArtifacts(artifactPage.entities ?? []);
    setSelectedTaskId(detail.entity.taskId);
    return nextDetail;
  }, [agentSpaceName]);

  const loadAutomationDetail = useCallback(async (automationId: string) => {
    if (!agentSpaceName) return null;

    const detail = await getAutomation(agentSpaceName, automationId);
    setAutomationDetail(detail.entity);
    setSelectedAutomationId(detail.entity.automationId);
    return detail.entity;
  }, [agentSpaceName]);

  useEffect(() => {
    if (!viewingAutomationId) {
      setAutomationDetail(null);
    }
  }, [viewingAutomationId]);

  useEffect(() => {
    if (!viewingArtifactId) {
      setArtifactDetail(null);
    }
  }, [viewingArtifactId]);

  useEffect(() => {
    if (!viewingTaskId) {
      setTaskDetail(null);
    }
  }, [viewingTaskId]);

  useEffect(() => {
    if (!agentSpaceName || !viewingArtifactId) {
      return;
    }
    if (artifactDetail?.artifact.artifactId === viewingArtifactId) {
      return;
    }

    let alive = true;
    onError?.(null);

    const load = async () => {
      try {
        const detail = await getArtifact(agentSpaceName, viewingArtifactId);
        if (!alive) return;
        setArtifactDetail({ artifact: detail.entity, content: detail.content });
        setSelectedArtifactId(detail.entity.artifactId);
      } catch (err) {
        if (alive) onError?.((err as Error).message);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [agentSpaceName, artifactDetail?.artifact.artifactId, onError, viewingArtifactId]);

  useEffect(() => {
    if (!agentSpaceName || !viewingAutomationId) {
      return;
    }

    let alive = true;
    let timer: number | undefined;
    onError?.(null);

    const load = async () => {
      if (!alive) return;
      try {
        const [automationResp, tasksResp] = await Promise.all([
          getAutomation(agentSpaceName, viewingAutomationId),
          listTasks(agentSpaceName),
        ]);
        if (!alive) return;
        setAutomationDetail(automationResp.entity);
        setSelectedAutomationId(automationResp.entity.automationId);
        setTasks(tasksResp.entities ?? []);
      } catch (err) {
        if (alive) onError?.((err as Error).message);
      }
    };

    load();
    timer = window.setInterval(load, 5000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [agentSpaceName, onError, viewingAutomationId]);

  useEffect(() => {
    if (!agentSpaceName || !viewingTaskId) {
      return;
    }

    let alive = true;
    let timer: number | undefined;
    onError?.(null);

    const load = async () => {
      if (!alive) return;
      try {
        const [detail, recordsResp, artifactPage] = await Promise.all([
          getTask(agentSpaceName, viewingTaskId),
          listRecords({ agentSpaceName, taskId: viewingTaskId, maxResults: 500 }),
          listArtifacts(agentSpaceName),
        ]);
        if (!alive) return false;
        setTaskDetail({ task: detail.entity, records: recordsResp.records ?? [] });
        setArtifacts(artifactPage.entities ?? []);
        setSelectedTaskId(detail.entity.taskId);
        const finished = isFinalTaskStatus(detail.entity.status);
        if (finished && timer) {
          clearInterval(timer);
          timer = undefined;
        }
        return finished;
      } catch (err) {
        if (alive) onError?.((err as Error).message);
        return false;
      }
    };

    const startPolling = async () => {
      const finished = await load();
      if (!alive || finished) return;
      timer = window.setInterval(load, 2000);
    };

    startPolling();

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [agentSpaceName, onError, viewingTaskId]);

  useEffect(() => {
    if (!agentSpaceName || activeView !== 'automations') {
      return;
    }

    let alive = true;
    const load = async () => {
      if (!alive) return;
      try {
        const page = await listAutomations(agentSpaceName);
        if (!alive) return;
        setAutomations(page.entities ?? []);
      } catch (err) {
        if (alive) onError?.((err as Error).message);
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activeView, agentSpaceName, onError]);

  useEffect(() => {
    if (!agentSpaceName || activeView !== 'tasks') {
      return;
    }

    let alive = true;
    onError?.(null);

    const load = async () => {
      if (!alive || document.hidden) return;
      try {
        const page = await listTasks(agentSpaceName);
        if (!alive) return;
        setTasks(page.entities ?? []);
      } catch (err) {
        if (alive) onError?.((err as Error).message);
      }
    };

    load();
    const timer = window.setInterval(load, TASK_LIST_REFRESH_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activeView, agentSpaceName, onError]);

  return {
    artifactDetail,
    artifacts,
    automationDetail,
    automations,
    documents,
    loadArtifactDetail,
    loadAutomationDetail,
    loadTaskDetail,
    refresh,
    selectedArtifactId,
    selectedAutomationId,
    selectedTaskId,
    setAutomationDetail,
    setAutomations,
    setSelectedArtifactId,
    setSelectedAutomationId,
    setSelectedTaskId,
    taskDetail,
    tasks,
  };
}
