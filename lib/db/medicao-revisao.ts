import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Helper para "desfazer aprovação" de uma medição.
 *
 * Regra-chave (Fase 3):
 *   - Só permite reverter SE nenhuma NF FIP material foi lançada APÓS a
 *     aprovação da medição. Se houve, o usuário precisa cancelar/rejeitar
 *     essas NFs primeiro — caso contrário, o histórico financeiro fica
 *     inconsistente (NF pertence a uma medição aprovada que será revertida).
 *
 * Critério para "NF lançada após aprovação":
 *   - notas_fiscais_fat_direto.created_at > medicoes.data_aprovacao
 *   - status != 'rejeitada'  (rejeitadas não contam — já foram descartadas)
 *   - solicitacao_id pertence a um pedido do mesmo contrato da medição
 *
 * Audit:
 *   - Toda reversão é registrada em medicoes_revisao_log (motivo
 *     obrigatório), pra rastreabilidade.
 */

export class DesfazerAprovacaoError extends Error {
  code: 'NFS_POSTERIORES' | 'STATUS_INVALIDO' | 'NAO_ENCONTRADA'
  detail: Record<string, unknown>
  constructor(
    code: DesfazerAprovacaoError['code'],
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'DesfazerAprovacaoError'
    this.code = code
    this.detail = detail
  }
}

export interface DesfazerAprovacaoInput {
  medicao_id: string
  motivo: string
  revisado_por_id: string
}

export async function desfazerAprovacaoMedicao(input: DesfazerAprovacaoInput) {
  const admin = createAdminClient()

  // 1) Carrega medição
  const { data: med, error } = await admin
    .from('medicoes')
    .select('id, status, contrato_id, data_aprovacao')
    .eq('id', input.medicao_id)
    .single()
  if (error) throw error
  if (!med) {
    throw new DesfazerAprovacaoError('NAO_ENCONTRADA', 'Medição não encontrada.')
  }
  if ((med as any).status !== 'aprovado') {
    throw new DesfazerAprovacaoError(
      'STATUS_INVALIDO',
      `Medição com status '${(med as any).status}' não pode ser desfeita.`,
      { status: (med as any).status },
    )
  }

  // 2) Validar: nenhuma NF FIP material foi lançada APÓS data_aprovacao
  // (em pedidos do mesmo contrato).
  const dataAprovacao = (med as any).data_aprovacao as string | null
  if (dataAprovacao) {
    const { data: solIds } = await admin
      .from('solicitacoes_fat_direto')
      .select('id')
      .eq('contrato_id', (med as any).contrato_id)

    const ids = (solIds ?? []).map((s: any) => s.id)
    if (ids.length > 0) {
      const { data: nfsPosteriores } = await admin
        .from('notas_fiscais_fat_direto')
        .select('id, created_at, numero_nf, status')
        .in('solicitacao_id', ids)
        .gt('created_at', dataAprovacao)
        .neq('status', 'cancelada')

      if ((nfsPosteriores ?? []).length > 0) {
        throw new DesfazerAprovacaoError(
          'NFS_POSTERIORES',
          `Não é possível desfazer: ${nfsPosteriores!.length} NF(s) FIP material foram lançadas após a aprovação. Cancele/rejeite-as antes de tentar desfazer.`,
          { qtd_nfs_posteriores: nfsPosteriores!.length, nfs: nfsPosteriores },
        )
      }
    }
  }

  // 3) Atualiza status (volta pra 'submetido'), zera data_aprovacao
  const { error: updErr } = await admin
    .from('medicoes')
    .update({ status: 'submetido', data_aprovacao: null })
    .eq('id', input.medicao_id)
  if (updErr) throw updErr

  // 4) Registra revisão (audit trail)
  const { error: logErr } = await admin
    .from('medicoes_revisao_log')
    .insert({
      medicao_id: input.medicao_id,
      status_anterior: 'aprovado',
      status_novo: 'submetido',
      acao: 'desfazer_aprovacao',
      motivo: input.motivo,
      revisado_por_id: input.revisado_por_id,
    })
  if (logErr) throw logErr

  return { ok: true as const }
}
