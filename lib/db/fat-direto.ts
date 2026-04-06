import { createAdminClient } from '@/lib/supabase/admin'

export async function listarSolicitacoes(contratoId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, created_at,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      solicitante:solicitante_id(nome, email),
      aprovador:aprovador_id(nome, email),
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
      solicitante:solicitante_id(nome, email),
      aprovador:aprovador_id(nome, email),
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
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  fornecedor_contato?: string
  itens: Array<{
    tarefa_id: string
    descricao: string
    local: string
    valor_total: number
  }>
}) {
  const admin = createAdminClient()
  const valor_total = input.itens.reduce((s, i) => s + i.valor_total, 0)

  // Validate against teto
  const violation = await verificarTeto(input.contrato_id, valor_total)
  if (violation) {
    const err = new Error('TETO_EXCEDIDO')
    ;(err as any).violation = violation
    throw err
  }

  const { data: sol, error } = await admin
    .from('solicitacoes_fat_direto')
    .insert({
      contrato_id: input.contrato_id,
      solicitante_id: input.solicitante_id,
      observacoes: input.observacoes,
      fornecedor_razao_social: input.fornecedor_razao_social,
      fornecedor_cnpj: input.fornecedor_cnpj,
      fornecedor_contato: input.fornecedor_contato,
      valor_total,
      status: 'aguardando_aprovacao',
    })
    .select()
    .single()
  if (error) throw error

  const itensPayload = input.itens.map(i => ({
    solicitacao_id: sol.id,
    tarefa_id: i.tarefa_id,
    descricao: i.descricao,
    local: i.local,
    qtde_solicitada: 1,
    valor_unitario: i.valor_total,
  }))
  const { error: itErr } = await admin.from('itens_solicitacao_fat_direto').insert(itensPayload)
  if (itErr) throw itErr

  return sol
}

export async function atualizarStatusSolicitacao(
  id: string,
  status: 'aprovado' | 'rejeitado' | 'cancelado',
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
  }
  if (motivo_rejeicao) updates.motivo_rejeicao = motivo_rejeicao

  const { error } = await admin.from('solicitacoes_fat_direto').update(updates).eq('id', id)
  if (error) throw error
}

export async function criarNotaFiscal(input: {
  solicitacao_id: string
  numero_nf: string
  emitente: string
  cnpj_emitente?: string
  valor: number
  data_emissao: string
  descricao?: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notas_fiscais_fat_direto')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data
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
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id')
    .eq('contrato_id', contratoId)
  const grupoIds = (grupos || []).map((g: any) => g.id)
  if (grupoIds.length === 0) return []
  const { data, error } = await admin
    .from('tarefas')
    .select(`
      id, codigo, nome, valor_material, valor_servico, valor_total,
      grupo_macro:grupo_macro_id(id, codigo, nome)
    `)
    .in('grupo_macro_id', grupoIds)
    .order('codigo')
  if (error) throw error
  return data || []
}
