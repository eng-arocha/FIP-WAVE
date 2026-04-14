'use client'

/**
 * Global error boundary — última linha de defesa do App Router.
 *
 * Captura erros que não foram pegos por nenhum `error.tsx` de segment,
 * incluindo erros no próprio layout raiz. Precisa renderizar `<html>` e
 * `<body>` porque substitui toda a árvore.
 *
 * Mantém HTML minimalista pra evitar que um erro aqui cascateie.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // eslint-disable-next-line no-console
  if (typeof console !== 'undefined') console.error('[global-error]', error)
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b1220', color: '#e5e7eb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 520, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>Erro inesperado</h1>
            <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 20 }}>
              A aplicação encontrou um problema. Você pode tentar recarregar.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
