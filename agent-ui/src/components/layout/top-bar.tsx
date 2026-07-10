import { ArrowLeft, Circle, Columns3, Menu } from 'lucide-react';

export function TopBar({
  agentSpaceName,
  onOpenAdmin,
  onLogout,
}: {
  agentSpaceName: string;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex h-11 items-center justify-between border-b border-[#222b36] bg-[#121922] px-3">
      <div className="flex items-center gap-3">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#8f5cff] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[#c3c9d3] transition hover:bg-[#202936] hover:text-white"
            onClick={onOpenAdmin}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Agents
          </button>
          <span className="text-sm font-semibold text-[#f2f4f8]">{agentSpaceName}</span>
          <span className="rounded bg-[#6b7079] px-2 py-0.5 text-[11px] font-medium text-white">
            v1 Preview
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[#8f82ff]">
        <Columns3 className="h-4 w-4" />
        <Circle className="h-4 w-4 fill-current opacity-85" />
        <button
          className="text-xs font-medium hover:text-white"
          onClick={onLogout}
          title="退出登录"
        >
          退出
        </button>
      </div>
    </header>
  );
}
