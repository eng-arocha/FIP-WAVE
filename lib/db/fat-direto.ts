import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError } from '@/lib/db/resilient'

export async function listarSolicitacoes(contratoId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, numero_pedido_fip, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, created_at,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      solicitante:perfis!solicitante_id(nome, email),
      aprovador:perfis!aprovador_id(nome, email),
      itens:itens_solicitacao_fat_direto(
        id, descricao, local, qtde_solicitada, valor_unitario, valor_total,
        tarefa:tarefa_id(codigo, nome)
      )
    `)
    .eq('contrato_id', contratoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getSolicitacao(id: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, contrato_id, created_at,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      solicitante:perfis!solicitante_id(nome, email),
      aprovador:perfis!aprovador_id(nome, email),
      itens:itens_solicitacao_fat_direto(
        id, descricao, local, qtde_solicitada, valor_unitario, valor_total,
        tarefa:tarefa_id(id, codigo, nome, grupo_macro_id)
      ),
      notas_fiscais:notas_fiscais_fat_direto(
        id, numero_nf, emitente, cnpj_emitente, valor, data_emissao, descricao, status, validado_em
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export interface TetoViolation {
  teto: number
  total_aprovado: number
  total_pendente: number
  valor_novo: number
  saldo_disponivel: number
  pedidos_bloqueantes: Array<{
    id: string
    numero: number
    status: string
    valor_total: number
    data_solicitacao: string
  }>
}

export async function verificarTeto(contratoId: string, valorNovo: number): Promise<TetoViolation | null> {
  const admin = createAdminClient()

  const { data: contrato } = await admin
    .from('contratos')
    .select('valor_material_direto')
    .eq('id', contratoId)
    .single()

  const teto = contrato?.valor_material_direto ?? 0

  const { data: sols } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, numero, status, valor_total, data_solicitacao')
    .eq('contrato_id', contratoId)
    .in('status', ['aprovado', 'aguardando_aprovacao'])

  const total_aprovado = (sols || [])
    .filter((s: any) => s.status === 'aprovado')
    .reduce((s: number, x: any) => s + (x.valor_total || 0), 0)

  const total_pendente = (sols || [])
    .filter((s: any) => s.status === 'aguardando_aprovacao')
    .reduce((s: number, x: any) => s + (x.valor_total || 0), 0)

  const comprometido = total_aprovado + valorNovo
  if (comprometido <= teto) return null

  const saldo_disponivel = teto - total_aprovado

  return {
    teto,
    total_aprovado,
    total_pendente,
    valor_novo: valorNovo,
    saldo_disponivel,
    pedidos_bloqueantes: (sols || [])
      .filter((s: any) => s.status === 'aprovado')
      .sort((a: any, b: any) => new Date(b.data_solicitacao).getTime() - new Date(a.data_solicitacao).getTime()),
  }
}

export async function criarSolicitacao(input: {
  contrato_id: string
  solicitante_id: string
  observacoes?: string
  numero_pedido_fip?: number
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  fornecedor_contato?: string
  fornecedor_contato_nome?: string
  fornecedor_contato_telefone?: string
  itens: Array<{
    tarefa_id: string
    detalhamento_id?: string
    descricao: string
    local: string
    valor_total: number
  }>
}) {
  const admin = createAdminClient()
  const valor_total = input.itens.reduce((s, i) => s + i.valor_total, 0)

  // Verificar teto global do contrato
  const violation = await verificarTeto(input.contrato_id, valor_total)
  if (violation) {
    const err = new Error('TETO_EXCEDIDO')
    ;(err as any).violation = violation
    throw err
  }

  // Verificar limite por detalhamento (nível 3)
  const detIdsReq = input.itens.map(i => i.detalhamento_id).filter(Boolean) as string[]
  if (detIdsReq.length > 0) {
    const { data: detsData } = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, valor_total, quantidade_contratada, valor_unitario')
      .in('id', detIdsReq)

    const { data: itensExist } = await admin
      .from('itens_solicitacao_fat_direto')
      .select('detalhamento_id, valor_total, solicitacoes_fat_direto!inner(status)')
      .in('detalhamento_id', detIdsReq)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])

    const aprovByDet: Record<string, number> = {}
    const pendByDet: Record<string, number> = {}
    ;(itensExist || []).forEach((it: any) => {
      if (!it.detalhamento_id) return
      const s = it.solicitacoes_fat_direto?.status
      if (s === 'aprovado') aprovByDet[it.detalhamento_id] = (aprovByDet[it.detalhamento_id] || 0) + (it.valor_total || 0)
      else if (s === 'aguardando_aprovacao') pendByDet[it.detalhamento_id] = (pendByDet[it.detalhamento_id] || 0) + (it.valor_total || 0)
    })

    // Group new items by detalhamento
    const novoByDet: Record<string, number> = {}
    input.itens.forEach(i => {
      if (i.detalhamento_id) novoByDet[i.detalhamento_id] = (novoByDet[i.detalhamento_id] || 0) + i.valor_total
    })

    for (const det of (detsData || [])) {
      const limite = det.valor_total || (det.quantidade_contratada || 0) * (det.valor_unitario || 0)
      if (limite <= 0) continue
      const aprovado = aprovByDet[det.id] || 0
      const emAprovacao = pendByDet[det.id] || 0
      const novo = novoByDet[det.id] || 0
      if (aprovado + emAprovacao + novo > limite) {
        const err = new Error('ITEM_LIMITE_EXCEDIDO')
        ;(err as any).itemViolation = {
          codigo: det.codigo,
          descricao: det.descricao,
          limite,
          aprovado,
          emAprovacao,
          saldoDisponivel: Math.max(0, limite - aprovado - emAprovacao),
          novoValor: novo,
        }
        throw err
      }
    }
  }

  const insertPayload: Record<string, unknown> = {
    contrato_id: input.contrato_id,
    solicitante_id: input.solicitante_id,
    observacoes: input.observacoes,
    numero_pedido_fip: input.numero_pedido_fip,
    fornecedor_razao_social: input.fornecedor_razao_social,
    fornecedor_cnpj: input.fornecedor_cnpj,
    fornecedor_contato: input.fornecedor_contato,
    fornecedor_contato_nome: input.fornecedor_contato_nome,
    fornecedor_contato_telefone: input.fornecedor_contato_telefone,
    valor_total,
    status: 'aguardando_aprovacao',
  }
  // Use FIP order number as the solicitation number
  if (input.numero_pedido_fip) {
    insertPayload.numero = input.numero_pedido_fip
  }

  const { data: sol, error } = await admin
    .from('solicitacoes_fat_direto')
    .insert(insertPayload)
    .select()
    .single()
  if (error) throw error

  const itensPayload = input.itens.map(i => ({
    solicitacao_id: sol.id,
    tarefa_id: i.tarefa_id,
    detalhamento_id: i.detalhamento_id || null,
    descricao: i.descricao,
    local: i.local,
    qtde_solicitada: 1,
    valor_unitario: i.valor_total,
  }))
  const { error: itErr } = await admin.from('itens_solicitacao_fat_direto').insert(itensPayload)
  if (itErr) throw itErr

  return sol
}

export async function listarSolicitacoesAprovadas() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, status, data_solicitacao, data_aprovacao, valor_total,
      fornecedor_razao_social, fornecedor_cnpj,
      contrato_id,
      contrato:contrato_id(id, numero, descricao),
      solicitante:perfis!solicitante_id(nome),
      notas_fiscais:notas_fiscais_fat_direto(id, numero_nf, valor, status),
      itens:itens_solicitacao_fat_direto(id)
    `)
    .in('status', ['aprovado', 'aguardando_aprovacao'])
    .order('data_solicitacao', { ascending: false })
  if (error) throw error
  return data || []
}

