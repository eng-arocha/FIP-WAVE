'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Componente compartilhado pelas rotas de erro do App Router
 * (`app/**\/error.tsx`).
 *
 * Padrão:
 *   - Mostra mensagem amigável sem vazar stacktrace ao usuário final
 *   - Registra no console no dev / pode encaminhar pra Sentry quando ativado
 *   - Oferece botão "Tentar novamente" (reset) que rehidrata o segment
 *     sem recarregar a app inteira
 *   - Em dev, exibe detalhes (mensagem + digest) pra facilitar debug
 *
 * Cada segment tem um `error.tsx` de 3 linhas que chama este componente
 * com o título adequado ao escopo.
 */
export function SegmentError({
  error,
  reset,
  title = 'Algo deu errado nesta área.',
  description = 'Nossa equipe já foi notificada. Você pode tentar recarregar.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  useEffect(() => {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[segment-error]', error)
    }
    // Sentry — só roda se SDK estiver ativo (env var setada)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import('@sentry/nextjs').then(Sentry => {
        Sentry.captureException(error, { tags: { source: 'segment-error', digest: error.digest } })
      }).catch(() => {/* sentry pkg ausente — no-op */})
    }
  }, [error])

  const isDev = process.env.NODE_ENV !== 'production'

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div
        className="max-w-lg w-full rounded-xl border p-8 text-center"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
      >
        <div className="flex justify-center mb-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)' }}
          >
            <AlertTriangle className="w-7 h-7" style={{ color: '#ef4444' }} />
          </div>
        </div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-1)' }}>
          {title}
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
          {description}
        </p>
        {isDev && (
          <pre
            className="text-xs text-left p-3 rounded-lg overflow-auto max-h-40 mb-4"
            style={{ background: 'var(--surface-1)', color: 'var(--text-2)' }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--accent, #3b82f6)',
            color: 'white',
          }}
        >
          <RotateCcw className="w-4 h-4" />
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
