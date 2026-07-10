import { getTask, type Status, type Task } from '@/lib/api';
import { humanizeToken } from '@/lib/utils';

const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1_000;

export function formatTaskRunType(task: Task) {
  switch (task.source) {
    case 'automation_schedule':
      return 'Scheduled';
    case 'automation_event':
      return 'Event';
    case 'automation_once':
    case 'manual':
    case 'chat':
      return 'One-time';
    default:
      return humanizeToken(task.type || task.source || 'task');
  }
}

export function formatAutomationLabel(task: Task) {
  return task.automationId ? task.automationId : '-';
}

export function isTaskFinished(status: Status) {
  return status === 'COMPLETED' || status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED';
}

export async function pollTask(agentSpaceName: string, taskId: string) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const task = await getTask(agentSpaceName, taskId);
    if (task.entity.status === 'COMPLETED' || task.entity.status === 'FAILED' || task.entity.status === 'AWAITING_INPUT') {
      return task.entity;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Task polling timed out');
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
