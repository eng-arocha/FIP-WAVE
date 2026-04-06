/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Executado UMA VEZ no startup do servidor Node.js.
 * Garante que todas as migrations SQL pendentes sejam aplicadas automaticamente.
 */

export async function register() {
  // Só roda no runtime Node.js (não no Edge Runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations } = await import('./lib/db/auto-migrate')
    await runMigrations()
  }
}
