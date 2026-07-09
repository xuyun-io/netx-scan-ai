import type { ReactNode } from 'react';
import { ChevronRight, Expand } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

interface CreatePageFrameProps {
  parent: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}

export function CreatePageFrame({ parent, title, children, footer }: CreatePageFrameProps) {
  return (
    <div className="min-w-[760px] pb-8">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <button className="text-[#8f82ff] underline underline-offset-2">{parent}</button>
          <ChevronRight className="h-4 w-4 text-[#657080]" />
          <span className="text-[#aab2bf]">{title}</span>
        </div>
        <button className="text-[#c4cad5] hover:text-white" aria-label="Expand workspace">
          <Expand className="h-4 w-4" />
        </button>
      </div>
      <h2 className="mb-4 text-2xl font-semibold text-[#eef2f8]">{title}</h2>
      <div className="space-y-4">{children}</div>
      <div className="mt-4 flex items-center gap-2">{footer}</div>
    </div>
  );
}

interface InstructionsPanelProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function InstructionsPanel({ value, onChange, placeholder }: InstructionsPanelProps) {
  return (
    <Panel
      title="Instructions"
      description="Describe in detail what you want the NetX SRE Agent to do. Be specific about services, time ranges, and desired output format."
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[106px] w-full resize-none rounded-md border border-[#3a4654] bg-[#121922] px-3 py-3 text-sm font-normal leading-6 text-[#dce1eb] outline-none placeholder:text-[#a4adbb] focus:border-[#8378ff]"
      />
    </Panel>
  );
}

interface PanelProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Panel({ title, description, children }: PanelProps) {
  return (
    <section className="rounded-lg border border-[#222b36] bg-[#121922] px-4 py-4">
      <h3 className="text-lg font-semibold text-[#eef2f8]">{title}</h3>
      {description && <p className="mt-1 text-sm font-normal text-[#9aa3b2]">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function RunModeRadioGroup({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange}>
      {[
        {
          value: 'once',
          label: 'Run once',
          detail: 'Execute immediately as a one-time task',
        },
        {
          value: 'schedule',
          label: 'Run on a schedule',
          detail: 'Repeat on a recurring schedule',
        },
        {
          value: 'event',
          label: 'Run when an event occurs',
          detail: 'Event-triggered automations will be added later',
          disabled: true,
        },
      ].map((item) => (
        <label
          key={item.value}
          className={cn('flex items-start gap-2', item.disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer')}
        >
          <RadioGroupItem value={item.value} className="mt-0.5" disabled={item.disabled} />
          <span>
            <span className="block text-sm font-semibold text-[#d9dee8]">{item.label}</span>
            <span className="text-xs font-normal text-[#8f98a6]">{item.detail}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}
