import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError, withSchemaFallback } from '@/lib/db/resilient'
import { log } from '@/lib/log'

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

  const baseSelect = `
      id, numero, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, contrato_id, created_at,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      solicitante:perfis!solicitante_id(nome, email),
      aprovador:perfis!aprovador_id(nome, email),
      itens:itens_solicitacao_fat_direto(
        id, descricao, local, qtde_solicitada, valor_unitario, valor_total,
        tarefa:tarefa_id(id, codigo, nome, grupo_macro_id)
      ),
      notas_fiscais:notas_fiscais_fat_direto!solicitacao_id(
        id, numero_nf, emitente, cnpj_emitente, valor, data_emissao, descricao, status, validado_em
      )
    `

  // Campos extras (contato/pedido/anexos/encerramento): se schema cache do
  // PostgREST ainda não os conhece, cai pro select base em vez de quebrar.
  // Itens ganham valor_devolvido pra UI exibir saldo livre por item.
  const extraSelect = `
      id, numero, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, contrato_id, created_at,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      fornecedor_contato_nome, fornecedor_contato_telefone,
      numero_pedido_fip, pedido_pdf_url, pedido_pdf_nome, pedido_anexos,
      data_encerramento, encerrado_por_id, motivo_encerramento,
      solicitante:perfis!solicitante_id(nome, email),
      aprovador:perfis!aprovador_id(nome, email),
      encerrado_por:perfis!encerrado_por_id(nome, email),
      itens:itens_solicitacao_fat_direto(
        id, descricao, local, qtde_solicitada, valor_unitario, valor_total, valor_devolvido,
        tarefa:tarefa_id(id, codigo, nome, grupo_macro_id)
      ),
      notas_fiscais:notas_fiscais_fat_direto!solicitacao_id(
        id, numero_nf, emitente, cnpj_emitente, valor, data_emissao, descricao, status, validado_em
      )
    `

  const { data, error } = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(extraSelect)
      .eq('id', id)
      .single(),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(baseSelect)
      .eq('id', id)
      .single(),
    missingColumns: [
      'fornecedor_contato_nome',
      'fornecedor_contato_telefone',
      'numero_pedido_fip',
      'pedido_pdf_url',
      'pedido_pdf_nome',
      'pedido_anexos',
      'data_encerramento',
      'encerrado_por_id',
      'motivo_encerramento',
      'valor_devolvido',
    ],
    context: 'getSolicitacao',
  })

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

export interface PedidoFipDuplicadoInfo {
  numero_pedido_fip: number
  solicitacao_existente: { id: string; numero: number; status: string; contrato_id: string }
}

/**
 * Verifica se já existe outra solicitação ativa (não soft-deleted) com o mesmo
 * numero_pedido_fip. Use ANTES do insert/update para devolver 409 amigável em
 * vez de deixar o índice único estourar 23505.
 *
 * Retorna null se livre, ou as informações do pedido conflitante.
 */
