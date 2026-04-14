import { NextResponse } from 'next/server'
import { log } from '@/lib/log'

/**
 * GET /api/_test/sentry
 *
 * Endpoint TEMPORÁRIO de validação do Sentry/GlitchTip.
 * Dispara um erro server-side que deve aparecer no GlitchTip Issues
 * via lib/log.ts.error() → import dinâmico do SDK.
 *
 * Se aparecer no GlitchTip:
 *   - Server SDK funcional ✅
 *   - DSN correta ✅
 *   - Hook do logger funcional ✅
 *
 * Se NÃO aparecer:
 *   - Provavelmente SENTRY_DSN não está no env do runtime, OU
 *   - Pacote @sentry/nextjs não está instalado em prod
 *
 * REMOVER este arquivo após validação.
 */
export async function GET() {
  const requestId = `sentry-test-${Date.now()}`
  const erro = new Error(`Teste manual GlitchTip — ${requestId}`)

  // Pista pro debug: indica se o SDK está disponível e se a DSN está setada
  const dsnPresente = !!process.env.SENTRY_DSN
  let sdkLoaded = false
  let sdkSendResult: string = 'não testado'
  try {
    const Sentry = await import('@sentry/nextjs')
    sdkLoaded = true
    // Envio direto, sem passar pelo log.ts, pra isolar a causa
    const eventId = Sentry.captureException(erro, {
      tags: { source: '_test/sentry', requestId },
      extra: { dsnPresente, instrumentation: 'manual' },
    })
    // Force flush antes da função terminar (Vercel mata o processo)
    await Sentry.flush(3000)
    sdkSendResult = `enviado (eventId=${eventId})`
  } catch (e: any) {
    sdkSendResult = `falhou: ${e?.message ?? String(e)}`
  }

  // Também loga via log.ts pra exercitar o caminho normal
  log.error('test_sentry_endpoint', erro, { requestId, dsnPresente })

  return NextResponse.json({
    ok: true,
    requestId,
    diagnostico: {
      sentry_dsn_setada: dsnPresente,
      sdk_carregado: sdkLoaded,
      envio_direto: sdkSendResult,
      next_runtime: process.env.NEXT_RUNTIME ?? 'unknown',
      vercel_env: process.env.VERCEL_ENV ?? 'local',
    },
    instrucoes: [
      '1. Verifique no GlitchTip → Issues se apareceu este requestId',
      '2. Se "sentry_dsn_setada=false" → faltou setar a env var no Vercel',
      '3. Se "sdk_carregado=false" → @sentry/nextjs não foi instalado',
      '4. Se "envio_direto=falhou:..." → erro de rede/DSN do servidor pro GlitchTip',
    ],
  })
}
