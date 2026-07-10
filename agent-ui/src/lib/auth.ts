const STORAGE_KEY = 'netx-auth';

export interface AuthState {
  username: string;
  password: string;
  authEnabled: boolean;
}

export interface LoginResult {
  authenticated: boolean;
  authEnabled: boolean;
}

export function getStoredAuth(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: AuthState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getAuthHeader(): string | undefined {
  const auth = getStoredAuth();
  if (!auth) return undefined;
  return `Basic ${btoa(`${auth.username}:${auth.password}`)}`;
}

export async function checkAuth(): Promise<LoginResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = getAuthHeader();
  if (auth) {
    headers.Authorization = auth;
  }
  const response = await fetch('/api/v1/login', {
    method: 'POST',
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as LoginResult;
  if (response.ok && !payload.authEnabled) {
    return { authenticated: true, authEnabled: false };
  }
  if (response.status === 401) {
    clearStoredAuth();
    return { authenticated: false, authEnabled: true };
  }
  return { authenticated: response.ok, authEnabled: payload.authEnabled ?? true };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const response = await fetch('/api/v1/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as LoginResult;
  if (!response.ok) {
    throw new Error(payload?.authenticated === false ? '用户名或密码错误' : '登录失败，请重试');
  }
  setStoredAuth({ username, password, authEnabled: payload.authEnabled ?? true });
  return payload;
}

export function logout(): void {
  clearStoredAuth();
}
