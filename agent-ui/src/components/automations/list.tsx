import { useState } from 'react';
import { CheckCircle2, MoreHorizontal, Trash2, XCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditAutomationDialog } from '@/components/automations/detail';
import { cn, formatShortTime, humanizeToken } from '@/lib/utils';
import type { Automation, AutomationSchedule } from '@/lib/api';

export function AutomationRow({
  automation,
  busy,
  gridTemplateColumns,
  selected,
  onDelete,
  onOpen,
  onRunOnce,
  onSelect,
  onToggleEnabled,
  onUpdate,
}: {
  automation: Automation;
  busy: boolean;
  gridTemplateColumns: string;
  selected: boolean;
  onDelete: (automation: Automation) => void;
  onOpen: (automation: Automation) => void;
  onRunOnce: (automation: Automation) => void;
  onSelect: (automationId: string | null) => void;
  onToggleEnabled: (automation: Automation) => void;
  onUpdate: (automation: Automation, input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          'grid min-h-[38px] cursor-pointer items-center border-b px-5 text-[13px] text-[#dce1eb]',
          selected
            ? 'border-[#8f82ff]/40 bg-[#8f82ff]/10'
            : 'border-[#202936] hover:bg-[#151f2b]',
        )}
        style={{ gridTemplateColumns }}
        onClick={() => onOpen(automation)}
      >
        <input
          aria-label={`Select ${automation.name}`}
          checked={selected}
          className="h-3.5 w-3.5 accent-[#8f82ff]"
          type="checkbox"
          onChange={() => onSelect(selected ? null : automation.automationId)}
          onClick={(event) => event.stopPropagation()}
        />
        <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] underline-offset-2 hover:underline">
          {automation.name}
        </div>
        <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">
          {humanizeToken(automation.triggerType)}
        </div>
        <div className="min-w-0 border-l border-[#303b49] px-3">
          <AutomationStatusBadge automation={automation} />
        </div>
        <div className="border-l border-[#303b49] px-3">
          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', automation.enabled ? 'text-[#10c957]' : 'text-[#a7afba]')}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {automation.enabled ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">
          {automation.lastTriggeredAt ? formatShortTime(automation.lastTriggeredAt) : '-'}
        </div>
        <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">
          {formatShortTime(automation.createdAt)}
        </div>
        <div className="flex justify-center" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-[#9aa3b2] hover:text-white" aria-label="Automation actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRunOnce(automation)} disabled={!automation.enabled || busy}>
                Run once
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleEnabled(automation)}>
                {automation.enabled ? 'Disable automation' : 'Enable automation'}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-400 focus:text-red-400"
                disabled={busy}
                onClick={() => onDelete(automation)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete automation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <EditAutomationDialog
        automation={automation}
        busy={busy}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={(input) => onUpdate(automation, input)}
      />
    </>
  );
}

function AutomationStatusBadge({ automation }: { automation: Automation }) {
  if (!automation.enabled || automation.status === 'DISABLED') {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-[#a7afba]">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-[#10c957]">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      Active
    </span>
  );
}
