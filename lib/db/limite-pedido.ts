/**
 * Trava de saldo por item do orçamento (detalhamento) para pedidos de
 * faturamento direto.
 *
 * Antes a checagem existia só em `criarSolicitacao`. Três caminhos gravavam
 * pedido sem ela — e foi por eles que o material passou do contratado
 * (diagnóstico em docs/DIVIDAS.md, 28/10/2026):
 *   - pedido FIP gerado automaticamente na autorização/aprovação da medição;
 *   - edição de pedido (PUT), que regrava os itens até de pedido aprovado;
 *   - aprovação de pedido criado antes da trava.
 * Todos passam a usar esta mesma função.
 *
 * Comprometido = pedidos aprovados + aguardando aprovação da MESMA natureza
 * (menos devoluções) + compensação de lastro no material. O pedido que está
 * sendo editado/aprovado sai da conta (`excluirSolicitacaoId`), senão ele
 * disputaria saldo consigo mesmo.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { withSchemaFallback } from '@/lib/db/resilient'
import {
  basesDoDetalhamento,
  baseParaNatureza,
  naturezaDoPedido,
  type NaturezaPedido,
} from '@/lib/db/saldo-detalhamento'
import { carregarCompensadoPorDetalhamento } from '@/lib/db/compensacao-lastro'

type Admin = ReturnType<typeof createAdminClient>

/** Folga de arredondamento: centavo não trava pedido. */
const TOLERANCIA = 0.01

export interface SaldoDetalhamento {
  codigo: string
  descricao: string
  limite: number
  aprovado: number
  emAprovacao: number
}

export interface ItemLimiteViolation {
  codigo: string
  descricao: string
  natureza: NaturezaPedido
  limite: number
  aprovado: number
  emAprovacao: number
  saldoDisponivel: number
  novoValor: number
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function saldoLivre(s: SaldoDetalhamento): number {
  return Math.max(0, s.limite - s.aprovado - s.emAprovacao)
}

/** Soma os valores do pedido por detalhamento (um item pode aparecer 2×). */
export function somarPorDetalhamento(
  itens: Array<{ detalhamento_id?: string | null; valor_total: number }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of itens) {
    if (!i.detalhamento_id) continue
    out[i.detalhamento_id] = (out[i.detalhamento_id] || 0) + (Number(i.valor_total) || 0)
  }
  return out
}

/** Puro: quais itens passam do limite com o valor novo. */
export function apurarViolacoes(
  saldos: Map<string, SaldoDetalhamento>,
  novoPorDet: Record<string, number>,
  natureza: NaturezaPedido,
): ItemLimiteViolation[] {
  const out: ItemLimiteViolation[] = []
  for (const [detId, novo] of Object.entries(novoPorDet)) {
    const s = saldos.get(detId)
    // Item sem base contratual (limite 0) não tem como travar — mesmo
    // comportamento de antes em criarSolicitacao.
    if (!s || s.limite <= 0 || novo <= 0) continue
    if (s.aprovado + s.emAprovacao + novo > s.limite + TOLERANCIA) {
      out.push({
        codigo: s.codigo,
        descricao: s.descricao,
        natureza,
        limite: s.limite,
        aprovado: s.aprovado,
        emAprovacao: s.emAprovacao,
        saldoDisponivel: saldoLivre(s),
        novoValor: novo,
      })
    }
  }
  return out
}

export function mensagemLimiteExcedido(v: ItemLimiteViolation[]): string {
  const linhas = v.map(x =>
    `${x.codigo}: pedido R$ ${fmt(x.novoValor)}, saldo livre R$ ${fmt(x.saldoDisponivel)} ` +
    `(contratado R$ ${fmt(x.limite)}, já comprometido R$ ${fmt(x.aprovado + x.emAprovacao)})`,
  )
  return (v.length === 1 ? 'Item acima do saldo do contrato — ' : 'Itens acima do saldo do contrato — ') +
    linhas.join('; ') + '.'
}

/** Erro no formato que as rotas já conhecem (`ITEM_LIMITE_EXCEDIDO` + itemViolation). */
export function erroLimiteExcedido(v: ItemLimiteViolation[]): Error {
  const err = new Error('ITEM_LIMITE_EXCEDIDO')
  ;(err as any).itemViolation = v[0]
  ;(err as any).itemViolations = v
  ;(err as any).mensagem = mensagemLimiteExcedido(v)
  return err
}

/** Corpo HTTP 422 padrão: `error` legível (as telas mostram esse campo). */
export function respostaLimiteExcedido(e: any) {
  return {
    error: e?.mensagem ?? 'Item acima do saldo do contrato.',
    code: 'ITEM_LIMITE_EXCEDIDO',
    itemViolation: e?.itemViolation,
    itemViolations: e?.itemViolations,
  }
}

