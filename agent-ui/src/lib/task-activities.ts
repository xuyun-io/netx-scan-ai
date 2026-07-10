import type { RecordEntry } from '@/lib/api';
import { prettyJson } from '@/lib/utils';

export interface TaskActivity {
  id: string;
  timestamp: string;
  title: string;
  subtitle: string;
  content?: string;
  request?: string;
  response?: string;
}

export function groupRecordsIntoActivities(records: RecordEntry[]) {
  const sorted = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const grouped = new Map<
    string,
    { call?: RecordEntry; result?: RecordEntry; loadSkill?: RecordEntry; loadTool?: RecordEntry }
  >();

  for (const record of sorted) {
    const toolUseId =
      record.toolCall?.toolUseId ??
      record.toolResult?.toolUseId ??
      record.loadSkill?.toolUseId ??
      record.loadTool?.toolUseId;
    if (!toolUseId) continue;
    const entry = grouped.get(toolUseId) ?? {};
    switch (record.recordType) {
      case 'TOOL_CALL':
        entry.call = record;
        break;
      case 'TOOL_RESULT':
        entry.result = record;
        break;
      case 'LOAD_SKILL':
        entry.loadSkill = record;
        break;
      case 'LOAD_TOOL':
        entry.loadTool = record;
        break;
    }
    grouped.set(toolUseId, entry);
  }

  const processed = new Set<string>();
  const activities: TaskActivity[] = [];

  for (const record of sorted) {
    const toolUseId =
      record.toolCall?.toolUseId ??
      record.toolResult?.toolUseId ??
      record.loadSkill?.toolUseId ??
      record.loadTool?.toolUseId;

    if (toolUseId && ['TOOL_CALL', 'TOOL_RESULT', 'LOAD_SKILL', 'LOAD_TOOL'].includes(record.recordType)) {
      if (processed.has(toolUseId)) continue;
      processed.add(toolUseId);
      const entry = grouped.get(toolUseId);
      if (!entry) continue;

      if (entry.call || entry.result) {
        const call = entry.call;
        const result = entry.result;
        const name =
          call?.toolCall?.action ||
          call?.toolCall?.toolName ||
          result?.toolResult?.action ||
          result?.toolResult?.skill ||
          'tool';
        activities.push({
          id: `tool-${toolUseId}`,
          timestamp: (call ?? result)!.createdAt,
          title: 'Called tool',
          subtitle: name,
          request: call?.toolCall?.input ? prettyJson(call.toolCall.input) : undefined,
          response: result?.toolResult?.output ? prettyJson(result.toolResult.output) : undefined,
        });
      } else if (entry.loadSkill) {
        const r = entry.loadSkill;
        activities.push({
          id: r.recordId,
          timestamp: r.createdAt,
          title: 'Loaded skill',
          subtitle: r.loadSkill?.skillName || '',
          request: r.loadSkill?.input ? prettyJson(r.loadSkill.input) : undefined,
          response: r.loadSkill?.output ? prettyJson(r.loadSkill.output) : undefined,
        });
      } else if (entry.loadTool) {
        const r = entry.loadTool;
        activities.push({
          id: r.recordId,
          timestamp: r.createdAt,
          title: 'Loaded tool',
          subtitle: r.loadTool?.toolName || '',
          request: r.loadTool?.input ? prettyJson(r.loadTool.input) : undefined,
          response: r.loadTool?.output ? prettyJson(r.loadTool.output) : undefined,
        });
      }
      continue;
    }

    if (record.recordType === 'RESPONSE') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Agent responded',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'STATUS') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: record.content || 'Status update',
        subtitle: '',
      });
    } else if (record.recordType === 'ERROR') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Error',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'THINKING') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Thinking',
        subtitle: '',
        content: record.content,
      });
    } else if (record.recordType === 'MEMORY_ACCESS') {
      activities.push({
        id: record.recordId,
        timestamp: record.createdAt,
        title: 'Memory access',
        subtitle: '',
        content: record.content,
      });
    }
  }

  return activities;
}
