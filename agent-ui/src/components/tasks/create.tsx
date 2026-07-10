import { useState } from 'react';
import { CreatePageFrame, InstructionsPanel, Panel, RunModeRadioGroup } from '@/components/create-common';
import { Button } from '@/components/ui/button';

export function CreateTaskForm({
  busy,
  onCancel,
  onSchedule,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSchedule: () => void;
  onSubmit: (instruction: string) => void;
}) {
  const [instructions, setInstructions] = useState('');
  const [runMode, setRunMode] = useState('once');

  const handleRunModeChange = (value: string) => {
    if (value === 'schedule') {
      onSchedule();
      return;
    }
    setRunMode(value);
  };

  return (
    <CreatePageFrame
      parent="Tasks"
      title="Create task"
      footer={
        <>
          <Button variant="outline" className="h-8 border-2 px-5 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button className="h-8 px-5 text-xs" disabled={!instructions.trim() || busy} onClick={() => onSubmit(instructions)}>
            Create task
          </Button>
        </>
      }
    >
      <InstructionsPanel
        value={instructions}
        onChange={setInstructions}
        placeholder="例如：分析最近 24 小时 validator peer count 和出块情况，生成 Markdown 巡检报告。"
      />

      <Panel title="When to run">
        <RunModeRadioGroup value={runMode} onChange={handleRunModeChange} />
      </Panel>
    </CreatePageFrame>
  );
}
