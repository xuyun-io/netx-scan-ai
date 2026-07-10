import type { Artifact } from '@/lib/api';
import { cn, formatSize, formatTime } from '@/lib/utils';

export function ArtifactRow({
  artifact,
  gridTemplateColumns,
  selected,
  onOpen,
  onSelect,
}: {
  artifact: Artifact;
  gridTemplateColumns: string;
  selected: boolean;
  onOpen: (artifact: Artifact) => void;
  onSelect: (artifact: Artifact) => void;
}) {
  return (
    <div
      className={cn(
        'grid min-h-12 cursor-pointer items-center border-b px-4 text-sm text-[#dce1eb] transition',
        selected
          ? 'border-[#8f82ff]/40 bg-[#8f82ff]/15'
          : 'border-[#202936] hover:bg-[#1a2330]',
      )}
      style={{ gridTemplateColumns }}
      onClick={() => onOpen(artifact)}
    >
      <input
        aria-label={`Select ${artifact.name}`}
        checked={selected}
        className="h-3.5 w-3.5 accent-[#8f82ff]"
        type="checkbox"
        onChange={() => onSelect(artifact)}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="truncate border-l border-[#303b49] px-3 font-medium text-[#8f82ff] hover:underline">
        {artifact.name}
      </div>
      <div className="truncate border-l border-[#303b49] px-3">{artifact.type}</div>
      <div className="truncate border-l border-[#303b49] px-3">{formatSize(artifact.size)}</div>
      <div className="truncate border-l border-[#303b49] px-3">{formatTime(artifact.createdAt)}</div>
    </div>
  );
}
