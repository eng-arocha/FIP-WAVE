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

  // Validate against teto global do contrato
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
      numero_pedido_fip: input.numero_pedido_fip,
      fornecedor_razao_social: input.fornecedor_razao_social,
      fornecedor_cnpj: input.fornecedor_cnpj,
      fornecedor_contato: input.fornecedor_contato,
      fornecedor_contato_nome: input.fornecedor_contato_nome,
      fornecedor_contato_telefone: input.fornecedor_contato_telefone,
      valor_total,
      status: 'aguardando_aprovacao',
    })
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

  // Grupos do contrato
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id')
    .eq('contrato_id', contratoId)
  const grupoIds = (grupos || []).map((g: any) => g.id)
  if (grupoIds.length === 0) return []

  // Tarefas (nivel 2) — apenas para montar o mapa código/nome
  const { data: tarefas } = await admin
    .from('tarefas')
    .select('id, codigo, nome')
    .in('grupo_macro_id', grupoIds)
  const tarefaIds = (tarefas || []).map((t: any) => t.id)
  const tarefaMap: Record<string, any> = {}
  ;(tarefas || []).forEach((t: any) => { tarefaMap[t.id] = t })
  if (tarefaIds.length === 0) return []

  // Detalhamentos (nivel 3) — lista completa para o dropdown
  const { data: dets, error } = await admin
    .from('detalhamentos')
    .select('id, tarefa_id, codigo, descricao, local, quantidade_contratada, valor_unitario, valor_total, valor_material_unit')
    .in('tarefa_id', tarefaIds)
  if (error) throw error
  const detalhamentos = dets || []
  const detIds = detalhamentos.map((d: any) => d.id)

  // Valores já aprovados por detalhamento (a partir de solicitações aprovadas)
  const aprovadoByDet: Record<string, number> = {}
  if (detIds.length > 0) {
    try {
      const { data: itensAprov } = await admin
        .from('itens_solicitacao_fat_direto')
        .select('detalhamento_id, valor_total, solicitacoes_fat_direto!inner(status)')
        .in('detalhamento_id', detIds)
        .eq('solicitacoes_fat_direto.status', 'aprovado')
      ;(itensAprov || []).forEach((it: any) => {
        if (it.detalhamento_id) {
          aprovadoByDet[it.detalhamento_id] = (aprovadoByDet[it.detalhamento_id] || 0) + (it.valor_total || 0)
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
    // Prefer generated column valor_total (qty × valor_unitario, exists since migration 001)
    // Fallback to qty × valor_material_unit (migration 011) or qty × valor_unitario
    const valorMaterial = d.valor_total
      || (d.quantidade_contratada || 0) * (d.valor_material_unit || d.valor_unitario || 0)
    return {
      id: d.id,
      codigo: d.codigo,
      // 'nome' é o que a interface Tarefa do formulário espera
      nome: (d.descricao || '').trim(),
      // 'locais' é um array — o formulário usa t.locais.some(...)
      locais: [(d.local || 'TORRE').trim().toUpperCase()],
      // valor máximo de material para este detalhamento (nivel 3)
      valor_material: valorMaterial,
      valor_servico: 0,
      valor_total: valorMaterial,
      valor_aprovado: aprovadoByDet[d.id] || 0,
      grupo_macro: {
        codigo: tarefaMap[d.tarefa_id]?.codigo || '',
        nome: tarefaMap[d.tarefa_id]?.nome || '',
      },
    }
  })
}
