import { CheckCircle2, XCircle } from 'lucide-react';
import { cn, formatShortTime, humanizeToken } from '@/lib/utils';
import type { Automation } from '@/lib/api';

export function AutomationRow({
  automation,
  gridTemplateColumns,
  selected,
  onOpen,
  onSelect,
}: {
  automation: Automation;
  gridTemplateColumns: string;
  selected: boolean;
  onOpen: (automation: Automation) => void;
  onSelect: (automationId: string | null) => void;
}) {
  return (
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
    </div>
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
