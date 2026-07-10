import { ChevronDown, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Artifact, Automation, Task } from '@/lib/api';
import type { ResourceView } from '@/components/agent-workspace/workspace-panel';

export function ResourceActionsDropdown({
  artifacts,
  automations,
  selectedArtifactId,
  selectedAutomationId,
  selectedTaskId,
  tasks,
  view,
  onDeleteArtifact,
  onDeleteAutomation,
  onDeleteTask,
  onDownloadArtifact,
}: {
  artifacts: Artifact[];
  automations: Automation[];
  selectedArtifactId: string | null;
  selectedAutomationId: string | null;
  selectedTaskId: string | null;
  tasks: Task[];
  view: ResourceView;
  onDeleteArtifact: (artifact: Artifact) => void;
  onDeleteAutomation: (automation: Automation) => void;
  onDeleteTask: (task: Task) => void;
  onDownloadArtifact: (artifact: Artifact) => void;
}) {
  const selectedArtifact = selectedArtifactId ? artifacts.find((a) => a.artifactId === selectedArtifactId) : undefined;
  const selectedAutomation = selectedAutomationId
    ? automations.find((automation) => automation.automationId === selectedAutomationId)
    : undefined;
  const selectedTask = selectedTaskId ? tasks.find((t) => t.taskId === selectedTaskId) : undefined;
  const isArtifacts = view === 'artifacts';
  const isTasks = view === 'tasks';
  const isAutomations = view === 'automations';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 border-2 px-4" variant="outline">
          Actions
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isArtifacts ? (
          <>
            <DropdownMenuItem
              disabled={!selectedArtifact}
              onClick={() => selectedArtifact && onDownloadArtifact(selectedArtifact)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!selectedArtifact}
              className="text-red-400 focus:text-red-400"
              onClick={() => selectedArtifact && onDeleteArtifact(selectedArtifact)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        ) : isTasks ? (
          <DropdownMenuItem
            disabled={!selectedTask}
            className="text-red-400 focus:text-red-400"
            onClick={() => selectedTask && onDeleteTask(selectedTask)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete task
          </DropdownMenuItem>
        ) : isAutomations ? (
          <DropdownMenuItem
            disabled={!selectedAutomation}
            className="text-red-400 focus:text-red-400"
            onClick={() => selectedAutomation && onDeleteAutomation(selectedAutomation)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete automation
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
