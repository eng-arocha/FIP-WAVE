import { createAdminClient } from '@/lib/supabase/admin'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { encerrarSolicitacao } from './fat-direto'

/**
 * Helpers do fluxo formal de encerramento de saldo:
 *   Fornecedor (Wave) solicita → FIP (aprovador) decide.
 *
 * Quando aprovada, dispara `encerrarSolicitacao()` (lib/db/fat-direto.ts) que:
 *   - muda status do pedido pra 'encerrado'
 *   - distribui saldo proporcionalmente entre os itens (cancelamento total
 *     do saldo pendente)
 *   - libera saldo dos detalhamentos automaticamente
 *
 * Tabela: solicitacoes_encerramento_saldo (migration 060)
 */

export const MOTIVO_DEFAULT_ENCERRAMENTO =
  'fornecedor confirmou que não emitirá mais NF — material concluído com NFs já lançadas'

export interface CriarSolicitacaoInput {
  solicitacao_fat_direto_id: string
  motivo?: string
  solicitado_por_id: string
  /** Opcional: medição que originou a solicitação (contexto/auditoria). */
  medicao_origem_id?: string
}

export async function criarSolicitacaoEncerramento(input: CriarSolicitacaoInput) {
  const admin = createAdminClient()

  // 1) Carrega o pedido + NFs ativas pra validar e calcular o saldo no momento.
  const { data: pedido, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, status, valor_total, deletado_em,
      nfs:notas_fiscais_fat_direto!solicitacao_id(id, valor, status)
    `)
    .eq('id', input.solicitacao_fat_direto_id)
    .single()

  if (error) throw error
  if (!pedido) throw new Error('Pedido não encontrado.')
  if ((pedido as any).deletado_em) throw new Error('Pedido deletado.')
  if ((pedido as any).status !== 'aprovado') {
    throw new Error(
      `Pedido com status '${(pedido as any).status}' não pode ter saldo encerrado (apenas aprovados).`,
    )
  }

  const totalNfsAtivas = (((pedido as any).nfs ?? []) as any[])
    .filter(nf => nfReservaSaldo(nf.status))
    .reduce((s, nf) => s + Number(nf.valor || 0), 0)
  const saldoNoMomento = Number((pedido as any).valor_total) - totalNfsAtivas

  if (saldoNoMomento <= 0.01) {
    throw new Error('Pedido sem saldo pendente — não há o que encerrar.')
  }

  // 2) Verifica se já existe solicitação pendente pra esse pedido (single-flight).
  const { data: pend } = await admin
    .from('solicitacoes_encerramento_saldo')
    .select('id, status')
    .eq('solicitacao_fat_direto_id', input.solicitacao_fat_direto_id)
    .eq('status', 'pendente')
    .maybeSingle()

  if (pend) {
    throw new Error('Já existe solicitação de encerramento pendente para este pedido.')
  }

  // 3) Cria registro
  const { data, error: insErr } = await admin
    .from('solicitacoes_encerramento_saldo')
    .insert({
      solicitacao_fat_direto_id: input.solicitacao_fat_direto_id,
      medicao_origem_id: input.medicao_origem_id ?? null,
      motivo_solicitacao: input.motivo?.trim() || MOTIVO_DEFAULT_ENCERRAMENTO,
      saldo_no_momento: saldoNoMomento,
      solicitado_por_id: input.solicitado_por_id,
    })
    .select()
    .single()

  if (insErr) throw insErr
  return data
}

export interface DecidirSolicitacaoInput {
  solicitacao_encerramento_id: string
  acao: 'aprovar' | 'rejeitar'
  motivo_rejeicao?: string
  decidido_por_id: string
}

/**
 * Saldo efetivamente devolvido num pedido JÁ encerrado.
 *
 * `encerrarSolicitacao()` é o único writer de `itens.valor_devolvido` e roda
 * no máximo uma vez por pedido (o status vira 'encerrado' e não volta), então
 * a soma das devoluções dos itens é o saldo cancelado. Devolve null se não der
 * pra apurar — aí o chamador cai no snapshot `saldo_no_momento`.
 */
async function saldoDevolvidoDePedidoEncerrado(
  admin: ReturnType<typeof createAdminClient>,
  pedidoId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from('itens_solicitacao_fat_direto')
    .select('valor_devolvido')
    .eq('solicitacao_id', pedidoId)
  if (error || !data) return null
  const total = data.reduce((s: number, it: any) => s + Number(it.valor_devolvido || 0), 0)
  return total > 0 ? total : null
}

/**
 * Fecha as solicitações de encerramento PENDENTES de um pedido que já foi
 * encerrado por outro caminho, marcando-as como aprovadas.
 *
 * Existe porque encerrar um pedido e decidir a solicitação são dois passos
 * distintos e não-atômicos, em duas rotas diferentes:
 *   - o admin pode encerrar direto pelo modal "Encerrar pedido" (rota
 *     `/encerrar`), que não conhece esta fila;
 *   - a aprovação daqui pode encerrar o pedido e falhar no UPDATE seguinte.
 *
 * Nos dois casos o pedido fica 'encerrado' com a solicitação presa em
 * 'pendente' — e toda tentativa de aprovar batia em 422 PEDIDO_NAO_APROVADO,
 * sem saída pela UI. Como o estado desejado (saldo encerrado) já vale,
 * reconciliar é o desfecho correto.
 *
 * Best-effort e idempotente: só toca em quem está 'pendente'.
 */
export async function reconciliarEncerramentosPendentes(input: {
  solicitacao_fat_direto_id: string
  decidido_por_id: string
  /** Saldo devolvido, se o chamador já souber (evita reconsultar os itens). */
  saldo_devolvido?: number
}): Promise<number> {
  const admin = createAdminClient()

  const { data: pendentes, error } = await admin
    .from('solicitacoes_encerramento_saldo')
    .select('id, saldo_no_momento')
    .eq('solicitacao_fat_direto_id', input.solicitacao_fat_direto_id)
    .eq('status', 'pendente')
  if (error || !pendentes || pendentes.length === 0) return 0

  const saldo = input.saldo_devolvido
    ?? (await saldoDevolvidoDePedidoEncerrado(admin, input.solicitacao_fat_direto_id))

  const agora = new Date().toISOString()
  let fechadas = 0
  for (const p of pendentes as any[]) {
    const { error: updErr } = await admin
      .from('solicitacoes_encerramento_saldo')
      .update({
        status: 'aprovada',
        saldo_efetivamente_cancelado: saldo ?? Number(p.saldo_no_momento || 0),
        decidido_por_id: input.decidido_por_id,
        decidido_em: agora,
        updated_at: agora,
      })
      .eq('id', p.id)
      .eq('status', 'pendente')
    if (!updErr) fechadas += 1
  }
  return fechadas
}

export async function decidirSolicitacaoEncerramento(input: DecidirSolicitacaoInput) {
  const admin = createAdminClient()

  const { data: enc, error } = await admin
    .from('solicitacoes_encerramento_saldo')
    .select('*')
    .eq('id', input.solicitacao_encerramento_id)
    .single()
  if (error) throw error
  if (!enc) throw new Error('Solicitação não encontrada.')
  if ((enc as any).status !== 'pendente') {
    throw new Error(`Solicitação já foi decidida (status: ${(enc as any).status}).`)
  }

  // ---- REJEITAR ----
  if (input.acao === 'rejeitar') {
    if (!input.motivo_rejeicao?.trim()) {
      throw new Error('Motivo de rejeição obrigatório.')
    }
    const { data: upd, error: updErr } = await admin
      .from('solicitacoes_encerramento_saldo')
      .update({
        status: 'rejeitada',
        motivo_rejeicao: input.motivo_rejeicao.trim(),
        decidido_por_id: input.decidido_por_id,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.solicitacao_encerramento_id)
      .select()
      .single()
    if (updErr) throw updErr
    return { decisao: 'rejeitada' as const, encerramento: upd }
  }

  // ---- APROVAR ----
  // Antes de tentar encerrar: o pedido pode JÁ estar encerrado (aprovação
  // anterior que falhou no UPDATE final, ou admin que encerrou direto pelo
  // modal). Nesse caso o estado desejado já vale e o certo é reconciliar —
  // antes, `encerrarSolicitacao` estourava 422 PEDIDO_NAO_APROVADO e a
  // solicitação ficava presa em 'pendente' pra sempre.
  const { data: pedidoAtual } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, status, deletado_em')
    .eq('id', (enc as any).solicitacao_fat_direto_id)
    .maybeSingle()

  if ((pedidoAtual as any)?.status === 'encerrado' && !(pedidoAtual as any)?.deletado_em) {
    const saldo = await saldoDevolvidoDePedidoEncerrado(
      admin,
      (enc as any).solicitacao_fat_direto_id,
    )
    const agora = new Date().toISOString()
    const { data: upd, error: updErr } = await admin
      .from('solicitacoes_encerramento_saldo')
      .update({
        status: 'aprovada',
        saldo_efetivamente_cancelado: saldo ?? Number((enc as any).saldo_no_momento || 0),
        decidido_por_id: input.decidido_por_id,
        decidido_em: agora,
        updated_at: agora,
      })
      .eq('id', input.solicitacao_encerramento_id)
      .select()
      .single()
    if (updErr) throw updErr
    return {
      decisao: 'aprovada' as const,
      encerramento: upd,
      resultado_encerramento: null,
      /** true = o pedido já estava encerrado; só a fila foi acertada. */
      reconciliado: true,
    }
  }

  // Pedido em estado terminal que NÃO é encerramento (cancelado, rejeitado,
  // deletado): aprovar é impossível. Diz o que fazer em vez de deixar o
  // aprovador num beco sem saída.
  const statusPedido = (pedidoAtual as any)?.status
  if ((pedidoAtual as any)?.deletado_em || (statusPedido && statusPedido !== 'aprovado')) {
    throw new Error(
      `O pedido está ${(pedidoAtual as any)?.deletado_em ? 'deletado' : `com status '${statusPedido}'`} ` +
      `e não pode ter o saldo encerrado. Rejeite esta solicitação para tirá-la da fila.`,
    )
  }

  // Reusa `encerrarSolicitacao` (migration 050): muda status do pedido pra
  // 'encerrado', devolve saldo proporcionalmente entre os itens (devoluções
  // omitidas → distribuição automática).
  const resEnc = await encerrarSolicitacao({
    solicitacao_id: (enc as any).solicitacao_fat_direto_id,
    encerrado_por_id: input.decidido_por_id,
    motivo: (enc as any).motivo_solicitacao,
  })

  // Snapshot do saldo efetivamente cancelado no momento da decisão
  // (pode divergir de saldo_no_momento se NFs foram lançadas entre a
  // solicitação e a aprovação).
  const saldoCancelado = (resEnc as any).saldo_devolvido ?? (enc as any).saldo_no_momento

  const { data: upd, error: updErr } = await admin
    .from('solicitacoes_encerramento_saldo')
    .update({
      status: 'aprovada',
      saldo_efetivamente_cancelado: saldoCancelado,
      decidido_por_id: input.decidido_por_id,
      decidido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.solicitacao_encerramento_id)
    .select()
    .single()
  if (updErr) throw updErr

  return {
    decisao: 'aprovada' as const,
    encerramento: upd,
    resultado_encerramento: resEnc,
    reconciliado: false,
  }
}

/**
 * Lista solicitações de encerramento PENDENTES de um contrato.
 *
 * O filtro de contrato é aplicado client-side porque o filtro de embed do
 * PostgREST não consegue propagar a cláusula `eq` pra coluna do parent —
 * o embed retorna ALL pedidos e filtra via JOIN. Mais simples (e
 * performático em volume baixo) é filtrar em memória.
 */
export async function listarSolicitacoesPendentes(contratoId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_encerramento_saldo')
    .select(`
      *,
      solicitacao_fat_direto:solicitacoes_fat_direto!solicitacao_fat_direto_id(
        id, numero, numero_pedido_fip, contrato_id, valor_total,
        fornecedor_razao_social, fornecedor_cnpj
      ),
      solicitado_por:perfis!solicitado_por_id(id, nome, email)
    `)
    .eq('status', 'pendente')
    .order('solicitado_em', { ascending: false })
  if (error) throw error
  // Normaliza pro shape que a UI (encerramentos/page.tsx) consome — sem isso
  // a tela mostra saldo R$ 0,00, motivo "—" e o pedido como UUID.
  return (data ?? [])
    .filter((s: any) => s.solicitacao_fat_direto?.contrato_id === contratoId)
    .map((s: any) => {
      const ped = s.solicitacao_fat_direto ?? {}
      return {
        ...s,
        contrato_id: ped.contrato_id ?? contratoId,
        saldo: Number(s.saldo_no_momento ?? 0),
        motivo: s.motivo_solicitacao ?? '',
        pedido_numero: ped.numero_pedido_fip ?? ped.numero ?? null,
        pedido_descricao: ped.fornecedor_razao_social ?? null,
        data_solicitacao: s.solicitado_em ?? s.created_at ?? null,
        solicitante: s.solicitado_por
          ? { nome: s.solicitado_por.nome, email: s.solicitado_por.email }
          : null,
      }
    })
}
