import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-[#1E293B] bg-[#0D1421] px-3 py-1 text-sm text-[#F1F5F9] shadow-sm transition-colors',
          'placeholder:text-[#475569]',
          'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
