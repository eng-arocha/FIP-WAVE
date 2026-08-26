import type { SupabaseClient } from '@supabase/supabase-js'
import { withSchemaFallback } from '@/lib/db/resilient'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'
import { chaveMacroItem } from '@/lib/informakon/comparar-saldo'
import type { AlocacaoNossa } from '@/lib/informakon/rechavear'

/**
 * Onde o FIP-WAVE coloca cada nota de terceiro, em macro item.
 *
 * O Informakon amarra a nota ao ITEM DO PEDIDO da FIP; nós amarramos ao
 * pedido de fat-direto e rateamos pelos detalhamentos dele. As duas
 * classificações do mesmo material divergem — no retrato de 26/08, 24 das
 * 180 notas aparecem em mais de um macro item do ERP, uma delas em sete.
 *
 * Esta função devolve a NOSSA leitura, para que `rechavearRetrato` possa ler
 * o saldo do ERP no mesmo endereçamento em que o boletim pede o desconto.
 *
 * O rateio é o mesmo da origem: a nota se divide entre os itens do pedido na
 * proporção do valor de cada item. Nota cancelada não entra — ela não reserva
 * saldo em lugar nenhum (`nfReservaSaldo`).
 */
export async function carregarAlocacaoDeNotas(
  admin: SupabaseClient,
  contratoId: string,
): Promise<AlocacaoNossa[]> {
  const CORPO = `
      id,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( numero_nf, valor, status )
    `
  const res = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(`tipo, fornecedor_cnpj, fornecedor_razao_social, ${CORPO}`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(`fornecedor_cnpj, fornecedor_razao_social, ${CORPO}`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    missingColumns: ['tipo'],
    context: 'alocacaoDeNotas',
  })
  if (res.error || !res.data) return []

  const pedidos = res.data as unknown as Array<{
    itens?: Array<{ detalhamento_id: string | null; valor_total: number | null }> | null
    nfs?: Array<{ numero_nf: string | null; valor: number | null; status: string | null }> | null
  }>

  // Códigos dos detalhamentos citados — é deles que sai o macro item.
  const detIds = new Set<string>()
  for (const p of pedidos) {
    for (const it of p.itens ?? []) if (it.detalhamento_id) detIds.add(it.detalhamento_id)
  }
  if (detIds.size === 0) return []

  const { data: dets, error: detErr } = await admin
    .from('detalhamentos')
    .select('id, codigo')
    .in('id', [...detIds])
  if (detErr) return []
  const codigoPorDet = new Map<string, string>()
  for (const d of (dets || []) as Array<{ id: string; codigo: string }>) {
    codigoPorDet.set(d.id, String(d.codigo ?? ''))
  }

  const out: AlocacaoNossa[] = []
  for (const p of pedidos) {
    // A NF de SERVIÇO da Wave mora na mesma tabela e não desconta material.
    if (ehPedidoDeServicoWave(p as any)) continue
    const itens = (p.itens ?? []).filter(it => it.detalhamento_id)
    const base = itens.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)
    if (!(base > 0)) continue

    for (const nf of p.nfs ?? []) {
      if (!nfReservaSaldo(nf.status ?? '')) continue
      const numeroNf = String(nf.numero_nf ?? '').trim()
      const valorNf = Number(nf.valor) || 0
      if (!numeroNf || !(valorNf > 0)) continue
      for (const it of itens) {
        const chave = chaveMacroItem(codigoPorDet.get(it.detalhamento_id as string))
        if (!chave) continue
        const parte = valorNf * ((Number(it.valor_total) || 0) / base)
        if (parte > 0) out.push({ numeroNf, chave, valor: parte })
      }
    }
  }
  return out
}
