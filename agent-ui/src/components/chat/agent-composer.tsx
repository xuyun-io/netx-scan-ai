import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Copy,
  Expand,
  FileText,
  MoreHorizontal,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Wrench,
  XCircle,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { ExecutionPanel } from '@/components/execution/execution-panel';
import { Button } from '@/components/ui/button';
import { promptTemplates } from '@/data/promptTemplates';
import { buildTimelineItems, prettyPayload, type ChatEvent, type TimelineItem } from '@/lib/chat-events';
import { cn, formatTime } from '@/lib/utils';

const MAX_PROMPT_LENGTH = 1000;

type ChatSurfaceVariant = 'full' | 'inline';

interface AgentComposerProps {
  booting: boolean;
  busy: boolean;
  conversationTitle: string;
  events: ChatEvent[];
  prompt: string;
  variant: ChatSurfaceVariant;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
  onExpand?: () => void;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onTemplateClick: (value: string) => void;
}

export function AgentComposer({
  booting,
  busy,
  conversationTitle,
  events,
  prompt,
  variant,
  onApproveTask,
  onExpand,
  onPromptChange,
  onSend,
  onTemplateClick,
}: AgentComposerProps) {
  const compact = variant === 'inline';

  return (
    <section
      className={cn(
        'grid h-full min-w-0 grid-rows-[48px_1fr_auto] bg-[#111821]',
        compact ? 'border-r border-[#222b36] max-lg:border-r-0' : '',
      )}
    >
      <div className="flex h-12 items-center justify-between border-b border-[#222b36] px-5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-[#f2f4f8]">{conversationTitle}</h1>
            <button className="shrink-0 text-xs font-medium text-[#8f82ff] hover:text-[#aaa2ff]">
              Show ID
            </button>
          </div>
        </div>
        {compact && (
          <button className="text-[#c4cad5] hover:text-white" aria-label="Open full chat" onClick={onExpand}>
            <Expand className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'agent-scrollbar min-h-0 overflow-y-auto overscroll-y-contain',
          compact ? 'px-5 py-5' : 'px-8 py-7',
        )}
      >
        {events.length === 0 ? (
          <ChatEmptyState compact={compact} onTemplateClick={onTemplateClick} />
        ) : (
          <ChatTimeline compact={compact} events={events} onApproveTask={onApproveTask} />
        )}
      </div>

      <ChatInput
        booting={booting}
        busy={busy}
        compact={compact}
        prompt={prompt}
        onPromptChange={onPromptChange}
        onSend={onSend}
      />
    </section>
  );
}

