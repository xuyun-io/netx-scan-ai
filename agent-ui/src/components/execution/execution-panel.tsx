import { useEffect, useId, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Bot, BrainCircuit, Clock3, Copy, Database, GitBranch, Search, Wrench, Workflow } from 'lucide-react';
import { findInvocationTraces, getLocalToolTrace, listRecords, type InvocationTrace, type ModelCallTrace, type RecordEntry, type ToolTraceSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

type View = 'tree' | 'waterfall' | 'graph' | 'usage';
type Span = {
  id: string; invocationId: string; kind: 'invocation' | 'model' | 'tool'; name: string; subtitle: string;
  startedAt: string; completedAt: string; durationMillis: number; status: string;
  model?: ModelCallTrace; tool?: ToolTraceSummary;
};

export function ExecutionPanel({ agentSpaceName, taskId, conversationId, turnId, compact = false }: {
  agentSpaceName: string; taskId?: string; conversationId?: string; turnId?: string; compact?: boolean;
}) {
  const [traces, setTraces] = useState<InvocationTrace[]>([]);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('tree');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true; let timer: number | undefined; let emptyAttempts = 0;
    setLoading(true); setError('');
    const load = () => void Promise.all([
      findInvocationTraces({ agentSpaceName, taskId, conversationId, turnId }),
      listRecords({ agentSpaceName, taskId, conversationId, turnId, maxResults: 500 }),
    ]).then(([traceResult, recordResult]) => {
      if (!active) return;
      const next = (traceResult.traces ?? []).map((trace) => ({ ...trace, summary: { ...trace.summary, modelCalls: trace.summary.modelCalls ?? [] }, tools: trace.tools ?? [] }));
      setTraces(next); setRecords(recordResult.records ?? []);
      if (next[0]) setSelectedId((current) => current || `inv:${next[0].summary.invocationId}`);
      if (!next.length) emptyAttempts += 1;
      if (next.some((trace) => trace.summary.status === 'in_progress') || (!next.length && emptyAttempts < 6)) timer = window.setTimeout(load, 1500);
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Trace unavailable'))
      .finally(() => active && setLoading(false));
    load(); return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [agentSpaceName, conversationId, taskId, turnId]);

  const spans = useMemo(() => buildSpans(traces), [traces]);
  const visibleSpans = useMemo(() => spans.filter((span) => !query || `${span.name} ${span.subtitle}`.toLowerCase().includes(query.toLowerCase())), [query, spans]);
  const selected = spans.find((span) => span.id === selectedId) ?? spans[0];
  const aggregate = useMemo(() => summarize(traces), [traces]);

  if (loading) return <PanelMessage>Loading execution trace…</PanelMessage>;
  if (error) return <PanelMessage error>{error}</PanelMessage>;
  if (!traces.length) return <PanelMessage>No invocation trace recorded.</PanelMessage>;

  return <section className={cn('overflow-hidden rounded-xl border border-[#27323d] bg-[#080e14] shadow-[0_22px_70px_rgba(0,0,0,.26)]', compact && 'rounded-lg')}>
    <header className="border-b border-[#222d37] bg-[radial-gradient(circle_at_12%_0%,rgba(50,188,164,.11),transparent_28%)] px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[#69d7bb]"><Activity className="h-4 w-4" /> Trace studio</div><div className="mt-1 font-mono text-[11px] text-[#71808e]">{traces[0].summary.invocationId} · local repository</div></div>
        <StatusPill status={traces[0].summary.status} errors={aggregate.errors} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#26313b] bg-[#26313b] md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Duration" value={formatDuration(aggregate.duration)} icon={<Clock3 />} />
        <Metric label="Model calls" value={String(aggregate.models)} icon={<BrainCircuit />} />
        <Metric label="Tool calls" value={String(aggregate.tools)} icon={<Wrench />} />
        <Metric label="Input" value={formatNumber(aggregate.input)} icon={<Database />} />
        <Metric label="Cache hit" value={`${aggregate.cacheRate.toFixed(1)}%`} icon={<GitBranch />} />
        <Metric label="Generated" value={formatNumber(aggregate.generated)} icon={<Bot />} />
        <Metric label="Reasoning" value={formatNumber(aggregate.reasoning)} icon={<BrainCircuit />} />
        <Metric label="Payload reduced" value={`${aggregate.payloadReduced.toFixed(1)}%`} icon={<BarChart3 />} accent />
      </div>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202a34] px-4 py-2.5">
      <div className="flex items-center gap-1" role="tablist" aria-label="Trace views">{(['tree', 'waterfall', 'graph', 'usage'] as View[]).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} aria-controls={`trace-view-${item}`} onClick={() => setView(item)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold capitalize text-[#7d8996] transition-colors hover:bg-[#1d2530] hover:text-[#c5cbd8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-action)]', view === item && 'bg-[#292348] text-[#b8b1ff]')}>{item}</button>)}</div>
      <label className="flex items-center gap-2 rounded-md border border-[#25313c] bg-[#0b131a] px-2.5 py-1.5 focus-within:border-[var(--accent-action)] focus-within:ring-1 focus-within:ring-[var(--accent-action)]"><span className="sr-only">Filter trace spans</span><Search aria-hidden="true" className="h-3.5 w-3.5 text-[#657280]" /><input name="trace-filter" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter spans…" className="w-32 bg-transparent text-xs text-[#c8d1da] outline-none placeholder:text-[#56616e]" /></label>
    </div>

    {view === 'usage' ? <div id="trace-view-usage" role="tabpanel"><UsageView traces={traces} /></div> : <div id={`trace-view-${view}`} role="tabpanel" className="grid min-h-[430px] lg:grid-cols-[minmax(420px,1.15fr)_minmax(360px,.85fr)]">
      <div className="min-w-0 border-b border-[#202a34] lg:border-b-0 lg:border-r">
        {view === 'tree' && <TreeView traces={traces} spans={visibleSpans} selectedId={selected?.id} onSelect={setSelectedId} />}
        {view === 'waterfall' && <WaterfallView traces={traces} spans={visibleSpans} selectedId={selected?.id} onSelect={setSelectedId} />}
        {view === 'graph' && <GraphView spans={visibleSpans} selectedId={selected?.id} onSelect={setSelectedId} />}
      </div>
      <Inspector span={selected} records={records} agentSpaceName={agentSpaceName} />
    </div>}
  </section>;
}

function TreeView({ traces, spans, selectedId, onSelect }: { traces: InvocationTrace[]; spans: Span[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <div className="p-3">{traces.map((trace) => { const root = spans.find((s) => s.id === `inv:${trace.summary.invocationId}`); const children = spans.filter((s) => s.invocationId === trace.summary.invocationId && s.kind !== 'invocation').sort(byStart); return <div key={trace.summary.invocationId}>
    {root && <SpanRow span={root} depth={0} selected={selectedId === root.id} onSelect={onSelect} />}
    <div className="relative ml-5 border-l border-[#263743] pl-3">{children.map((span) => <SpanRow key={span.id} span={span} depth={1} selected={selectedId === span.id} onSelect={onSelect} />)}</div>
  </div>; })}</div>;
}

function SpanRow({ span, selected, onSelect }: { span: Span; depth: number; selected: boolean; onSelect: (id: string) => void }) {
  return <button type="button" onClick={() => onSelect(span.id)} className={cn('group my-1 grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-action)]', selected ? 'border-[#6f63d9] bg-[#211d38]' : 'hover:border-[#222f39] hover:bg-[#0d151c]')}>
    <SpanIcon kind={span.kind} failed={span.status === 'error'} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#dbe4ec]">{span.name}</div><div className="truncate font-mono text-[10px] text-[#687684]">{span.subtitle}</div></div>
    <div className="text-right"><div className="font-mono text-xs text-[#a2adba]">{formatDuration(span.durationMillis)}</div>{span.model && <div className="font-mono text-[10px] text-[#c49a58]">{formatNumber(totalOutput(span.model))} tok</div>}{span.tool && <div className="font-mono text-[10px] text-[#508f80]">{formatBytes(span.tool.rawBytes)}</div>}</div>
  </button>;
}

function WaterfallView({ traces, spans, selectedId, onSelect }: { traces: InvocationTrace[]; spans: Span[]; selectedId?: string; onSelect: (id: string) => void }) {
  const trace = traces[0]; const start = new Date(trace.summary.startedAt).getTime(); const duration = effectiveTraceDuration(trace); const live = trace.summary.status === 'in_progress'; const rows = spans.filter((s) => s.kind !== 'invocation').sort(byStart);
  return <div className="overflow-x-auto p-4"><div className="min-w-[660px]"><div className="mb-3 grid grid-cols-[180px_1fr] gap-3 font-mono text-[11px] text-[#71808e]"><span className="flex items-center gap-2">SPAN{live && <span className="inline-flex items-center gap-1 text-[var(--status-running)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--status-running)] motion-reduce:animate-none" />LIVE</span>}</span><div className="flex justify-between"><span>0s</span><span>{formatDuration(duration / 2)}</span><span className={live ? 'text-[var(--status-running)]' : ''}>{live ? 'NOW · ' : ''}{formatDuration(duration)}</span></div></div>
    {rows.map((span) => { const left = clamp((new Date(span.startedAt).getTime() - start) / duration * 100); const width = Math.max(0.8, Math.min(100 - left, span.durationMillis / duration * 100)); const fitsInside = width >= 6; const nearRightEdge = left + width > 94; const elapsed = formatDuration(span.durationMillis); return <button type="button" key={span.id} onClick={() => onSelect(span.id)} className={cn('grid w-full grid-cols-[180px_1fr] items-center gap-3 rounded px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-action)]', selectedId === span.id && 'bg-[#211d38]')}>
      <span className="flex min-w-0 items-center gap-2 text-xs text-[#a9b4bf]"><WaterfallSpanIcon span={span} /><span className="truncate">{span.name}</span></span>
      <span className="relative h-7 rounded bg-[#101a22] before:absolute before:inset-y-0 before:left-1/2 before:border-l before:border-[#1c2a34]">
        <span className={cn('absolute top-1 h-5 rounded-sm shadow-[0_0_14px_rgba(0,0,0,.2)]', span.kind === 'model' ? 'bg-[#c78e43]' : span.status === 'error' ? 'bg-[#d76159]' : 'bg-[#39a78a]')} style={{ left: `${left}%`, width: `${width}%` }} />
        <span className={cn('pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums', fitsInside ? 'text-[#07100e]' : 'text-[#c0cad3]')} style={fitsInside ? { left: `calc(${left}% + 6px)` } : nearRightEdge ? { right: `${100 - left}%`, transform: 'translate(-5px,-50%)' } : { left: `${left + width}%`, transform: 'translate(5px,-50%)' }}>{elapsed}</span>
      </span>
    </button>; })}
  </div></div>;
}

function WaterfallSpanIcon({ span }: { span: Span }) {
  if (span.status === 'error') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#ef746b]" />;
  return span.kind === 'model' ? <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-[#d7a04e]" /> : <Wrench className="h-3.5 w-3.5 shrink-0 text-[#55c6a8]" />;
}

function GraphView({ spans, selectedId, onSelect }: { spans: Span[]; selectedId?: string; onSelect: (id: string) => void }) {
  const dag = useMemo(() => buildDag(spans), [spans]);
  const graphId = useId().replace(/:/g, '');
  const forwardArrowId = `${graphId}-arrow-forward`; const returnArrowId = `${graphId}-arrow-return`; const glowId = `${graphId}-selected-glow`;
  return <div className="relative min-h-[430px] overflow-auto bg-[radial-gradient(circle,#1b2932_1px,transparent_1px)] [background-size:22px_22px]">
    <svg width={dag.width} height={dag.height} viewBox={`0 0 ${dag.width} ${dag.height}`} className="mx-auto block min-w-full" role="img" aria-label="Agent execution DAG">
      <defs>
        <marker id={forwardArrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#476775" /></marker>
        <marker id={returnArrowId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#3b927e" /></marker>
        <filter id={glowId} x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {dag.edges.map((edge) => { const from = dag.nodeMap.get(edge.from)!; const to = dag.nodeMap.get(edge.to)!; const x1 = from.x + from.width / 2; const y1 = from.y + from.height; const x2 = to.x + to.width / 2; const y2 = to.y; const bend = Math.max(24, (y2 - y1) * .48); return <path key={`${edge.from}-${edge.to}`} d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`} fill="none" stroke={edge.returnEdge ? '#3b927e' : '#476775'} strokeWidth="1.5" strokeDasharray={edge.returnEdge ? '5 5' : undefined} markerEnd={`url(#${edge.returnEdge ? returnArrowId : forwardArrowId})`} opacity=".9" />; })}
      {dag.nodes.map((node) => { const selected = node.spanId === selectedId; const model = node.kind === 'model'; const tool = node.kind === 'tool'; const stroke = selected ? '#8f82ff' : model ? '#7b5a30' : tool ? '#286655' : '#52616c'; const fill = model ? '#15150f' : tool ? '#0c1917' : '#10171d'; const select = () => node.spanId && onSelect(node.spanId); return <g key={node.id} transform={`translate(${node.x},${node.y})`} role={node.spanId ? 'button' : undefined} tabIndex={node.spanId ? 0 : undefined} aria-label={node.spanId ? `${node.label}, ${node.subtitle || node.kind}, ${node.duration}` : undefined} onClick={select} onKeyDown={(event) => { if (node.spanId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(); } }} className={node.spanId ? 'cursor-pointer outline-none focus-visible:[&>rect:first-of-type]:stroke-[#b8b1ff] focus-visible:[&>rect:first-of-type]:stroke-[3]' : ''} filter={selected ? `url(#${glowId})` : undefined}>
        <rect width={node.width} height={node.height} rx={node.kind === 'boundary' ? 22 : 10} fill={fill} stroke={stroke} strokeWidth={selected ? 2 : 1.2} />
        {node.kind !== 'boundary' && <><rect x="12" y="14" width="28" height="28" rx="7" fill={model ? '#4a351d' : '#153a32'} /><g transform="translate(19 21)" color={model ? '#efb75f' : '#65d3b5'}>{model ? <BrainCircuit width="14" height="14" aria-hidden="true" /> : <Wrench width="14" height="14" aria-hidden="true" />}</g></>}
        <text x={node.kind === 'boundary' ? node.width / 2 : 50} y={node.kind === 'boundary' ? 27 : 24} textAnchor={node.kind === 'boundary' ? 'middle' : 'start'} fill="#dce5ec" fontSize="12" fontWeight="700">{node.label}</text>
        {node.subtitle && <text x="50" y="41" fill="#71808d" fontSize="9" fontFamily="monospace">{truncate(node.subtitle, 28)}</text>}
        {node.duration && <text x={node.width - 10} y="25" textAnchor="end" fill="#8c99a5" fontSize="9" fontFamily="monospace">{node.duration}</text>}
      </g>; })}
    </svg>
  </div>;
}

function Inspector({ span, records, agentSpaceName }: { span?: Span; records: RecordEntry[]; agentSpaceName: string }) {
  const [tab, setTab] = useState<'overview' | 'input' | 'output' | 'metadata'>('overview'); const [raw, setRaw] = useState('');
  useEffect(() => { setTab('overview'); setRaw(''); }, [span?.id]);
  useEffect(() => { if (span?.tool && (tab === 'input' || tab === 'output') && !raw) { const ref = span.tool.ref || `${span.invocationId}/tools/${span.tool.functionCallId}.json`; void getLocalToolTrace(agentSpaceName, ref).then(({ trace }) => setRaw(JSON.stringify(tab === 'input' ? trace.request : trace.response ?? { error: trace.error }, null, 2))); } }, [agentSpaceName, raw, span, tab]);
  if (!span) return null;
  const related = relatedRecords(span, records);
  return <aside className="min-w-0 bg-[#0a1117]"><div className="border-b border-[#202a34] p-4"><div className="flex items-center gap-3"><SpanIcon kind={span.kind} failed={span.status === 'error'} /><div className="min-w-0"><h3 className="truncate text-base font-semibold text-[#e0e7ee]">{span.name}</h3><p className="truncate font-mono text-[11px] text-[#71808e]">{span.id}</p></div></div><div className="mt-4 flex gap-1" role="tablist" aria-label="Span details">{(['overview', 'input', 'output', 'metadata'] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} aria-controls={`span-panel-${item}`} key={item} onClick={() => { setTab(item); setRaw(''); }} className={cn('rounded px-2.5 py-1 text-xs font-semibold capitalize text-[#75828f] hover:bg-[#1d2530] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-action)]', tab === item && 'bg-[#292348] text-[#c2bcff]')}>{item}</button>)}</div></div>
    <div id={`span-panel-${tab}`} role="tabpanel" className="max-h-[520px] overflow-auto p-4">{tab === 'overview' && <Overview span={span} />}{tab === 'input' && (span.tool ? <CodeBlock value={raw || 'Loading request…'} /> : <MessageList records={related.filter(isInputRecord)} empty="No persisted input message for this span." />)}{tab === 'output' && (span.tool ? <CodeBlock value={raw || 'Loading response…'} /> : <MessageList records={related.filter((r) => !isInputRecord(r))} empty="No persisted output message for this span." />)}{tab === 'metadata' && <CodeBlock value={JSON.stringify(span.model ?? span.tool ?? span, null, 2)} />}</div>
  </aside>;
}

function Overview({ span }: { span: Span }) { const model = span.model; const tool = span.tool; return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#23303a] bg-[#23303a]">{model ? <><Fact label="Model" value={model.model || 'unknown'} /><Fact label="Duration" value={formatDuration(span.durationMillis)} /><Fact label="Input" value={formatExact(model.inputTokens)} /><Fact label="Cache read" value={formatExact(model.cachedInputTokens)} /><Fact label="Uncached" value={formatExact(Math.max(0, model.inputTokens - model.cachedInputTokens))} /><Fact label="Tool-use input" value={formatExact(model.toolUseInputTokens ?? 0)} /><Fact label="Generated" value={formatExact(model.outputTokens)} /><Fact label="Reasoning" value={formatExact(model.reasoningTokens)} /><Fact label="Total output" value={formatExact(totalOutput(model))} /><Fact label="Finish reason" value={model.finishReason || '—'} /></> : tool ? <><Fact label="Skill" value={tool.skill || 'runtime'} /><Fact label="Action" value={tool.action || tool.toolName} /><Fact label="Duration" value={formatDuration(tool.durationMillis)} /><Fact label="Status" value={tool.status || 'ok'} /><Fact label="Raw payload" value={formatBytes(tool.rawBytes)} /><Fact label="Model payload" value={formatBytes(tool.modelBytes ?? 0)} /></> : <><Fact label="Status" value={span.status} /><Fact label="Duration" value={formatDuration(span.durationMillis)} /></>}</div>; }

function UsageView({ traces }: { traces: InvocationTrace[] }) { const calls = traces.flatMap((trace) => trace.summary.modelCalls); return <div className="overflow-x-auto p-4"><table className="w-full min-w-[840px] border-separate border-spacing-0 overflow-hidden rounded-lg border border-[#25313b] text-left"><thead><tr className="bg-[#101922] text-[10px] uppercase tracking-[.12em] text-[#6f7d89]">{['Call', 'Model', 'Input', 'Cache', 'Uncached', 'Tool-use', 'Generated', 'Reasoning', 'Total output', 'Duration'].map((h) => <th key={h} className="border-b border-[#25313b] px-3 py-2.5">{h}</th>)}</tr></thead><tbody>{calls.map((call) => <tr key={`${call.eventId}-${call.sequence}`} className="bg-[#0b1218] font-mono text-xs text-[#b7c2cc] hover:bg-[#0f1920]"><td className="px-3 py-2.5 text-[#d7a657]">#{call.sequence}</td><td className="px-3 py-2.5">{call.model}</td><td className="px-3 py-2.5">{formatExact(call.inputTokens)}</td><td className="px-3 py-2.5 text-[#65cdb1]">{formatExact(call.cachedInputTokens)}</td><td className="px-3 py-2.5">{formatExact(Math.max(0, call.inputTokens - call.cachedInputTokens))}</td><td className="px-3 py-2.5">{formatExact(call.toolUseInputTokens ?? 0)}</td><td className="px-3 py-2.5">{formatExact(call.outputTokens)}</td><td className="px-3 py-2.5 text-[#d0a15c]">{formatExact(call.reasoningTokens)}</td><td className="px-3 py-2.5">{formatExact(totalOutput(call))}</td><td className="px-3 py-2.5">{formatDuration(call.durationMillis ?? 0)}</td></tr>)}</tbody></table></div>; }

function MessageList({ records, empty }: { records: RecordEntry[]; empty: string }) { const [copiedId, setCopiedId] = useState(''); if (!records.length) return <div className="rounded-lg border border-dashed border-[#2a3741] p-4 text-xs text-[#71808d]">{empty}</div>; return <div className="space-y-3">{records.map((record) => { const content = record.content || record.toolCall?.input || record.toolResult?.output || record.loadSkill?.output || record.loadTool?.output || 'No text content'; return <div key={record.recordId} className="rounded-lg border border-[#24313b] bg-[#0d161d] p-3"><div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#6fcfb5]"><span>{record.recordType}</span><button type="button" aria-label={`Copy ${record.recordType}`} onClick={() => void navigator.clipboard.writeText(content).then(() => { setCopiedId(record.recordId); window.setTimeout(() => setCopiedId((current) => current === record.recordId ? '' : current), 1600); })} className="inline-flex items-center gap-1 rounded p-1 text-[#82909c] hover:bg-[#202936] hover:text-[#dce5ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-action)]"><Copy aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only" aria-live="polite">{copiedId === record.recordId ? 'Copied' : ''}</span></button></div><div className="whitespace-pre-wrap break-words text-xs leading-5 text-[#bdc7d0]">{content}</div></div>; })}</div>; }
function CodeBlock({ value }: { value: string }) { return <pre className="max-h-[420px] overflow-auto rounded-lg border border-[#202c35] bg-[#060b0f] p-3 font-mono text-[11px] leading-5 text-[#afbbc5]">{value}</pre>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-[#0d161d] p-3"><div className="text-[11px] font-bold uppercase tracking-[.1em] text-[#71808e]">{label}</div><div className="mt-1 truncate font-mono text-xs tabular-nums text-[#d5dee6]" title={value}>{value}</div></div>; }
function SpanIcon({ kind, failed }: { kind: Span['kind']; failed: boolean }) { if (failed) return <span className="grid h-7 w-7 place-items-center rounded-md bg-red-500/10 text-red-300"><AlertTriangle className="h-4 w-4" /></span>; const style = kind === 'model' ? 'bg-[#4a351d] text-[#efb75f]' : kind === 'tool' ? 'bg-[#153a32] text-[#65d3b5]' : 'bg-[#17384a] text-[#72c7ee]'; return <span className={cn('grid h-7 w-7 place-items-center rounded-md', style)}>{kind === 'model' ? <BrainCircuit className="h-4 w-4" /> : kind === 'tool' ? <Wrench className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}</span>; }
function Metric({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) { return <div className="bg-[#0d151c] px-3 py-3"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-[#71808e]"><span aria-hidden="true" className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}</div><div className={cn('mt-1 font-mono text-base font-semibold tabular-nums text-[#dce5ed]', accent && 'text-[#72ddc0]')}>{value}</div></div>; }
function StatusPill({ status, errors }: { status: string; errors: number }) { const running = status === 'in_progress'; const failed = status === 'error' || status === 'failed'; const withIssues = !failed && !running && errors > 0; const label = failed ? 'Failed' : running ? 'Running' : withIssues ? `${errors} issues` : 'Completed'; return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider', failed ? 'border-red-400/30 bg-red-400/10 text-red-300' : running ? 'border-blue-400/30 bg-blue-400/10 text-[#73b7ff]' : withIssues ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300')}>{label}</span>; }
function PanelMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) { return <div className={cn('rounded-lg border border-[#26303b] bg-[#0b1118] p-4 text-sm text-[#8793a2]', error && 'border-red-500/30 text-red-300')}>{children}</div>; }

function buildSpans(traces: InvocationTrace[]): Span[] { const result: Span[] = []; for (const trace of traces) { const s = trace.summary; result.push({ id: `inv:${s.invocationId}`, invocationId: s.invocationId, kind: 'invocation', name: 'Agent invocation', subtitle: s.invocationId, startedAt: s.startedAt, completedAt: s.completedAt ?? new Date().toISOString(), durationMillis: effectiveTraceDuration(trace), status: s.status }); let previous = new Date(s.startedAt).getTime(); for (const call of s.modelCalls) { const completed = call.completedAt || call.timestamp; const started = call.startedAt || new Date(previous).toISOString(); const duration = call.durationMillis ?? Math.max(0, new Date(completed).getTime() - new Date(started).getTime()); result.push({ id: `model:${s.invocationId}:${call.sequence}`, invocationId: s.invocationId, kind: 'model', name: `Model #${call.sequence}`, subtitle: `${call.model || 'model'} · ${formatNumber(call.inputTokens)} input`, startedAt: started, completedAt: completed, durationMillis: duration, status: 'ok', model: call }); previous = new Date(completed).getTime(); } for (const tool of trace.tools) result.push({ id: `tool:${s.invocationId}:${tool.functionCallId}`, invocationId: s.invocationId, kind: 'tool', name: tool.action || tool.toolName, subtitle: tool.skill || 'runtime', startedAt: tool.startedAt, completedAt: tool.completedAt, durationMillis: tool.durationMillis, status: tool.status || (tool.error ? 'error' : 'ok'), tool }); } return result; }
function summarize(traces: InvocationTrace[]) { const x = traces.reduce((a, t) => { const s = t.summary; a.duration += effectiveTraceDuration(t); a.models += s.modelCallCount; a.tools += s.toolCallCount; a.errors += s.errorCount; a.input += s.inputTokens; a.cached += s.cachedInputTokens; a.generated += s.outputTokens; a.reasoning += s.reasoningTokens; a.raw += s.rawToolBytes; a.compact += s.modelToolBytes; return a; }, { duration: 0, models: 0, tools: 0, errors: 0, input: 0, cached: 0, generated: 0, reasoning: 0, raw: 0, compact: 0 }); return { ...x, cacheRate: x.input ? x.cached / x.input * 100 : 0, payloadReduced: x.raw ? Math.max(0, (1 - x.compact / x.raw) * 100) : 0 }; }
function effectiveTraceDuration(trace: InvocationTrace) { const start = new Date(trace.summary.startedAt).getTime(); if (!Number.isFinite(start)) return Math.max(trace.summary.durationMillis, 1); if (trace.summary.status !== 'in_progress' && trace.summary.durationMillis > 0) return trace.summary.durationMillis; const observedEnds = [Date.now(), ...trace.tools.map((tool) => new Date(tool.completedAt).getTime()), ...trace.summary.modelCalls.map((call) => new Date(call.completedAt || call.timestamp).getTime())].filter(Number.isFinite); return Math.max(1, Math.max(...observedEnds) - start); }
function relatedRecords(span: Span, records: RecordEntry[]) { if (!span.model) return []; const ids = new Set(span.model.functionCallIds ?? []); const at = new Date(span.completedAt).getTime(); return records.filter((record) => (record.toolCall?.toolUseId && ids.has(record.toolCall.toolUseId)) || (record.loadSkill?.toolUseId && ids.has(record.loadSkill.toolUseId)) || (record.loadTool?.toolUseId && ids.has(record.loadTool.toolUseId)) || (record.modelId === span.model?.model && Math.abs(new Date(record.createdAt).getTime() - at) < 2500)); }
function isInputRecord(record: RecordEntry) { return record.recordType === 'TOOL_RESULT' || record.recordType === 'LOAD_SKILL' || record.recordType === 'LOAD_TOOL'; }

type DagNode = { id: string; spanId?: string; kind: 'boundary' | 'model' | 'tool'; label: string; subtitle: string; duration: string; x: number; y: number; width: number; height: number };
type DagEdge = { from: string; to: string; returnEdge?: boolean };

function buildDag(spans: Span[]) {
  const models = spans.filter((span) => span.kind === 'model').sort(byStart);
  const tools = spans.filter((span) => span.kind === 'tool').sort(byStart);
  const assigned = new Map<string, Span[]>();
  const claimedTools = new Set<string>();

  for (const model of models) {
    const ids = new Set(model.model?.functionCallIds ?? []);
    const matches = tools.filter((tool) => tool.tool && ids.has(tool.tool.functionCallId));
    if (matches.length) {
      assigned.set(model.id, matches);
      matches.forEach((tool) => claimedTools.add(tool.id));
    }
  }
  for (const tool of tools) {
    if (claimedTools.has(tool.id)) continue;
    const toolStart = new Date(tool.startedAt).getTime();
    const owner = [...models].reverse().find((model) => new Date(model.completedAt).getTime() <= toolStart + 1500);
    if (owner) assigned.set(owner.id, [...(assigned.get(owner.id) ?? []), tool]);
  }

  const layers: Array<Array<Omit<DagNode, 'x' | 'y'>>> = [[{ id: 'dag:start', kind: 'boundary', label: '__start__', subtitle: '', duration: '', width: 142, height: 44 }]];
  const edges: DagEdge[] = [];
  let previousExit = ['dag:start'];
  models.forEach((model) => {
    const modelNode = dagNodeFromSpan(model);
    layers.push([modelNode]);
    previousExit.forEach((from) => edges.push({ from, to: modelNode.id, returnEdge: from.startsWith('tool:') }));
    const modelTools = (assigned.get(model.id) ?? []).sort(byStart);
    if (modelTools.length) {
      const toolNodes = modelTools.map(dagNodeFromSpan);
      layers.push(toolNodes);
      toolNodes.forEach((toolNode) => edges.push({ from: modelNode.id, to: toolNode.id }));
      previousExit = toolNodes.map((node) => node.id);
    } else {
      previousExit = [modelNode.id];
    }
  });
  const endNode = { id: 'dag:end', kind: 'boundary' as const, label: '__end__', subtitle: '', duration: '', width: 142, height: 44 };
  layers.push([endNode]);
  previousExit.forEach((from) => edges.push({ from, to: endNode.id, returnEdge: from.startsWith('tool:') }));

  const horizontalGap = 34; const verticalGap = 68; const padding = 36;
  const widestLayer = Math.max(...layers.map((layer) => layer.reduce((sum, node) => sum + node.width, 0) + Math.max(0, layer.length - 1) * horizontalGap));
  const width = Math.max(720, widestLayer + padding * 2);
  let y = padding;
  const nodes: DagNode[] = [];
  for (const layer of layers) {
    const layerWidth = layer.reduce((sum, node) => sum + node.width, 0) + Math.max(0, layer.length - 1) * horizontalGap;
    let x = (width - layerWidth) / 2;
    const layerHeight = Math.max(...layer.map((node) => node.height));
    for (const node of layer) { nodes.push({ ...node, x, y }); x += node.width + horizontalGap; }
    y += layerHeight + verticalGap;
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return { nodes, edges, nodeMap, width, height: y - verticalGap + padding };
}

function dagNodeFromSpan(span: Span): Omit<DagNode, 'x' | 'y'> { return { id: span.id, spanId: span.id, kind: span.kind === 'model' ? 'model' : 'tool', label: span.name, subtitle: span.subtitle, duration: formatDuration(span.durationMillis), width: 206, height: 58 }; }
function byStart(a: Span, b: Span) { return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(); }
function totalOutput(call: ModelCallTrace) { return call.totalOutputTokens ?? call.outputTokens + call.reasoningTokens; }
function clamp(value: number) { return Math.max(0, Math.min(99.2, value)); }
function truncate(value: string, max: number) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function formatDuration(ms: number) { if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`; if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`; return `${Math.max(0, Math.round(ms))}ms`; }
function formatNumber(value: number) { return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value); }
function formatExact(value: number) { return new Intl.NumberFormat('en-US').format(value || 0); }
function formatBytes(value: number) { return value >= 1024 ? `${(value / 1024).toFixed(1)}KB` : `${value || 0}B`; }
