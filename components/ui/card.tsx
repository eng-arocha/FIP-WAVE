'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pushMaximized, popMaximized } from '@/lib/maximize-state'

/**
 * Card — wrapper padrão de seções/cards da app.
 *
 * Por padrão TODO `<Card>` é "maximizável": duplo-clique em área
 * não-interativa abre o card em visualização ampliada (quase fullscreen).
 * ESC ou clique fora restaura.
 *
 * Para desabilitar em casos pontuais (cards pequenos, aninhados, etc.):
 *   <Card disableMaximize>...</Card>
 *
 * O título no modo maximizado é derivado, em ordem de prioridade:
 *   1. prop `title` passada explicitamente
 *   2. texto do primeiro `<h3>` encontrado dentro do card após mount
 *   3. fallback "Visualização ampliada"
 *
 * Implementação: muda `position` do MESMO elemento (não duplica JSX) pra
 * preservar state dos filhos — Recharts, filtros, inputs continuam
 * funcionando normalmente durante a ampliação.
 */

interface CardMaximizableProps {
  /** Título mostrado no header do modo maximizado. */
  title?: string
  /** Desabilita o duplo-clique. */
  disableMaximize?: boolean
}

type CardProps = React.HTMLAttributes<HTMLDivElement> & CardMaximizableProps

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, disableMaximize = false, onDoubleClick, children, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLDivElement | null>(null)
    // Combina innerRef (usado internamente pra medir) com o forwardedRef do pai
    const setRefs = useCallback((node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    }, [forwardedRef])

    const [max, setMax] = useState(false)
    const [placeholderSize, setPlaceholderSize] = useState<{ width: number; height: number } | null>(null)
    const [derivedTitle, setDerivedTitle] = useState('')

    useEffect(() => {
      if (!max) return
      pushMaximized()
      // Usa capture phase + stopImmediatePropagation pra garantir que o
      // ESC fecha a ampliação ANTES de qualquer outro listener (ex: o
      // <EscBack> global que faz router.back()).
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') {
          e.stopImmediatePropagation()
          e.preventDefault()
          setMax(false)
        }
      }
      window.addEventListener('keydown', onKey, true)
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        window.removeEventListener('keydown', onKey, true)
        document.body.style.overflow = prev
        popMaximized()
      }
    }, [max])

    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      // Chain o handler passado pelo usuário
      onDoubleClick?.(e)
      if (e.defaultPrevented) return
      if (disableMaximize || max) return

      const target = e.target as HTMLElement
      // Ignora se o duplo-clique veio de algo interativo.
      if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-maximize]')) return

      const el = innerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        setPlaceholderSize({ width: rect.width, height: rect.height })
        // Deriva título do primeiro h3 caso nenhum explícito tenha sido dado
        if (!title) {
          const h3 = el.querySelector('h3')
          setDerivedTitle(h3?.textContent?.trim() || '')
        }
      }
      setMax(true)
    }, [disableMaximize, max, onDoubleClick, title])

    const effectiveTitle = title || derivedTitle || 'Visualização ampliada'

    const baseClasses = 'rounded-xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm transition-all duration-200 hover:border-[#2d3f5c] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.05),0_4px_20px_rgba(0,0,0,0.3)]'

    return (
      <>
        {/* Placeholder ocupa o espaço no grid quando card está fixed */}
        {max && placeholderSize && (
          <div
            style={{
              width: placeholderSize.width,
              height: placeholderSize.height,
              visibility: 'hidden',
            }}
            aria-hidden
          />
        )}

        {max && (
          <div
            className="fixed inset-0 z-[99]"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setMax(false)}
          />
        )}

        <div
          ref={setRefs}
          className={max ? undefined : cn(baseClasses, className)}
          style={max ? {
            position: 'fixed',
            top: '24px',
            left: '24px',
            right: '24px',
            bottom: '24px',
            zIndex: 100,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          } : props.style}
          onDoubleClick={disableMaximize ? onDoubleClick : handleDoubleClick}
          title={!disableMaximize && !max ? 'Duplo clique para maximizar' : undefined}
          {...(max ? {} : props)}
        >
          {max && (
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {effectiveTitle}
              </h3>
              <button
                onClick={(e) => { e.stopPropagation(); setMax(false) }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
                style={{ color: 'var(--text-2)' }}
                title="Fechar (ESC)"
                data-no-maximize
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {children}
        </div>
      </>
    )
  }
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
    <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight text-[var(--text-1)]', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-[var(--text-2)]', className)} {...props} />
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

/** Glassmorphism variant — NÃO maximizável (usado pra cards secundários/overlays). */
const GlassCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 backdrop-blur-sm shadow-sm transition-colors duration-150 hover:border-[#2d3f5c]',
        className
      )}
      {...props}
    />
  )
)
GlassCard.displayName = 'GlassCard'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, GlassCard }
