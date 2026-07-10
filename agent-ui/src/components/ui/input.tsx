import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-[#3a4654] bg-[#121922] px-3 py-2 text-sm text-[#dce1eb] shadow-sm transition-colors',
        'placeholder:text-[#6b7785]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8378ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111821]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
