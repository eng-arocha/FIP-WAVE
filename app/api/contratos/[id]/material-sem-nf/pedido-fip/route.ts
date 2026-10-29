import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAlgumaPermissao } from '@/lib/api/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { getRelatorioMaterialSemNf } from '@/lib/db/material-sem-nf'
import { criarSolicitacaoRascunhoDeMedicao } from '@/lib/db/fat-direto'
import { detalhamentosDeFaturamentoDireto } from '@/lib/db/fat-direto-grupos'
import { textoCortesSaldo } from '@/lib/db/limite-pedido'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/contratos/[id]/material-sem-nf/pedido-fip
 * body: { detalhamento_ids: uuid[] }
 *
 * Pedido de NF de material da FIP SEM medição: cria o rascunho `fip_material`
 * com os itens escolhidos no relatório Material sem NF, cada um pelo valor
 * "Sem NF" — o mesmo número que o boletim pede à FIP (camada ③).
 *
 * O valor é recalculado aqui, nunca vem do cliente. Fica de fora o item:
 *   - sem falta (já comprado desde que a tela abriu);
 *   - com pedido FIP ainda não aprovado (rascunho/em aprovação) — senão dois
 *     cliques geram dois pedidos para o mesmo material;
 *   - de grupo de faturamento direto do terceiro (mesma regra do portão 1).
 * A trava de saldo por item corta o que passar do saldo de material.
 */
const Body = z.object({
  detalhamento_ids: z.array(uuid()).min(1, 'Selecione ao menos um item.').max(500),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requireAlgumaPermissao(['documentos', 'criar'], ['nf_fat_direto', 'lancar'], ['contratos', 'editar'])
  if (negado) return negado
  try {
    const { id: contratoId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const pedidos = new Set(parsed.data.detalhamento_ids)

    const relatorio = await getRelatorioMaterialSemNf(contratoId)
    const terceiro = await detalhamentosDeFaturamentoDireto(createAdminClient(), contratoId)
    const linhas = relatorio.grupos.flatMap(g => g.itens).filter(l => pedidos.has(l.id))

    const ignorados: string[] = []
    const itens: Array<{ detalhamento_id: string; descricao: string; valor_total: number }> = []
    for (const l of linhas) {
      if ((l.fipEmAndamento ?? 0) > 0.5) { ignorados.push(`${l.codigo} (pedido FIP em andamento)`); continue }
      if (terceiro.has(l.id)) { ignorados.push(`${l.codigo} (faturamento direto do terceiro)`); continue }
      if (!(l.semNf > 0.5)) continue
      itens.push({ detalhamento_id: l.id, descricao: l.nome, valor_total: l.semNf })
    }
    if (itens.length === 0) {
      return NextResponse.json(
        { error: ignorados.length ? `Nenhum item a pedir: ${ignorados.join('; ')}.` : 'Nenhum dos itens tem material sem NF.' },
        { status: 422 },
      )
    }

    const sol = await criarSolicitacaoRascunhoDeMedicao({
      contrato_id: contratoId,
      solicitante_id: user.id,
      origem: 'Relatório Material sem NF (sem medição)',
      tipo: 'fip_material',
      itens,
    })
    await audit({
      event: 'solicitacao_fat_direto.rascunho_fip_sem_medicao',
      entity_type: 'solicitacao_fat_direto',
      entity_id: sol.id,
      actor_id: user.id,
      actor_email: user.email ?? null,
      metadata: { tipo: 'fip_material', valor_total: Number(sol.valor_total ?? 0), itens: itens.length },
      request: req,
    })

    const alertas: string[] = []
    const cortado = textoCortesSaldo((sol as { cortes_saldo?: Array<{ codigo: string; cortado: number; gravado: number }> }).cortes_saldo)
    if (cortado) alertas.push(cortado)
    if (ignorados.length) alertas.push(`Fora do pedido: ${ignorados.join('; ')}.`)

    return NextResponse.json({ id: sol.id, numero: sol.numero, valor_total: Number(sol.valor_total ?? 0), alertas }, { status: 201 })
  } catch (e: unknown) {
    if ((e as Error)?.message === 'FIP_MATERIAL_SEM_SALDO') {
      return NextResponse.json(
        { error: 'Nenhum item cabe no saldo de material do contrato.', cortes: (e as { cortes?: unknown }).cortes },
        { status: 422 },
      )
    }
    return apiError(e)
  }
}
