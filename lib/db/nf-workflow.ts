/**
 * Máquina de estados do workflow de aprovação de NF de faturamento direto.
 *
 * Estados:
 *  - aguardando_aprovacao: contratada lançou; aguardando o contratante.
 *  - aprovada: contratante aprovou. Só aqui a NF "vale" (pagável/relatórios).
 *  - em_correcao: contratante rejeitou com motivo; volta pra contratada.
 *  - cancelada: NF abandonada (não conta pra saldo).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { validarNotaFiscal3Way, NFMatchError } from '@/lib/db/fat-direto'
import { audit } from '@/lib/api/audit'

export type NfStatus = 'aguardando_aprovacao' | 'aprovada' | 'em_correcao' | 'cancelada'

/**
 * Status inicial da NF no lançamento. Quem tem permissão de aprovar
 * (admin / representante do contratante) lança direto como aprovada —
 * não faz sentido aprovar a si mesmo.
 */
export function statusInicialNf(lancadorPodeAprovar: boolean): NfStatus {
  return lancadorPodeAprovar ? 'aprovada' : 'aguardando_aprovacao'
}

/** Transições permitidas do workflow. */
const TRANSICOES: Record<NfStatus, NfStatus[]> = {
  aguardando_aprovacao: ['aprovada', 'em_correcao', 'cancelada'],
  em_correcao: ['aguardando_aprovacao', 'cancelada'],
  aprovada: ['cancelada'],
  cancelada: [],
}

/** True se a transição `de → para` é válida. */
export function podeTransicionar(de: NfStatus, para: NfStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false
}

/**
 * True se uma NF nesse status consome (reserva) saldo do pedido — ou seja,
 * entra no somatório do 3-way match. Só `cancelada` (e o legado `rejeitada`)
 * não reservam.
 */
export function nfReservaSaldo(status: string): boolean {
  return status === 'aguardando_aprovacao' || status === 'em_correcao' || status === 'aprovada'
}

interface AtorAudit { actor_id: string; actor_email?: string | null }

/**
 * Aprova o lançamento de uma NF. Revalida o 3-way match no momento da
 * aprovação — o saldo pode ter mudado desde o lançamento (outra NF
 * aprovada no intervalo). Se a NF agora estoura o saldo, lança
 * NFMatchError e o handler deve avisar o aprovador.
 */
export async function aprovarNotaFiscal(nfId: string, ator: AtorAudit): Promise<void> {
  const admin = createAdminClient()
  const { data: nf, error } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, solicitacao_id, numero_nf, cnpj_emitente, valor, data_emissao, status')
    .eq('id', nfId)
    .single()
  if (error || !nf) throw new NFMatchError('SOLICITACAO_NAO_APROVADA', 'NF não encontrada.', {})
  if (!podeTransicionar(nf.status as NfStatus, 'aprovada')) {
    throw new NFMatchError('SOLICITACAO_NAO_APROVADA',
      `NF no status "${nf.status}" não pode ser aprovada.`, { status: nf.status })
  }

  // Revalida o match ignorando a própria NF no somatório de saldo:
  // validarNotaFiscal3Way soma todas as ativas; como esta NF já está
  // gravada (ativa), passamos valor 0 e checamos o saldo restante.
  await validarNotaFiscal3Way({
    solicitacao_id: nf.solicitacao_id,
    numero_nf: nf.numero_nf,
    cnpj_emitente: nf.cnpj_emitente ?? undefined,
    valor: 0,
    data_emissao: nf.data_emissao,
    override_data_anterior: true, // data já foi validada no lançamento
  })

  const agora = new Date().toISOString()
  const { error: upErr } = await admin
    .from('notas_fiscais_fat_direto')
    .update({ status: 'aprovada', validado_por_id: ator.actor_id, validado_em: agora, motivo_rejeicao: null })
    .eq('id', nfId)
  if (upErr) throw upErr

  await audit({
    event: 'nf.aprovada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
    actor_id: ator.actor_id, actor_email: ator.actor_email ?? null,
    metadata: { numero_nf: nf.numero_nf, solicitacao_id: nf.solicitacao_id },
  })
}

/**
 * Rejeita o lançamento de uma NF — volta pra contratada corrigir.
 * Exige motivo.
 */
export async function rejeitarNotaFiscal(
  nfId: string, motivo: string, ator: AtorAudit,
): Promise<void> {
  const motivoLimpo = (motivo ?? '').trim()
  if (!motivoLimpo) throw new Error('Motivo da rejeição é obrigatório.')

  const admin = createAdminClient()
  const { data: nf, error } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, solicitacao_id, numero_nf, status')
    .eq('id', nfId)
    .single()
  if (error || !nf) throw new Error('NF não encontrada.')
  if (!podeTransicionar(nf.status as NfStatus, 'em_correcao')) {
    throw new Error(`NF no status "${nf.status}" não pode ser rejeitada.`)
  }

  const { error: upErr } = await admin
    .from('notas_fiscais_fat_direto')
    .update({ status: 'em_correcao', motivo_rejeicao: motivoLimpo })
    .eq('id', nfId)
  if (upErr) throw upErr

  await audit({
    event: 'nf.rejeitada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
    actor_id: ator.actor_id, actor_email: ator.actor_email ?? null,
    metadata: { numero_nf: nf.numero_nf, solicitacao_id: nf.solicitacao_id, motivo: motivoLimpo },
  })
}