export async function listarSolicitacoesPendentes() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, status, data_solicitacao, valor_total, observacoes,
      fornecedor_razao_social, fornecedor_cnpj,
      contrato_id,
      contrato:contrato_id(id, numero, descricao),
      solicitante:perfis!solicitante_id(nome, email),
      itens:itens_solicitacao_fat_direto(id)
    `)
    .eq('status', 'aguardando_aprovacao')
    .order('data_solicitacao', { ascending: false })
  if (error) throw error
  return data || []
}

export async function atualizarStatusSolicitacao(
  id: string,
  status: 'aprovado' | 'rejeitado' | 'cancelado' | 'aguardando_aprovacao',
  aprovador_id?: string,
  motivo_rejeicao?: string,
) {
  const admin = createAdminClient()
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'aprovado') {
    updates.aprovador_id = aprovador_id
    updates.data_aprovacao = new Date().toISOString()
    // Ao re-aprovar, limpa qualquer registro de desaprovação anterior
    updates.desaprovado_em = null
    updates.desaprovado_por = null
    updates.motivo_desaprovacao = null
  }
  if (status === 'aguardando_aprovacao') {
    updates.aprovador_id = null
    updates.data_aprovacao = null
  }
  if (motivo_rejeicao) updates.motivo_rejeicao = motivo_rejeicao

  const { error } = await admin.from('solicitacoes_fat_direto').update(updates).eq('id', id)
  if (error) {
    // Tolera colunas de desaprovação ausentes (migration 027 ainda não rodada)
    if (isSchemaMissingError(error, ['desaprovado_em', 'desaprovado_por', 'motivo_desaprovacao'])) {
      delete updates.desaprovado_em
      delete updates.desaprovado_por
      delete updates.motivo_desaprovacao
      const retry = await admin.from('solicitacoes_fat_direto').update(updates).eq('id', id)
      if (retry.error) throw retry.error
      return
    }
    throw error
  }
}

/**
 * Desaprovar uma solicitação já aprovada: volta ao rascunho e registra
 * auditoria (quem, quando, motivo). Depois o solicitante original pode
 * editar e re-submeter, ou o admin pode cancelar/excluir.
 */
export async function desaprovarSolicitacao(
  id: string,
  desaprovado_por: string,
  motivo: string,
) {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const updates: Record<string, unknown> = {
    status: 'rascunho',
    aprovador_id: null,
    data_aprovacao: null,
    desaprovado_em: agora,
    desaprovado_por,
    motivo_desaprovacao: motivo,
    updated_at: agora,
  }

  const { error } = await admin
    .from('solicitacoes_fat_direto')
    .update(updates)
    .eq('id', id)

  if (error) {
    // Se a migration 027 ainda não foi aplicada, reporta 503 amigável
    if (isSchemaMissingError(error, ['desaprovado_em', 'desaprovado_por', 'motivo_desaprovacao'])) {
      throw new Error('MIGRATION_027_PENDING')
    }
    throw error
  }
}

/**
 * Erros de 3-way match da NF contra o pedido/solicitação.
 * Usamos classes nomeadas pra que o route handler possa mapear
 * pra status HTTP específicos (422 pra violação de regra de negócio).
 */
export class NFMatchError extends Error {
  code: 'CNPJ_DIVERGENTE' | 'VALOR_EXCEDE_SALDO' | 'DATA_INVALIDA' | 'SOLICITACAO_NAO_APROVADA' | 'DUPLICATA'
  detail: Record<string, unknown>
  constructor(code: NFMatchError['code'], message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'NFMatchError'
    this.code = code
    this.detail = detail
  }
}

/** Normaliza CNPJ (só dígitos) para comparação tolerante a máscara. */
function cnpjDigits(s: string | null | undefined): string {
  return (s || '').replace(/\D/g, '')
}

/**
 * 3-way match — valida NF contra Pedido antes de gravar.
 *
 * Checa:
 *  1) Solicitação existe, está aprovada (permite aguardando_aprovacao só se contrato permitir)
 *  2) CNPJ do emitente da NF == CNPJ do fornecedor no pedido (se ambos presentes)
 *  3) data_emissao >= data_aprovacao da solicitação (NF emitida após aprovação)
 *  4) valor somado das NFs ativas (não rejeitadas) + esta NF <= valor_total do pedido
 *  5) numero_nf + cnpj_emitente não duplicado no mesmo pedido
 *
 * Retorna { saldo_antes, saldo_depois, pct_uso_pedido } pra UI mostrar barra/alerta.
 */
export async function validarNotaFiscal3Way(input: {
  solicitacao_id: string
  numero_nf: string
  cnpj_emitente?: string
  valor: number
  data_emissao: string
}): Promise<{ saldo_antes: number; saldo_depois: number; pct_uso_pedido: number; pedido_valor: number }> {
  const admin = createAdminClient()

  const { data: sol, error: solErr } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, status, valor_total, fornecedor_cnpj, data_aprovacao, deletado_em')
    .eq('id', input.solicitacao_id)
    .single()
  if (solErr || !sol) {
    throw new NFMatchError('SOLICITACAO_NAO_APROVADA', 'Solicitação não encontrada.', {})
  }
  if (sol.deletado_em) {
    throw new NFMatchError('SOLICITACAO_NAO_APROVADA', 'Solicitação foi excluída.', { id: sol.id })
  }
  if (sol.status !== 'aprovado') {
    throw new NFMatchError(
      'SOLICITACAO_NAO_APROVADA',
      `Só é possível lançar NF em solicitação aprovada (status atual: ${sol.status}).`,
      { status: sol.status },
    )
  }

  // CNPJ check (só se ambos presentes — se pedido não tem CNPJ, deixa passar com warning no client)
  const cnpjPedido = cnpjDigits(sol.fornecedor_cnpj)
  const cnpjNf = cnpjDigits(input.cnpj_emitente)
  if (cnpjPedido && cnpjNf && cnpjPedido !== cnpjNf) {
    throw new NFMatchError(
      'CNPJ_DIVERGENTE',
      `CNPJ do emitente da NF (${cnpjNf}) diverge do CNPJ do fornecedor do pedido (${cnpjPedido}).`,
      { cnpj_pedido: cnpjPedido, cnpj_nf: cnpjNf },
    )
  }

  // Data da NF não pode ser anterior à aprovação do pedido
  if (sol.data_aprovacao) {
    const dataEmissao = new Date(input.data_emissao + 'T00:00:00Z').getTime()
    const dataAprov = new Date(sol.data_aprovacao).getTime()
    // Margem de 1 dia pra fuso/aproximação
    if (dataEmissao < dataAprov - 24 * 3600 * 1000) {
      throw new NFMatchError(
        'DATA_INVALIDA',
        `Data de emissão da NF (${input.data_emissao}) é anterior à aprovação do pedido (${new Date(sol.data_aprovacao).toISOString().slice(0, 10)}).`,
        { data_emissao: input.data_emissao, data_aprovacao: sol.data_aprovacao },
      )
    }
  }

  // Checa saldo: soma NFs ativas + esta <= valor_total do pedido
  const { data: nfsAtivas } = await admin
    .from('notas_fiscais_fat_direto')
    .select('id, numero_nf, cnpj_emitente, valor, status')
    .eq('solicitacao_id', input.solicitacao_id)

  const ativas = (nfsAtivas || []).filter((n: any) => n.status !== 'rejeitada')

  // Duplicata (mesmo numero_nf + cnpj_emitente na mesma solicitação)
  const dup = ativas.find((n: any) =>
    String(n.numero_nf).trim() === input.numero_nf.trim() &&
    cnpjDigits(n.cnpj_emitente) === cnpjNf
  )
  if (dup) {
    throw new NFMatchError(
      'DUPLICATA',
      `NF ${input.numero_nf} deste emitente já foi lançada neste pedido.`,
      { nf_id: dup.id },
    )
  }

  const somaAtivas = ativas.reduce((s: number, n: any) => s + Number(n.valor || 0), 0)
  const pedidoValor = Number(sol.valor_total || 0)
  const saldoAntes = pedidoValor - somaAtivas
  const saldoDepois = saldoAntes - input.valor

  if (input.valor > saldoAntes + 0.01) {
    throw new NFMatchError(
      'VALOR_EXCEDE_SALDO',
      `Valor da NF (R$ ${input.valor.toFixed(2)}) excede o saldo do pedido (R$ ${saldoAntes.toFixed(2)}).`,
      { pedido_valor: pedidoValor, soma_nfs: somaAtivas, saldo: saldoAntes, valor_nf: input.valor },
    )
  }

  const usado = somaAtivas + input.valor
  return {
    saldo_antes: saldoAntes,
    saldo_depois: saldoDepois,
    pct_uso_pedido: pedidoValor > 0 ? (usado / pedidoValor) * 100 : 0,
    pedido_valor: pedidoValor,
  }
}

export async function criarNotaFiscal(input: {
  solicitacao_id: string
  numero_nf: string
  emitente?: string
  cnpj_emitente?: string
  valor: number
  data_emissao: string
  data_recebimento?: string
  data_vencimento?: string
  descricao?: string
  arquivo_url?: string
}) {
  // 3-way match antes de gravar — lança NFMatchError em caso de violação
  const match = await validarNotaFiscal3Way({
    solicitacao_id: input.solicitacao_id,
    numero_nf: input.numero_nf,
    cnpj_emitente: input.cnpj_emitente,
    valor: input.valor,
    data_emissao: input.data_emissao,
  })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notas_fiscais_fat_direto')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  // Anexa info do match pra UI exibir barra/alerta sem nova request
  return { ...data, _match: match }
}

export async function getResumoFatDireto(contratoId: string) {
  const admin = createAdminClient()

  const { data: sols } = await admin
    .from('solicitacoes_fat_direto')
    .select('status, valor_total')
    .eq('contrato_id', contratoId)

  const { data: nfs } = await admin
    .from('notas_fiscais_fat_direto')
    .select('valor, status, solicitacao_id')
    .in(
      'solicitacao_id',
      (sols || []).map(s => s as any).filter(() => true).map((s: any) => s.id) || [],
    )

  // Get teto from contrato
  const { data: contrato } = await admin
    .from('contratos')
    .select('valor_material_direto')
    .eq('id', contratoId)
    .single()

  const teto = contrato?.valor_material_direto ?? 0
  const totalSolicitado = (sols || []).reduce((s: number, x: any) => s + (x.valor_total || 0), 0)
  const totalAprovado = (sols || [])
    .filter((x: any) => x.status === 'aprovado')
    .reduce((s: number, x: any) => s + (x.valor_total || 0), 0)
  const totalNF = (nfs || []).reduce((s: number, x: any) => s + (x.valor || 0), 0)

  return {
    teto,
    total_solicitado: totalSolicitado,
    total_aprovado: totalAprovado,
    total_nf_recebida: totalNF,
    saldo_disponivel: teto - totalAprovado,
    pct_aprovado: teto > 0 ? (totalAprovado / teto) * 100 : 0,
    pct_nf: teto > 0 ? (totalNF / teto) * 100 : 0,
  }
}

export async function listarTarefasParaSolicitacao(contratoId: string) {
  const admin = createAdminClient()

  // Grupos do contrato
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id')
    .eq('contrato_id', contratoId)
  const grupoIds = (grupos || []).map((g: any) => g.id)
  if (grupoIds.length === 0) return []

  // Tarefas (nivel 2) — select('*') é seguro: retorna o que existir sem quebrar
  const { data: tarefas } = await admin
    .from('tarefas')
    .select('*')
    .in('grupo_macro_id', grupoIds)
  const tarefaIds = (tarefas || []).map((t: any) => t.id)
  const tarefaMap: Record<string, any> = {}
  ;(tarefas || []).forEach((t: any) => { tarefaMap[t.id] = t })
  if (tarefaIds.length === 0) return []

  // Detalhamentos (nivel 3) — lista completa para o dropdown
  const { data: dets, error } = await admin
    .from('detalhamentos')
    .select('*')
    .in('tarefa_id', tarefaIds)
  if (error) throw error
  const detalhamentos = dets || []
  const detIds = detalhamentos.map((d: any) => d.id)

  // Valores já aprovados e em aprovação por detalhamento
  const aprovadoByDet: Record<string, number> = {}
  const emAprovacaoByDet: Record<string, number> = {}
  if (detIds.length > 0) {
    try {
      const { data: itensComStatus } = await admin
        .from('itens_solicitacao_fat_direto')
        .select('detalhamento_id, valor_total, solicitacoes_fat_direto!inner(status)')
        .in('detalhamento_id', detIds)
        .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      ;(itensComStatus || []).forEach((it: any) => {
        if (!it.detalhamento_id) return
        const status = it.solicitacoes_fat_direto?.status
        if (status === 'aprovado') {
          aprovadoByDet[it.detalhamento_id] = (aprovadoByDet[it.detalhamento_id] || 0) + (it.valor_total || 0)
        } else if (status === 'aguardando_aprovacao') {
          emAprovacaoByDet[it.detalhamento_id] = (emAprovacaoByDet[it.detalhamento_id] || 0) + (it.valor_total || 0)
        }
      })
    } catch {
      // coluna detalhamento_id ainda não existe — executar migration 009
    }
  }

  // Ordenação natural pelo código (1.1.1 < 1.2.1 < 1.10.1)
  const sorted = [...detalhamentos].sort((a: any, b: any) => {
    const partsA = (a.codigo || '').split('.').map(Number)
    const partsB = (b.codigo || '').split('.').map(Number)
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const diff = (partsA[i] || 0) - (partsB[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  })

  return sorted.map((d: any) => {
    const qty = d.quantidade_contratada || 0
    // valor_total = generated column qty × valor_unitario (global)
    const valorGlobal = d.valor_total || qty * (d.valor_unitario || 0)

    // Calcula valor de material com 3 níveis de prioridade:
    // 1. valor_material_unit explícito no detalhamento (migration 011/017)
    // 2. global − valor_servico_unit (quando só serviço está configurado)
    // 3. Proporção de material da tarefa pai (fallback quando nem um foi configurado)
    const matUnit = d.valor_material_unit || 0
    const srvUnit = d.valor_servico_unit  || 0
    let valorMaterial: number
    if (matUnit > 0) {
      valorMaterial = qty * matUnit
    } else if (srvUnit > 0) {
      valorMaterial = valorGlobal - qty * srvUnit
    } else {
      // Fallback: proporção de material da tarefa pai (se disponível)
      // Se tarefa não tem breakdown (valor_material=0), usa global como teto conservador
      const t = tarefaMap[d.tarefa_id]
      const tTotal = t?.valor_total || 0
      const tMat   = t?.valor_material || 0
      const ratio  = tTotal > 0 && tMat > 0 ? tMat / tTotal : 1
      valorMaterial = valorGlobal * ratio
    }
    const valorServico = valorGlobal - valorMaterial

    return {
      id: d.id,              // detalhamento ID (usado no dropdown)
      tarefa_id: d.tarefa_id, // FK real para tarefas (usado no insert)
      codigo: d.codigo,
      nome: (d.descricao || '').trim(),
      locais: [(d.local || 'TORRE').trim().toUpperCase()],
      valor_material: valorMaterial,
      valor_servico: valorServico,
      valor_total: valorGlobal,
      valor_aprovado: aprovadoByDet[d.id] || 0,
      valor_em_aprovacao: emAprovacaoByDet[d.id] || 0,
      grupo_macro: {
        codigo: tarefaMap[d.tarefa_id]?.codigo || '',
        nome: tarefaMap[d.tarefa_id]?.nome || '',
      },
    }
  })
}
