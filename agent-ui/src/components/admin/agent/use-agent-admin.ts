import { useCallback, useState } from 'react';
import {
  createAgentSpace,
  deleteAgentSpace,
  getAgentSpace,
  listAgentSpaces,
  updateAgentSpace,
  type AgentSpace,
  type CreateAgentSpaceInput,
} from '@/lib/api';
import { navigateToAgent, navigateToRoot, parseAgentSpaceNameFromPath } from '@/lib/routing';

interface UseAgentAdminParams {
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
}

export function useAgentAdmin({ onBusyChange, onError }: UseAgentAdminParams) {
  const [adminView, setAdminView] = useState(true);
  const [agentSpaces, setAgentSpaces] = useState<AgentSpace[]>([]);
  const [agentSpace, setAgentSpace] = useState<AgentSpace | null>(null);

  const loadAgentSpaces = useCallback(async () => {
    const page = await listAgentSpaces();
    setAgentSpaces(page.entities ?? []);
  }, []);

  const loadAgentSpaceFromPath = useCallback(async () => {
    const agentSpaceName = parseAgentSpaceNameFromPath();
    if (!agentSpaceName) {
      setAgentSpace(null);
      setAdminView(true);
      return null;
    }

    const detail = await getAgentSpace(agentSpaceName);
    setAgentSpace(detail.entity);
    setAdminView(false);
    return detail.entity;
  }, []);

  const openAgent = useCallback((nextSpace: AgentSpace) => {
    navigateToAgent(nextSpace.name, '#/chat');
  }, []);

  const handleCreateAgent = useCallback(async (input: CreateAgentSpaceInput) => {
    onBusyChange(true);
    onError(null);
    try {
      const created = await createAgentSpace(input);
      await loadAgentSpaces();
      openAgent(created.entity);
    } catch (err) {
      onError((err as Error).message);
      throw err;
    } finally {
      onBusyChange(false);
    }
  }, [loadAgentSpaces, onBusyChange, onError, openAgent]);

  const handleUpdateAgent = useCallback(async (target: AgentSpace) => {
    onBusyChange(true);
    onError(null);
    try {
      const updated = await updateAgentSpace({
        name: target.name,
        description: target.description,
        llm: target.llm,
        environment: target.environment,
        integrations: target.integrations,
      });
      await loadAgentSpaces();
      setAgentSpace((prev) => (prev?.name === updated.entity.name ? updated.entity : prev));
    } catch (err) {
      onError((err as Error).message);
      throw err;
    } finally {
      onBusyChange(false);
    }
  }, [loadAgentSpaces, onBusyChange, onError]);

  const handleDeleteAgent = useCallback(async (target: AgentSpace) => {
    const confirmed = window.confirm(`确定删除 Agent "${target.name}" 吗？这会删除对应 AgentSpace 的文本数据目录。`);
    if (!confirmed) return;

    onBusyChange(true);
    onError(null);
    try {
      await deleteAgentSpace(target.name);
      if (agentSpace?.name === target.name) {
        navigateToRoot();
        return;
      }
      await loadAgentSpaces();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      onBusyChange(false);
    }
  }, [agentSpace?.name, loadAgentSpaces, onBusyChange, onError]);

  const handleOpenAdmin = useCallback(() => {
    navigateToRoot();
  }, []);

  return {
    adminView,
    agentSpace,
    agentSpaces,
    handleCreateAgent,
    handleDeleteAgent,
    handleOpenAdmin,
    handleUpdateAgent,
    loadAgentSpaceFromPath,
    loadAgentSpaces,
    openAgent,
  };
}
