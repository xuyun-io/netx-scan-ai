import { useMemo } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { ArtifactRow } from '@/components/artifacts/list';
import { AutomationRow } from '@/components/automations/list';
import { TaskRow } from '@/components/tasks/list';
import { Button } from '@/components/ui/button';
import { DataRow } from '@/components/agent-workspace/data-row';
import { ResourceActionsDropdown } from '@/components/agent-workspace/resource-actions-dropdown';
import { emptyTableConfig, resourceColumns } from '@/data/promptTemplates';
import type { Artifact, Automation, DocumentFile, Task } from '@/lib/api';
import { cn, formatTime } from '@/lib/utils';
import type { ResourceView } from '@/components/agent-workspace/workspace-panel';

interface ResourceTableProps {
  actionLabel: string;
  automations: Automation[];
  artifacts: Artifact[];
  description: string;
  documents: DocumentFile[];
  highlightTaskId: string | null;
  searchPlaceholder: string;
  selectedAutomationId: string | null;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  tasks: Task[];
  title: string;
  view: ResourceView;
  onClearHighlightTask: () => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDeleteTask: (task: Task) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
  onDeleteAutomation: (automation: Automation) => void;
  setSelectedAutomationId: (automationId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

export function ResourceTable({
  actionLabel,
  automations,
  artifacts,
  description,
  documents,
  highlightTaskId,
  searchPlaceholder,
  selectedAutomationId,
  selectedArtifactId,
  selectedTaskId,
  tasks,
  title,
  view,
  onClearHighlightTask,
  onDeleteArtifact,
  onDeleteTask,
  onDownloadArtifact,
  onOpenAutomationDetail,
  onOpenArtifactDetail,
  onOpenTaskDetail,
  onPrimaryAction,
  onRefresh,
  onDeleteAutomation,
  setSelectedAutomationId,
  setSelectedTaskId,
}: ResourceTableProps) {
  const columns = resourceColumns[view];
  const empty = emptyTableConfig[view];
  const rowCount =
    view === 'tasks'
      ? tasks.length
      : view === 'automations'
        ? automations.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;
  const gridTemplateColumns = useMemo(
    () => `34px ${columns.map((column) => column.width ?? '1fr').join(' ')}`,
    [columns],
  );
  const isTaskTable = view === 'tasks';

  return (
    <section className={cn('rounded-lg border border-[#222b36] bg-[#121922]', isTaskTable && 'mt-4')}>
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-[#eef2f8]">{title}</h2>
          <p className="mt-1 text-sm font-normal text-[#9aa3b2]">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button className="h-8 w-8 border-2 p-0" variant="outline" aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {view !== 'context-files' && (
            <ResourceActionsDropdown
              artifacts={artifacts}
              automations={automations}
              selectedArtifactId={selectedArtifactId}
              selectedAutomationId={selectedAutomationId}
              selectedTaskId={selectedTaskId}
              tasks={tasks}
              view={view}
              onDeleteArtifact={onDeleteArtifact}
              onDeleteAutomation={onDeleteAutomation}
              onDeleteTask={onDeleteTask}
              onDownloadArtifact={onDownloadArtifact}
            />
          )}
          {view !== 'artifacts' && (
            <Button className="h-8 px-5 text-sm font-medium" onClick={onPrimaryAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between px-5">
        <div className={cn('relative', isTaskTable ? 'w-[640px] max-w-[68%]' : 'w-[520px]')}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d97a6]" />
          <input
            className="h-8 w-full rounded-md border border-[#3a4654] bg-[#121922] pl-9 pr-3 text-sm font-normal italic text-[#dce1eb] outline-none placeholder:text-[#8f98a6] focus:border-[#8378ff]"
            placeholder={searchPlaceholder}
          />
        </div>

        <div className="flex items-center gap-4 text-sm font-medium text-[#c5ccd7]">
          <ChevronLeft className="h-4 w-4 text-[#667180]" />
          <span>1</span>
          <ChevronRight className="h-4 w-4 text-[#667180]" />
          <Settings className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto overflow-y-hidden border-t border-[#222b36]">
        <div
          className="grid h-9 items-center border-b border-[#222b36] px-5 text-[13px] font-semibold text-[#d3d8e2]"
          style={{ gridTemplateColumns }}
        >
          <input aria-label="Select all rows" className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
          {columns.map((column) => (
            <div key={column.id} className="flex min-w-0 items-center justify-between border-l border-[#303b49] px-3">
              <span className="truncate">{column.label}</span>
              {isTaskTable ? (
                <ChevronDown className="h-3.5 w-3.5 text-[#8f98a6]" />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 text-[#9aa3b2]" />
              )}
            </div>
          ))}
        </div>

        {rowCount === 0 ? (
          <div className="flex min-h-[96px] flex-col items-center justify-center px-6 py-8 text-center">
            <div className="text-sm font-semibold text-[#d3d8e2]">{empty.title}</div>
            <p className="mt-2 max-w-[560px] text-sm font-normal text-[#9fa8b7]">{empty.description}</p>
            {view !== 'artifacts' && (
              <Button className="mt-4 h-8 border-2 px-5 text-xs" variant="outline" onClick={onPrimaryAction}>
                {empty.action}
              </Button>
            )}
          </div>
        ) : (
          <div>
            {view === 'tasks' &&
              tasks.map((task) => (
                <TaskRow
                  key={task.taskId}
                  automations={automations}
                  gridTemplateColumns={gridTemplateColumns}
                  highlighted={highlightTaskId === task.taskId}
                  selected={selectedTaskId === task.taskId}
                  task={task}
                  onHighlightSeen={onClearHighlightTask}
                  onOpenAutomationDetail={onOpenAutomationDetail}
                  onOpenDetail={onOpenTaskDetail}
                  onSelect={setSelectedTaskId}
                />
              ))}
            {view === 'automations' &&
              automations.map((automation) => (
                <AutomationRow
                  key={automation.automationId}
                  automation={automation}
                  gridTemplateColumns={gridTemplateColumns}
                  selected={selectedAutomationId === automation.automationId}
                  onOpen={onOpenAutomationDetail}
                  onSelect={setSelectedAutomationId}
                />
              ))}
            {view === 'artifacts' &&
              artifacts.map((artifact) => (
                <ArtifactRow
                  key={artifact.artifactId}
                  artifact={artifact}
                  gridTemplateColumns={gridTemplateColumns}
                  selected={selectedArtifactId === artifact.artifactId}
                  onOpen={onOpenArtifactDetail}
                  onSelect={onOpenArtifactDetail}
                />
              ))}
            {view === 'context-files' &&
              documents.map((document) => (
                <DataRow
                  key={document.documentId}
                  gridTemplateColumns={gridTemplateColumns}
                  values={[document.name, document.status, formatTime(document.updatedAt)]}
                />
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
