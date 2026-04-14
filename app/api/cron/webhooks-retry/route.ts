import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deliverWebhook } from '@/lib/api/webhooks'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/cron/webhooks-retry
 *
 * Reprocessa deliveries pendentes elegíveis pra retry.
 * Agendamento idêntico ao cron de notificações (vercel.json: a cada 5min).
 */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: pendentes, error } = await admin
      .from('webhook_deliveries')
      .select(`
        id, payload, tentativa,
        sub:webhook_subscriptions!inner ( id, url, secret )
      `)
      .eq('status', 'pendente')
      .lte('proximo_retry', nowIso)
      .lt('tentativa', 5)
      .limit(50)

    if (error) throw error
    const list = (pendentes || []) as any[]

    for (const row of list) {
      const body = JSON.stringify(row.payload)
      void deliverWebhook(row.sub, body, row.id, row.tentativa ?? 0)
    }

    return NextResponse.json({
      processadas: list.length,
      timestamp: nowIso,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
