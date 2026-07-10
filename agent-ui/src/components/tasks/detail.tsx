import { useCallback, useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { CheckCircle2, ChevronDown, ChevronRight, Copy, Expand, Info, Play, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/status-badge';
import type { Artifact, RecordEntry, Task } from '@/lib/api';
import { groupRecordsIntoActivities } from '@/lib/task-activities';
import { isTaskFinished } from '@/lib/tasks';
import { cn, formatPriority, formatSize, formatTime } from '@/lib/utils';

export function TaskDetailView({
  task,
  records,
  artifacts,
  onApproveTask,
  onBack,
  onCancelTask,
  onDeleteTask,
  onOpenArtifact,
}: {
  task: Task;
  records: RecordEntry[];
  artifacts: Artifact[];
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onBack: () => void;
  onCancelTask: () => void;
  onDeleteTask: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
}) {
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [expandedActivityIds, setExpandedActivityIds] = useState<Set<string>>(new Set());
  const resultContent = useMemo(() => {
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].recordType === 'RESPONSE' && records[i].content) {
        return records[i].content;
      }
    }
    return '';
  }, [records]);

  const activities = useMemo(() => groupRecordsIntoActivities(records), [records]);
  const awaitingApproval = task.status === 'AWAITING_INPUT';
  const canCancel = !isTaskFinished(task.status);

  const expandAllActivities = useCallback(() => {
    setActivitiesExpanded(true);
    setExpandedActivityIds(new Set(activities.map((a) => a.id)));
  }, [activities]);

  const collapseAllActivities = useCallback(() => {
    setExpandedActivityIds(new Set());
  }, []);

  const toggleActivity = useCallback((id: string) => {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setActivitiesExpanded(false);
    setExpandedActivityIds(new Set());
  }, [task.taskId]);

  return (
    <div className="agent-scrollbar min-h-full min-w-0 overflow-y-auto px-5 py-4">
      <div className="min-w-[720px] pb-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button className="text-[#8f82ff] underline underline-offset-2" onClick={onBack}>
              Tasks
            </button>
            <ChevronRight className="h-4 w-4 text-[#657080]" />
            <span className="text-[#aab2bf]">Task details</span>
          </div>
          <button className="text-[#c4cad5] hover:text-white" aria-label="Back to tasks" onClick={onBack}>
            <Expand className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-xl font-semibold text-[#eef2f8]">{task.name || '未命名任务'}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 border-2 px-4" variant="outline">
                Actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {awaitingApproval && (
                <>
                  <DropdownMenuItem onClick={() => onApproveTask(task.taskId, 'approve')}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onApproveTask(task.taskId, 'reject')}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem disabled={!canCancel} onClick={onCancelTask}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel task
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={onDeleteTask}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <section className="rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <h2 className="text-base font-semibold text-[#eef2f8]">Task overview</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Status</div>
              <div className="mt-1">
                <StatusBadge status={task.status} />
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Task ID</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#e2e8f0]">
                {task.taskId}
                <button
                  className="text-[#8f82ff] hover:text-[#aaa2ff]"
                  aria-label="Copy task ID"
                  onClick={() => navigator.clipboard.writeText(task.taskId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Priority</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{formatPriority(task.priority)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Created at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{formatTime(task.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Started at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">{task.startedAt ? formatTime(task.startedAt) : '-'}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#9aa3b2]">Completed at</div>
              <div className="mt-1 text-sm text-[#e2e8f0]">
                {task.completedAt ? formatTime(task.completedAt) : '-'}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <h2 className="text-base font-semibold text-[#eef2f8]">Instructions</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-[#aab2bf]">{task.instruction || '-'}</p>
        </section>

        {resultContent && (
          <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
            <div className="border-b border-[#222b36] px-5 py-4">
              <h2 className="text-base font-semibold text-[#eef2f8]">Result</h2>
            </div>
            <div
              className="prose prose-invert max-w-none px-5 py-4 text-sm text-[#aab2bf]"
              dangerouslySetInnerHTML={{ __html: marked.parse(resultContent, { async: false }) as string }}
            />
          </section>
        )}

        <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
          <div
            className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left"
            onClick={() => setActivitiesExpanded((prev) => !prev)}
          >
            <div className="flex items-center gap-2">
              {activitiesExpanded ? (
                <ChevronDown className="h-4 w-4 text-[#c4cad5]" />
              ) : (
                <Play className="h-3 w-3 text-[#c4cad5]" />
              )}
              <h2 className="text-base font-semibold text-[#eef2f8]">Activities</h2>
              <span className="rounded bg-[#5a6270] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#f2f4f8]">
                {activities.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                className="h-8 border-2 text-xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  expandAllActivities();
                }}
              >
                Expand all
              </Button>
              <Button
                className="h-8 border-2 text-xs"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  collapseAllActivities();
                }}
              >
                Collapse all
              </Button>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[#c4cad5] transition-transform',
                  activitiesExpanded && 'rotate-180',
                )}
              />
            </div>
          </div>
          {activitiesExpanded && (
            <div className="border-t border-[#222b36]">
              {activities.map((activity) => {
                const expanded = expandedActivityIds.has(activity.id);
                return (
                  <div key={activity.id} className="border-b border-[#222b36] last:border-b-0">
                    <div className="flex items-start gap-3 px-5 py-3">
                      <div className="mt-0.5 shrink-0 text-[#8f82ff]">
                        <Info className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm text-[#f2f4f8]">
                          <span className="shrink-0 text-[#8f98a6]">{formatTime(activity.timestamp)}</span>
                          <span className="font-medium text-[#f2f4f8]">{activity.title}</span>
                          <span className="text-[#8f82ff]">{activity.subtitle}</span>
                        </div>
                        {expanded && (
                          <div className="mt-3 space-y-3">
                            {activity.request && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-[#8f98a6]">Request</div>
                                <pre className="max-h-96 overflow-auto rounded-md bg-[#0b0f14] p-3 text-xs text-[#f2f4f8]">
                                  {activity.request}
                                </pre>
                              </div>
                            )}
                            {activity.response && (
                              <div>
                                <div className="mb-1 text-xs font-medium text-[#8f98a6]">Response</div>
                                <pre className="max-h-96 overflow-auto rounded-md bg-[#0b0f14] p-3 text-xs text-[#f2f4f8]">
                                  {activity.response}
                                </pre>
                              </div>
                            )}
                            {activity.content && (
                              <div
                                className="prose prose-invert max-w-none text-sm text-[#f2f4f8]"
                                dangerouslySetInnerHTML={{
                                  __html: marked.parse(activity.content, { async: false }) as string,
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        className="shrink-0 text-xs text-[#8f82ff] hover:text-[#aaa2ff]"
                        onClick={() => toggleActivity(activity.id)}
                      >
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {artifacts.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
            <div className="border-b border-[#222b36] px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#eef2f8]">Generated files</h2>
                <span className="rounded bg-[#5a6270] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-[#f2f4f8]">
                  {artifacts.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#222b36] text-xs font-semibold uppercase tracking-wide text-[#9aa3b2]">
                    <th className="px-5 py-3 font-medium">File name</th>
                    <th className="w-[140px] px-5 py-3 font-medium">Type</th>
                    <th className="w-[100px] px-5 py-3 font-medium">Size</th>
                    <th className="w-[260px] whitespace-nowrap px-5 py-3 font-medium">Created at</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr
                      key={artifact.artifactId}
                      className="cursor-pointer border-b border-[#222b36] last:border-b-0 hover:bg-[#1a222c]"
                      onClick={() => onOpenArtifact(artifact)}
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-[#8f82ff] hover:text-[#aaa2ff] hover:underline">
                          {artifact.name}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[#e2e8f0]">{artifact.type}</td>
                      <td className="px-5 py-3 text-[#e2e8f0]">{formatSize(artifact.size)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-[#e2e8f0]">{formatTime(artifact.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
