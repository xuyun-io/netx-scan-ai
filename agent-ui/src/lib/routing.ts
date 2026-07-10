export function setHash(hash: string) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

export type WorkspaceRouteView = 'chat' | 'tasks' | 'automations' | 'artifacts' | 'context-files';
export type WorkspaceCreateMode = 'none' | 'task' | 'automation';

export interface WorkspaceHashRoute {
  view: WorkspaceRouteView;
  createMode: WorkspaceCreateMode;
  viewingAutomationId: string | null;
  viewingArtifactId: string | null;
  viewingTaskId: string | null;
}

export function parseWorkspaceHash(hash = window.location.hash || '#/chat'): WorkspaceHashRoute {
  if (hash.startsWith('#/task/create')) {
    const [, query = ''] = hash.split('?');
    const params = new URLSearchParams(query);
    const schedule = params.get('mode') === 'schedule';
    return {
      view: schedule ? 'automations' : 'tasks',
      createMode: schedule ? 'automation' : 'task',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  if (hash.startsWith('#/automations/') || hash.startsWith('#/automation/')) {
    return {
      view: 'automations',
      createMode: 'none',
      viewingAutomationId: decodeHashId(hash, ['#/automations/', '#/automation/']),
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  if (hash === '#/tasks') {
    return {
      view: 'tasks',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  if (hash.startsWith('#/tasks/') || hash.startsWith('#/task/')) {
    return {
      view: 'tasks',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: decodeHashId(hash, ['#/tasks/', '#/task/']),
    };
  }

  if (hash === '#/automations') {
    return {
      view: 'automations',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  if (hash === '#/artifacts' || hash === '#/artifact') {
    return {
      view: 'artifacts',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  if (hash.startsWith('#/artifact/')) {
    return {
      view: 'artifacts',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: decodeHashId(hash, ['#/artifact/']),
      viewingTaskId: null,
    };
  }

  if (hash === '#/context-files') {
    return {
      view: 'context-files',
      createMode: 'none',
      viewingAutomationId: null,
      viewingArtifactId: null,
      viewingTaskId: null,
    };
  }

  return {
    view: 'chat',
    createMode: 'none',
    viewingAutomationId: null,
    viewingArtifactId: null,
    viewingTaskId: null,
  };
}

export function workspaceViewHash(view: WorkspaceRouteView) {
  return `#/${view}`;
}

export function workspaceCreateHash(mode: Exclude<WorkspaceCreateMode, 'none'>) {
  return mode === 'task' ? '#/task/create' : '#/task/create?mode=schedule';
}

export function workspaceTaskHash(taskId: string) {
  return `#/task/${encodeURIComponent(taskId)}`;
}

export function workspaceAutomationHash(automationId: string) {
  return `#/automation/${encodeURIComponent(automationId)}`;
}

export function workspaceArtifactHash(artifactId: string) {
  return `#/artifact/${encodeURIComponent(artifactId)}`;
}

export function parseAgentSpaceNameFromPath(): string | null {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (!path || path === '') return null;
  return path;
}

export function navigateToAgent(agentSpaceName: string, hash = '#/chat') {
  const target = `/${agentSpaceName}${hash}`;
  if (window.location.pathname !== `/${agentSpaceName}` || window.location.hash !== hash) {
    window.location.assign(target);
  }
}

export function navigateToRoot() {
  if (window.location.pathname !== '/') {
    window.location.assign('/');
  }
}

function decodeHashId(hash: string, prefixes: string[]) {
  const prefix = prefixes.find((candidate) => hash.startsWith(candidate));
  if (!prefix) return null;
  const rawId = hash.replace(prefix, '').split('?')[0];
  return rawId ? decodeURIComponent(rawId) : null;
}
