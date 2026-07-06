export type Status = 'PENDING' | 'IN_PROGRESS' | 'AWAITING_INPUT' | 'COMPLETED' | 'SUCCESS' | 'FAILED';

export type SkillOutputStatus = 'ok' | 'error' | 'partial' | 'pending';

export interface SkillOutputError {
  code: string;
  detail?: string;
}

export interface SkillOutputDisplay {
  format?: string;
  title?: string;
  unit?: string;
  collapsed?: boolean;
}

export interface SkillOutputMetadata {
  skill?: string;
  action?: string;
  version?: string;
  timestamp?: string;
  source?: string;
  readonly?: boolean;
  durationMs?: number;
}

export interface SkillOutput {
  version: string;
  status: SkillOutputStatus;
  message: string;
  data?: Record<string, unknown>;
  error?: SkillOutputError;
  display?: SkillOutputDisplay;
  metadata?: SkillOutputMetadata;
}

export interface AgentSpace {
  agentSpaceId: string;
  name: string;
  description?: string;
  llm?: LLMConfig;
  environment?: Record<string, string>;
  integrations?: Integrations;
  createdAt?: string;
  updatedAt?: string;
}

export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface Integrations {
  wecom?: WeComConfig;
}

export interface WeComConfig {
  enabled: boolean;
  webhookUrl?: string;
}

export interface Conversation {
  conversationId: string;
  agentSpaceId: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TurnOutput {
  artifactIds: string[];
  text: string;
}

export interface Turn {
  turnId: string;
  conversationId: string;
  agentSpaceId: string;
  status: Status;
  statusReason?: string;
  prompt: string;
  documentIds?: string[];
  output?: TurnOutput | null;
  pendingAgentRequests?: unknown;
  taskId?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export type RecordType = 'RESPONSE' | 'TOOL_CALL' | 'TOOL_RESULT' | 'MEMORY_ACCESS' | 'LOAD_SKILL' | 'LOAD_TOOL' | 'THINKING' | 'STATUS' | 'ERROR';

export interface ToolCallRecord {
  input: string;
  toolName: string;
  toolUseId: string;
  skill?: string;
  action?: string;
}

export interface ToolResultRecord {
  output: string;
  toolUseId: string;
  skill?: string;
  action?: string;
  isError: boolean;
}

export interface LoadSkillRecord {
  skillName: string;
  input?: string;
  output?: string;
  toolUseId?: string;
}

export interface LoadToolRecord {
  toolName: string;
  input?: string;
  output?: string;
  toolUseId?: string;
}

export interface RecordEntry {
  recordId: string;
  agentSpaceId: string;
  taskId?: string;
  conversationId?: string;
  turnId?: string;
  recordType: RecordType;
  content?: string;
  modelId?: string;
  toolCall?: ToolCallRecord | null;
  toolResult?: ToolResultRecord | null;
  loadSkill?: LoadSkillRecord | null;
  loadTool?: LoadToolRecord | null;
  createdAt: string;
}

export interface Task {
  taskId: string;
  agentSpaceId: string;
  name: string;
  description?: string;
  status: Status;
  priority: string;
  type: string;
  source: string;
  instruction: string;
  requiresApproval: boolean;
  artifacts?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Artifact {
  artifactId: string;
  agentSpaceId: string;
  taskId?: string;
  name: string;
  type: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface DocumentFile {
  documentId: string;
  agentSpaceId: string;
  name: string;
  contentType?: string;
  size: number;
  status: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface EntityResponse<T> {
  entity: T;
}

export interface TurnResponse {
  turn: Turn;
}

export interface PageResponse<T> {
  entities: T[] | null;
  nextToken?: string;
}

export interface RecordsResponse {
  records: RecordEntry[] | null;
  nextToken?: string | null;
}

export interface CreateAgentSpaceInput {
  name: string;
  description?: string;
  llm: LLMConfig;
  environment?: Record<string, string>;
  integrations?: Integrations;
}

export interface UpdateAgentSpaceInput {
  agentSpaceId: string;
  name?: string;
  description?: string;
  llm?: LLMConfig;
  environment?: Record<string, string>;
  integrations?: Integrations;
}

export function listAgentSpaces() {
  return post<PageResponse<AgentSpace>>('/listAgentSpaces', {});
}

export function createAgentSpace(input: CreateAgentSpaceInput) {
  return post<EntityResponse<AgentSpace>>('/createAgentSpace', input);
}

export function updateAgentSpace(input: UpdateAgentSpaceInput) {
  return post<EntityResponse<AgentSpace>>('/updateAgentSpace', input);
}

export function deleteAgentSpace(agentSpaceId: string) {
  return post<EntityResponse<{ agentSpaceId: string }>>('/deleteAgentSpace', {
    agentSpaceId,
  });
}

export function listConversations(agentSpaceId: string, maxResults = 20) {
  return post<PageResponse<Conversation>>('/listConversations', {
    agentSpaceId,
    maxResults,
  });
}

export function createConversation(agentSpaceId: string, title: string) {
  return post<EntityResponse<Conversation>>('/createConversation', {
    agentSpaceId,
    title,
  });
}

export function getConversation(agentSpaceId: string, conversationId: string) {
  return post<EntityResponse<Conversation> & { turns?: Turn[] }>('/getConversation', {
    agentSpaceId,
    conversationId,
  });
}

export function deleteConversation(agentSpaceId: string, conversationId: string) {
  return post<EntityResponse<{ conversationId: string }>>('/deleteConversation', {
    agentSpaceId,
    conversationId,
  });
}

export function createTurn(agentSpaceId: string, conversationId: string, prompt: string) {
  return post<TurnResponse>('/createTurn', {
    agentSpaceId,
    conversationId,
    prompt,
  });
}

export function getTurn(agentSpaceId: string, conversationId: string, turnId: string) {
  return post<TurnResponse>('/getTurn', {
    agentSpaceId,
    conversationId,
    turnId,
  });
}

export function listTasks(agentSpaceId: string) {
  return post<PageResponse<Task>>('/listTasks', {
    agentSpaceId,
    maxResults: 100,
  });
}

export function createTask(agentSpaceId: string, instruction: string, priority: string) {
  return post<EntityResponse<Task>>('/createTask', {
    agentSpaceId,
    instruction,
    priority,
    type: 'diagnosis',
  });
}

export function getTask(agentSpaceId: string, taskId: string) {
  return post<EntityResponse<Task>>('/getTask', {
    agentSpaceId,
    taskId,
  });
}

export function respondToTask(agentSpaceId: string, taskId: string, response: 'approve' | 'reject') {
  return post<EntityResponse<Task>>('/respondToTask', {
    agentSpaceId,
    taskId,
    response,
    userId: 'web-ui',
  });
}

export function listRecords(input: {
  agentSpaceId: string;
  taskId?: string;
  conversationId?: string;
  turnId?: string;
  maxResults?: number;
}) {
  return post<RecordsResponse>('/listRecords', {
    maxResults: 100,
    ...input,
  });
}

export function listArtifacts(agentSpaceId: string) {
  return post<PageResponse<Artifact>>('/listArtifacts', {
    agentSpaceId,
    maxResults: 100,
  });
}

export function listDocuments(agentSpaceId: string) {
  return post<PageResponse<DocumentFile>>('/listDocuments', {
    agentSpaceId,
    maxResults: 100,
  });
}

export async function createDocument(agentSpaceId: string, file: File) {
  const contentBase64 = await fileToBase64(file);
  return post<EntityResponse<DocumentFile>>('/createDocument', {
    agentSpaceId,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64,
  });
}

const API_PREFIX = '/api/v1';

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}
