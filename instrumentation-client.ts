/**
 * Next.js Client Instrumentation Hook (Next 15.3+).
 *
 * Roda UMA VEZ no client após hidratação. Usado pra inicializar o
 * Sentry/GlitchTip no browser sem depender do `withSentryConfig` do
 * SDK (que tenta upload de source maps e exige SENTRY_AUTH_TOKEN).
 *
 * O `sentry.client.config.ts` faz o `Sentry.init()` propriamente — basta
 * importar pra disparar a inicialização. Se a DSN não estiver no env,
 * o init vira no-op.
 */

import './sentry.client.config'
