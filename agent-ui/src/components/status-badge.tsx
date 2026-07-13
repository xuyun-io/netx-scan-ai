import { CheckCircle2, Clock, ShieldAlert, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Status } from '@/lib/api';

const statusConfig: Record<
  Status,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  PENDING: {
    label: 'Pending',
    className: 'text-[#aab4c2]',
    icon: Clock,
  },
  IN_PROGRESS: {
    label: 'In progress',
    className: 'text-[#73b7ff]',
    icon: Clock,
  },
  AWAITING_INPUT: {
    label: 'Awaiting approval',
    className: 'text-[#f1b54c]',
    icon: ShieldAlert,
  },
  COMPLETED: {
    label: 'Completed',
    className: 'text-[#10c957]',
    icon: CheckCircle2,
  },
  SUCCESS: {
    label: 'Completed',
    className: 'text-[#10c957]',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Failed',
    className: 'text-[#ef746b]',
    icon: XCircle,
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'text-[#a7afba]',
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status] ?? statusConfig.PENDING;
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-xs font-semibold', config.className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{config.label}</span>
    </span>
  );
}
