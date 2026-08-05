/**
 * Workflow de aprovação de NF de faturamento direto — funções com efeito
 * de banco (aprovar / rejeitar). A máquina de estados pura fica em
 * `nf-status.ts` (módulo-folha) e é re-exportada aqui por conveniência.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { validarNotaFiscal3Way, NFMatchError } from '@/lib/db/fat-direto'
import { audit } from '@/lib/api/audit'
import { podeTransicionar, type NfStatus } from '@/lib/db/nf-status'

export { statusInicialNf, podeTransicionar, nfReservaSaldo, nfPendente } from '@/lib/db/nf-status'
export type { NfStatus } from '@/lib/db/nf-status'

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

  // Revalida o match excluindo a própria NF do conjunto de ativas: ela já
  // está gravada (e reserva saldo), então sem exclusão entraria no somatório
  // e dispararia DUPLICATA contra si mesma. Com exclude_nf_id passamos o
  // valor real e validamos contra as DEMAIS NFs do pedido.
  await validarNotaFiscal3Way({
    solicitacao_id: nf.solicitacao_id,
    numero_nf: nf.numero_nf,
    cnpj_emitente: nf.cnpj_emitente ?? undefined,
    valor: Number(nf.valor ?? 0),
    data_emissao: nf.data_emissao,
    override_data_anterior: true, // data já foi validada no lançamento
    exclude_nf_id: nfId,
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

/**
 * Cancela uma NF lançada por engano — é o "excluir" do produto.
 *
 * NÃO apaga a linha: move pra 'cancelada', o estado terminal do workflow.
 * Cancelada não reserva saldo (`nfReservaSaldo`), então o valor volta na
 * hora pro saldo do pedido, que é o efeito prático esperado. Manter o
 * registro preserva a trilha de auditoria de um lançamento financeiro — e
 * apagar de vez deixaria o histórico do pedido sem explicação pro buraco.
 *
 * A máquina de estados permite cancelar de qualquer situação, inclusive de
 * 'aprovada' (NF aprovada por engano). Só não se cancela o que já está
 * cancelado.
 */
export async function cancelarNotaFiscal(
  nfId: string, motivo: string, ator: AtorAudit,
): Promise<{ numero_nf: string; valor: number; solicitacao_id: string }> {
  const motivoLimpo = (motivo ?? '').trim()
  if (!motivoLimpo) throw new Error('Motivo do cancelamento é obrigatório.')

  const admin = createAdminClient()
  const { data: nf, error } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, solicitacao_id, numero_nf, valor, status')
    .eq('id', nfId)
    .single()
  if (error || !nf) throw new Error('NF não encontrada.')
  if (nf.status === 'cancelada') {
    throw new Error('Esta NF já está cancelada.')
  }
  if (!podeTransicionar(nf.status as NfStatus, 'cancelada')) {
    throw new Error(`NF no status "${nf.status}" não pode ser cancelada.`)
  }

  const { error: upErr } = await admin
    .from('notas_fiscais_fat_direto')
    .update({
      status: 'cancelada',
      motivo_rejeicao: motivoLimpo,
      validado_por_id: ator.actor_id,
      validado_em: new Date().toISOString(),
    })
    .eq('id', nfId)
  if (upErr) throw upErr

  await audit({
    event: 'nf.cancelada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
    actor_id: ator.actor_id, actor_email: ator.actor_email ?? null,
    metadata: {
      numero_nf: nf.numero_nf, solicitacao_id: nf.solicitacao_id,
      valor: Number(nf.valor || 0), status_anterior: nf.status, motivo: motivoLimpo,
    },
  })

  return {
    numero_nf: nf.numero_nf,
    valor: Number(nf.valor || 0),
    solicitacao_id: nf.solicitacao_id,
  }
}
