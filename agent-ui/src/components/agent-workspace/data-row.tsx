import type { ReactNode } from 'react';

export function DataRow({ gridTemplateColumns, values }: { gridTemplateColumns: string; values: ReactNode[] }) {
  return (
    <div className="grid min-h-12 items-center border-b border-[#202936] px-4 text-sm text-[#dce1eb]" style={{ gridTemplateColumns }}>
      <input aria-label="Select row" className="h-3.5 w-3.5 accent-[#8f82ff]" type="checkbox" />
      {values.map((value, index) => (
        <div key={index} className="truncate border-l border-[#303b49] px-3 font-normal">
          {value}
        </div>
      ))}
    </div>
  );
}
