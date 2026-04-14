import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { reenviarNotificacao } from '@/lib/email/send'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/cron/notificacoes-retry
 *
 * Reprocessa notificações com status_envio in (pendente, falhou) e
 * proximo_retry_em <= now() e tentativas < 5.
 *
 * Como agendar:
 *  - Vercel Cron (vercel.json):
 *    {
 *      "crons": [
 *        { "path": "/api/cron/notificacoes-retry", "schedule": "*\/5 * * * *" }
 *      ]
 *    }
 *  - GitHub Action curl (alternativa)
 *
 * Segurança: protegido por header Authorization: Bearer ${CRON_SECRET}
 * (defina CRON_SECRET no ambiente). Em dev, sem secret, processa
 * livremente — mas só localhost.
 */
export async function GET(req: Request) {
  // Auth básica do cron — Vercel Cron envia automaticamente o header
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    // Lê até 50 notificações elegíveis pra reprocessamento
    const { data: pendentes, error } = await admin
      .from('notificacoes_log')
      .select('id, tentativas, payload')
      .in('status_envio', ['pendente', 'falhou'])
      .lt('tentativas', 5)
      .or(`proximo_retry_em.is.null,proximo_retry_em.lte.${nowIso}`)
      .not('payload', 'is', null)
      .limit(50)

    if (error) throw error
    const list = (pendentes || []) as any[]

    let okCount = 0
    let errCount = 0
    const results: Array<{ id: string; ok: boolean; error?: string }> = []
    for (const row of list) {
      const r = await reenviarNotificacao(row.id)
      if (r.success) { okCount++ } else { errCount++ }
      results.push({ id: row.id, ok: r.success, error: r.error })
    }

    return NextResponse.json({
      processadas: list.length,
      sucesso: okCount,
      falhas: errCount,
      timestamp: nowIso,
      results,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
