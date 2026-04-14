/**
 * Sentry — inicialização para client e edge runtime.
 *
 * Política:
 *  - Se SENTRY_DSN não está setado, vira no-op (não inicia, não reporta).
 *    Permite rodar dev/CI sem dependência externa e antes do user
 *    criar projeto Sentry.
 *  - Em prod, ativa pleno com sample rate 10% (ajustável via env).
 *  - PII desativado (não envia IPs de usuário, headers de auth).
 *
 * Quando o user adicionar SENTRY_DSN no Vercel, basta redeployar e
 * tudo passa a reportar automaticamente.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    // Filtro de erros conhecidos / ruído de browser
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Network request failed',
    ],
  })
}
