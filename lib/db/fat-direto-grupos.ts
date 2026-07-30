import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Detalhamentos do contrato que pertencem a grupo com
 * `tipo_medicao = 'faturamento_direto'`.
 *
 * O PORQUÊ:
 *
 * Nesses grupos — no contrato WAVE-2025-001 é o 19, SERVIÇOS COMPLEMENTARES —
 * a nota é emitida por TERCEIRO. A administração de obra (19.1.1, 17 parcelas
 * mensais de R$ 38.000) é faturada pelos engenheiros, não pela FIP.
 *
 * O grupo PRECISA ser medido: sem isso o contrato nunca fecha 100% e o valor
 * total da medição divergia do que é lançado no INFORMAKON. Mas o material
 * medido ali NÃO gera direito de NF de material FIP — quem fatura é o
 * fornecedor, e a conferência de que a nota dele já entrou é feita pela régua
 * de desconto (`lib/db/desconto-transbordo.ts`), que abate o medido contra a
 * NF alocada e zera o gap.
 *
 * Sem esse filtro, autorizar uma medição que inclua a administração criava um
 * pedido `fip_material` de R$ 38.000 **já aprovado** no nome de FIP ENGENHARIA
 * ELETRICA LTDA (fornecedor fixo em `FORNECEDORES_AUTO`), todo mês — e quando
 * a NF real do engenheiro fosse lançada, o mesmo valor consumia o teto de
 * material duas vezes.
 *
 * A tela de Nova Medição mostra o placar da conciliação por item antes de
 * autorizar; este filtro é a rede de segurança do lado do servidor.
 */
export async function detalhamentosDeFaturamentoDireto(
  admin: SupabaseClient,
  contratoId: string,
): Promise<Set<string>> {
  const out = new Set<string>()
  const { data, error } = await admin
    .from('grupos_macro')
    .select('id, tipo_medicao, tarefas ( detalhamentos ( id ) )')
    .eq('contrato_id', contratoId)
    .eq('tipo_medicao', 'faturamento_direto')
  if (error || !data) return out
  for (const g of data as unknown as Array<{ tarefas?: Array<{ detalhamentos?: Array<{ id?: string }> }> }>) {
    for (const t of (g.tarefas || [])) {
      for (const d of (t.detalhamentos || [])) {
        if (d?.id) out.add(d.id)
      }
    }
  }
  return out
}

/**
 * Separa as linhas de material a faturar entre as que a FIP realmente pode
 * emitir e as que são faturamento direto de terceiro.
 *
 * Devolve também o total excluído, pra registrar em log/auditoria — o valor
 * não desaparece do boletim, ele só deixa de virar pedido no nome da FIP.
 */
export function separarLinhasFipMaterial<T extends { detalhamento_id: string; fip_faturar: number }>(
  linhas: T[],
  detsFatDireto: Set<string>,
): { fip: T[]; terceiro: T[]; totalTerceiro: number } {
  const fip: T[] = []
  const terceiro: T[] = []
  for (const l of linhas) {
    if (l.fip_faturar <= 0) continue
    if (detsFatDireto.has(l.detalhamento_id)) terceiro.push(l)
    else fip.push(l)
  }
  return {
    fip,
    terceiro,
    totalTerceiro: terceiro.reduce((s, l) => s + l.fip_faturar, 0),
  }
}
