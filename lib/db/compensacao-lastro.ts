import type { SupabaseClient } from '@supabase/supabase-js'
import { isSchemaMissingError, withSchemaFallback } from '@/lib/db/resilient'
import { basesDoDetalhamento, baseParaNatureza, naturezaDoPedido } from '@/lib/db/saldo-detalhamento'
import { chaveDoCodigo, type ItemDestino } from '@/lib/informakon/compensacao-lastro'

/**
 * Leitura e escrita das compensações de lastro (migration 085). A regra está
 * em lib/informakon/compensacao-lastro.ts.
 *
 * Tudo aqui é resiliente à migration ausente: sem as tabelas, não há
 * compensação, o saldo por item e o boletim seguem exatamente como antes.
 */

export const TABELAS_085 = ['compensacoes_lastro', 'compensacoes_lastro_itens']

export interface CompensacaoRegistrada {
  id: string
  medicao_id: string
  chave_falta: string
  chave_nota: string
  valor: number
  notas: string[]
  motivo: string | null
  created_at: string
  itens: Array<{ detalhamento_id: string; valor: number }>
}

/** Todas as compensações do contrato. `disponivel: false` = migration 085 pendente. */
export async function carregarCompensacoes(
  admin: SupabaseClient,
  contratoId: string,
): Promise<{ disponivel: boolean; lista: CompensacaoRegistrada[] }> {
  const { data, error } = await admin
    .from('compensacoes_lastro')
    .select('id, medicao_id, chave_falta, chave_nota, valor, notas, motivo, created_at, itens:compensacoes_lastro_itens ( detalhamento_id, valor )')
    .eq('contrato_id', contratoId)
    .order('created_at', { ascending: true })
  if (error) {
    if (isSchemaMissingError(error, TABELAS_085)) return { disponivel: false, lista: [] }
    console.warn('[compensacao-lastro] falha ao carregar:', error.message)
    return { disponivel: false, lista: [] }
  }
  const lista = ((data || []) as any[]).map(r => ({
    id: r.id,
    medicao_id: r.medicao_id,
    chave_falta: String(r.chave_falta),
    chave_nota: String(r.chave_nota),
    valor: Number(r.valor || 0),
    notas: (r.notas || []) as string[],
    motivo: r.motivo ?? null,
    created_at: r.created_at,
    itens: ((r.itens || []) as any[]).map(i => ({ detalhamento_id: i.detalhamento_id, valor: Number(i.valor || 0) })),
  }))
  return { disponivel: true, lista }
}

/** Soma por chave — `campo` escolhe o lado (falta ou nota). */
export function somarPorChave(
  lista: CompensacaoRegistrada[],
  campo: 'chave_falta' | 'chave_nota',
  filtro?: (c: CompensacaoRegistrada) => boolean,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const c of lista) {
    if (filtro && !filtro(c)) continue
    out.set(c[campo], (out.get(c[campo]) || 0) + c.valor)
  }
  return out
}

/**
 * Redução de saldo a gastar por detalhamento. É CONSUMO de material do item:
 * o saldo por item e a trava de novo pedido somam isto ao aprovado.
 */
export async function carregarCompensadoPorDetalhamento(
  admin: SupabaseClient,
  detIds: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (detIds.length === 0) return out
  const { data, error } = await admin
    .from('compensacoes_lastro_itens')
    .select('detalhamento_id, valor')
    .in('detalhamento_id', detIds)
  if (error) {
    if (!isSchemaMissingError(error, TABELAS_085)) {
      console.warn('[compensacao-lastro] falha ao carregar redução por item:', error.message)
    }
    return out
  }
  for (const r of (data || []) as any[]) {
    out[r.detalhamento_id] = (out[r.detalhamento_id] || 0) + Number(r.valor || 0)
  }
  return out
}

/**
 * Saldo a gastar de MATERIAL dos itens de um macro item, na mesma conta do
 * saldo por item: base de material − pedidos aprovados e em aprovação
 * (líquidos de devolução) − compensações já registradas.
 */
export async function saldoMaterialDoMacroItem(
  admin: SupabaseClient,
  contratoId: string,
  chave: string,
): Promise<ItemDestino[]> {
  const { data: dets, error } = await admin
    .from('detalhamentos')
    .select(`
      id, codigo, quantidade_contratada, valor_unitario, valor_material_unit, valor_servico_unit,
      subtotal_material, subtotal_mo, valor_total,
      tarefa:tarefas!inner ( grupo:grupos_macro!inner ( contrato_id ) )
    `)
    .eq('tarefa.grupo.contrato_id', contratoId)
    .range(0, 9999)
  if (error) throw error
  const doMacro = ((dets || []) as any[]).filter(d => chaveDoCodigo(d.codigo) === chave)
  if (doMacro.length === 0) return []
  const ids = doMacro.map(d => d.id)

  const SOL_COMPLETA = 'solicitacoes_fat_direto!inner(status, deletado_em, tipo, fornecedor_cnpj, fornecedor_razao_social)'
  const SOL_ENXUTA = 'solicitacoes_fat_direto!inner(status, deletado_em, fornecedor_cnpj, fornecedor_razao_social)'
  const itensRes = await withSchemaFallback({
    primary: () => admin
      .from('itens_solicitacao_fat_direto')
      .select(`detalhamento_id, valor_total, valor_devolvido, ${SOL_COMPLETA}`)
      .in('detalhamento_id', ids)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    fallback: () => admin
      .from('itens_solicitacao_fat_direto')
      .select(`detalhamento_id, valor_total, ${SOL_ENXUTA}`)
      .in('detalhamento_id', ids)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    missingColumns: ['valor_devolvido', 'tipo'],
    context: 'saldoMaterialDoMacroItem',
  })
  const consumo: Record<string, number> = {}
  for (const it of (itensRes.data || []) as any[]) {
    const sol = it.solicitacoes_fat_direto
    if (!sol || naturezaDoPedido(sol) !== 'material') continue
    const efetivo = Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)
    if (efetivo <= 0) continue
    consumo[it.detalhamento_id] = (consumo[it.detalhamento_id] || 0) + efetivo
  }
  const compensado = await carregarCompensadoPorDetalhamento(admin, ids)

  return doMacro.map(d => ({
    detalhamentoId: d.id,
    codigo: d.codigo,
    saldo: baseParaNatureza(basesDoDetalhamento(d), 'material')
      - (consumo[d.id] || 0)
      - (compensado[d.id] || 0),
  }))
}
