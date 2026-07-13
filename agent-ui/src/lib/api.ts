export type Status = 'PENDING' | 'IN_PROGRESS' | 'AWAITING_INPUT' | 'COMPLETED' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

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
  agentSpaceName: string;
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
  agentSpaceName: string;
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
  rawResultRef?: string;
  toolUseId: string;
  skill?: string;
  action?: string;
  isError: boolean;
}

export interface LocalToolTrace {
  version: string;
  ref?: string;
  invocationId: string;
  functionCallId: string;
  toolName: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  error?: string;
  rawBytes: number;
  modelBytes?: number;
  createdAt: string;
}

export interface TraceScope {
  agentSpaceName: string;
  taskId?: string;
  sessionId?: string;
  conversationId?: string;
  turnId?: string;
  source?: string;
}

export interface ModelCallTrace {
  sequence: number;
  eventId?: string;
  model?: string;
  startedAt?: string;
  completedAt?: string;
  durationMillis?: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolUseInputTokens?: number;
  reasoningTokens: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  functionCallIds?: string[];
  timestamp: string;
}

export interface ToolTraceSummary extends Omit<LocalToolTrace, 'request' | 'response'> {
  skill?: string;
  action?: string;
  status?: string;
  modelBytes?: number;
  startedAt: string;
  completedAt: string;
  durationMillis: number;
  scope: TraceScope;
}

export interface InvocationSummary {
  version: string;
  scope: TraceScope;
  invocationId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMillis: number;
  modelCalls: ModelCallTrace[];
  modelCallCount: number;
  toolCallCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolUseInputTokens?: number;
  reasoningTokens: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  rawToolBytes: number;
  modelToolBytes: number;
}

