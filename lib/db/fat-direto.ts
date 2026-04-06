import { createAdminClient } from '@/lib/supabase/admin'

export async function listarSolicitacoes(contratoId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, status, data_solicitacao, data_aprovacao,
      observacoes, motivo_rejeicao, valor_total, created_at,
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

export async function criarSolicitacao(input: {
  contrato_id: string
  solicitante_id: string
  observacoes?: string
  itens: Array<{
    tarefa_id: string
    descricao: string
    local: string
    qtde_solicitada: number
    valor_unitario: number
  }>
}) {
  const admin = createAdminClient()
  const valor_total = input.itens.reduce((s, i) => s + i.qtde_solicitada * i.valor_unitario, 0)

  const { data: sol, error } = await admin
    .from('solicitacoes_fat_direto')
    .insert({
      contrato_id: input.contrato_id,
      solicitante_id: input.solicitante_id,
      observacoes: input.observacoes,
      valor_total,
      status: 'aguardando_aprovacao',
    })
    .select()
    .single()
  if (error) throw error

  const itensPayload = input.itens.map(i => ({ ...i, solicitacao_id: sol.id }))
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
  const { data, error } = await admin
    .from('tarefas')
    .select(`
      id, codigo, nome, valor_material, valor_servico, valor_total,
      grupo_macro:grupo_macro_id(id, codigo, nome)
    `)
    .in(
      'grupo_macro_id',
      (
        await admin
          .from('grupos_macro')
          .select('id')
          .eq('contrato_id', contratoId)
          .in('tipo_medicao', ['faturamento_direto', 'misto'])
      ).data?.map((g: any) => g.id) || [],
    )
    .order('codigo')
  if (error) throw error
  return data || []
}
