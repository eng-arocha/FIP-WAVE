'use client'

import { useState, useEffect, useCallback, useRef, ReactNode, CSSProperties, MouseEvent } from 'react'
import { X } from 'lucide-react'
import { pushMaximized, popMaximized } from '@/lib/maximize-state'

/**
 * MaximizableCard — wrapper que adiciona comportamento de "duplo-clique
 * para maximizar" em QUALQUER card da app.
 *
 * Uso:
 *   <MaximizableCard title="Contratos Ativos" className="rounded-xl ..." style={{ ... }}>
 *     ...conteúdo do card...
 *   </MaximizableCard>
 *
 * Por que usa `position: fixed` no mesmo elemento ao invés de duplicar:
 *   Cards contém componentes com state vivo (Recharts, filtros,
 *   checkboxes, inputs). Duplicar o JSX condicionalmente quebra esse
 *   state. Mudando só o posicionamento CSS do MESMO elemento, o React
 *   tree fica intacto — animação, filtros, scroll interno, tudo
 *   continua funcionando.
 *
 * Interação:
 *   - Duplo-clique em área não-interativa: maximiza
 *   - Clique em botão/link/input dentro do card: comportamento normal
 *   - ESC ou clique no backdrop: restaura
 *   - Botão X no canto superior direito quando maximizado
 */

interface MaximizableCardProps {
  children: ReactNode
  /** Título mostrado no header em modo maximizado. */
  title?: string
  /** Classes aplicadas ao wrapper em modo normal. */
  className?: string
  /** Estilos inline em modo normal. */
  style?: CSSProperties
  /** Desabilita o comportamento (útil pra debug ou casos específicos). */
  disabled?: boolean
}

export function MaximizableCard({
  children,
  title = '',
  className,
  style,
  disabled = false,
}: MaximizableCardProps) {
  const [max, setMax] = useState(false)
  const placeholderRef = useRef<HTMLDivElement>(null)
  const [placeholderSize, setPlaceholderSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!max) return
    pushMaximized()
    // Capture phase + stopImmediatePropagation: o ESC fecha a ampliação
    // sem disparar o <EscBack> global (router.back).
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        setMax(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      popMaximized()
    }
  }, [max])

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    if (disabled || max) return
    // Não maximiza se o duplo-clique veio de algo interativo.
    const target = e.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-maximize]')) return

    // Mede o tamanho atual antes de fixar — evita "pulo" no layout
    if (placeholderRef.current) {
      const rect = placeholderRef.current.getBoundingClientRect()
      setPlaceholderSize({ width: rect.width, height: rect.height })
    }
    setMax(true)
  }, [disabled, max])

  // Placeholder mantém o espaço no grid durante o modo maximizado
  const showPlaceholder = max && placeholderSize

  return (
    <>
      {/* Placeholder: ocupa o mesmo espaço no layout quando o card está
          fixed, evitando que elementos ao redor "pulem". */}
      {showPlaceholder && (
        <div
          style={{
            width: placeholderSize.width,
            height: placeholderSize.height,
            visibility: 'hidden',
          }}
          aria-hidden
        />
      )}

      {/* Backdrop — só renderiza quando maximizado */}
      {max && (
        <div
          className="fixed inset-0 z-[99]"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={() => setMax(false)}
        />
      )}

      <div
        ref={placeholderRef}
        className={max ? undefined : className}
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
        } : style}
        onDoubleClick={handleDoubleClick}
        title={!disabled && !max ? (title ? `${title} — duplo clique para maximizar` : 'Duplo clique para maximizar') : undefined}
      >
        {/* Header só aparece em modo maximizado — sticky no topo do card */}
        {max && (
          <div
            className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
          >
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {title || 'Visualização ampliada'}
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
