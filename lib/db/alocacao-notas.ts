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
      numero,
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
    numero?: string | null
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
        if (parte > 0) out.push({ numeroNf, chave, valor: parte, pedido: p.numero ?? null })
      }
    }
  }
  return out
}

/**
 * Todos os números de nota de fat-direto que o FIP-WAVE conhece — inclusive
 * os de pedido ainda não aprovado e os de nota cancelada.
 *
 * Serve para a pergunta INVERSA: o Informakon tem uma nota que nós não temos?
 * Aqui o filtro é de propósito o mais largo possível. A pergunta não é "esta
 * nota entra no desconto", é "esta nota existe no nosso cadastro" — e
 * responder "não existe" para uma nota que está lá, só que num pedido em
 * rascunho, seria um alarme falso mandando cadastrar o que já está cadastrado.
 */
export async function carregarNumerosDeNotasConhecidas(
  admin: SupabaseClient,
  contratoId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, nfs:notas_fiscais_fat_direto!solicitacao_id ( numero_nf )')
    .eq('contrato_id', contratoId)
    .is('deletado_em', null)
  if (error || !data) return new Set()

  const out = new Set<string>()
  for (const p of data as unknown as Array<{ nfs?: Array<{ numero_nf: string | null }> | null }>) {
    for (const nf of p.nfs ?? []) {
      const numero = String(nf.numero_nf ?? '').replace(/\D/g, '').replace(/^0+/, '')
      if (numero) out.add(numero)
    }
  }
  return out
}

/**
 * Data de emissão de cada nota de fat-direto, por número normalizado.
 *
 * O retrato do Informakon não traz data — o ERP só devolve documento e valor.
 * A ordem FIFO do roteiro de lançamento sai daqui, do nosso cadastro. Nota que
 * só existe lá fica sem data e vai para o fim da fila.
 */
export async function carregarDatasDeNotas(
  admin: SupabaseClient,
  contratoId: string,
): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, nfs:notas_fiscais_fat_direto!solicitacao_id ( numero_nf, data_emissao )')
    .eq('contrato_id', contratoId)
    .is('deletado_em', null)
  if (error || !data) return new Map()

  const out = new Map<string, string>()
  for (const p of data as unknown as Array<{ nfs?: Array<{ numero_nf: string | null; data_emissao: string | null }> | null }>) {
    for (const nf of p.nfs ?? []) {
      const numero = String(nf.numero_nf ?? '').replace(/\D/g, '').replace(/^0+/, '')
      const data = nf.data_emissao ? String(nf.data_emissao).slice(0, 10) : ''
      if (!numero || !data) continue
      // A mais antiga manda: se a mesma nota aparece em dois pedidos, é a
      // emissão que importa, e ela é uma só.
      const atual = out.get(numero)
      if (!atual || data < atual) out.set(numero, data)
    }
  }
  return out
}
