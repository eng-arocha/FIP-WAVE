import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * GET — lista subscriptions (admin).
 * POST — cria nova subscription (admin).
 *
 * Eventos suportados (compatíveis com audit_log):
 *   medicao.aprovada, medicao.rejeitada,
 *   solicitacao.aprovada, solicitacao.rejeitada, solicitacao.desaprovada,
 *   nf_fat_direto.criada, contrato.reajuste_aplicado
 *
 * Lista vazia [] = recebe TODOS os eventos.
 */
const Body = z.object({
  nome: z.string().min(1).max(100),
  url: z.string().url().refine(u => u.startsWith('https://') || u.startsWith('http://'), 'URL deve ser http ou https'),
  events: z.array(z.string().max(100)).max(20).default([]),
  contrato_id: z.string().uuid().nullable().optional(),
})

export async function GET() {
  try {
    const isAdmin = await assertAdmin()
    if (!isAdmin) return NextResponse.json({ error: 'admin only' }, { status: 403 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('webhook_subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    // Não retorna `secret` em listagem
    const sanitized = (data || []).map(({ secret, ...rest }: any) => ({ ...rest, secret_set: !!secret }))
    return NextResponse.json(sanitized)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const isAdmin = await assertAdmin()
    if (!isAdmin) return NextResponse.json({ error: 'admin only' }, { status: 403 })

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const body = parsed.data

    // Gera secret aleatório (32 bytes hex)
    const secret = crypto.randomBytes(32).toString('hex')

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('webhook_subscriptions')
      .insert({
        nome: body.nome,
        url: body.url,
        events: body.events,
        contrato_id: body.contrato_id ?? null,
        secret,
        ativo: true,
      })
      .select()
      .single()
    if (error) throw error

    await audit({
      event: 'webhook.criado',
      entity_type: 'webhook_subscription',
      entity_id: data.id,
      metadata: { nome: body.nome, url: body.url, events: body.events },
      request: req,
    })

    // Retorna o secret APENAS UMA VEZ (na criação) pra cliente armazenar
    return NextResponse.json({ ...data, secret })
  } catch (e: any) {
    return apiError(e)
  }
}
