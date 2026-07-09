export function setHash(hash: string) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
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
