import { Expand } from 'lucide-react';
import { ArtifactDetailView } from '@/components/artifacts/detail';
import { AutomationDetailView } from '@/components/automations/detail';
import { StatusBadge } from '@/components/status-badge';
import { TaskDetailView } from '@/components/tasks/detail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceTable } from '@/components/agent-workspace/resource-table';
import type {
  Artifact,
  Automation,
  AutomationSchedule,
  DocumentFile,
  RecordEntry,
  Task,
} from '@/lib/api';
import { formatShortTime } from '@/lib/utils';
import { type CreateMode } from '@/data/promptTemplates';
import type { ResourceView } from '@/components/agent-workspace/workspace-panel';

const viewCopy: Record<
  ResourceView,
  {
    eyebrow: string;
    title: string;
    description: string;
    search: string;
    action: string;
  }
> = {
  tasks: {
    eyebrow: 'Tasks',
    title: 'Tasks queue',
    description: 'View and manage tasks delegated to the NetX SRE Agent',
    search: 'Find tasks',
    action: 'Create task',
  },
  automations: {
    eyebrow: 'Automations',
    title: 'Automations',
    description: 'Recurring tasks managed by the NetX SRE Agent',
    search: 'Find automations',
    action: 'Create automation',
  },
  artifacts: {
    eyebrow: 'Artifacts',
    title: 'Artifacts',
    description: 'Generated reports, analysis files, and task outputs',
    search: 'Find artifacts',
    action: 'Upload artifact',
  },
  'context-files': {
    eyebrow: 'Context',
    title: 'Context files',
    description: 'Help NetX SRE Agent learn your environment by uploading relevant documents.',
    search: 'Search files',
    action: 'Upload file',
  },
};

