import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseWorkspaceHash,
  setHash,
  workspaceArtifactHash,
  workspaceAutomationHash,
  workspaceCreateHash,
  workspaceTaskHash,
  workspaceViewHash,
  type WorkspaceCreateMode,
  type WorkspaceHashRoute,
  type WorkspaceRouteView,
} from '@/lib/routing';

export type ResourceView = Exclude<WorkspaceRouteView, 'chat'>;

export function useWorkspaceRoute() {
  const [route, setRoute] = useState<WorkspaceHashRoute>(() => parseWorkspaceHash());
  const routeRef = useRef(route);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const applyHashRoute = useCallback(() => {
    setRoute(parseWorkspaceHash());
  }, []);

  useEffect(() => {
    applyHashRoute();
    window.addEventListener('hashchange', applyHashRoute);
    return () => window.removeEventListener('hashchange', applyHashRoute);
  }, [applyHashRoute]);

  const navigateToHash = useCallback((hash: string) => {
    setRoute(parseWorkspaceHash(hash));
    setHash(hash);
  }, []);

  const selectView = useCallback((view: WorkspaceRouteView) => {
    navigateToHash(workspaceViewHash(view));
  }, [navigateToHash]);

  const startCreate = useCallback((mode: Exclude<WorkspaceCreateMode, 'none'>) => {
    navigateToHash(workspaceCreateHash(mode));
  }, [navigateToHash]);

  const cancelCreate = useCallback(() => {
    navigateToHash(route.view === 'automations' ? '#/automations' : '#/tasks');
  }, [navigateToHash, route.view]);

  const openFullChat = useCallback(() => {
    navigateToHash('#/chat');
  }, [navigateToHash]);

  const openTasks = useCallback(() => {
    navigateToHash('#/tasks');
  }, [navigateToHash]);

  const openTaskDetail = useCallback((taskId: string) => {
    navigateToHash(workspaceTaskHash(taskId));
  }, [navigateToHash]);

  const closeTaskDetail = useCallback(() => {
    navigateToHash('#/tasks');
  }, [navigateToHash]);

  const openAutomationDetail = useCallback((automationId: string) => {
    navigateToHash(workspaceAutomationHash(automationId));
  }, [navigateToHash]);

  const closeAutomationDetail = useCallback(() => {
    navigateToHash('#/automations');
  }, [navigateToHash]);

  const openArtifactDetail = useCallback((artifactId: string) => {
    navigateToHash(workspaceArtifactHash(artifactId));
  }, [navigateToHash]);

  const closeArtifactDetail = useCallback(() => {
    navigateToHash('#/artifacts');
  }, [navigateToHash]);

  const isChatRoute = useCallback(() => routeRef.current.view === 'chat', []);

  const resourceView = useMemo(
    () => (route.view === 'chat' ? 'tasks' : route.view),
    [route.view],
  );

  return {
    activeView: route.view,
    createMode: route.createMode,
    resourceView,
    viewingAutomationId: route.viewingAutomationId,
    viewingArtifactId: route.viewingArtifactId,
    viewingTaskId: route.viewingTaskId,
    applyHashRoute,
    cancelCreate,
    closeArtifactDetail,
    closeAutomationDetail,
    closeTaskDetail,
    openArtifactDetail,
    openAutomationDetail,
    openFullChat,
    openTaskDetail,
    openTasks,
    isChatRoute,
    selectView,
    startCreate,
  };
}
