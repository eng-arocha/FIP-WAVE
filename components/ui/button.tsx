import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080C14] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/30 hover:shadow-blue-700/40 hover:brightness-110 focus-visible:ring-blue-500',
        destructive:
          'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-600 shadow-sm',
        outline:
          'border border-[#2d3f5c] bg-transparent text-[var(--text-2)] hover:border-blue-500 hover:text-white focus-visible:ring-blue-500',
        secondary:
          'bg-[var(--surface-3)] text-[var(--text-2)] hover:bg-[#1E293B] hover:text-[var(--text-1)] focus-visible:ring-[#2d3f5c]',
        ghost:
          'bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] focus-visible:ring-[#2d3f5c]',
        link:
          'text-blue-400 underline-offset-4 hover:underline hover:text-cyan-400',
        success:
          'bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-emerald-600 shadow-sm',
        warning:
          'bg-amber-500 text-white hover:bg-amber-400 focus-visible:ring-amber-500 shadow-sm',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-11 rounded-md px-8 text-base',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
