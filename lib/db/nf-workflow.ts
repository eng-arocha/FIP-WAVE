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
