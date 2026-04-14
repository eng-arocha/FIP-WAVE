/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Executado UMA VEZ no startup do servidor.
 * Responsabilidades:
 *   1. Aplica migrations SQL pendentes (Node runtime).
 *   2. Inicializa Sentry/GlitchTip se SENTRY_DSN estiver setado.
 */

export async function register() {
  // Node.js runtime: migrations + Sentry server config
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/db/auto-migrate')
    await runMigrations()
    // Sentry só ativa se DSN setado (no-op caso contrário)
    if (process.env.SENTRY_DSN) {
      await import('./sentry.server.config')
    }
  }
  // Edge runtime: só Sentry edge config
  if (process.env.NEXT_RUNTIME === 'edge' && process.env.SENTRY_DSN) {
    await import('./sentry.edge.config')
  }
}
