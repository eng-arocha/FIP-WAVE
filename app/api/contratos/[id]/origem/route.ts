// app/api/contratos/[id]/origem/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { descendantDetalhamentoIds, type WbsNode } from '@/lib/db/wbs-utils'
import { listOrigem } from '@/lib/db/origem'
import { apiError } from '@/lib/api/error-response'
import type { DashboardModo } from '@/types/dashboard'
import type { OrigemResponse, OrigemTipo, OrigemResumoStatus } from '@/types/origem'

/**
 * GET /api/contratos/[id]/origem
 *
 * Devolve o payload `OrigemResponse` com os itens de origem (NFs ou
 * pedidos/medições com saldo) do contrato, filtrados por modo, tipo de
 * origem e escopo WBS.
 *
 * Query params (todos opcionais):
 *   - modo    → 'total' | 'material' | 'servico'  (default: 'total')
 *   - origem  → 'realizado' | 'saldo'              (default: 'realizado')
 *   - scope   → UUID de grupo_macro, tarefa ou detalhamento;
 *               "" ou "null" → todos os detalhamentos do contrato.
 *
 * `runtime = 'nodejs'` é necessário porque `createAdminClient()` usa
 * SUPABASE_SERVICE_ROLE_KEY, que não está disponível no edge runtime.
 *
 * `dynamic = 'force-dynamic'` + Cache-Control no-store: os dados refletem
 * o estado atual das NFs/medições e não podem ser cacheados pelo Vercel CDN.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params
    const url = new URL(req.url)

    // --- Query params ---
    const modoRaw = url.searchParams.get('modo') ?? 'total'
    const origemRaw = url.searchParams.get('origem') ?? 'realizado'
    const scopeRaw = url.searchParams.get('scope')
    const scopeId =
      scopeRaw === null || scopeRaw === '' || scopeRaw === 'null'
        ? null
        : scopeRaw

    const modo: DashboardModo = (
      ['total', 'material', 'servico'] as const
    ).includes(modoRaw as DashboardModo)
      ? (modoRaw as DashboardModo)
      : 'total'

    const origem: OrigemTipo = origemRaw === 'saldo' ? 'saldo' : 'realizado'

    const admin = createAdminClient()

    // --- Carregar a WBS completa do contrato ---
    const [grupos, tarefas, dets] = await Promise.all([
      admin
        .from('grupos_macro')
        .select('id, codigo, nome')
        .eq('contrato_id', contratoId),
      admin.from('tarefas').select('id, codigo, nome, grupo_macro_id'),
      admin.from('detalhamentos').select('id, codigo, descricao, tarefa_id'),
    ])

    // Montar array de WbsNode enriquecido (+ codigo + nome)
    const nodes: Array<WbsNode & { codigo: string; nome: string }> = [
      ...((grupos.data ?? []).map(g => ({
        id: g.id as string,
        pai_id: null as string | null,
        nivel: 1 as const,
        codigo: String(g.codigo),
        nome: String(g.nome),
      }))),
      ...((tarefas.data ?? []).map(t => ({
        id: t.id as string,
        pai_id: t.grupo_macro_id as string | null,
        nivel: 2 as const,
        codigo: String(t.codigo),
        nome: String(t.nome),
      }))),
      ...((dets.data ?? []).map(d => ({
        id: d.id as string,
        pai_id: d.tarefa_id as string | null,
        nivel: 3 as const,
        codigo: String(d.codigo),
        nome: String(d.descricao),
      }))),
    ]

    // --- Resolver escopo → conjunto de detalhamento IDs alvo ---
    const alvos = descendantDetalhamentoIds(scopeId, nodes)

    // --- Buscar itens de origem ---
    const itens = await listOrigem(contratoId, modo, origem, alvos)

    // --- Total ---
    const total = itens.reduce((s, it) => {
      if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') {
        return s + it.valorAlocado
      }
      return s + it.saldo
    }, 0)

    // --- Resumo de status (apenas em realizado — itens com NF) ---
    let resumoStatus: OrigemResumoStatus | undefined = undefined
    if (origem === 'realizado') {
      resumoStatus = { validadas: 0, pendentes: 0, rejeitadas: 0 }
      for (const it of itens) {
        if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') {
          const s = String(it.status ?? '').toLowerCase()
          if (s === 'validada') resumoStatus.validadas! += 1
          else if (s === 'pendente') resumoStatus.pendentes! += 1
          else if (s === 'rejeitada') resumoStatus.rejeitadas! += 1
        }
      }
    }

    // --- Scope info ---
    let scopeInfo: OrigemResponse['scope'] = null
    if (scopeId === null) {
      scopeInfo = { id: null, codigo: '', nome: 'Todos os grupos', nivel: null }
    } else {
      const node = nodes.find(n => n.id === scopeId)
      if (node) {
        scopeInfo = {
          id: node.id,
          codigo: node.codigo,
          nome: node.nome,
          nivel: node.nivel,
        }
      }
    }

    // --- Ordenar por data desc (NFs) ou aprovado desc (saldos) ---
    itens.sort((a, b) => {
      const da = 'data' in a ? a.data : (a.aprovadoEm ?? '')
      const db = 'data' in b ? b.data : (b.aprovadoEm ?? '')
      return db.localeCompare(da)
    })

    const response: OrigemResponse = {
      total,
      count: itens.length,
      itens,
      resumoStatus,
      scope: scopeInfo,
      modo,
      origem,
    }

    return NextResponse.json(response, { headers: CACHE_HEADERS })
  } catch (e) {
    return apiError(e)
  }
}
