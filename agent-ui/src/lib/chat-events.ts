import {
  getTask,
  getTurn,
  listArtifacts,
  listRecords,
  type Artifact,
  type RecordEntry,
  type SkillOutput,
  type Status,
  type Task,
  type Turn,
} from '@/lib/api';

export type ChatEvent =
  | { id: string; type: 'user'; content: string; createdAt?: string }
  | { id: string; type: 'status'; content: string; state: 'running' | 'complete' | 'error'; createdAt?: string }
  | {
      id: string;
      type: 'tool';
      kind: 'tool' | 'skill' | 'resource';
      name: string;
      status: 'called' | 'result' | 'error';
      request?: string;
      rawResponse?: string;
      output?: SkillOutput;
      skill?: string;
      action?: string;
      createdAt?: string;
    }
  | { id: string; type: 'task'; taskId: string; title: string; status: Status; description?: string; createdAt?: string }
  | { id: string; type: 'approval'; taskId: string; title: string; risk: string; target: string; command: string; status: Status }
  | { id: string; type: 'artifact'; artifactId: string; name: string; artifactType: string; createdAt?: string }
  | { id: string; type: 'answer'; content: string; taskId?: string; status: Status; createdAt?: string; agentSpaceName?: string; conversationId?: string; turnId?: string };

export type TimelineItem =
  | { id: string; kind: 'event'; event: ChatEvent }
  | { id: string; kind: 'assistant'; scopeKey: string; events: ChatEvent[] };

const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

export function buildTimelineItems(events: ChatEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const event of events) {
    const scopeKey = event.type === 'user' ? '' : scopeFromEventId(event.id);
    if (!scopeKey) {
      items.push({ id: event.id, kind: 'event', event });
      continue;
    }
    const last = items[items.length - 1];
    if (last?.kind === 'assistant' && last.scopeKey === scopeKey) {
      last.events.push(event);
      continue;
    }
    items.push({ id: scopeKey, kind: 'assistant', scopeKey, events: [event] });
  }
  return items;
}

export async function turnsToChatEvents(agentSpaceName: string, turns: Turn[]): Promise<ChatEvent[]> {
  const allEvents: ChatEvent[] = [];
  for (const turn of turns) {
    const scopeKey = turnScope(turn.turnId);
    const events: ChatEvent[] = [
      {
        id: `${turn.turnId}-user`,
        type: 'user',
        content: turn.prompt,
        createdAt: turn.createdAt,
      },
    ];
    try {
      const recordPage = await listRecords({
        agentSpaceName,
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        maxResults: 100,
      });
      events.push(...recordsToChatEvents(recordPage.records ?? [], { scopeKey, traceScope: { agentSpaceName, conversationId: turn.conversationId, turnId: turn.turnId } }));
    } catch {
      events.push({
        id: scopedEventId(scopeKey, `${turn.turnId}-record-load-error`),
        type: 'status',
        content: `无法加载会话记录：${turn.turnId}`,
        state: 'error',
        createdAt: turn.updatedAt,
      });
    }
    if (turn.taskId) {
      try {
        const [task, recordPage, artifactPage] = await Promise.all([
          getTask(agentSpaceName, turn.taskId),
          listRecords({ agentSpaceName, taskId: turn.taskId, maxResults: 100 }),
          listArtifacts(agentSpaceName),
        ]);
        events.push(...recordsToChatEvents(recordPage.records ?? [], { scopeKey }));
        events.push(taskToChatEvent(task.entity, scopeKey));
        if (task.entity.status === 'AWAITING_INPUT') {
          events.push(taskToApprovalEvent(task.entity, scopeKey));
        }
        events.push(...artifactsToChatEvents((artifactPage.entities ?? []).filter((artifact) => artifact.taskId === turn.taskId), scopeKey));
      } catch {
        events.push({
          id: scopedEventId(scopeKey, `${turn.turnId}-task-load-error`),
          type: 'status',
          content: `无法加载任务记录：${turn.taskId}`,
          state: 'error',
          createdAt: turn.updatedAt,
        });
      }
    }
    if (!events.some((event) => event.type === 'answer') && (turn.output?.text || turn.status === 'FAILED')) {
      const answerEvent = turnToAnswerEvent(turn, scopeKey);
      if (answerEvent.content) {
        events.push(answerEvent);
      }
    } else if (!isTurnDone(turn) && !events.some((event) => event.type === 'status' && event.state === 'running')) {
      events.push({
        id: scopedEventId(scopeKey, `${turn.turnId}-status`),
        type: 'status',
        content: 'Thinking...',
        state: 'running',
        createdAt: turn.updatedAt,
      });
    }
    allEvents.push(...events);
  }
  return allEvents;
}

