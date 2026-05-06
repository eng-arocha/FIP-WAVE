// Gestão da retenção contratual via livro-razão (tabela retencao_movimentos).
// Crédito a cada medição aprovada (5% × mat+serv da medição). Débito a cada
// NF Wave emitida (até zerar o saldo). Resíduo final é pago via NF de
// retenção da Wave SPE no encerramento do contrato.
//
// Nunca insere direto em retencao_movimentos — sempre via RPC
// `aplicar_movimento_retencao` que faz lock+cálculo atômico.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoMovimento =
  | 'credito'
  | 'debito'
  | 'reversao_credito'
  | 'reversao_debito'

export type OrigemMovimento =
  | 'medicao_aprovada'
  | 'nf_wave_emitida'
  | 'ajuste_manual'
  | 'pagamento_final'
  | 'desfazer_aprovacao'

export interface MovimentoRetencao {
  id: string
  contrato_id: string
  tipo: TipoMovimento
  origem_tipo: OrigemMovimento
  origem_id: string | null
  valor: number
  saldo_apos: number
  descricao: string | null
  criado_por_id: string | null
  created_at: string
}

/**
 * Aplica um movimento de retenção (crédito ou débito) atomicamente.
 * Retorna o ID do movimento criado e o novo saldo.
 *
 * Levanta exceção se for débito maior que o saldo atual.
 */
export async function aplicarMovimentoRetencao(
  admin: SupabaseClient,
  args: {
    contrato_id: string
    tipo: TipoMovimento
    origem_tipo: OrigemMovimento
    origem_id: string | null
    valor: number
    descricao: string
    criado_por: string
  },
): Promise<{ id: string; saldo_apos: number }> {
  const { data, error } = await admin.rpc('aplicar_movimento_retencao', {
    p_contrato_id: args.contrato_id,
    p_tipo: args.tipo,
    p_origem_tipo: args.origem_tipo,
    p_origem_id: args.origem_id,
    p_valor: args.valor,
    p_descricao: args.descricao,
    p_criado_por: args.criado_por,
  })
  if (error) throw error
  // RPC retorna SETOF — pega primeira (e única) linha
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('aplicar_movimento_retencao não retornou linha')
  return {
    id: String(row.movimento_id),
    saldo_apos: Number(row.saldo_apos),
  }
}

/** Saldo atual de retenção pra um contrato (= soma sinalizada dos movimentos). */
export async function getSaldoRetencao(
  admin: SupabaseClient,
  contratoId: string,
): Promise<number> {
  const { data, error } = await admin
    .from('retencao_movimentos')
    .select('tipo, valor')
    .eq('contrato_id', contratoId)
  if (error) throw error
  let saldo = 0
  for (const m of (data || []) as any[]) {
    const v = Number(m.valor || 0)
    if (m.tipo === 'credito' || m.tipo === 'reversao_debito') saldo += v
    else if (m.tipo === 'debito' || m.tipo === 'reversao_credito') saldo -= v
  }
  return Math.max(0, saldo)
}

/** Lista todos os movimentos de um contrato em ordem cronológica. */
export async function listarMovimentosRetencao(
  admin: SupabaseClient,
  contratoId: string,
  limit = 200,
): Promise<MovimentoRetencao[]> {
  const { data, error } = await admin
    .from('retencao_movimentos')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as MovimentoRetencao[]
}

/**
 * Helper de alto nível pra a aprovação de medição.
 *
 * Aplica o CRÉDITO da medição (= 5% × base) primeiro, depois calcula o
 * DÉBITO a aplicar contra a NF Wave dessa medição (= min(saldo_apos_credito,
 * wave_servico_bruto)). Retorna saldo antes/depois e o líquido a faturar.
 *
 * É a função canônica pra "fechar a retenção" de uma aprovação.
 */
export async function aplicarRetencaoDaAprovacao(
  admin: SupabaseClient,
  args: {
    contrato_id: string
    medicao_id: string
    medicao_numero: number
    /**
     * Base de retenção da medição. Use `informacon.totais.base_retencao`
     * (= mat_medido + serv_medido — todo material e serviço executado
     * fisicamente nesta medição, spec 2026-05-06). Inclui itens fat-direto
     * comerciais (item 19 Admin Obra) que entram na base mesmo emitindo NF
     * por canal FIP material/terceiro. A retenção desses 5% é debitada da
     * NF Wave Serviço (única que abate retenção).
     */
    base_retencao: number
    wave_bruto: number
    pct_retencao: number  // ex.: 5 → 5%
    aprovador_id: string
  },
): Promise<{
  saldo_antes: number
  credito_aplicado: number
  debito_aplicado: number
  saldo_depois: number
  wave_liquido: number
}> {
  const tag = `MED-${String(args.medicao_numero).padStart(3, '0')}`

  // Saldo ANTES de qualquer movimento desta aprovação
  const saldoAntes = await getSaldoRetencao(admin, args.contrato_id)

  // Crédito = pct × base_retencao
  const valorCredito = Math.round(args.base_retencao * (args.pct_retencao / 100) * 100) / 100

  let creditoAplicado = 0
  let saldoAposCredito = saldoAntes
  if (valorCredito > 0) {
    const ret = await aplicarMovimentoRetencao(admin, {
      contrato_id: args.contrato_id,
      tipo: 'credito',
      origem_tipo: 'medicao_aprovada',
      origem_id: args.medicao_id,
      valor: valorCredito,
      descricao: `Retenção ${args.pct_retencao}% × (wave + mat − retido) da ${tag}: ${args.pct_retencao}% × R$ ${args.base_retencao.toFixed(2)}`,
      criado_por: args.aprovador_id,
    })
    creditoAplicado = valorCredito
    saldoAposCredito = ret.saldo_apos
  }

  // Débito = min(saldo, wave_bruto) — abate o máximo que a NF Wave aguenta
  let debitoAplicado = 0
  let saldoDepois = saldoAposCredito
  const debitoIdeal = Math.min(saldoAposCredito, args.wave_bruto)
  const debitoArredondado = Math.round(debitoIdeal * 100) / 100
  if (debitoArredondado > 0) {
    const ret = await aplicarMovimentoRetencao(admin, {
      contrato_id: args.contrato_id,
      tipo: 'debito',
      origem_tipo: 'nf_wave_emitida',
      origem_id: args.medicao_id,  // referencia a medição que origina; refinar se houver tabela de NFs Wave
      valor: debitoArredondado,
      descricao: `Desconto na NF Wave da ${tag}: NF bruta R$ ${args.wave_bruto.toFixed(2)} − retenção R$ ${debitoArredondado.toFixed(2)}`,
      criado_por: args.aprovador_id,
    })
    debitoAplicado = debitoArredondado
    saldoDepois = ret.saldo_apos
  }

  const waveLiquido = Math.max(0, args.wave_bruto - debitoAplicado)

  return {
    saldo_antes: saldoAntes,
    credito_aplicado: creditoAplicado,
    debito_aplicado: debitoAplicado,
    saldo_depois: saldoDepois,
    wave_liquido: waveLiquido,
  }
}