export interface InvocationTrace {
  summary: InvocationSummary;
  tools: ToolTraceSummary[];
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
  agentSpaceName: string;
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
  agentSpaceName: string;
  name: string;
  description?: string;
  status: Status;
  priority: string;
  type: string;
  source: string;
  automationId?: string;
  instruction: string;
  requiresApproval: boolean;
  artifacts?: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type AutomationStatus = 'ACTIVE' | 'DISABLED';
export type AutomationFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

export interface AutomationSchedule {
  frequency: AutomationFrequency;
  interval: number;
  minute: number;
  hour: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timezone: string;
  cron?: string;
  summary?: string;
}

export interface Automation {
  automationId: string;
  agentSpaceName: string;
  name: string;
  description?: string;
  instruction: string;
  triggerType: 'schedule';
  status: AutomationStatus;
  enabled: boolean;
  schedule: AutomationSchedule;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact {
  artifactId: string;
  agentSpaceName: string;
  taskId?: string;
  name: string;
  type: string;
  size: number;
  version?: number;
  path: string;
  createdAt: string;
}

export interface DocumentFile {
  documentId: string;
  agentSpaceName: string;
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
  name: string;
  description?: string;
  llm?: LLMConfig;
  environment?: Record<string, string>;
  integrations?: Integrations;
}

export interface CreateAutomationInput {
  agentSpaceName: string;
  name: string;
  description?: string;
  instruction: string;
  schedule: AutomationSchedule;
}

export function listAgentSpaces() {
  return post<PageResponse<AgentSpace>>('/listAgentSpaces', {});
}

export function getAgentSpace(agentSpaceName: string) {
  return post<EntityResponse<AgentSpace>>('/getAgentSpace', { agentSpaceName });
}

export function createAgentSpace(input: CreateAgentSpaceInput) {
  return post<EntityResponse<AgentSpace>>('/createAgentSpace', input);
}

export function updateAgentSpace(input: UpdateAgentSpaceInput) {
  return post<EntityResponse<AgentSpace>>('/updateAgentSpace', input);
}

export function deleteAgentSpace(agentSpaceName: string) {
  return post<EntityResponse<{ agentSpaceName: string }>>('/deleteAgentSpace', {
    agentSpaceName,
  });
}

export function listConversations(agentSpaceName: string, maxResults = 20) {
  return post<PageResponse<Conversation>>('/listConversations', {
    agentSpaceName,
    maxResults,
  });
}

export function createConversation(agentSpaceName: string, title: string) {
  return post<EntityResponse<Conversation>>('/createConversation', {
    agentSpaceName,
    title,
  });
}

export function getConversation(agentSpaceName: string, conversationId: string) {
  return post<EntityResponse<Conversation> & { turns?: Turn[] }>('/getConversation', {
    agentSpaceName,
    conversationId,
  });
}

export function deleteConversation(agentSpaceName: string, conversationId: string) {
  return post<EntityResponse<{ conversationId: string }>>('/deleteConversation', {
    agentSpaceName,
    conversationId,
  });
}

export function createTurn(agentSpaceName: string, conversationId: string, prompt: string) {
  return post<TurnResponse>('/createTurn', {
    agentSpaceName,
    conversationId,
    prompt,
  });
}

export function getTurn(agentSpaceName: string, conversationId: string, turnId: string) {
  return post<TurnResponse>('/getTurn', {
    agentSpaceName,
    conversationId,
    turnId,
  });
}

export function listTasks(agentSpaceName: string) {
  return post<PageResponse<Task>>('/listTasks', {
    agentSpaceName,
    maxResults: 100,
  });
}

export function createTask(agentSpaceName: string, instruction: string, priority = 'normal') {
  return post<EntityResponse<Task>>('/createTask', {
    agentSpaceName,
    instruction,
    priority,
    type: 'diagnosis',
    source: 'automation_once',
  });
}

export function getTask(agentSpaceName: string, taskId: string) {
  return post<EntityResponse<Task>>('/getTask', {
    agentSpaceName,
    taskId,
  });
}

export function deleteTask(agentSpaceName: string, taskId: string) {
  return post<EntityResponse<{ taskId: string }>>('/deleteTask', {
    agentSpaceName,
    taskId,
  });
}

export function respondToTask(agentSpaceName: string, taskId: string, response: 'approve' | 'reject') {
  return post<EntityResponse<Task>>('/respondToTask', {
    agentSpaceName,
    taskId,
    response,
    userId: 'web-ui',
  });
}

export function cancelTask(agentSpaceName: string, taskId: string) {
  return post<EntityResponse<Task>>('/cancelTask', {
    agentSpaceName,
    taskId,
  });
}

export function listAutomations(agentSpaceName: string) {
  return post<PageResponse<Automation>>('/listAutomations', {
    agentSpaceName,
    maxResults: 100,
  });
}

export function createAutomation(input: CreateAutomationInput) {
  return post<EntityResponse<Automation>>('/createAutomation', input);
}

export function getAutomation(agentSpaceName: string, automationId: string) {
  return post<EntityResponse<Automation>>('/getAutomation', {
    agentSpaceName,
    automationId,
  });
}

export function updateAutomationEnabled(agentSpaceName: string, automationId: string, enabled: boolean) {
  return post<EntityResponse<Automation>>('/updateAutomation', {
    agentSpaceName,
    automationId,
    enabled,
  });
}

export function updateAutomation(
  agentSpaceName: string,
  automationId: string,
  input: { name?: string; description?: string; instruction?: string; schedule?: AutomationSchedule },
) {
  return post<EntityResponse<Automation>>('/updateAutomation', {
    agentSpaceName,
    automationId,
    ...input,
  });
}

export function deleteAutomation(agentSpaceName: string, automationId: string) {
  return post<{ success: boolean }>('/deleteAutomation', {
    agentSpaceName,
    automationId,
  });
}

export function triggerAutomation(agentSpaceName: string, automationId: string) {
  return post<EntityResponse<Task>>('/triggerAutomation', {
    agentSpaceName,
    automationId,
  });
}

export function listRecords(input: {
  agentSpaceName: string;
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

export function getLocalToolTrace(agentSpaceName: string, ref: string) {
  return post<{ trace: LocalToolTrace }>('/getLocalToolTrace', {
    agentSpaceName,
    ref,
  });
}

export function findInvocationTraces(input: {
  agentSpaceName: string;
  taskId?: string;
  conversationId?: string;
  turnId?: string;
}) {
  return post<{ traces: InvocationTrace[] }>('/findInvocationTraces', input);
}

export function listArtifacts(agentSpaceName: string) {
  return post<PageResponse<Artifact>>('/listArtifacts', {
    agentSpaceName,
    maxResults: 100,
  });
}

export function getArtifact(agentSpaceName: string, artifactId: string) {
  return post<{ entity: Artifact; content: string }>('/getArtifact', {
    agentSpaceName,
    artifactId,
  });
}

export function deleteArtifact(agentSpaceName: string, artifactId: string) {
  return post<EntityResponse<{ artifactId: string }>>('/deleteArtifact', {
    agentSpaceName,
    artifactId,
  });
}

export function listDocuments(agentSpaceName: string) {
  return post<PageResponse<DocumentFile>>('/listDocuments', {
    agentSpaceName,
    maxResults: 100,
  });
}

export async function createDocument(agentSpaceName: string, file: File) {
  const contentBase64 = await fileToBase64(file);
  return post<EntityResponse<DocumentFile>>('/createDocument', {
    agentSpaceName,
    name: file.name,
    contentType: file.type || 'application/octet-stream',
    contentBase64,
  });
}

import { getAuthHeader } from './auth';

const API_PREFIX = '/api/v1';

function buildHeaders(): Record<string, string> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = getAuthHeader();
  if (auth) {
    base.Authorization = auth;
  }
  return base;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
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
