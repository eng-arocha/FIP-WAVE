import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'destructive'
  /** Tooltip nativo (atributo HTML title). */
  title?: string
}

export function Badge({ children, className, variant = 'default', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
        variant === 'default'     && 'bg-[var(--surface-3)] text-[var(--text-2)] border-[#2d3f5c]',
        variant === 'outline'     && 'bg-transparent text-[var(--text-2)] border-[#2d3f5c]',
        variant === 'success'     && 'bg-emerald-900/40 text-emerald-400 border-emerald-800/60',
        variant === 'warning'     && 'bg-amber-900/40  text-amber-400  border-amber-800/60',
        variant === 'destructive' && 'bg-red-900/40    text-red-400    border-red-800/60',
        className
      )}
    >
      {children}
    </span>
  )
}
