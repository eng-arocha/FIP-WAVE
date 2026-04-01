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
  const { data, error } = await supabase
    .from('medicoes')
    .select(`
      *,
      contrato:contratos(
        id, numero, descricao,
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
  const { error: medError } = await supabase
    .from('medicoes')
    .update({ status: 'aprovado', data_aprovacao: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (medError) throw medError

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
