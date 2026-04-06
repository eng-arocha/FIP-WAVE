import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-[#1E293B] bg-[#111827] shadow-sm transition-all duration-200 hover:border-[#2d3f5c] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.05),0_4px_20px_rgba(0,0,0,0.3)]',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 p-5 pb-3', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight text-[#F1F5F9]', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-[#94A3B8]', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

/** Glassmorphism variant — apply as className="glass-card" or use directly */
const GlassCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-[#1E293B] bg-[#111827]/60 backdrop-blur-sm shadow-sm transition-colors duration-150 hover:border-[#2d3f5c]',
        className
      )}
      {...props}
    />
  )
)
GlassCard.displayName = 'GlassCard'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, GlassCard }
