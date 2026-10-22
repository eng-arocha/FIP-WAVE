import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { estornarRetencaoDaMedicao } from '@/lib/db/retencao'

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
  code: 'NFS_POSTERIORES' | 'STATUS_INVALIDO' | 'NAO_ENCONTRADA' | 'RETENCAO_CONSUMIDA'
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
    .select('id, numero, status, contrato_id, data_aprovacao')
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

  // 2b) Estorna a retenção desta medição no livro-razão ANTES de mexer no
  // status. Sem isto a reaprovação creditava os 5% de novo (medição contada
  // em dobro no card). Se o crédito já foi consumido por NF Wave de outra
  // medição, recusa aqui — nada foi gravado ainda.
  try {
    await estornarRetencaoDaMedicao(admin, {
      contrato_id: (med as any).contrato_id,
      medicao_id: input.medicao_id,
      medicao_numero: Number((med as any).numero || 0),
      usuario_id: input.revisado_por_id,
    })
  } catch (e: any) {
    throw new DesfazerAprovacaoError(
      'RETENCAO_CONSUMIDA',
      `Não é possível desfazer: ${e?.message || 'falha ao estornar a retenção.'}`,
    )
  }

  // 3) Atualiza status (volta pra 'submetido'), zera data_aprovacao
  const { error: updErr } = await admin
    .from('medicoes')
    .update({ status: 'submetido', data_aprovacao: null })
    .eq('id', input.medicao_id)
  if (updErr) throw updErr

  // 3b) Limpa o snapshot de NF abatida desta medição.
  //
  // Sem isto, uma reaprovação lê o snapshot velho como se fosse definitivo:
  // `calcularInformaconData` só recalcula ao vivo quando a medição aprovada
  // NÃO tem valores gravados (ver `snapshotAprovado` em informacon-data.ts).
  // Como o status já foi para 'aprovado' antes do cálculo, o snapshot antigo
  // passaria a mandar — e todo detalhamento ausente dele viraria 0,
  // devolvendo a nota ao saldo e permitindo descontá-la de novo.
  // Best-effort: se a coluna não existe (074 pendente), segue.
  {
    const { error } = await admin
      .from('medicao_itens')
      .update({ nf_material_descontada: 0 })
      .eq('medicao_id', input.medicao_id)
    if (error && !isSchemaMissingError(error, ['nf_material_descontada'])) {
      console.warn('[desfazerAprovacao] falha ao limpar nf_material_descontada:', error.message)
    }
  }

  // 3c) Tira de cena o pedido Wave de serviço que esta aprovação criou.
  // Desfazer só chega aqui sem NF lançada depois da aprovação (passo 2), então
  // o pedido ainda está sem nota. Mantê-lo faria a reaprovação criar outro —
  // dois pedidos Wave para a mesma medição. Soft delete: o histórico fica.
  {
    const tag = `MED-${String((med as any).numero || 0).padStart(3, '0')}`
    const { data: pedidosWave } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, notas:notas_fiscais_fat_direto!solicitacao_id(id, status)')
      .eq('contrato_id', (med as any).contrato_id)
      .eq('tipo', 'wave_servico')
      .is('deletado_em', null)
      .ilike('observacoes', `%Aprovação da medição ${tag} %`)
    const semNota = ((pedidosWave ?? []) as any[])
      .filter(p => !(p.notas ?? []).some((n: any) => n.status !== 'cancelada'))
      .map(p => p.id as string)
    if (semNota.length > 0) {
      const { error } = await admin
        .from('solicitacoes_fat_direto')
        .update({ deletado_em: new Date().toISOString(), deletado_por: input.revisado_por_id })
        .in('id', semNota)
      if (error) console.warn('[desfazerAprovacao] falha ao remover pedido Wave:', error.message)
    }
  }

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
