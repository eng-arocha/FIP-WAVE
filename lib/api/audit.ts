import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import type { NextRequest } from 'next/server'

/**
 * Registra um evento sensível na trilha de auditoria (tabela audit_log).
 *
 * Padrão de nomenclatura do `event`:
 *   `<entidade>.<acao>` em snake-case dentro de cada parte.
 *   Ex: 'medicao.aprovada', 'solicitacao.desaprovada', 'usuario.permissao_alterada'
 *
 * Estratégia de ruído zero:
 *   - Falha em gravar audit NÃO deve falhar a operação de negócio.
 *     Loga no console e segue.
 *   - Usa o admin client (service role) pra bypassar RLS — a policy da
 *     tabela é "insert any" mas leitura é restrita.
 *
 * Uso típico (em route handler ou lib/db):
 *
 *   import { audit } from '@/lib/api/audit'
 *   await audit({
 *     event: 'medicao.aprovada',
 *     entity_type: 'medicao',
 *     entity_id: medicaoId,
 *     actor_id: userId,
 *     actor_nome: perfil.nome,
 *     actor_email: perfil.email,
 *     metadata: { comentario },
 *     request: req,
 *   })
 *
 * O parâmetro `request` (NextRequest) é opcional — quando passado, extrai
 * IP e user-agent pros campos actor_ip/actor_user_agent automaticamente.
 */
export interface AuditEvent {
  event: string
  entity_type: string
  entity_id?: string | null
  actor_id?: string | null
  actor_nome?: string | null
  actor_email?: string | null
  before?: unknown
  after?: unknown
  /**
   * Metadados livres. Aceita `null` pra ergonomia em call-sites com
   * `cond ? {...} : null`.
   */
  metadata?: Record<string, unknown> | null
  request?: Request | NextRequest
}

function extractIp(req: Request | NextRequest | undefined): string | null {
  if (!req) return null
  // `x-forwarded-for` pode vir com múltiplos IPs, primeiro é o cliente original
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

function extractUserAgent(req: Request | NextRequest | undefined): string | null {
  if (!req) return null
  return req.headers.get('user-agent')
}

export async function audit(ev: AuditEvent): Promise<void> {
  try {
    const admin = createAdminClient()
    const row = {
      actor_id: ev.actor_id ?? null,
      actor_nome: ev.actor_nome ?? null,
      actor_email: ev.actor_email ?? null,
      actor_ip: extractIp(ev.request),
      actor_user_agent: extractUserAgent(ev.request),
      event: ev.event,
      entity_type: ev.entity_type,
      entity_id: ev.entity_id ?? null,
      before: ev.before ?? null,
      after: ev.after ?? null,
      metadata: ev.metadata ?? null,
    }
    const { error } = await admin.from('audit_log').insert(row)
    if (error) {
      // A tabela pode ainda não existir em ambiente que não rodou a migration —
      // degrada graciosamente sem quebrar a operação principal.
      log.warn('audit_log_insert_failed', { event: ev.event, error: error.message })
    }
  } catch (e: any) {
    log.warn('audit_log_exception', { event: ev.event, error: e?.message })
  }
}

/**
 * Helper de consulta pra UI administrativa. Retorna timeline por entidade
 * ou por ator. Limitado por padrão — paginar via offset/limit se necessário.
 */
export async function buscarAuditoria(opts: {
  entity_type?: string
  entity_id?: string
  actor_id?: string
  event?: string
  since?: string // ISO datetime
  limit?: number
}) {
  const admin = createAdminClient()
  let q = admin
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100)

  if (opts.entity_type) q = q.eq('entity_type', opts.entity_type)
  if (opts.entity_id)   q = q.eq('entity_id', opts.entity_id)
  if (opts.actor_id)    q = q.eq('actor_id', opts.actor_id)
  if (opts.event)       q = q.eq('event', opts.event)
  if (opts.since)       q = q.gte('created_at', opts.since)

  const { data, error } = await q
  if (error) throw error
  return data || []
}
