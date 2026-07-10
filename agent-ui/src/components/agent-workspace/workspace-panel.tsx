import { CreateAutomationForm } from '@/components/automations/create';
import { CreateTaskForm } from '@/components/tasks/create';
import { ResourceList } from '@/components/agent-workspace/resource-list';
import type {
  Artifact,
  Automation,
  AutomationSchedule,
  CreateAutomationInput,
  DocumentFile,
  RecordEntry,
  Task,
} from '@/lib/api';
import { type CreateMode, type WorkspaceView } from '@/data/promptTemplates';

export type ResourceView = Exclude<WorkspaceView, 'chat'>;

interface AgentWorkspacePanelProps {
  automations: Automation[];
  automationDetail: Automation | null;
  artifacts: Artifact[];
  artifactDetail: { artifact: Artifact; content: string } | null;
  busy: boolean;
  createMode: CreateMode;
  documents: DocumentFile[];
  error: string | null;
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
  onCancelCreate: () => void;
  onCancelTask: (taskId: string) => void;
  onClearHighlightTask: () => void;
  onCloseAutomationDetail: () => void;
  onCloseArtifactDetail: () => void;
  onCreate: (mode: Exclude<CreateMode, 'none'>) => void;
  onCreateAutomation: (input: Omit<CreateAutomationInput, 'agentSpaceName'>) => void;
  onCreateTask: (instruction: string) => void;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDeleteTask: (task: Task) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
  onExpandWorkspace: () => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenArtifactDetail: (artifact: Artifact) => void;
  onOpenTaskDetail: (task: Task) => void;
  onOpenTaskFromArtifact: (taskId: string) => void;
  onPrimaryAction: (view: ResourceView) => void;
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

export function AgentWorkspacePanel({
  automations,
  automationDetail,
  artifacts,
  artifactDetail,
  busy,
  createMode,
  documents,
  error,
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
  onCancelCreate,
  onCancelTask,
  onClearHighlightTask,
  onCloseAutomationDetail,
  onCloseArtifactDetail,
  onCreate,
  onCreateAutomation,
  onCreateTask,
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
}: AgentWorkspacePanelProps) {
  return (
    <section className="agent-scrollbar h-full min-w-0 overflow-auto px-5 py-4">
      {error && (
        <div className="mb-3 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      )}
      {createMode === 'task' && (
        <CreateTaskForm busy={busy} onCancel={onCancelCreate} onSchedule={() => onCreate('automation')} onSubmit={onCreateTask} />
      )}
      {createMode === 'automation' && (
        <CreateAutomationForm
          busy={busy}
          onCancel={onCancelCreate}
          onRunOnce={() => onCreate('task')}
          onSubmit={onCreateAutomation}
        />
      )}
      {createMode === 'none' && (
        <ResourceList
          automations={automations}
          automationDetail={automationDetail}
          artifacts={artifacts}
          artifactDetail={artifactDetail}
          busy={busy}
          documents={documents}
          highlightTaskId={highlightTaskId}
          selectedAutomationId={selectedAutomationId}
          selectedArtifactId={selectedArtifactId}
          selectedTaskId={selectedTaskId}
          taskDetail={taskDetail}
          tasks={tasks}
          viewingAutomationId={viewingAutomationId}
          viewingArtifactId={viewingArtifactId}
          viewingTaskId={viewingTaskId}
          view={view}
          onApproveTask={onApproveTask}
          onCancelTask={onCancelTask}
          onClearHighlightTask={onClearHighlightTask}
          onCloseAutomationDetail={onCloseAutomationDetail}
          onCloseArtifactDetail={onCloseArtifactDetail}
          onCreate={onCreate}
          onDeleteArtifact={onDeleteArtifact}
          onDeleteTask={onDeleteTask}
          onDownloadArtifact={onDownloadArtifact}
          onExpandWorkspace={onExpandWorkspace}
          onOpenAutomationDetail={onOpenAutomationDetail}
          onOpenArtifactDetail={onOpenArtifactDetail}
          onOpenTaskDetail={onOpenTaskDetail}
          onOpenTaskFromArtifact={onOpenTaskFromArtifact}
          onPrimaryAction={() => onPrimaryAction(view)}
          onRefresh={onRefresh}
          onToggleAutomationEnabled={onToggleAutomationEnabled}
          onDeleteAutomation={onDeleteAutomation}
          onTriggerAutomation={onTriggerAutomation}
          onUpdateAutomation={onUpdateAutomation}
          onCloseTaskDetail={onCloseTaskDetail}
          setSelectedAutomationId={setSelectedAutomationId}
          setSelectedTaskId={setSelectedTaskId}
        />
      )}
    </section>
  );
}