function ChatEmptyState({
  compact,
  onTemplateClick,
}: {
  compact: boolean;
  onTemplateClick: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-h-full flex-col',
        compact ? 'justify-start' : 'mx-auto max-w-[980px] justify-center pb-24',
      )}
    >
      <div className={cn('text-xs font-medium text-[#8f98a6]', compact ? '' : 'text-center')}>
        Get started with a common task
      </div>
      <h2
        className={cn(
          'agent-gradient-title mt-3 font-bold',
          compact ? 'text-xl leading-7' : 'text-center text-3xl',
        )}
      >
        Delegate work to NetX Agent
      </h2>
      <div className={cn('mt-6 grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-2')}>
        {promptTemplates.slice(0, compact ? 4 : 8).map((template) => (
          <button
            key={template.id}
            className="rounded-md border border-[#3b3480] bg-[#121922] px-3 py-2 text-left text-sm font-medium leading-5 text-[#9a91ff] transition hover:border-[#958bff] hover:bg-[#8378ff]/10 hover:text-[#b9b3ff]"
            onClick={() => onTemplateClick(template.text)}
          >
            {template.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatTimeline({
  compact,
  events,
  onApproveTask,
}: {
  compact: boolean;
  events: ChatEvent[];
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const timeline = useMemo(() => buildTimelineItems(events), [events]);
  return (
    <div className="w-full max-w-[1500px] space-y-7">
      {timeline.map((item) => (
        <TimelineItemRow key={item.id} compact={compact} item={item} onApproveTask={onApproveTask} />
      ))}
    </div>
  );
}

function TimelineItemRow({
  compact,
  item,
  onApproveTask,
}: {
  compact: boolean;
  item: TimelineItem;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  if (item.kind === 'assistant') {
    return (
      <div className={cn('grid min-w-0 gap-5', compact ? 'grid-cols-[30px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]')}>
        <EventAvatar type="answer" />
        <div className="min-w-0">
          <AssistantResponseEvent events={item.events} onApproveTask={onApproveTask} />
        </div>
      </div>
    );
  }

  const { event } = item;
  const isUser = event.type === 'user';
  return (
    <div className={cn('grid min-w-0 gap-5', compact ? 'grid-cols-[30px_minmax(0,1fr)]' : 'grid-cols-[34px_minmax(0,1fr)]')}>
      <EventAvatar type={event.type} />
      <div className="min-w-0">
        {event.type === 'user' && (
          <div className="pt-0.5 text-sm leading-6 text-[#aeb7c5]">
            <div className="whitespace-pre-wrap text-[15px] font-normal">{event.content}</div>
            <div className="mt-1 text-xs font-normal text-[#9ca6b5]">{formatTime(event.createdAt)}</div>
          </div>
        )}
        {!isUser && event.type === 'status' && <StatusEvent event={event} />}
        {!isUser && event.type === 'tool' && <ToolEvent event={event} />}
        {!isUser && event.type === 'task' && <TaskEvent event={event} />}
        {!isUser && event.type === 'approval' && <ApprovalEvent event={event} onApproveTask={onApproveTask} />}
        {!isUser && event.type === 'artifact' && <ArtifactEvent event={event} />}
        {!isUser && event.type === 'answer' && <AnswerEvent event={event} />}
      </div>
    </div>
  );
}

function AssistantResponseEvent({
  events,
  onApproveTask,
}: {
  events: ChatEvent[];
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const answer = [...events].reverse().find((event): event is Extract<ChatEvent, { type: 'answer' }> => event.type === 'answer');
  const runningStatus = [...events]
    .reverse()
    .find((event): event is Extract<ChatEvent, { type: 'status' }> => event.type === 'status' && event.state === 'running');
  const running = Boolean(runningStatus);
  const processEvents = events.filter((event) => event.type === 'tool');
  const stepCount = processEvents.length;
  const [showSteps, setShowSteps] = useState(!answer || running);
  const userToggled = useRef(false);

  useEffect(() => {
    if (running) {
      userToggled.current = false;
      setShowSteps(true);
      return;
    }
    if (answer && !userToggled.current) {
      setShowSteps(false);
    }
  }, [running, Boolean(answer)]);

  const toggleSteps = () => {
    userToggled.current = true;
    setShowSteps((value) => !value);
  };

  return (
    <div className="box-border w-full max-w-[1360px] min-w-0 overflow-hidden rounded-md border border-[#1c2530] bg-[#0a0f15] px-4 py-4 text-[#b8c1cf] shadow-[0_18px_55px_rgba(0,0,0,0.16)]">
      {stepCount > 0 && !running && !showSteps && (
        <button
          className="mb-4 text-sm font-semibold text-[#8f82ff] hover:text-[#b8b0ff]"
          onClick={toggleSteps}
        >
          Show thinking process ({stepCount} {stepCount === 1 ? 'step' : 'steps'})
        </button>
      )}

      {(showSteps || running) && stepCount > 0 && (
        <div className="grid min-w-0 gap-3">
          {processEvents.map((event) => (
            <AssistantStepEvent key={event.id} event={event} onApproveTask={onApproveTask} />
          ))}
        </div>
      )}

      {runningStatus && (
        <div className={cn(stepCount > 0 ? 'mt-5' : '')}>
          <RunningProcess label={runningStatus.content} />
        </div>
      )}

      {stepCount > 0 && !running && showSteps && (
        <button
          className="mt-4 text-sm font-semibold text-[#8f82ff] hover:text-[#b8b0ff]"
          onClick={toggleSteps}
        >
          Hide thinking process
        </button>
      )}

      {answer && (
        <div className={cn(stepCount > 0 || runningStatus ? 'mt-5' : '')}>
          <AnswerEvent embedded event={answer} />
        </div>
      )}
    </div>
  );
}

function AssistantStepEvent({
  event,
  onApproveTask,
}: {
  event: ChatEvent;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  if (event.type === 'status') {
    return <StatusStep event={event} />;
  }
  if (event.type === 'tool') {
    return <ToolEvent embedded event={event} />;
  }
  if (event.type === 'task') {
    return <TaskEvent event={event} />;
  }
  if (event.type === 'approval') {
    return <ApprovalEvent event={event} onApproveTask={onApproveTask} />;
  }
  if (event.type === 'artifact') {
    return <ArtifactEvent event={event} />;
  }
  return null;
}

function StatusStep({ event }: { event: Extract<ChatEvent, { type: 'status' }> }) {
  const icon =
    event.state === 'error' ? (
      <XCircle className="h-4 w-4 text-red-400" />
    ) : event.state === 'complete' ? (
      <MoreHorizontal className="h-4 w-4 text-[#9aa4b3]" />
    ) : (
      <Clock className="h-4 w-4 animate-spin text-[#aeb7c5]" />
    );
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm font-normal leading-6 text-[#aeb7c5]">
      <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center opacity-90">{icon}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{event.content}</span>
    </div>
  );
}

function RunningProcess({ label }: { label: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-[#aeb7c5]">
        <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
        {label}
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[#242d3a]">
        <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
      </div>
      <button className="mt-4 text-sm font-semibold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
    </div>
  );
}

function EventAvatar({ type }: { type: ChatEvent['type'] }) {
  if (type === 'user') {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#454c57] text-[#eef2f8] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
        <UserRound className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#18b8ff] via-[#7267ff] to-[#9b46ff] text-white shadow-[0_8px_22px_rgba(114,103,255,0.22)]">
      {type === 'tool' ? <Wrench className="h-4 w-4" /> : type === 'approval' ? <ShieldAlert className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
    </div>
  );
}

function StatusEvent({ event }: { event: Extract<ChatEvent, { type: 'status' }> }) {
  const icon =
    event.state === 'complete' ? (
      <Check className="h-4 w-4 text-[#35d05d]" />
    ) : event.state === 'error' ? (
      <XCircle className="h-4 w-4 text-red-400" />
    ) : (
      <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
    );
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-[#cbd3df]">
        {icon}
        {event.content}
      </div>
      {event.state === 'running' && (
        <>
          <div className="mt-3 h-[3px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[#242d3a]">
            <div className="h-full w-1/3 animate-progress rounded-full bg-gradient-to-r from-[#8f82ff] via-[#18b8ff] to-[#9d4dff]" />
          </div>
          <button className="mt-3 text-sm font-semibold text-[#8f82ff] hover:text-[#aaa2ff]">Cancel</button>
        </>
      )}
    </div>
  );
}

function ToolEvent({ event, embedded = false }: { event: Extract<ChatEvent, { type: 'tool' }>; embedded?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const ok = event.status !== 'error';
  const complete = event.status === 'result';
  const label =
    event.kind === 'skill'
      ? `${complete ? 'Powered up skill' : 'Loading skill'}`
      : event.kind === 'resource'
        ? `${complete ? 'Loaded' : 'Loading'}`
        : `${complete ? 'Called tool' : 'Calling tool'}`;
  const output = event.output;
  const hasDetails = Boolean(event.request || event.rawResponse || output?.data);
  const statusStyle =
    output?.status === 'ok'
      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
      : output?.status === 'error'
        ? 'bg-red-500/10 text-red-300 border-red-500/20'
        : output?.status === 'partial' || output?.status === 'pending'
          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
          : '';
  return (
    <div className={cn('min-w-0 max-w-full overflow-hidden', embedded ? '' : 'rounded-md border border-[#202936] bg-[#0d131b] px-4 py-3')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium leading-6">
        {complete ? (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-[#26d044] text-[#26d044]">
            <Check className="h-3 w-3 stroke-[3]" />
          </span>
        ) : event.status === 'error' ? (
          <XCircle className="h-4 w-4 text-red-400" />
        ) : (
          <Clock className="h-4 w-4 animate-spin text-[#c4cad5]" />
        )}
        <span className={ok ? 'text-[#26d044]' : 'text-red-300'}>{label}</span>
        {event.kind !== 'skill' && <span className="min-w-0 max-w-full truncate text-[#c6ceda]">{event.name}</span>}
        {event.kind === 'skill' && <span className="min-w-0 max-w-full truncate text-[#c6ceda]">{event.name}</span>}
        {!embedded && event.skill && event.kind === 'tool' && (
          <span className="rounded border border-[#2a3b4d] px-2 py-0.5 text-[11px] text-[#aab2bf]">
            {event.skill}{event.action ? ` / ${event.action}` : ''}
          </span>
        )}
        {output && output.status && (
          <span className={cn('rounded border px-2 py-0.5 text-[11px]', statusStyle)}>
            {output.status}
          </span>
        )}
        {hasDetails && (
          <button
            className="text-[#9a91ff] underline underline-offset-2 hover:text-[#b8b0ff]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      {output?.message && (
        <div className={cn('mt-2 text-sm leading-6 text-[#aeb7c5]', embedded ? 'ml-6' : '')}>
          {output.message}
        </div>
      )}
      {output?.error && (
        <div className={cn('mt-2 text-sm leading-6 text-red-300', embedded ? 'ml-6' : '')}>
          {output.error.code}{output.error.detail ? `: ${output.error.detail}` : ''}
        </div>
      )}
      {expanded && hasDetails && (
        <div className={cn('mt-3 grid min-w-0 max-w-full gap-3 overflow-hidden', embedded ? 'ml-6 max-w-[calc(100%-1.5rem)]' : '')}>
          {event.request && <PayloadBlock label="Request" value={event.request} />}
          {output?.data && <PayloadBlock label="Data" value={JSON.stringify(output.data, null, 2)} />}
          {event.rawResponse && <PayloadBlock label="Response" value={prettyPayload(event.rawResponse)} />}
        </div>
      )}
    </div>
  );
}

function PayloadBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#aab2bf]">{label}</div>
      <pre className="max-h-[260px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#202936] bg-[#101722] px-3 py-2 font-mono text-xs leading-5 text-[#d8dee8] [overflow-wrap:anywhere]">
        {value}
      </pre>
    </div>
  );
}

function TaskEvent({ event }: { event: Extract<ChatEvent, { type: 'task' }> }) {
  return (
    <div className="rounded-md border border-[#2e3b4d] bg-[#101820] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Task created</div>
          <div className="mt-1 text-sm font-semibold text-[#eef2f8]">{event.title}</div>
        </div>
        <StatusBadge status={event.status} />
      </div>
      <div className="mt-2 font-mono text-xs text-[#aab2bf]">{event.taskId}</div>
      {event.description && <div className="mt-2 text-sm leading-6 text-[#cbd3df]">{event.description}</div>}
    </div>
  );
}

function ApprovalEvent({
  event,
  onApproveTask,
}: {
  event: Extract<ChatEvent, { type: 'approval' }>;
  onApproveTask: (taskId: string, response: 'approve' | 'reject') => void;
}) {
  const pending = event.status === 'AWAITING_INPUT';
  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-950/20 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldCheck className="h-4 w-4" />
        {pending ? 'Waiting for approval' : `Approval ${event.status.toLowerCase()}`}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[#e7d7b7]">
        <div><span className="font-semibold">操作：</span>{event.title}</div>
        <div><span className="font-semibold">风险：</span>{event.risk}</div>
        <div><span className="font-semibold">目标：</span>{event.target}</div>
        <div><span className="font-semibold">摘要：</span>{event.command}</div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button className="h-8 px-4 text-xs" disabled={!pending} onClick={() => onApproveTask(event.taskId, 'approve')}>
          Approve
        </Button>
        <Button className="h-8 border-2 px-4 text-xs" disabled={!pending} variant="outline" onClick={() => onApproveTask(event.taskId, 'reject')}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function ArtifactEvent({ event }: { event: Extract<ChatEvent, { type: 'artifact' }> }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-[#26313e] bg-[#101820] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-4 w-4 shrink-0 text-[#8f82ff]" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[#eef2f8]">{event.name}</div>
          <div className="font-mono text-xs text-[#aab2bf]">{event.artifactType} · {event.artifactId}</div>
        </div>
      </div>
      <button className="text-xs font-medium text-[#8f82ff] hover:text-[#aaa2ff]">View</button>
    </div>
  );
}

function AnswerEvent({ event, embedded = false }: { event: Extract<ChatEvent, { type: 'answer' }>; embedded?: boolean }) {
  const [showTrace, setShowTrace] = useState(false);
  const body = (
    <>
      <div className="prose-netx min-w-0 max-w-full whitespace-pre-wrap break-words text-sm font-normal leading-6 text-[#b8c1cf] [overflow-wrap:anywhere]">{event.content}</div>
      {event.taskId && (
        <div className="mt-3 inline-flex rounded border border-[#8378ff]/40 px-2 py-1 text-xs font-medium text-[#9a91ff]">
          Task: {event.taskId}
        </div>
      )}
      {event.agentSpaceName && event.turnId && (
        <div className="mt-3">
          <button className="inline-flex items-center gap-1.5 rounded border border-[#2b594f] bg-[#10231f] px-2 py-1 text-xs font-semibold text-[#72d8bd] hover:border-[#4a9c87]" onClick={() => setShowTrace((value) => !value)}>
            <Activity className="h-3.5 w-3.5" /> {showTrace ? 'Hide execution trace' : 'View execution trace'}
          </button>
          {showTrace && <div className="mt-3"><ExecutionPanel compact agentSpaceName={event.agentSpaceName} conversationId={event.conversationId} turnId={event.turnId} /></div>}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-3 text-[#9aa4b3]">
        <button aria-label="Thumbs up" className="hover:text-white"><ThumbsUp className="h-4 w-4" /></button>
        <button aria-label="Thumbs down" className="hover:text-white"><ThumbsDown className="h-4 w-4" /></button>
        <button aria-label="Copy response" className="hover:text-white"><Copy className="h-4 w-4" /></button>
      </div>
    </>
  );
  if (embedded) {
    return (
      <div className="text-[#cbd3df]">
        {body}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[#202936] bg-[#0d131b] px-4 py-3 text-[#cbd3df]">
      {body}
    </div>
  );
}

function ChatInput({
  booting,
  busy,
  compact,
  prompt,
  onPromptChange,
  onSend,
}: {
  booting: boolean;
  busy: boolean;
  compact: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className={cn('shrink-0 border-t border-[#222b36]', compact ? 'px-5 py-4' : 'px-8 py-5')}>
      <div>
        <div className="overflow-hidden rounded-md border border-[#3b4654] bg-[#121922] transition focus-within:border-[#8278ff] focus-within:ring-1 focus-within:ring-[#8278ff]">
          <textarea
            value={prompt}
            maxLength={MAX_PROMPT_LENGTH}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                if (!booting && !busy && prompt.trim()) {
                  onSend();
                }
              }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                onSend();
              }
            }}
            placeholder="例如：现在链上块高多少？或生成一份 validator 健康巡检报告。"
            className={cn(
              'block w-full resize-none border-0 bg-transparent px-3 py-3 text-sm font-normal leading-6 text-[#dce1eb] outline-none placeholder:text-[#a2a9b4] focus:outline-none',
              compact ? 'h-[68px]' : 'h-[84px]',
            )}
          />
          <div className="flex h-10 items-center justify-end gap-3 border-t border-[#232d39] px-3">
            <div className="text-xs font-medium text-[#aab2bf]">
              字数 {prompt.length}/{MAX_PROMPT_LENGTH}
            </div>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#8378ff] text-white shadow-sm transition hover:bg-[#968dff] disabled:bg-[#283241] disabled:text-[#788291]"
              aria-label="Send prompt"
              disabled={booting || busy || !prompt.trim()}
              onClick={onSend}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
