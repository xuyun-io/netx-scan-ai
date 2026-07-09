import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreatePageFrame, InstructionsPanel, Panel, RunModeRadioGroup } from '@/components/create-common';
import {
  buildSchedule,
  Field,
  inputClassName,
  ScheduleEditor,
} from '@/components/automations/editor';
import { cn } from '@/lib/utils';
import type { AutomationFrequency, CreateAutomationInput } from '@/lib/api';

export function CreateAutomationForm({
  busy,
  onCancel,
  onRunOnce,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onRunOnce: () => void;
  onSubmit: (input: Omit<CreateAutomationInput, 'agentSpaceName'>) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<AutomationFrequency>('weekly');
  const [interval, setInterval] = useState(1);
  const [minuteOffset, setMinuteOffset] = useState('00');
  const [deliveryTime, setDeliveryTime] = useState('08:00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);

  const handleRunModeChange = (value: string) => {
    if (value === 'once') {
      onRunOnce();
    }
  };

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
    <CreatePageFrame
      parent="Automations"
      title="Create automation"
      footer={
        <>
          <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="h-8 px-5 text-xs"
            disabled={!instructions.trim() || !name.trim() || busy}
            onClick={() =>
              onSubmit({
                name,
                description,
                instruction: instructions,
                schedule,
              })
            }
          >
            Create automation
          </Button>
        </>
      }
    >
      <InstructionsPanel
        value={instructions}
        onChange={setInstructions}
        placeholder="例如：每天 08:00 生成 Chain287 validator 健康巡检报告，并把 HTML 报告保存为产物。"
      />

      <Panel title="When to run">
        <RunModeRadioGroup value="schedule" onChange={handleRunModeChange} />
        <div className="mt-4 grid gap-4">
          <Field label="Name" hint="A short descriptive name for this automation">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Daily Chain287 validator inspection"
              className={inputClassName}
            />
          </Field>
          <Field label="Description" hint="Optional details about this automation">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
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
    </CreatePageFrame>
  );
}
