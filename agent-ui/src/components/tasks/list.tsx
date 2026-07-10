import { useEffect, useRef } from 'react';
import { ShieldAlert } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import type { Automation, Task } from '@/lib/api';
import { cn, formatPriority, formatShortTime } from '@/lib/utils';
import { formatAutomationLabel, formatTaskRunType } from '@/lib/tasks';

export function TaskRow({
  automations,
  gridTemplateColumns,
  highlighted,
  selected,
  task,
  onHighlightSeen,
  onOpenAutomationDetail,
  onOpenDetail,
  onSelect,
}: {
  automations: Automation[];
  gridTemplateColumns: string;
  highlighted: boolean;
  selected: boolean;
  task: Task;
  onHighlightSeen: () => void;
  onOpenAutomationDetail: (automation: Automation) => void;
  onOpenDetail: (task: Task) => void;
  onSelect: (taskId: string | null) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const linkedAutomation = task.automationId
    ? automations.find((automation) => automation.automationId === task.automationId)
    : null;
  const automationLabel = linkedAutomation?.name ?? formatAutomationLabel(task);

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = window.setTimeout(() => onHighlightSeen(), 2000);
      return () => window.clearTimeout(timer);
    }
  }, [highlighted, onHighlightSeen]);

  return (
    <div
      ref={rowRef}
      className={cn(
        'grid min-h-[38px] cursor-pointer items-center border-b px-5 text-[13px] text-[#dce1eb]',
        highlighted ? 'border-[#8f82ff]/40 bg-[#8f82ff]/10' : selected ? 'border-[#8f82ff]/40 bg-[#8f82ff]/10' : 'border-[#202936] hover:bg-[#151f2b]',
      )}
      style={{ gridTemplateColumns }}
      onClick={() => onSelect(selected ? null : task.taskId)}
    >
      <input
        aria-label={`Select ${task.name}`}
        checked={selected}
        className="h-3.5 w-3.5 accent-[#8f82ff]"
        type="checkbox"
        onChange={() => onSelect(selected ? null : task.taskId)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] underline-offset-2 hover:underline">
        <button
          className="text-left"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDetail(task);
          }}
        >
          {task.name}
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-2 border-l border-[#303b49] px-3">
        <StatusBadge status={task.status} />
        {task.status === 'AWAITING_INPUT' && (
          <ShieldAlert className="h-4 w-4 shrink-0 text-[#f1b54c]" aria-label="Awaiting approval" />
        )}
      </div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">{formatPriority(task.priority)}</div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#aeb7c5]">{formatTaskRunType(task)}</div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#aeb7c5]">
        {linkedAutomation ? (
          <button
            type="button"
            className="block max-w-full truncate text-left text-[#8f82ff] underline-offset-2 hover:underline"
            title={automationLabel}
            onClick={(event) => {
              event.stopPropagation();
              onOpenAutomationDetail(linkedAutomation);
            }}
          >
            {automationLabel}
          </button>
        ) : (
          <span title={automationLabel}>{automationLabel}</span>
        )}
      </div>
      <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">{formatShortTime(task.updatedAt)}</div>
    </div>
  );
}
