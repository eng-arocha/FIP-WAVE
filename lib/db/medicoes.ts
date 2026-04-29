import { createClient } from '@/lib/supabase/server'

export async function getMedicoes(contratoId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('medicoes')
    .select('*')
    .eq('contrato_id', contratoId)
    .order('numero', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMedicoesPendentes() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('medicoes')
    .select(`
      *,
      contrato:contratos(
        id, numero, descricao,
        contratado:empresas!contratos_contratado_id_fkey(nome)
      )
    `)
    .in('status', ['submetido', 'em_analise'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getMedicoesHistorico() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('medicoes')
    .select(`
      *,
      contrato:contratos(id, numero, descricao)
    `)
    .in('status', ['aprovado', 'rejeitado', 'cancelado'])
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data || []
}

export async function getMedicao(id: string) {
  const supabase = await createClient()
  const tryWith = async (contratoCols: string) => supabase
    .from('medicoes')
    .select(`
      *,
      contrato:contratos(
        ${contratoCols},
        contratante:empresas!contratos_contratante_id_fkey(nome, email_contato),
        contratado:empresas!contratos_contratado_id_fkey(nome, email_contato)
      ),
      medicao_itens(
        *,
        detalhamento:detalhamentos(codigo, descricao, unidade, valor_unitario)
      ),
      medicao_anexos(*),
      notas_fiscais(*),
      aprovacoes(*)
    `)
    .eq('id', id)
    .single()

  // Tenta com percentual_retencao (migration 051); fallback sem ele.
  const cols = 'id, numero, descricao, valor_total, valor_servicos, valor_material_direto, percentual_retencao'
  let { data, error } = await tryWith(cols)
  if (error && (
    (error as any).code === 'PGRST204' ||
    String((error as any).message || '').includes('percentual_retencao')
  )) {
    const fallback = await tryWith('id, numero, descricao, valor_total, valor_servicos, valor_material_direto')
    if (fallback.error) throw fallback.error
    return fallback.data
  }
  if (error) throw error
  return data
}

export async function createMedicao(input: {
  contrato_id: string
  periodo_referencia: string
  tipo: string
  solicitante_nome: string
  solicitante_email: string
  observacoes?: string
  itens: { detalhamento_id: string; quantidade_medida: number; valor_unitario: number }[]
  notas_fiscais?: { numero_nf: string; emitente: string; cnpj_emitente?: string; valor: number; data_emissao: string }[]
}) {
  const supabase = await createClient()

  // Pegar próximo número
  const { data: last } = await supabase
    .from('medicoes')
    .select('numero')
    .eq('contrato_id', input.contrato_id)
    .order('numero', { ascending: false })
    .limit(1)
    .single()
  const numero = (last?.numero || 0) + 1

  // Calcular valor total
  const valor_total = input.itens.reduce((acc, i) => acc + i.quantidade_medida * i.valor_unitario, 0)

  // Criar medição
  const { data: medicao, error } = await supabase
    .from('medicoes')
    .insert({
      contrato_id: input.contrato_id,
      numero,
      periodo_referencia: input.periodo_referencia,
      tipo: input.tipo,
      status: 'submetido',
      valor_total,
      data_submissao: new Date().toISOString(),
      solicitante_nome: input.solicitante_nome,
      solicitante_email: input.solicitante_email,
      observacoes: input.observacoes,
    })
    .select()
    .single()
  if (error) throw error

  // Criar itens
  if (input.itens.length > 0) {
    const { error: itensError } = await supabase
      .from('medicao_itens')
      .insert(input.itens.map(i => ({
        medicao_id: medicao.id,
        detalhamento_id: i.detalhamento_id,
        quantidade_medida: i.quantidade_medida,
        valor_unitario: i.valor_unitario,
      })))
    if (itensError) throw itensError
  }

  // Criar notas fiscais
  if (input.notas_fiscais && input.notas_fiscais.length > 0) {
    const { error: nfError } = await supabase
      .from('notas_fiscais')
      .insert(input.notas_fiscais.map(nf => ({ ...nf, medicao_id: medicao.id })))
    if (nfError) throw nfError
  }

  return medicao
}

export async function aprovarMedicao(id: string, aprovadorNome: string, aprovadorEmail: string, comentario?: string) {
  const supabase = await createClient()

  // Calcula snapshots de retenção antes do UPDATE
  // (busca contrato + medição direto pra não depender de outros helpers)
  const { data: medSnap } = await supabase
    .from('medicoes')
    .select('valor_total, contrato_id')
    .eq('id', id)
    .single()
  const { data: contrSnap } = medSnap
    ? await supabase
        .from('contratos')
        .select('valor_total, valor_servicos, percentual_retencao')
        .eq('id', (medSnap as any).contrato_id)
        .single()
    : { data: null }

  const valorMedido = Number((medSnap as any)?.valor_total || 0)
  const valorServicos = Number((contrSnap as any)?.valor_servicos || 0)
  const valorTotalContrato = Number((contrSnap as any)?.valor_total || 0)
  const pctRetencao = Number((contrSnap as any)?.percentual_retencao ?? 5)

  const andamento_fisico_pct = valorServicos > 0
    ? (valorMedido / valorServicos) * 100
    : 0
  const valor_financeiro_proporcional = valorServicos > 0
    ? (valorMedido / valorServicos) * valorTotalContrato
    : 0
  const valor_retencao_garantia = valor_financeiro_proporcional * (pctRetencao / 100)

  // UPDATE com snapshots — resiliente a colunas ausentes (migration 051 stale)
  const updateBase: Record<string, unknown> = {
    status: 'aprovado',
    data_aprovacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const updateExtra: Record<string, unknown> = {
    ...updateBase,
    andamento_fisico_pct,
    valor_financeiro_proporcional,
    valor_retencao_garantia,
  }

  const tryUpdate = await supabase.from('medicoes').update(updateExtra).eq('id', id)
  if (tryUpdate.error) {
    const msg = (tryUpdate.error as any).message || ''
    const code = (tryUpdate.error as any).code || ''
    const isSchemaStale =
      code === 'PGRST204' ||
      ['andamento_fisico_pct', 'valor_financeiro_proporcional', 'valor_retencao_garantia']
        .some(c => msg.includes(c))
    if (isSchemaStale) {
      const retry = await supabase.from('medicoes').update(updateBase).eq('id', id)
      if (retry.error) throw retry.error
    } else {
      throw tryUpdate.error
    }
  }

  await supabase.from('aprovacoes').insert({
    medicao_id: id,
    aprovador_nome: aprovadorNome,
    aprovador_email: aprovadorEmail,
    acao: 'aprovado',
    comentario,
  })
}

export async function rejeitarMedicao(id: string, aprovadorNome: string, aprovadorEmail: string, motivo: string) {
  const supabase = await createClient()
  const { error: medError } = await supabase
    .from('medicoes')
    .update({ status: 'rejeitado', motivo_rejeicao: motivo, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (medError) throw medError

  await supabase.from('aprovacoes').insert({
    medicao_id: id,
    aprovador_nome: aprovadorNome,
    aprovador_email: aprovadorEmail,
    acao: 'rejeitado',
    comentario: motivo,
  })
}

export async function uploadAnexo(medicaoId: string, file: File, tipoDocumento: string, uploadedPor: string) {
  const supabase = await createClient()
  const nomeStorage = `${medicaoId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('medicoes-anexos')
    .upload(nomeStorage, file)
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('medicoes-anexos')
    .getPublicUrl(nomeStorage)

  const { data, error } = await supabase
    .from('medicao_anexos')
    .insert({
      medicao_id: medicaoId,
      nome_original: file.name,
      nome_storage: nomeStorage,
      url: publicUrl,
      tipo_documento: tipoDocumento,
      tamanho_bytes: file.size,
      mime_type: file.type,
      uploaded_por: uploadedPor,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