export async function checkPedidoFipDuplicado(
  numeroPedidoFip: number,
  excludeSolId?: string,
): Promise<PedidoFipDuplicadoInfo | null> {
  const admin = createAdminClient()
  let query = admin
    .from('solicitacoes_fat_direto')
    .select('id, numero, status, contrato_id, deletado_em')
    .eq('numero_pedido_fip', numeroPedidoFip)
    .is('deletado_em', null)
    .limit(1)

  if (excludeSolId) query = query.neq('id', excludeSolId)

  const { data, error } = await query
  if (error) {
    // Se a coluna deletado_em não existir ainda no schema cache, retry sem filtro
    if (isSchemaMissingError(error, ['deletado_em'])) {
      let q2 = admin
        .from('solicitacoes_fat_direto')
        .select('id, numero, status, contrato_id')
        .eq('numero_pedido_fip', numeroPedidoFip)
        .limit(1)
      if (excludeSolId) q2 = q2.neq('id', excludeSolId)
      const { data: d2, error: e2 } = await q2
      if (e2) throw e2
      const found = (d2 || [])[0]
      if (!found) return null
      return { numero_pedido_fip: numeroPedidoFip, solicitacao_existente: found as any }
    }
    throw error
  }

  const found = (data || [])[0]
  if (!found) return null
  return {
    numero_pedido_fip: numeroPedidoFip,
    solicitacao_existente: {
      id: found.id,
      numero: found.numero,
      status: found.status,
      contrato_id: found.contrato_id,
    },
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

  // Verificar duplicidade de numero_pedido_fip (apenas quando override explícito)
  if (input.numero_pedido_fip) {
    const dup = await checkPedidoFipDuplicado(input.numero_pedido_fip)
    if (dup) {
      const err = new Error('PEDIDO_FIP_DUPLICADO')
      ;(err as any).pedidoFipDuplicado = dup
      throw err
    }
  }

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

    // Inclui valor_devolvido pra desconsiderar dos comprometimentos.
    // withSchemaFallback: durante janela de schema cache stale (após migration 050),
    // cai pra select sem valor_devolvido — soma normal sem subtrair (degradação OK).
    const itensExistRes = await withSchemaFallback({
      primary: () => admin
        .from('itens_solicitacao_fat_direto')
        .select('detalhamento_id, valor_total, valor_devolvido, solicitacoes_fat_direto!inner(status)')
        .in('detalhamento_id', detIdsReq)
        .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao']),
      fallback: () => admin
        .from('itens_solicitacao_fat_direto')
        .select('detalhamento_id, valor_total, solicitacoes_fat_direto!inner(status)')
        .in('detalhamento_id', detIdsReq)
        .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao']),
      missingColumns: ['valor_devolvido'],
      context: 'criarSolicitacao_itensExist',
    })
    const itensExist = itensExistRes.data

    const aprovByDet: Record<string, number> = {}
    const pendByDet: Record<string, number> = {}
    ;(itensExist || []).forEach((it: any) => {
      if (!it.detalhamento_id) return
      const s = it.solicitacoes_fat_direto?.status
      // Saldo efetivo = valor_total − valor_devolvido (devoluções liberam o saldo do item)
      const efetivo = (it.valor_total || 0) - (it.valor_devolvido || 0)
      if (efetivo <= 0) return
      if (s === 'aprovado') aprovByDet[it.detalhamento_id] = (aprovByDet[it.detalhamento_id] || 0) + efetivo
      else if (s === 'aguardando_aprovacao') pendByDet[it.detalhamento_id] = (pendByDet[it.detalhamento_id] || 0) + efetivo
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
    // P2.15: se omitido, o trigger auto_assign_pedido_fip atribui via sequence.
    // Aceitar override pra casos de migração / correção manual.
    numero_pedido_fip: input.numero_pedido_fip,
    fornecedor_razao_social: input.fornecedor_razao_social,
    fornecedor_cnpj: input.fornecedor_cnpj,
    fornecedor_contato: input.fornecedor_contato,
    fornecedor_contato_nome: input.fornecedor_contato_nome,
    fornecedor_contato_telefone: input.fornecedor_contato_telefone,
    valor_total,
    status: 'aguardando_aprovacao',
  }
  // Use FIP order number as the solicitation number when explicit
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

/**
 * Cria uma solicitação fat-direto em status `rascunho` automaticamente,
 * a partir dos itens com FIP fat-direto > 0 de uma medição recém-aprovada.
 *
 * Diferente de `criarSolicitacao`:
 *   - Status nasce `rascunho` (não `aguardando_aprovacao`) — admin completa
 *     fornecedor/numero/observações depois e só aí submete pra aprovação.
 *   - **Sem validações de teto / limite por detalhamento** — a medição
 *     que origina já foi validada pelo admin, e o material já foi
 *     fisicamente medido. Bloquear aqui só atrapalharia.
 *   - Sem geração automática de número (numero_pedido_fip fica NULL,
 *     admin atribui manualmente ao completar o rascunho).
 *
 * Retorna a solicitação criada. Lança erro se inserir falhar.
 */
export async function criarSolicitacaoRascunhoDeMedicao(input: {
  contrato_id: string
  solicitante_id: string
  medicao_id: string
  medicao_numero: number
  itens: Array<{
    detalhamento_id: string
    descricao: string
    valor_total: number  // = fip_faturar do item
  }>
}) {
  const admin = createAdminClient()

  if (input.itens.length === 0) {
    throw new Error('Nenhum item com fip_faturar > 0 — sem rascunho a criar.')
  }

  // Busca tarefa_id de cada detalhamento (campo obrigatório em itens)
  const detIds = input.itens.map(i => i.detalhamento_id)
  const { data: dets, error: detErr } = await admin
    .from('detalhamentos')
    .select('id, tarefa_id')
    .in('id', detIds)
  if (detErr) throw detErr
  const tarefaPorDet = new Map<string, string>()
  for (const d of (dets || []) as any[]) {
    if (d.id && d.tarefa_id) tarefaPorDet.set(d.id, d.tarefa_id)
  }

  const valor_total = input.itens.reduce((s, i) => s + i.valor_total, 0)
  const tag = `MED-${String(input.medicao_numero).padStart(3, '0')}`

  const insertPayload: Record<string, unknown> = {
    contrato_id: input.contrato_id,
    solicitante_id: input.solicitante_id,
    observacoes: `Rascunho gerado automaticamente da aprovação da medição ${tag}. Complete fornecedor/numero/observações antes de submeter.`,
    valor_total,
    status: 'rascunho',
  }

  const { data: sol, error } = await admin
    .from('solicitacoes_fat_direto')
    .insert(insertPayload)
    .select()
    .single()
  if (error) throw error

  const itensPayload = input.itens.map(i => ({
    solicitacao_id: sol.id,
    tarefa_id: tarefaPorDet.get(i.detalhamento_id) ?? null,
    detalhamento_id: i.detalhamento_id,
    descricao: i.descricao,
    local: 'TORRE',  // default schema; admin ajusta se necessário
    qtde_solicitada: 1,
    valor_unitario: i.valor_total,
  })).filter(it => it.tarefa_id !== null)

  if (itensPayload.length === 0) {
    // Nenhum dos detalhamentos tinha tarefa associada — desfaz o cabeçalho
    await admin.from('solicitacoes_fat_direto').delete().eq('id', sol.id)
    throw new Error('Nenhum dos itens tinha tarefa_id resolvido — rascunho cancelado.')
  }

  const { error: itErr } = await admin.from('itens_solicitacao_fat_direto').insert(itensPayload)
  if (itErr) {
    // Desfaz cabeçalho em caso de falha nos itens
    await admin.from('solicitacoes_fat_direto').delete().eq('id', sol.id)
    throw itErr
  }

  return sol
}

export async function listarSolicitacoesAprovadas() {
  const admin = createAdminClient()
  const baseSelect = `
      id, numero, status, data_solicitacao, data_aprovacao, valor_total,
      fornecedor_razao_social, fornecedor_cnpj,
      contrato_id,
      contrato:contrato_id(id, numero, descricao),
      solicitante:perfis!solicitante_id(nome),
      notas_fiscais:notas_fiscais_fat_direto!solicitacao_id(id, numero_nf, valor, status),
      itens:itens_solicitacao_fat_direto(id)
    `
  const extraSelect = `${baseSelect}, observacoes, numero_pedido_fip`

  // withSchemaFallback: se observacoes/numero_pedido_fip não estão no schema cache,
  // cai no select base e a página segue funcionando (sem coluna).
  const { data, error } = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(extraSelect)
      .in('status', ['aprovado', 'aguardando_aprovacao'])
      .order('data_solicitacao', { ascending: false }),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(baseSelect)
      .in('status', ['aprovado', 'aguardando_aprovacao'])
      .order('data_solicitacao', { ascending: false }),
    missingColumns: ['observacoes', 'numero_pedido_fip'],
    context: 'listarSolicitacoesAprovadas',
  })
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
  /**
   * Se true, pula a checagem 'data_emissao >= data_aprovacao' (mantém os
   * outros checks). Use apenas quando o aprovador confirmar explicitamente
   * que a NF antedatada é aceitável (ex.: NF emitida durante negociação,
   * antes da aprovação formal).
   */
  override_data_anterior?: boolean
  /**
   * Se true, autoriza explicitamente NF que excede a tolerância configurada
   * no contrato. Exige `motivo_divergencia` preenchido (auditado).
   */
  override_excede_saldo?: boolean
  motivo_divergencia?: string
}): Promise<{
  saldo_antes: number
  saldo_depois: number
  pct_uso_pedido: number
  pedido_valor: number
  divergencia_valor: boolean
  divergencia_excedente: number
  tolerancia: number
}> {
  const admin = createAdminClient()

  const { data: sol, error: solErr } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, status, valor_total, fornecedor_cnpj, data_aprovacao, deletado_em, contrato_id')
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

  // Data da NF não pode ser anterior à aprovação do pedido — exceto se o
  // aprovador confirmar override explícito (ex.: NF emitida durante negociação).
  if (sol.data_aprovacao && !input.override_data_anterior) {
    const dataEmissao = new Date(input.data_emissao + 'T00:00:00Z').getTime()
    const dataAprov = new Date(sol.data_aprovacao).getTime()
    // Margem de 1 dia pra fuso/aproximação
    if (dataEmissao < dataAprov - 24 * 3600 * 1000) {
      throw new NFMatchError(
        'DATA_INVALIDA',
        `Data de emissão da NF (${input.data_emissao}) é anterior à aprovação do pedido (${new Date(sol.data_aprovacao).toISOString().slice(0, 10)}).`,
        { data_emissao: input.data_emissao, data_aprovacao: sol.data_aprovacao, override_disponivel: true },
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

  // Tolerância de divergência configurada no contrato (default 0)
  // — busca de forma resiliente: se a coluna ainda não existe (migration 053
  // não rodou), trata como 0 e mantém comportamento estrito.
  let tolerancia = 0
  if ((sol as any).contrato_id) {
    const { data: contrato } = await admin
      .from('contratos')
      .select('tolerancia_nf_valor')
      .eq('id', (sol as any).contrato_id)
      .single()
    tolerancia = Number((contrato as any)?.tolerancia_nf_valor ?? 0)
  }

  // Excedente = quanto a NF passa do saldo. Positivo = NF maior que saldo.
  const excedente = input.valor - saldoAntes
  const TOL_ARRED = 0.01 // arredondamento de centavos
  const divergenciaPequena = Math.abs(excedente) > TOL_ARRED

  // Caso 1: dentro do arredondamento (≤ R$ 0,01) — aceita silenciosamente.
  // Caso 2: excedente positivo > tolerância configurada — exige override.
  // Caso 3: excedente positivo dentro da tolerância — aceita com flag.
  if (excedente > tolerancia + TOL_ARRED) {
    if (!input.override_excede_saldo) {
      throw new NFMatchError(
        'VALOR_EXCEDE_SALDO',
        `Valor da NF (R$ ${input.valor.toFixed(2)}) excede o saldo do pedido (R$ ${saldoAntes.toFixed(2)}) ` +
        `em R$ ${excedente.toFixed(2)} — acima da tolerância de R$ ${tolerancia.toFixed(2)} configurada no contrato.`,
        {
          pedido_valor: pedidoValor,
          soma_nfs: somaAtivas,
          saldo: saldoAntes,
          valor_nf: input.valor,
          excedente,
          tolerancia,
          override_disponivel: true,
        },
      )
    }
    // Override aceito — exige motivo
    if (!input.motivo_divergencia || !input.motivo_divergencia.trim()) {
      throw new NFMatchError(
        'VALOR_EXCEDE_SALDO',
        'Override de saldo exige motivo da divergência (motivo_divergencia).',
        { excedente, tolerancia, override_sem_motivo: true },
      )
    }
  }

  const usado = somaAtivas + input.valor
  return {
    saldo_antes: saldoAntes,
    saldo_depois: saldoDepois,
    pct_uso_pedido: pedidoValor > 0 ? (usado / pedidoValor) * 100 : 0,
    pedido_valor: pedidoValor,
    divergencia_valor: divergenciaPequena,
    divergencia_excedente: divergenciaPequena ? excedente : 0,
    tolerancia,
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
  /** Override explícito: aceita data_emissao anterior à aprovação (auditado). */
  override_data_anterior?: boolean
  /** Override explícito: aceita NF que excede a tolerância do contrato (auditado). */
  override_excede_saldo?: boolean
  /** Justificativa obrigatória quando override_excede_saldo=true. */
  motivo_divergencia?: string
}) {
  // 3-way match antes de gravar — lança NFMatchError em caso de violação
  const match = await validarNotaFiscal3Way({
    solicitacao_id: input.solicitacao_id,
    numero_nf: input.numero_nf,
    cnpj_emitente: input.cnpj_emitente,
    valor: input.valor,
    data_emissao: input.data_emissao,
    override_data_anterior: input.override_data_anterior,
    override_excede_saldo: input.override_excede_saldo,
    motivo_divergencia: input.motivo_divergencia,
  })

  // Remove campos que não são colunas da tabela
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { override_data_anterior, override_excede_saldo, motivo_divergencia, ...rest } = input

  // Anexa metadados de divergência calculados pelo match (se aplicável).
  // Persistência dos flags resiliente: se a migration 053 ainda não rodou,
  // tenta com flags; se falhar por coluna ausente, refaz sem.
  const insertPayloadComFlags: Record<string, any> = {
    ...rest,
    divergencia_valor: match.divergencia_valor,
    divergencia_excedente: match.divergencia_valor ? match.divergencia_excedente : null,
    override_excede_saldo: !!input.override_excede_saldo,
    motivo_divergencia: input.motivo_divergencia || null,
  }

  const admin = createAdminClient()
  let data: any
  {
    const r = await admin
      .from('notas_fiscais_fat_direto')
      .insert(insertPayloadComFlags)
      .select()
      .single()
    if (r.error) {
      // Fallback se schema cache não tem as colunas ainda
      const isMissing = isSchemaMissingError(r.error, [
        'divergencia_valor', 'divergencia_excedente',
        'override_excede_saldo', 'motivo_divergencia',
      ])
      if (!isMissing) throw r.error
      const r2 = await admin
        .from('notas_fiscais_fat_direto')
        .insert(rest)
        .select()
        .single()
      if (r2.error) throw r2.error
      data = r2.data
    } else {
      data = r.data
    }
  }

  // Auditoria
  if (input.override_data_anterior) {
    log.warn('nf_data_anterior_aprovada', {
      nf_id: (data as any)?.id,
      solicitacao_id: input.solicitacao_id,
      numero_nf: input.numero_nf,
      data_emissao: input.data_emissao,
    })
  }
  if (input.override_excede_saldo) {
    log.warn('nf_override_excede_saldo', {
      nf_id: (data as any)?.id,
      solicitacao_id: input.solicitacao_id,
      numero_nf: input.numero_nf,
      valor_nf: input.valor,
      excedente: match.divergencia_excedente,
      tolerancia: match.tolerancia,
      motivo: input.motivo_divergencia,
    })
  } else if (match.divergencia_valor) {
    log.info('nf_divergencia_dentro_tolerancia', {
      nf_id: (data as any)?.id,
      solicitacao_id: input.solicitacao_id,
      numero_nf: input.numero_nf,
      excedente: match.divergencia_excedente,
      tolerancia: match.tolerancia,
    })
  }

  // Anexa info do match pra UI exibir barra/alerta sem nova request
  return { ...data, _match: match }
}

/**
 * Verifica se o detalhamento (item de nivel-3 do contrato) tem saldo
 * suficiente pra absorver mais R$ valor_extra em pedidos aprovados +
 * pendentes. Usado pra validar ajuste de saldo por divergência sem
 * estourar o limite contratual do item.
 *
 * Retorna null se cabe; objeto com info de violação se não cabe.
 */
export async function verificarSaldoDetalhamento(input: {
  detalhamento_id: string
  valor_extra: number
}): Promise<{ limite: number; aprovado: number; pendente: number; saldo: number } | null> {
  const admin = createAdminClient()

  // Carrega o detalhamento (limite contratual = qtde × valor_unitario)
  const { data: det, error: detErr } = await admin
    .from('detalhamentos')
    .select('id, valor_total, quantidade_contratada, valor_unitario')
    .eq('id', input.detalhamento_id)
    .single()
  if (detErr || !det) return null // sem detalhamento, sem checagem possível
  const limite = Number((det as any).valor_total ?? (Number((det as any).quantidade_contratada || 0) * Number((det as any).valor_unitario || 0)))

  // Soma valor_total dos itens com esse detalhamento_id em solicitações
  // aprovadas/pendentes (descontando devoluções)
  const itensRes = await withSchemaFallback({
    primary: () => admin
      .from('itens_solicitacao_fat_direto')
      .select('valor_total, valor_devolvido, solicitacoes_fat_direto!inner(status, deletado_em)')
      .eq('detalhamento_id', input.detalhamento_id)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    fallback: () => admin
      .from('itens_solicitacao_fat_direto')
      .select('valor_total, solicitacoes_fat_direto!inner(status, deletado_em)')
      .eq('detalhamento_id', input.detalhamento_id)
      .in('solicitacoes_fat_direto.status', ['aprovado', 'aguardando_aprovacao'])
      .is('solicitacoes_fat_direto.deletado_em', null),
    missingColumns: ['valor_devolvido'],
    context: 'verificarSaldoDetalhamento',
  })

  let aprovado = 0
  let pendente = 0
  for (const it of (itensRes.data || []) as any[]) {
    const efetivo = Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)
    if (it.solicitacoes_fat_direto?.status === 'aprovado') aprovado += efetivo
    else pendente += efetivo
  }

  const saldo = limite - aprovado - pendente
  if (saldo < input.valor_extra - 0.01) {
    return { limite, aprovado, pendente, saldo }
  }
  return null
}

/**
 * AJUSTA o saldo de um pedido existente pra acomodar divergência de NF.
 *
 * Caminho B (refatorado v2): em vez de criar pedido novo (que ficaria
 * com saldo sobrando e seria cobrado falsamente no relatório de 30 dias),
 * AUMENTA o valor_total do pedido original em +excedente e cria 1 item
 * de ajuste pra manter integridade da soma.
 *
 * Operação atômica via UPDATE com expressão SQL (sem race condition em
 * NFs simultâneas).
 *
 * Validações:
 *  - excedente > 0
 *  - saldo no detalhamento do 1º item >= excedente (não estoura
 *    limite contratual do item)
 *  - pedido existe e está aprovado
 */
export async function ajustarSaldoPedidoPorDivergencia(input: {
  contrato_id: string
  pedido_id: string
  nf_id: string
  excedente: number
  motivo: string
  ajustado_por_id?: string
  tipo?: 'divergencia_nf' | 'ajuste_retroativo'
}) {
  if (input.excedente <= 0) {
    throw new Error('Excedente deve ser positivo pra ajustar saldo.')
  }

  const admin = createAdminClient()

  // 1) Carrega pedido + 1º item (pra detalhamento_id e tarefa_id)
  const { data: pedido, error: pedErr } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero_pedido_fip, contrato_id, status, valor_total,
      itens:itens_solicitacao_fat_direto ( tarefa_id, detalhamento_id, local )
    `)
    .eq('id', input.pedido_id)
    .single()
  if (pedErr || !pedido) throw new Error('Pedido não encontrado pra ajuste.')
  if ((pedido as any).status !== 'aprovado') {
    throw new Error('Só dá pra ajustar saldo de pedido aprovado.')
  }
  const itemBase = ((pedido as any).itens || [])[0]
  if (!itemBase) throw new Error('Pedido sem itens — não dá pra herdar tarefa/detalhamento pro ajuste.')

  // 2) Verifica saldo POR DETALHAMENTO (não global) — limite contratual
  //    do item não pode ser estourado.
  if (itemBase.detalhamento_id) {
    const violation = await verificarSaldoDetalhamento({
      detalhamento_id: itemBase.detalhamento_id,
      valor_extra: input.excedente,
    })
    if (violation) {
      const err = new Error('SALDO_DETALHAMENTO_INSUFICIENTE')
      ;(err as any).violation = { ...violation, detalhamento_id: itemBase.detalhamento_id }
      throw err
    }
  }

  const valorAnterior = Number((pedido as any).valor_total || 0)
  const valorNovo = valorAnterior + input.excedente
  const tipo = input.tipo || 'divergencia_nf'

  // 3) UPDATE atômico: valor_total += excedente, ajustes_divergencia ||=
  //    novo_ajuste, valor_aprovado_original = COALESCE(atual, valor_anterior).
  //    Operação sem race condition — Postgres serializa o UPDATE.
  const novoAjuste = {
    nf_id: input.nf_id,
    excedente: input.excedente,
    motivo: input.motivo,
    data: new Date().toISOString(),
    valor_anterior: valorAnterior,
    valor_novo: valorNovo,
    ajustado_por_id: input.ajustado_por_id ?? null,
    tipo,
  }

  // RPC seria mais limpo, mas pra evitar dependência de função SQL nova,
  // fazemos via UPDATE direto. PostgREST aceita expressão na coluna.
  // Usamos rpc 'sql_update_atomic' se existir, senão fallback read-then-write.
  // Aqui escolhemos abordagem simples: valor é calculado client-side mas
  // o WHERE inclui valor_total = valorAnterior pra detectar concorrência.
  const updPayloadComCols: any = {
    valor_total: valorNovo,
    valor_aprovado_original: null, // só set se ainda null (lógica abaixo)
    ajustes_divergencia: null,     // idem
  }

  // Carrega valor_aprovado_original e ajustes_divergencia atuais
  // (read-then-write — race condition mitigada por checagem do valor_total
  //  no WHERE). Se outra NF entrou entre read e write, .eq do valor_total
  //  falha (devolve 0 rows) e nós retentamos.
  let updateOk = false
  for (let tentativa = 0; tentativa < 3 && !updateOk; tentativa++) {
    const { data: snap } = await admin
      .from('solicitacoes_fat_direto')
      .select('valor_total, valor_aprovado_original, ajustes_divergencia')
      .eq('id', input.pedido_id)
      .single()
    if (!snap) throw new Error('Pedido sumiu durante ajuste — concorrência?')

    const valAtual = Number((snap as any).valor_total || 0)
    const valOrigSnap = (snap as any).valor_aprovado_original
    const ajustesAtuais = ((snap as any).ajustes_divergencia ?? []) as any[]

    novoAjuste.valor_anterior = valAtual
    novoAjuste.valor_novo = valAtual + input.excedente
    updPayloadComCols.valor_total = valAtual + input.excedente
    updPayloadComCols.valor_aprovado_original = valOrigSnap ?? valAtual
    updPayloadComCols.ajustes_divergencia = [...ajustesAtuais, novoAjuste]

    const r = await admin
      .from('solicitacoes_fat_direto')
      .update(updPayloadComCols)
      .eq('id', input.pedido_id)
      .eq('valor_total', valAtual) // lock-otimista
      .select('id, valor_total')
    if (r.error) {
      // Schema cache pendente — fallback sem colunas novas
      const isMissing = isSchemaMissingError(r.error, [
        'valor_aprovado_original', 'ajustes_divergencia',
      ])
      if (!isMissing) throw r.error
      const { valor_aprovado_original, ajustes_divergencia, ...rest } = updPayloadComCols
      const r2 = await admin
        .from('solicitacoes_fat_direto')
        .update(rest)
        .eq('id', input.pedido_id)
        .eq('valor_total', valAtual)
        .select('id, valor_total')
      if (r2.error) throw r2.error
      if ((r2.data || []).length > 0) updateOk = true
    } else if ((r.data || []).length > 0) {
      updateOk = true
    }
    // se 0 rows → outra requisição mexeu antes; retenta
  }
  if (!updateOk) throw new Error('Concorrência: ajuste não pôde ser aplicado após 3 tentativas.')

  // 4) Insere item de ajuste no MESMO pedido
  const descricaoAjuste = tipo === 'ajuste_retroativo'
    ? `Ajuste retroativo de divergência — PED-${(pedido as any).numero_pedido_fip}`
    : `Ajuste de divergência da NF nº ${input.nf_id}`
  const insertItemPayload: any = {
    solicitacao_id: input.pedido_id,
    tarefa_id: itemBase.tarefa_id,
    detalhamento_id: itemBase.detalhamento_id ?? null,
    descricao: descricaoAjuste,
    local: itemBase.local || 'TORRE',
    qtde_solicitada: 1,
    valor_unitario: input.excedente,
  }
  const { error: itemErr } = await admin.from('itens_solicitacao_fat_direto').insert(insertItemPayload)
  if (itemErr) throw itemErr

  log.warn('nf_divergencia_saldo_ajustado', {
    contrato_id: input.contrato_id,
    pedido_id: input.pedido_id,
    numero_pedido_fip: (pedido as any).numero_pedido_fip,
    nf_id: input.nf_id,
    excedente: input.excedente,
    valor_anterior: novoAjuste.valor_anterior,
    valor_novo: novoAjuste.valor_novo,
    tipo,
    motivo: input.motivo,
  })

  return {
    pedido_id: input.pedido_id,
    numero_pedido_fip: (pedido as any).numero_pedido_fip,
    valor_anterior: novoAjuste.valor_anterior,
    valor_novo: novoAjuste.valor_novo,
    excedente: input.excedente,
  }
}

/**
 * Wrapper pra compat (callsites antigos que usavam o nome anterior).
 * Devolve formato adaptado pra UI antiga ainda funcionar.
 */
export async function criarPedidoCoberturaDivergencia(input: {
  contrato_id: string
  pedido_pai_id: string
  nf_id: string
  excedente: number
  motivo: string
  aprovador_id?: string
}) {
  const r = await ajustarSaldoPedidoPorDivergencia({
    contrato_id: input.contrato_id,
    pedido_id: input.pedido_pai_id,
    nf_id: input.nf_id,
    excedente: input.excedente,
    motivo: input.motivo,
    ajustado_por_id: input.aprovador_id,
  })
  return {
    id: input.pedido_pai_id,
    numero_pedido_fip: r.numero_pedido_fip,
    valor_total: r.valor_novo,
    origem_divergencia_id: input.pedido_pai_id,
    _ajuste: r,
  }
}

/**
 * Recusa NF por divergência sem saldo de teto (caminho C).
 *
 * Marca a NF com status='rejeitada' + tipo_rejeicao='divergencia_sem_saldo'
 * + motivo_divergencia (auditoria). NÃO cria pedido novo.
 *
 * O email de notificação à FIP é responsabilidade do chamador (rota
 * separada que passa por email-preview).
 */
export async function recusarNotaFiscalPorDivergencia(input: {
  nf_id: string
  motivo: string
  aprovador_id?: string
}) {
  const admin = createAdminClient()

  // Atualiza a NF — usa fallback se schema cache não tem as colunas novas
  const updatePayload: any = {
    status: 'rejeitada',
    tipo_rejeicao: 'divergencia_sem_saldo',
    motivo_divergencia: input.motivo,
    validado_por_id: input.aprovador_id ?? null,
    validado_em: new Date().toISOString(),
  }
  const r = await admin
    .from('notas_fiscais_fat_direto')
    .update(updatePayload)
    .eq('id', input.nf_id)
    .select()
    .single()
  if (r.error) {
    const isMissing = isSchemaMissingError(r.error, ['tipo_rejeicao', 'motivo_divergencia'])
    if (!isMissing) throw r.error
    const { tipo_rejeicao, motivo_divergencia, ...rest } = updatePayload
    const r2 = await admin
      .from('notas_fiscais_fat_direto')
      .update(rest)
      .eq('id', input.nf_id)
      .select()
      .single()
    if (r2.error) throw r2.error
    log.warn('nf_divergencia_recusa_fip', {
      nf_id: input.nf_id,
      motivo: input.motivo,
      schema_pendente: true,
    })
    return r2.data
  }
  log.warn('nf_divergencia_recusa_fip', {
    nf_id: input.nf_id,
    motivo: input.motivo,
  })
  return r.data
}

/**
 * Detecta pedidos fat-direto aprovados ANTES de uma data de referência
 * que ainda têm saldo pendente (NF parcial ou nenhuma NF lançada) e
 * estão em atraso (data_aprovacao < hoje - dias_threshold).
 *
 * Usado pra:
 *  - banner pós-cadastro de NF (15 dias) — passa data_aprov do pedido novo
 *    como referência; só lista pedidos ANTERIORES a ele.
 *  - relatório mensal (30 dias) — passa data atual como referência;
 *    lista todos os pedidos atrasados do contrato.
 */
export async function detectarPedidosAtrasados(input: {
  contrato_id: string
  /** Só considera pedidos com data_aprovacao < esta data. Default: agora. */
  data_referencia?: string
  /** Threshold em dias. Default: lê do contrato (dias_alerta_pedido_atrasado). */
  dias_threshold?: number
}): Promise<{
  pedidos: Array<{
    id: string
    numero_pedido_fip: number
    data_aprovacao: string
    valor_total: number
    total_nfs: number
    saldo: number
    dias_decorridos: number
  }>
  dias_threshold: number
}> {
  const admin = createAdminClient()

  // Resolve threshold
  let diasThreshold = input.dias_threshold
  if (diasThreshold === undefined) {
    const { data: contrato } = await admin
      .from('contratos')
      .select('dias_alerta_pedido_atrasado')
      .eq('id', input.contrato_id)
      .single()
    diasThreshold = Number((contrato as any)?.dias_alerta_pedido_atrasado ?? 15)
  }

  const dataRef = input.data_referencia ? new Date(input.data_referencia) : new Date()
  const corteAtraso = new Date(dataRef.getTime() - diasThreshold * 24 * 3600 * 1000)

  // Pega pedidos aprovados do contrato com data_aprovacao < corteAtraso
  const { data: sols } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, numero_pedido_fip, data_aprovacao, valor_total, deletado_em')
    .eq('contrato_id', input.contrato_id)
    .eq('status', 'aprovado')
    .is('deletado_em', null)
    .lt('data_aprovacao', corteAtraso.toISOString())
    .order('data_aprovacao', { ascending: true })

  if (!sols || sols.length === 0) {
    return { pedidos: [], dias_threshold: diasThreshold }
  }

  // Pega NFs ativas dos pedidos achados (1 query só)
  const ids = sols.map((s: any) => s.id)
  const { data: nfsRaw } = await admin
    .from('notas_fiscais_fat_direto')
    .select('solicitacao_id, valor, status')
    .in('solicitacao_id', ids)

  const nfsPorSol: Record<string, number> = {}
  for (const nf of (nfsRaw || []) as any[]) {
    if (nf.status === 'rejeitada') continue
    nfsPorSol[nf.solicitacao_id] = (nfsPorSol[nf.solicitacao_id] || 0) + Number(nf.valor || 0)
  }

  // Filtra apenas os com saldo > 0 (parcial ou sem NF) e calcula dias
  const hoje = new Date()
  const pedidos = sols
    .map((s: any) => {
      const totalNfs = nfsPorSol[s.id] || 0
      const saldo = Number(s.valor_total || 0) - totalNfs
      const diasDecorridos = Math.floor(
        (hoje.getTime() - new Date(s.data_aprovacao).getTime()) / (24 * 3600 * 1000),
      )
      return {
        id: s.id,
        numero_pedido_fip: Number(s.numero_pedido_fip || 0),
        data_aprovacao: s.data_aprovacao,
        valor_total: Number(s.valor_total || 0),
        total_nfs: totalNfs,
        saldo,
        dias_decorridos: diasDecorridos,
      }
    })
    .filter(p => p.saldo > 0.01)

  return { pedidos, dias_threshold: diasThreshold }
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

// ============================================================
// Encerrar pedido + devolver saldo aos itens
// ============================================================

export class EncerramentoError extends Error {
  code:
    | 'PEDIDO_NAO_APROVADO'
    | 'NF_PENDENTE_BLOQUEIA'
    | 'DEVOLUCAO_INVALIDA'
    | 'NAO_PERMITIDO'
  detail: Record<string, unknown>
  constructor(code: EncerramentoError['code'], message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'EncerramentoError'
    this.code = code
    this.detail = detail
  }
}

export interface EncerrarSolicitacaoInput {
  solicitacao_id: string
  encerrado_por_id: string
  motivo: string
  /**
   * Devoluções por item: { item_id, valor }. Soma deve ser igual ao saldo
   * do pedido (com tolerância R$ 0,01). Cada valor ≤ valor_unitario do item.
   *
   * Se omitido, devolve tudo proporcionalmente entre os itens (útil quando
   * pedido sem NF — equivalente a cancelamento total).
   */
  devolucoes?: Array<{ item_id: string; valor: number }>
}

/**
 * Encerra um pedido aprovado, devolvendo o saldo (valor_total − soma das NFs)
 * aos itens individuais. Após encerrar:
 *   - status = 'encerrado'
 *   - valor_total = soma das NFs validadas/pendentes (não-rejeitadas)
 *   - cada item ganha valor_devolvido somado ao que tinha
 *   - saldo dos detalhamentos é liberado automaticamente (cálculos usam
 *     valor_unitario − valor_devolvido)
 *
 * Bloqueia se houver NF status='pendente' (uma rejeição posterior deixaria
 * saldo no limbo). Permite se todas as NFs estão validadas/rejeitadas, ou
 * se não há NF nenhuma (= cancelamento total).
 */
export async function encerrarSolicitacao(input: EncerrarSolicitacaoInput) {
  const admin = createAdminClient()

  // 1) Carrega pedido + itens + nfs (single roundtrip por relação)
  const [{ data: sol }, { data: itens }, { data: nfs }] = await Promise.all([
    admin.from('solicitacoes_fat_direto')
      .select('id, status, valor_total, contrato_id, numero, numero_pedido_fip, fornecedor_razao_social, fornecedor_cnpj')
      .eq('id', input.solicitacao_id).single(),
    admin.from('itens_solicitacao_fat_direto')
      .select('id, descricao, local, valor_unitario, valor_devolvido, tarefa_id, detalhamento_id')
      .eq('solicitacao_id', input.solicitacao_id),
    admin.from('notas_fiscais_fat_direto')
      .select('id, valor, status')
      .eq('solicitacao_id', input.solicitacao_id),
  ])

  if (!sol) {
    throw new EncerramentoError('PEDIDO_NAO_APROVADO', 'Pedido não encontrado.', {})
  }
  if (sol.status !== 'aprovado') {
    throw new EncerramentoError(
      'PEDIDO_NAO_APROVADO',
      `Apenas pedidos aprovados podem ser encerrados (status atual: ${sol.status}).`,
      { status: sol.status },
    )
  }

  const nfsAtivas = (nfs || []).filter((n: any) => n.status !== 'rejeitada')
  const nfsPendentes = nfsAtivas.filter((n: any) => n.status === 'pendente')
  if (nfsPendentes.length > 0) {
    throw new EncerramentoError(
      'NF_PENDENTE_BLOQUEIA',
      `Existe(m) ${nfsPendentes.length} NF(s) pendente(s) de validação. Valide ou rejeite antes de encerrar o pedido.`,
      { qtd_pendentes: nfsPendentes.length },
    )
  }

  const totalNfs = nfsAtivas.reduce((s: number, n: any) => s + Number(n.valor || 0), 0)
  const valorOriginal = Number(sol.valor_total || 0)
  const saldoPedido = valorOriginal - totalNfs

  // Tolerância: saldo ≤ R$0,01 considerado "zerado", encerra direto sem devolução.
  if (saldoPedido <= 0.01) {
    const { error: updErr } = await admin
      .from('solicitacoes_fat_direto')
      .update({
        status: 'encerrado',
        data_encerramento: new Date().toISOString(),
        encerrado_por_id: input.encerrado_por_id,
        motivo_encerramento: input.motivo,
        // valor_total já igual a totalNfs, sem mudança
      })
      .eq('id', input.solicitacao_id)
    if (updErr) throw updErr
    return {
      saldo_devolvido: 0,
      total_nfs: totalNfs,
      valor_original: valorOriginal,
      devolucoes_aplicadas: [] as Array<{ item_id: string; valor: number; descricao: string }>,
    }
  }

  // 2) Calcula devoluções: usa o que veio no input ou distribui proporcionalmente
  const itensAtivos = (itens || []).map((it: any) => ({
    id: it.id,
    descricao: it.descricao || '',
    valor_unitario: Number(it.valor_unitario || 0),
    valor_devolvido_atual: Number(it.valor_devolvido || 0),
    saldo_disponivel: Math.max(0, Number(it.valor_unitario || 0) - Number(it.valor_devolvido || 0)),
    detalhamento_id: it.detalhamento_id,
  }))

  let devolucoes: Array<{ item_id: string; valor: number }>
  if (input.devolucoes && input.devolucoes.length > 0) {
    devolucoes = input.devolucoes
  } else {
    // Distribuição proporcional: cada item recebe sua fatia do saldo do pedido
    // proporcional ao seu saldo disponível. Útil pra "cancelar tudo" quando NF=0.
    const totalDisponivel = itensAtivos.reduce((s, it) => s + it.saldo_disponivel, 0)
    if (totalDisponivel < saldoPedido - 0.01) {
      throw new EncerramentoError(
        'DEVOLUCAO_INVALIDA',
        'Saldo do pedido excede a soma dos saldos disponíveis dos itens — não é possível distribuir.',
        { saldo_pedido: saldoPedido, total_disponivel: totalDisponivel },
      )
    }
    devolucoes = itensAtivos.map(it => ({
      item_id: it.id,
      valor: totalDisponivel > 0 ? (it.saldo_disponivel / totalDisponivel) * saldoPedido : 0,
    }))
  }

  // 3) Validações: cada devolução ≤ saldo disponível do item; soma = saldoPedido
  const itemMap = new Map(itensAtivos.map(it => [it.id, it]))
  let somaDevolucoes = 0
  for (const d of devolucoes) {
    const it = itemMap.get(d.item_id)
    if (!it) {
      throw new EncerramentoError('DEVOLUCAO_INVALIDA', `Item ${d.item_id} não pertence ao pedido.`, { item_id: d.item_id })
    }
    if (d.valor < 0) {
      throw new EncerramentoError('DEVOLUCAO_INVALIDA', `Valor de devolução não pode ser negativo (item ${it.descricao}).`, { item_id: d.item_id, valor: d.valor })
    }
    if (d.valor > it.saldo_disponivel + 0.01) {
      throw new EncerramentoError(
        'DEVOLUCAO_INVALIDA',
        `Devolução do item "${it.descricao}" (R$ ${d.valor.toFixed(2)}) excede o saldo disponível (R$ ${it.saldo_disponivel.toFixed(2)}).`,
        { item_id: d.item_id, valor: d.valor, max: it.saldo_disponivel },
      )
    }
    somaDevolucoes += d.valor
  }
  if (Math.abs(somaDevolucoes - saldoPedido) > 0.01) {
    throw new EncerramentoError(
      'DEVOLUCAO_INVALIDA',
      `Soma das devoluções (R$ ${somaDevolucoes.toFixed(2)}) deve ser igual ao saldo do pedido (R$ ${saldoPedido.toFixed(2)}).`,
      { soma_devolucoes: somaDevolucoes, saldo_pedido: saldoPedido },
    )
  }

  // 4) Aplica em lote: UPDATE itens (cada um) + UPDATE solicitacao
  // (Postgres aceita batch via upsert ou UPDATE serial; preferimos serial pra
  //  manter integridade individual e logs claros.)
  const devolucoesAplicadas: Array<{ item_id: string; valor: number; descricao: string }> = []
  for (const d of devolucoes) {
    if (d.valor <= 0) continue
    const it = itemMap.get(d.item_id)!
    const novoValorDevolvido = it.valor_devolvido_atual + d.valor
    const { error } = await admin
      .from('itens_solicitacao_fat_direto')
      .update({ valor_devolvido: novoValorDevolvido })
      .eq('id', d.item_id)
    if (error) {
      // Schema cache stale: a coluna pode não estar no PostgREST cache ainda
      if (isSchemaMissingError(error, ['valor_devolvido'])) {
        throw new EncerramentoError(
          'NAO_PERMITIDO',
          'Coluna valor_devolvido ainda não disponível no schema cache. Rode a migration 050 e recarregue o cache (Settings → API → Reload schema cache).',
          { hint: 'migration_050_pendente' },
        )
      }
      throw error
    }
    devolucoesAplicadas.push({ item_id: d.item_id, valor: d.valor, descricao: it.descricao })
  }

  const { error: updSolErr } = await admin
    .from('solicitacoes_fat_direto')
    .update({
      status: 'encerrado',
      valor_total: totalNfs, // ajusta valor pra refletir o efetivo recebido
      data_encerramento: new Date().toISOString(),
      encerrado_por_id: input.encerrado_por_id,
      motivo_encerramento: input.motivo,
    })
    .eq('id', input.solicitacao_id)
  if (updSolErr) {
    if (isSchemaMissingError(updSolErr, ['data_encerramento', 'encerrado_por_id', 'motivo_encerramento'])) {
      throw new EncerramentoError(
        'NAO_PERMITIDO',
        'Colunas de auditoria de encerramento ainda não disponíveis. Rode a migration 050 e recarregue o schema cache.',
        { hint: 'migration_050_pendente' },
      )
    }
    throw updSolErr
  }

  log.info('pedido_encerrado', {
    solicitacao_id: input.solicitacao_id,
    encerrado_por_id: input.encerrado_por_id,
    valor_original: valorOriginal,
    total_nfs: totalNfs,
    saldo_devolvido: saldoPedido,
    qtd_devolucoes: devolucoesAplicadas.length,
  })

  return {
    saldo_devolvido: saldoPedido,
    total_nfs: totalNfs,
    valor_original: valorOriginal,
    devolucoes_aplicadas: devolucoesAplicadas,
  }
}