export function recordsToChatEvents(records: RecordEntry[], options: { scopeKey?: string; traceScope?: { agentSpaceName: string; conversationId?: string; turnId?: string } } = {}): ChatEvent[] {
  const events: ChatEvent[] = [];
  const processById = new Map<string, Extract<ChatEvent, { type: 'tool' }>>();

  for (const record of records) {
    if (record.recordType === 'TOOL_CALL' && record.toolCall) {
      const id = scopedEventId(options.scopeKey, `tool-${record.toolCall.toolUseId || record.recordId}`);
      const existing = processById.get(id);
      if (existing) {
        existing.name = record.toolCall.toolName || existing.name;
        existing.request = existing.request || prettyPayload(record.toolCall.input);
        existing.skill = existing.skill || record.toolCall.skill;
        existing.action = existing.action || record.toolCall.action;
        continue;
      }
      const event: Extract<ChatEvent, { type: 'tool' }> = {
        id,
        type: 'tool',
        kind: 'tool',
        name: record.toolCall.toolName || 'tool',
        status: 'called',
        request: prettyPayload(record.toolCall.input),
        skill: record.toolCall.skill,
        action: record.toolCall.action,
        createdAt: record.createdAt,
      };
      processById.set(id, event);
      events.push(event);
      continue;
    }

    if (record.recordType === 'TOOL_RESULT' && record.toolResult) {
      const id = scopedEventId(options.scopeKey, `tool-${record.toolResult.toolUseId || record.recordId}`);
      const output = parseSkillOutput(record.toolResult.output);
      const resultStatus: Extract<ChatEvent, { type: 'tool' }>['status'] =
        record.toolResult.isError || output?.status === 'error' ? 'error' : 'result';
      const event = processById.get(id);
      if (event) {
        event.status = resultStatus;
        event.rawResponse = record.toolResult.output;
        event.output = output;
        event.skill = event.skill || record.toolResult.skill;
        event.action = event.action || record.toolResult.action;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'tool',
          name: record.toolResult.action || 'tool',
          status: resultStatus,
          rawResponse: record.toolResult.output,
          output,
          skill: record.toolResult.skill,
          action: record.toolResult.action,
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'LOAD_SKILL' && record.loadSkill) {
      const id = scopedEventId(options.scopeKey, `skill-${record.loadSkill.toolUseId || record.recordId}`);
      const event = processById.get(id);
      if (event) {
        event.status = record.loadSkill.output ? 'result' : event.status;
        event.rawResponse = event.rawResponse || record.loadSkill.output;
        event.skill = event.skill || record.loadSkill.skillName;
        event.name = record.loadSkill.skillName || event.name;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'skill',
          name: record.loadSkill.skillName || 'skill',
          status: record.loadSkill.output ? 'result' : 'called',
          request: prettyPayload(record.loadSkill.input),
          rawResponse: record.loadSkill.output,
          skill: record.loadSkill.skillName,
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'LOAD_TOOL' && record.loadTool) {
      const id = scopedEventId(options.scopeKey, `load-tool-${record.loadTool.toolUseId || record.recordId}`);
      const event = processById.get(id);
      if (event) {
        event.status = record.loadTool.output ? 'result' : event.status;
        event.rawResponse = event.rawResponse || record.loadTool.output;
      } else {
        const nextEvent: Extract<ChatEvent, { type: 'tool' }> = {
          id,
          type: 'tool',
          kind: 'resource',
          name: record.loadTool.toolName || 'resource',
          status: record.loadTool.output ? 'result' : 'called',
          request: prettyPayload(record.loadTool.input),
          rawResponse: record.loadTool.output,
          createdAt: record.createdAt,
        };
        processById.set(id, nextEvent);
        events.push(nextEvent);
      }
      continue;
    }

    if (record.recordType === 'ERROR') {
      events.push({
        id: scopedEventId(options.scopeKey, record.recordId),
        type: 'status',
        content: record.content || '执行失败',
        state: 'error',
        createdAt: record.createdAt,
      });
      continue;
    }

    if (record.recordType === 'RESPONSE') {
      const content = cleanAnswerContent(record.content);
      if (!content) {
        continue;
      }
      events.push({
        id: scopedEventId(options.scopeKey, `${record.recordId}-answer`),
        type: 'answer',
        content,
        status: 'SUCCESS',
        createdAt: record.createdAt,
		agentSpaceName: options.traceScope?.agentSpaceName,
		conversationId: options.traceScope?.conversationId,
		turnId: options.traceScope?.turnId,
      });
      continue;
    }

    const content = hasToolDetailMarkup(record.content) ? '' : record.content || statusLabelForRecord(record.recordType);
    if (!content) {
      continue;
    }
    events.push({
      id: scopedEventId(options.scopeKey, record.recordId),
      type: 'status',
      content,
      state: 'complete',
      createdAt: record.createdAt,
    });
  }

  return events;
}

export function taskToChatEvent(task: Task, scopeKey?: string): ChatEvent {
  return {
    id: scopedEventId(scopeKey, `${task.taskId}-task-card`),
    type: 'task',
    taskId: task.taskId,
    title: task.name || 'NetX SRE Task',
    status: task.status,
    description: task.description || task.instruction,
    createdAt: task.createdAt,
  };
}

export function taskToApprovalEvent(task: Task, scopeKey?: string): ChatEvent {
  return {
    id: scopedEventId(scopeKey, `${task.taskId}-approval-card`),
    type: 'approval',
    taskId: task.taskId,
    title: task.name || '高风险操作审批',
    risk: 'High',
    target: 'NetX Chain287 / AgentSpace scope',
    command: task.instruction,
    status: task.status,
  };
}

export function artifactsToChatEvents(artifacts: Artifact[], scopeKey?: string): ChatEvent[] {
  return artifacts.map((artifact) => ({
    id: scopedEventId(scopeKey, `${artifact.artifactId}-artifact-card`),
    type: 'artifact',
    artifactId: artifact.artifactId,
    name: artifact.name,
    artifactType: artifact.type,
    createdAt: artifact.createdAt,
  }));
}

export function turnToAnswerEvent(turn: Turn, scopeKey?: string): Extract<ChatEvent, { type: 'answer' }> {
  return {
    id: scopedEventId(scopeKey, `${turn.turnId}-answer`),
    type: 'answer',
    content: cleanAnswerContent(turn.output?.text || turn.statusReason),
    taskId: turn.taskId,
    status: turn.status,
    createdAt: turn.completedAt || turn.updatedAt,
	agentSpaceName: turn.agentSpaceName,
	conversationId: turn.conversationId,
	turnId: turn.turnId,
  };
}

export function turnScope(turnId: string) {
  return `turn-${turnId}`;
}

export function scopedEventId(scopeKey: string | undefined, id: string) {
  return scopeKey ? `${scopeKey}:${id}` : id;
}

export function replaceEvent(events: ChatEvent[], targetId: string, replacement: ChatEvent[]) {
  const index = events.findIndex((event) => event.id === targetId);
  if (index < 0) return [...events, ...replacement];
  return [...events.slice(0, index), ...replacement, ...events.slice(index + 1)];
}

export function replaceScopedEvents(events: ChatEvent[], placeholderId: string, scopeKey: string, replacement: ChatEvent[]) {
  const isTarget = (event: ChatEvent) => event.id === placeholderId || event.id.startsWith(`${scopeKey}:`);
  const anchorIndex = events.findIndex(isTarget);
  if (anchorIndex < 0) return [...events, ...replacement];
  const before = events.slice(0, anchorIndex).filter((event) => !isTarget(event));
  const after = events.slice(anchorIndex + 1).filter((event) => !isTarget(event));
  return [...before, ...replacement, ...after];
}

export function updateTaskEvents(events: ChatEvent[], task: Task) {
  return events.map((event) => {
    if (event.type === 'task' && event.taskId === task.taskId) {
      return { ...event, status: task.status, title: task.name || event.title, description: task.description || task.instruction };
    }
    if (event.type === 'approval' && event.taskId === task.taskId) {
      return { ...event, status: task.status };
    }
    return event;
  });
}

export function titleFromPrompt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '新的会话';
  const runes = Array.from(trimmed);
  return runes.length > 34 ? `${runes.slice(0, 34).join('')}...` : trimmed;
}

export function isTurnDone(turn: Turn) {
  return turn.status === 'SUCCESS' || turn.status === 'COMPLETED' || turn.status === 'FAILED';
}

export async function pollTurnRecords({
  agentSpaceName,
  conversationId,
  turnId,
  onUpdate,
}: {
  agentSpaceName: string;
  conversationId: string;
  turnId: string;
  onUpdate: (turn: Turn, records: RecordEntry[]) => void;
}) {
  let latestTurn: Turn | null = null;
  let latestRecords: RecordEntry[] = [];
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [turnPage, recordPage] = await Promise.all([
      getTurn(agentSpaceName, conversationId, turnId),
      listRecords({ agentSpaceName, conversationId, turnId, maxResults: 100 }),
    ]);
    latestTurn = turnPage.turn;
    latestRecords = recordPage.records ?? [];
    onUpdate(latestTurn, latestRecords);
    if (isTurnDone(latestTurn)) {
      return latestTurn;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (latestTurn) {
    onUpdate(latestTurn, latestRecords);
  }
  throw new Error('Turn polling timed out');
}

export function inProgressLabel(records: RecordEntry[]) {
  const last = records[records.length - 1];
  if (!last) return 'Thinking...';
  if (last.recordType === 'TOOL_CALL') return 'Waiting for tool result...';
  if (last.recordType === 'LOAD_SKILL') return 'Preparing skill context...';
  if (last.recordType === 'LOAD_TOOL') return 'Loading supporting context...';
  if (last.recordType === 'TOOL_RESULT') return 'Working on the answer...';
  return 'Thinking...';
}

export function prettyPayload(value?: string) {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function scopeFromEventId(id: string) {
  const index = id.indexOf(':');
  if (index <= 0) return '';
  const scopeKey = id.slice(0, index);
  return scopeKey.startsWith('turn-') ? scopeKey : '';
}

function parseSkillOutput(response?: string): SkillOutput | undefined {
  if (!response) return undefined;
  try {
    const parsed = JSON.parse(response) as { output?: SkillOutput };
    const output = parsed.output;
    if (output && typeof output.version === 'string' && typeof output.status === 'string' && typeof output.message === 'string') {
      return output;
    }
  } catch {
    // Not a skill action response or invalid envelope.
  }
  return undefined;
}

function cleanAnswerContent(value?: string) {
  if (!value) return '';
  let cleaned = value
    .replace(/<details\b[^>]*>\s*<summary>\s*tool_code\s*<\/summary>[\s\S]*?(?:<\/details>|$)/gi, '')
    .replace(/<details\b[^>]*>\s*<summary>\s*tool_result\s*<\/summary>[\s\S]*?(?:<\/details>|$)/gi, '');
  if (!/<details\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/<\/details>/gi, '');
  }
  return cleaned.trim();
}

function hasToolDetailMarkup(value?: string) {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower.includes('<details') && (lower.includes('tool_code') || lower.includes('tool_result'));
}

function statusLabelForRecord(recordType: RecordEntry['recordType']) {
  const labels: Record<RecordEntry['recordType'], string> = {
    RESPONSE: 'Response ready',
    TOOL_CALL: 'Tool called',
    TOOL_RESULT: 'Tool result received',
    MEMORY_ACCESS: 'Memory accessed',
    LOAD_SKILL: 'Skill loaded',
    LOAD_TOOL: 'Tool context loaded',
    THINKING: 'Thinking...',
    STATUS: 'Status updated',
    ERROR: 'Error',
  };
  return labels[recordType];
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
