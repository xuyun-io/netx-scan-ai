import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  Search,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/status-badge';
import { InstructionsPanel, Panel } from '@/components/create-common';
import {
  buildSchedule,
  describeAutomationSchedule,
  Field,
  inputClassName,
  ScheduleEditor,
} from '@/components/automations/editor';
import { RESOURCE_TIME_COLUMN_WIDTH } from '@/data/tableColumns';
import { cn, formatPriority, formatShortTime, formatTime, humanizeToken } from '@/lib/utils';
import type { Automation, AutomationFrequency, AutomationSchedule, Task } from '@/lib/api';

export function AutomationDetailView({
  automation,
  busy,
  tasks,
  onBack,
  onDelete,
  onOpenTask,
  onRunOnce,
  onToggleEnabled,
  onUpdate,
}: {
  automation: Automation;
  busy: boolean;
  tasks: Task[];
  onBack: () => void;
  onDelete: () => void;
  onOpenTask: (task: Task) => void;
  onRunOnce: () => void;
  onToggleEnabled: () => void;
  onUpdate: (input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="min-w-[760px] pb-8">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <button className="text-[#8f82ff] underline underline-offset-2" onClick={onBack}>
            Automations
          </button>
          <ChevronRight className="h-4 w-4 text-[#657080]" />
          <span className="text-[#aab2bf]">Automation details</span>
        </div>
        <button className="text-[#c4cad5] hover:text-white" aria-label="Back to automations" onClick={onBack}>
          <Expand className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="min-w-0 truncate text-2xl font-semibold text-[#eef2f8]">{automation.name}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 border-2 px-4" variant="outline">
              Actions
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRunOnce} disabled={!automation.enabled}>
              Run once
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleEnabled}>
              {automation.enabled ? 'Disable automation' : 'Enable automation'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-400 focus:text-red-400"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete automation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <section className="rounded-lg border border-[#222b36] bg-[#121922] px-5 py-4">
        <h3 className="text-lg font-semibold text-[#eef2f8]">Automation overview</h3>
        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-3">
          <OverviewField label="Automation ID">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono">{automation.automationId}</span>
              <button
                className="shrink-0 text-[#8f82ff] hover:text-[#aaa2ff]"
                aria-label="Copy automation ID"
                onClick={() => navigator.clipboard.writeText(automation.automationId)}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
          </OverviewField>
          <OverviewField label="Status">
            <AutomationStatusBadge automation={automation} />
          </OverviewField>
          <OverviewField label="Enabled">
            <button
              className={cn(
                'inline-flex h-6 items-center gap-2 rounded-full border px-2 text-xs font-medium',
                automation.enabled
                  ? 'border-[#8f82ff]/50 bg-[#8f82ff]/15 text-[#d8d4ff]'
                  : 'border-[#3a4654] bg-[#101722] text-[#a7afba]',
              )}
              onClick={onToggleEnabled}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  automation.enabled ? 'bg-[#8f82ff]' : 'bg-[#647084]',
                )}
              />
              {automation.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </OverviewField>
          <OverviewField label="Trigger type">{humanizeToken(automation.triggerType)}</OverviewField>
          <OverviewField label="Runs">{automation.schedule.summary || describeAutomationSchedule(automation.schedule)}</OverviewField>
          <OverviewField label="Last triggered">
            {automation.lastTriggeredAt ? formatTime(automation.lastTriggeredAt) : 'Never'}
          </OverviewField>
          <OverviewField label="Description">{automation.description || '-'}</OverviewField>
          <OverviewField label="Created">{formatTime(automation.createdAt)}</OverviewField>
          <OverviewField label="Last updated">{formatTime(automation.updatedAt)}</OverviewField>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-[#222b36] bg-[#121922] px-5 py-4">
        <h3 className="text-lg font-semibold text-[#eef2f8]">Instructions</h3>
        <div className="mt-4 whitespace-pre-wrap text-sm font-normal leading-6 text-[#cbd3df]">
          {automation.instruction}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-[#222b36] bg-[#121922] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[#eef2f8]">Tasks ({tasks.length})</h3>
            <p className="mt-1 text-sm font-normal text-[#9aa3b2]">Tasks created by this schedule</p>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-[#c5ccd7]">
            <ChevronLeft className="h-4 w-4 text-[#667180]" />
            <span>1</span>
            <ChevronRight className="h-4 w-4 text-[#667180]" />
            <Settings className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-4 w-[520px] max-w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d97a6]" />
            <input
              className="h-8 w-full rounded-md border border-[#3a4654] bg-[#121922] pl-9 pr-3 text-sm font-normal italic text-[#dce1eb] outline-none placeholder:text-[#8f98a6] focus:border-[#8378ff]"
              placeholder="Find tasks"
            />
          </div>
        </div>
        <AutomationTasksTable tasks={tasks} onOpenTask={onOpenTask} />
      </section>

      <EditAutomationDialog
        automation={automation}
        busy={busy}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={onUpdate}
      />
    </div>
  );
}

function OverviewField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-[#d8dee9]">{label}</div>
      <div className="mt-2 min-w-0 text-sm font-normal text-[#cbd3df]">{children}</div>
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

function AutomationTasksTable({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (task: Task) => void }) {
  const gridTemplateColumns = `minmax(260px,1.4fr) 170px 130px ${RESOURCE_TIME_COLUMN_WIDTH}`;
  return (
    <div className="mt-4 overflow-hidden border-t border-[#222b36]">
      <div
        className="grid h-9 items-center border-b border-[#222b36] text-[13px] font-semibold text-[#d3d8e2]"
        style={{ gridTemplateColumns }}
      >
        {['Task name', 'Status', 'Priority', 'Last updated at'].map((label) => (
          <div key={label} className="flex min-w-0 items-center justify-between border-l border-[#303b49] px-3 first:border-l-0">
            <span className="truncate">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#8f98a6]" />
          </div>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="flex min-h-[80px] items-center px-3 text-sm font-normal text-[#9fa8b7]">
          No tasks have been created by this automation yet.
        </div>
      ) : (
        tasks.map((task) => (
          <div
            key={task.taskId}
            className="grid min-h-[38px] items-center border-b border-[#202936] text-[13px] text-[#dce1eb]"
            style={{ gridTemplateColumns }}
          >
            <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] first:border-l-0">
              <button
                className="text-left hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTask(task);
                }}
              >
                {task.name}
              </button>
            </div>
            <div className="min-w-0 border-l border-[#303b49] px-3">
              <StatusBadge status={task.status} />
            </div>
            <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">
              {formatPriority(task.priority)}
            </div>
            <div className="truncate border-l border-[#303b49] px-3 font-normal text-[#cbd3df]">
              {formatShortTime(task.updatedAt)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function EditAutomationDialog({
  automation,
  busy,
  open,
  onOpenChange,
  onSubmit,
}: {
  automation: Automation;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; description: string; instruction: string; schedule: AutomationSchedule }) => Promise<void>;
}) {
  const [name, setName] = useState(automation.name);
  const [description, setDescription] = useState(automation.description ?? '');
  const [instruction, setInstruction] = useState(automation.instruction);
  const [frequency, setFrequency] = useState<AutomationFrequency>(automation.schedule.frequency);
  const [interval, setInterval] = useState(automation.schedule.interval);
  const [minuteOffset, setMinuteOffset] = useState(String(automation.schedule.minute).padStart(2, '0'));
  const [deliveryTime, setDeliveryTime] = useState(() => formatDeliveryTime(automation.schedule.hour, automation.schedule.minute));
  const [period, setPeriod] = useState<'AM' | 'PM'>(automation.schedule.hour >= 12 ? 'PM' : 'AM');
  const [timezone, setTimezone] = useState(automation.schedule.timezone);
  const [dayOfWeek, setDayOfWeek] = useState(automation.schedule.dayOfWeek ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(automation.schedule.dayOfMonth ?? 1);

  const lastAutomationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open && automation.automationId !== lastAutomationIdRef.current) {
      lastAutomationIdRef.current = automation.automationId;
      setName(automation.name);
      setDescription(automation.description ?? '');
      setInstruction(automation.instruction);
      setFrequency(automation.schedule.frequency);
      setInterval(automation.schedule.interval);
      setMinuteOffset(String(automation.schedule.minute).padStart(2, '0'));
      setDeliveryTime(formatDeliveryTime(automation.schedule.hour, automation.schedule.minute));
      setPeriod(automation.schedule.hour >= 12 ? 'PM' : 'AM');
      setTimezone(automation.schedule.timezone);
      setDayOfWeek(automation.schedule.dayOfWeek ?? 1);
      setDayOfMonth(automation.schedule.dayOfMonth ?? 1);
    }
  }, [open, automation.automationId]);

  const schedule = buildSchedule({
    frequency,
    interval,
    minuteOffset,
    deliveryTime,
    period,
    timezone,
    dayOfWeek,
    dayOfMonth,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(900px,calc(100vw-32px))] max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit automation</DialogTitle>
          <DialogDescription className="sr-only">Update automation name, description, instructions and schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <InstructionsPanel
            value={instruction}
            onChange={setInstruction}
            placeholder="Describe in detail what you want the NetX SRE Agent to do. Be specific about services, time ranges, and desired output format."
          />

          <Panel title="When to run">
            <div className="grid gap-4">
              <Field label="Name" hint="A short descriptive name for this automation">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={inputClassName}
                />
              </Field>
              <Field label="Description" hint="Optional details about this automation">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className={cn(inputClassName, 'h-20 resize-none py-2')}
                />
              </Field>
            </div>
          </Panel>

          <Panel title="Schedule">
            <ScheduleEditor
              dayOfMonth={dayOfMonth}
              dayOfWeek={dayOfWeek}
              deliveryTime={deliveryTime}
              frequency={frequency}
              interval={interval}
              minuteOffset={minuteOffset}
              period={period}
              timezone={timezone}
              onDayOfMonthChange={setDayOfMonth}
              onDayOfWeekChange={setDayOfWeek}
              onDeliveryTimeChange={setDeliveryTime}
              onFrequencyChange={setFrequency}
              onIntervalChange={setInterval}
              onMinuteOffsetChange={setMinuteOffset}
              onPeriodChange={setPeriod}
              onTimezoneChange={setTimezone}
            />
          </Panel>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="h-8 px-5 text-xs"
            disabled={!name.trim() || !instruction.trim() || busy}
            onClick={async () => {
              await onSubmit({ name, description, instruction, schedule });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDeliveryTime(hour: number, minute: number) {
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
