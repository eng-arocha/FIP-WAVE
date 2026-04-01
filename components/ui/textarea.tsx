import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-[#1E293B] bg-[#0D1421] px-3 py-2 text-sm text-[#F1F5F9] shadow-sm',
        'placeholder:text-[#475569] resize-none',
        'focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
