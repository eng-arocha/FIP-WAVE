// components/contratos/visao-geral/numero-clicavel.tsx
'use client'

import { forwardRef } from 'react'

type Props = {
  value: number
  format?: (v: number) => string
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const defaultFormat = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const NumeroClicavel = forwardRef<HTMLButtonElement, Props>(function NumeroClicavel(
  { value, format = defaultFormat, onClick, disabled, ariaLabel, className },
  ref,
) {
  const clickable = !disabled && typeof onClick === 'function' && value > 0
  if (!clickable) {
    return <span className={className}>{format(value)}</span>
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        className ?? '',
        'cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80 hover:decoration-solid focus:outline-none focus:ring-1 focus:ring-[var(--accent-1)] rounded-sm',
      ].join(' ')}
    >
      {format(value)}
    </button>
  )
})
