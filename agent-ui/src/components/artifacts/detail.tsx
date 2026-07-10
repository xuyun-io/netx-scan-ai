import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, Expand, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Artifact } from '@/lib/api';
import { bindArtifactPreviewHeight, buildArtifactPreviewDoc } from '@/lib/artifact-preview';
import { formatSize, formatTime } from '@/lib/utils';

export function ArtifactDetailView({
  artifact,
  content,
  onBack,
  onDelete,
  onDownload,
  onOpenTask,
}: {
  artifact: Artifact;
  content: string;
  onBack: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const previewDoc = useMemo(() => buildArtifactPreviewDoc(artifact, content), [artifact, content]);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const [previewHeight, setPreviewHeight] = useState(520);

  const handlePreviewLoad = useCallback(() => {
    previewCleanupRef.current?.();
    previewCleanupRef.current = bindArtifactPreviewHeight(previewFrameRef.current, setPreviewHeight);
  }, []);

  useEffect(() => {
    setPreviewHeight(520);
    previewCleanupRef.current?.();
    previewCleanupRef.current = null;
  }, [previewDoc]);

  useEffect(() => {
    return () => {
      previewCleanupRef.current?.();
    };
  }, []);

  return (
    <div className="agent-scrollbar min-h-full min-w-0 overflow-y-auto px-5 py-4">
      <div className="min-w-[720px] pb-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <button className="text-[#8f82ff] underline underline-offset-2" onClick={onBack}>
              Artifacts
            </button>
            <ChevronRight className="h-4 w-4 text-[#657080]" />
            <span className="text-[#aab2bf]">Artifact details</span>
          </div>
          <button className="text-[#c4cad5] hover:text-white" aria-label="Back to artifacts" onClick={onBack}>
            <Expand className="h-4 w-4" />
          </button>
        </div>

        <section className="rounded-lg border border-[#222b36] bg-[#121922] p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold text-[#eef2f8]">{artifact.name}</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 border-2 px-4" variant="outline">
                  Actions
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-red-400 focus:text-red-400">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Artifact ID</div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#f2f4f8]">
                {artifact.artifactId}
                <button
                  className="text-[#8f82ff] hover:text-[#aaa2ff]"
                  aria-label="Copy artifact ID"
                  onClick={() => navigator.clipboard.writeText(artifact.artifactId)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Type</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{artifact.type}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Size</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{formatSize(artifact.size)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Created</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{formatTime(artifact.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Version</div>
              <div className="mt-1 text-sm text-[#dce1eb]">{artifact.version ?? 1}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-[#8f98a6]">Source task</div>
              <div className="mt-1 text-sm">
                {artifact.taskId ? (
                  <button
                    className="font-mono text-[#8f82ff] hover:text-[#aaa2ff] hover:underline"
                    onClick={() => onOpenTask(artifact.taskId!)}
                  >
                    {artifact.taskId}
                  </button>
                ) : (
                  <span className="text-[#dce1eb]">-</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 overflow-hidden rounded-lg border border-[#222b36] bg-[#121922]">
          <div className="border-b border-[#222b36] px-5 py-4">
            <h3 className="text-base font-semibold text-[#eef2f8]">Preview</h3>
            <div className="mt-1 text-xs font-normal text-[#9aa3b2]">
              {artifact.type} · {formatSize(artifact.size)}
            </div>
          </div>
          <div className="bg-white" style={{ height: previewHeight }}>
            <iframe
              ref={previewFrameRef}
              srcDoc={previewDoc}
              title={artifact.name}
              className="block h-full w-full border-0 bg-white"
              // allow-scripts is required so that HTML artifacts (e.g. the Chain287 SRE
              // inspection report) can execute their own JS/CSS frameworks inside the preview.
              // Artifact content comes from trusted agent skills, so this is acceptable.
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              onLoad={handlePreviewLoad}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