/** Carrega limite e comprometido de cada detalhamento, na natureza do pedido. */
export async function carregarSaldosDetalhamentos(
  admin: Admin,
  detIds: string[],
  natureza: NaturezaPedido,
  opts: { excluirSolicitacaoId?: string } = {},
): Promise<Map<string, SaldoDetalhamento>> {
  const out = new Map<string, SaldoDetalhamento>()
  const ids = Array.from(new Set(detIds.filter(Boolean)))
  if (ids.length === 0) return out

  const { data: dets, error: detErr } = await admin
    .from('detalhamentos')
    .select('id, codigo, descricao, valor_total, quantidade_contratada, valor_unitario, valor_material_unit, valor_servico_unit, subtotal_material, subtotal_mo')
    .in('id', ids)
  if (detErr) throw detErr

  // withSchemaFallback: durante janela de schema cache stale (migrations
  // 050/074) cai pro select enxuto — a natureza ainda é inferida por CNPJ /
  // razão social (degradação OK).
  const SOL_COMPLETA = 'solicitacoes_fat_direto!inner(status, deletado_em, tipo, fornecedor_cnpj, fornecedor_razao_social)'
  const SOL_ENXUTA = 'solicitacoes_fat_direto!inner(status, deletado_em, fornecedor_cnpj, fornecedor_razao_social)'
  const itensRes = await withSchemaFallback({
    primary: () => admin
      .from('itens_solicitacao_fat_direto')
      .select(`solicitacao_id, detalhamento_id, valor_total, valor_devolvido, ${SOL_COMPLETA}`)
      .in('detalhamento_id', ids)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    fallback: () => admin
      .from('itens_solicitacao_fat_direto')
      .select(`solicitacao_id, detalhamento_id, valor_total, ${SOL_ENXUTA}`)
      .in('detalhamento_id', ids)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    missingColumns: ['valor_devolvido', 'tipo'],
    context: 'carregarSaldosDetalhamentos',
  })
  if (itensRes.error) throw itensRes.error

  const aprov: Record<string, number> = {}
  const pend: Record<string, number> = {}
  for (const it of (itensRes.data || []) as any[]) {
    if (!it.detalhamento_id) continue
    if (opts.excluirSolicitacaoId && it.solicitacao_id === opts.excluirSolicitacaoId) continue
    const sol = it.solicitacoes_fat_direto
    // Só o consumo da MESMA natureza disputa a mesma base.
    if (!sol || naturezaDoPedido(sol) !== natureza) continue
    // Devoluções (migration 050) liberam o saldo do item.
    const efetivo = Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)
    if (efetivo <= 0) continue
    const alvo = sol.status === 'aprovado' ? aprov : pend
    alvo[it.detalhamento_id] = (alvo[it.detalhamento_id] || 0) + efetivo
  }

  // Compensação de lastro (migration 085) consome a base de MATERIAL do
  // item como um pedido aprovado.
  if (natureza === 'material') {
    const compensado = await carregarCompensadoPorDetalhamento(admin, ids)
    for (const [detId, v] of Object.entries(compensado)) aprov[detId] = (aprov[detId] || 0) + v
  }

  for (const d of (dets || []) as any[]) {
    out.set(d.id, {
      codigo: d.codigo,
      descricao: d.descricao,
      limite: baseParaNatureza(basesDoDetalhamento(d), natureza),
      aprovado: aprov[d.id] || 0,
      emAprovacao: pend[d.id] || 0,
    })
  }
  return out
}

/** Carrega os saldos e devolve as violações do pedido (vazio = cabe). */
export async function verificarLimitesDoPedido(
  admin: Admin,
  input: {
    itens: Array<{ detalhamento_id?: string | null; valor_total: number }>
    natureza: NaturezaPedido
    excluirSolicitacaoId?: string
  },
): Promise<ItemLimiteViolation[]> {
  const novoPorDet = somarPorDetalhamento(input.itens)
  const saldos = await carregarSaldosDetalhamentos(admin, Object.keys(novoPorDet), input.natureza, {
    excluirSolicitacaoId: input.excluirSolicitacaoId,
  })
  return apurarViolacoes(saldos, novoPorDet, input.natureza)
}

/** Alerta legível dos cortes do pedido FIP automático (null = nada cortado). */
export function textoCortesSaldo(
  cortes: Array<{ codigo: string; cortado: number; gravado: number }> | null | undefined,
): string | null {
  if (!cortes || cortes.length === 0) return null
  const total = cortes.reduce((s, c) => s + c.cortado, 0)
  return `Material FIP acima do saldo contratado não foi incluído no pedido: R$ ${fmt(total)} ` +
    `(${cortes.map(c => `${c.codigo} −R$ ${fmt(c.cortado)}`).join('; ')}). ` +
    'Revise o item no orçamento (aditivo ou realocação) antes de emitir a NF.'
}

/**
 * Puro: corta cada item no saldo livre do seu detalhamento. Usado no pedido
 * FIP automático da medição — ele não pode ser recusado (a medição já foi
 * aprovada), então grava só o que cabe e devolve o corte para virar alerta.
 */
export function limitarAoSaldo<T extends { detalhamento_id: string; valor_total: number }>(
  itens: T[],
  saldos: Map<string, SaldoDetalhamento>,
): { itens: T[]; cortes: Array<{ codigo: string; descricao: string; pedido: number; gravado: number; cortado: number }> } {
  const livrePorDet = new Map<string, number>()
  for (const [id, s] of saldos) livrePorDet.set(id, s.limite > 0 ? saldoLivre(s) : Infinity)
  const out: T[] = []
  const cortes: Array<{ codigo: string; descricao: string; pedido: number; gravado: number; cortado: number }> = []
  for (const it of itens) {
    const livre = livrePorDet.get(it.detalhamento_id) ?? Infinity
    const gravado = Math.round(Math.min(it.valor_total, livre) * 100) / 100
    livrePorDet.set(it.detalhamento_id, livre - gravado)
    const cortado = Math.round((it.valor_total - gravado) * 100) / 100
    if (cortado > TOLERANCIA) {
      const s = saldos.get(it.detalhamento_id)
      cortes.push({ codigo: s?.codigo ?? '?', descricao: s?.descricao ?? '', pedido: it.valor_total, gravado, cortado })
    }
    if (gravado > TOLERANCIA) out.push({ ...it, valor_total: gravado })
  }
  return { itens: out, cortes }
}