interface ResourceListProps {
  automations: Automation[];
  automationDetail: Automation | null;
  artifacts: Artifact[];
  artifactDetail: { artifact: Artifact; content: string } | null;
  busy: boolean;
  documents: DocumentFile[];
  highlightTaskId: string | null;
  selectedAutomationId: string | null;
  selectedArtifactId: string | null;
  selectedTaskId: string | null;
  taskDetail: { task: Task; records: RecordEntry[] } | null;
  tasks: Task[];
  viewingAutomationId: string | null;
  viewingArtifactId: string | null;
  viewingTaskId: string | null;
  view: ResourceView;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onCancelTask: (taskId: string) => void;
  onClearHighlightTask: () => void;
  onCloseAutomationDetail: () => void;
  onCloseArtifactDetail: () => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDeleteTask: (task: Task) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onExpandWorkspace: () => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onOpenTaskFromArtifact: (taskId: string) => void;
  onPrimaryAction: () => void;
  onRefresh: () => void;
  onToggleAutomationEnabled: (automation: Automation) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onTriggerAutomation: (automation: Automation) => void;
  onUpdateAutomation: (
    automation: Automation,
    input: { name: string; description: string; instruction: string; schedule: AutomationSchedule },
  ) => Promise<void>;
  onCloseTaskDetail: () => void;
  setSelectedAutomationId: (automationId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

export function ResourceList({
  automations,
  automationDetail,
  artifacts,
  artifactDetail,
  documents,
  highlightTaskId,
  selectedAutomationId,
  selectedArtifactId,
  selectedTaskId,
  taskDetail,
  tasks,
  viewingAutomationId,
  viewingArtifactId,
  viewingTaskId,
  view,
  onApproveTask,
  onCancelTask,
  onClearHighlightTask,
  onCloseAutomationDetail,
  onCloseArtifactDetail,
  onCreate,
  onDeleteArtifact,
  onDeleteTask,
  onDownloadArtifact,
  onExpandWorkspace,
  onOpenAutomationDetail,
  onOpenArtifactDetail,
  onOpenTaskDetail,
  onOpenTaskFromArtifact,
  onPrimaryAction,
  onRefresh,
  onToggleAutomationEnabled,
  onDeleteAutomation,
  onTriggerAutomation,
  onUpdateAutomation,
  onCloseTaskDetail,
  setSelectedAutomationId,
  setSelectedTaskId,
  busy,
}: ResourceListProps) {
  const copy = viewCopy[view];
  const isTasks = view === 'tasks';
  const count =
    view === 'tasks'
      ? tasks.length
      : view === 'automations'
        ? automations.length
      : view === 'artifacts'
        ? artifacts.length
        : view === 'context-files'
          ? documents.length
          : 0;

  if (view === 'artifacts' && viewingArtifactId && artifactDetail) {
    return (
      <ArtifactDetailView
        artifact={artifactDetail.artifact}
        content={artifactDetail.content}
        onBack={onCloseArtifactDetail}
        onDelete={() => onDeleteArtifact(artifactDetail.artifact)}
        onDownload={() => onDownloadArtifact(artifactDetail.artifact)}
        onOpenTask={onOpenTaskFromArtifact}
      />
    );
  }

  if (view === 'automations' && viewingAutomationId && automationDetail) {
    return (
      <AutomationDetailView
        automation={automationDetail}
        busy={busy}
        tasks={tasks.filter((task) => task.automationId === automationDetail.automationId)}
        onBack={onCloseAutomationDetail}
        onDelete={() => onDeleteAutomation(automationDetail)}
        onOpenTask={onOpenTaskDetail}
        onRunOnce={() => onTriggerAutomation(automationDetail)}
        onToggleEnabled={() => onToggleAutomationEnabled(automationDetail)}
        onUpdate={(input) => onUpdateAutomation(automationDetail, input)}
      />
    );
  }

  if (view === 'tasks' && viewingTaskId && taskDetail) {
    return (
      <TaskDetailView
        artifacts={artifacts.filter((a) => a.taskId === taskDetail.task.taskId)}
        records={taskDetail.records}
        task={taskDetail.task}
        onApproveTask={onApproveTask}
        onBack={onCloseTaskDetail}
        onCancelTask={() => onCancelTask(taskDetail.task.taskId)}
        onDeleteTask={() => onDeleteTask(taskDetail.task)}
        onOpenArtifact={onOpenArtifactDetail}
      />
    );
  }

  const taskTabs = [
    { value: 'all', label: 'All tasks', rows: tasks },
    { value: 'approval', label: 'Awaiting approval', rows: tasks.filter((task) => task.status === 'AWAITING_INPUT') },
    { value: 'progress', label: 'In progress', rows: tasks.filter((task) => task.status === 'IN_PROGRESS' || task.status === 'PENDING') },
    { value: 'completed', label: 'Completed', rows: tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'SUCCESS') },
  ];

  return (
    <div className="min-w-[720px]">
      <WorkspaceTopLine eyebrow={copy.eyebrow} onExpand={onExpandWorkspace} />
      {isTasks && <RequestUpdatesCard tasks={tasks} />}
      {isTasks ? (
        <Tabs defaultValue="all" className="mt-5">
          <TabsList className="gap-3">
            {taskTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4">
                <span>{tab.label}</span>
                {tab.rows.length > 0 && (
                  <span className="ml-2 rounded bg-[#747984] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                    {tab.rows.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {taskTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              <ResourceTable
                actionLabel={copy.action}
                automations={automations}
                artifacts={artifacts}
                description={copy.description}
                documents={documents}
                highlightTaskId={highlightTaskId}
                searchPlaceholder={copy.search}
                selectedAutomationId={selectedAutomationId}
                selectedArtifactId={selectedArtifactId}
                selectedTaskId={selectedTaskId}
                tasks={tab.rows}
                title={`${copy.title} (${tab.rows.length})`}
                view={view}
                onClearHighlightTask={onClearHighlightTask}
                onDeleteArtifact={onDeleteArtifact}
                onDeleteTask={onDeleteTask}
                onDownloadArtifact={onDownloadArtifact}
                onOpenAutomationDetail={onOpenAutomationDetail}
                onOpenArtifactDetail={onOpenArtifactDetail}
                onOpenTaskDetail={onOpenTaskDetail}
                onDeleteAutomation={onDeleteAutomation}
                onPrimaryAction={() => onCreate('task')}
                onRefresh={onRefresh}
                setSelectedAutomationId={setSelectedAutomationId}
                setSelectedTaskId={setSelectedTaskId}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="mt-4">
          <ResourceTable
            actionLabel={copy.action}
            automations={automations}
            artifacts={artifacts}
            description={copy.description}
            documents={documents}
            highlightTaskId={highlightTaskId}
            searchPlaceholder={copy.search}
            selectedAutomationId={selectedAutomationId}
            selectedArtifactId={selectedArtifactId}
            selectedTaskId={selectedTaskId}
            tasks={tasks}
            title={`${copy.title} (${count})`}
            view={view}
            onClearHighlightTask={onClearHighlightTask}
            onDeleteArtifact={onDeleteArtifact}
            onDeleteTask={onDeleteTask}
            onDownloadArtifact={onDownloadArtifact}
            onOpenAutomationDetail={onOpenAutomationDetail}
            onOpenArtifactDetail={onOpenArtifactDetail}
            onOpenTaskDetail={onOpenTaskDetail}
            onDeleteAutomation={onDeleteAutomation}
            onPrimaryAction={onPrimaryAction}
            onRefresh={onRefresh}
            setSelectedAutomationId={setSelectedAutomationId}
            setSelectedTaskId={setSelectedTaskId}
          />
        </div>
      )}
    </div>
  );
}

function WorkspaceTopLine({ eyebrow, onExpand }: { eyebrow: string; onExpand: () => void }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div className="text-xs font-medium text-[#8f98a6]">{eyebrow}</div>
      <button className="text-[#c4cad5] hover:text-white" aria-label="Expand workspace" onClick={onExpand}>
        <Expand className="h-4 w-4" />
      </button>
    </div>
  );
}

function RequestUpdatesCard({ tasks }: { tasks: Task[] }) {
  const recentTasks = tasks.slice(0, 4);
  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922] px-5 py-5">
      <h2 className="text-lg font-semibold leading-tight text-[#eef2f8]">Recent request updates</h2>
      <p className="mt-1 text-sm font-normal text-[#9aa3b2]">
        Latest status changes from your delegated tasks
      </p>
      <div className="mt-4 min-h-[84px] space-y-3">
        {recentTasks.length > 0 ? (
          recentTasks.map((task) => (
            <div key={task.taskId} className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-[#8f82ff]">{task.name}</span>
              <StatusBadge status={task.status} />
              <span className="shrink-0 text-xs font-normal text-[#8f98a6]">{formatShortTime(task.updatedAt)}</span>
            </div>
          ))
        ) : (
          <div className="flex min-h-[72px] items-center text-sm font-normal text-[#a4adbb]">
            Status changes from tasks delegated to the NetX SRE Agent will appear here.
          </div>
        )}
      </div>
    </section>
  );
}
