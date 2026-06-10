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
    .limit(1000)
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
        detalhamento:detalhamentos(codigo, descricao, unidade, valor_unitario, valor_material_unit, valor_servico_unit)
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
  itens: {
    detalhamento_id: string
    quantidade_medida: number
    valor_unitario: number
    /** Breakdown por pavto (so PAV TIPO; cf. migration 066). */
    pavimentos_pct?: Record<string, number> | null
  }[]
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

  // Calcular valor total (= base de retenção, spec 2026-05-06)
  // Servidor é autoritativo: busca mat_unit + servico_unit do banco e
  // ignora o valor_unitario passado pelo cliente (que pode ser apenas o
  // componente serviço, dependendo da versão da UI). valor_total agora
  // representa TUDO executado fisicamente nesta medição: mat + serv.
  const detIds = input.itens.map(i => i.detalhamento_id)
  const { data: dets } = await supabase
    .from('detalhamentos')
    .select('id, valor_material_unit, valor_servico_unit')
    .in('id', detIds)
  const unitMap = new Map<string, { mat: number; serv: number }>()
  for (const d of (dets || []) as any[]) {
    unitMap.set(d.id, {
      mat: Number(d.valor_material_unit ?? 0),
      serv: Number(d.valor_servico_unit ?? 0),
    })
  }
  const valor_total = input.itens.reduce((acc, i) => {
    const u = unitMap.get(i.detalhamento_id)
    const totalUnit = u ? (u.mat + u.serv) : i.valor_unitario
    return acc + i.quantidade_medida * totalUnit
  }, 0)

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

  // Criar itens — valor_unitario gravado = mat + serv (spec 2026-05-06)
  // pra que valor_medido = qtde × (mat+serv) reflita TUDO o que foi
  // executado, e o livro-razão de retenção use a base correta.
  if (input.itens.length > 0) {
    const buildRow = (i: typeof input.itens[number], incluirPavto: boolean) => {
      const u = unitMap.get(i.detalhamento_id)
      const totalUnit = u ? (u.mat + u.serv) : i.valor_unitario
      const row: Record<string, unknown> = {
        medicao_id: medicao.id,
        detalhamento_id: i.detalhamento_id,
        quantidade_medida: i.quantidade_medida,
        valor_unitario: totalUnit,
      }
      // pavimentos_pct so existe apos migration 066; se a coluna nao
      // existir ainda, o insert eh refeito sem ela.
      if (incluirPavto && i.pavimentos_pct && Object.keys(i.pavimentos_pct).length > 0) {
        row.pavimentos_pct = i.pavimentos_pct
      }
      return row
    }
    let { error: itensError } = await supabase
      .from('medicao_itens')
      .insert(input.itens.map(i => buildRow(i, true)))
    if (itensError && (
      (itensError as any).code === 'PGRST204' ||
      String((itensError as any).message || '').includes('pavimentos_pct')
    )) {
      const retry = await supabase
        .from('medicao_itens')
        .insert(input.itens.map(i => buildRow(i, false)))
      itensError = retry.error
    }
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

  // Carrega medição + contrato + itens com unitários separados de mat/serv
  const { data: medSnap } = await supabase
    .from('medicoes')
    .select('valor_total, contrato_id')
    .eq('id', id)
    .single()
  const { data: contrSnap } = medSnap
    ? await supabase
        .from('contratos')
        .select('valor_total, percentual_retencao')
        .eq('id', (medSnap as any).contrato_id)
        .single()
    : { data: null }
  const { data: itensSnap } = await supabase
    .from('medicao_itens')
    .select(`
      id, quantidade_medida,
      detalhamento:detalhamentos ( valor_material_unit, valor_servico_unit )
    `)
    .eq('medicao_id', id)

  const valorTotalContrato = Number((contrSnap as any)?.valor_total || 0)
  const pctRetencao = Number((contrSnap as any)?.percentual_retencao ?? 5)

  // Calcula material e serviço por item (cada componente separadamente, pra
  // proteger contra inconsistência caso valor_unitario != mat_unit + serv_unit).
  let valorMaterialCorrespondente = 0
  let valorServicoMedidoTotal = 0
  const updatesItens: Array<{ id: string; mat: number; serv: number }> = []
  for (const it of (itensSnap || []) as any[]) {
    const qtd = Number(it.quantidade_medida || 0)
    const matUnit = Number(it.detalhamento?.valor_material_unit || 0)
    const servUnit = Number(it.detalhamento?.valor_servico_unit || 0)
    const matCorrespondente = qtd * matUnit
    const servCorrespondente = qtd * servUnit
    valorMaterialCorrespondente += matCorrespondente
    valorServicoMedidoTotal += servCorrespondente
    updatesItens.push({ id: it.id, mat: matCorrespondente, serv: servCorrespondente })
  }

  // Retenção (nova fórmula contratual): 5% sobre material + serviço executados.
  const baseRetencao = valorMaterialCorrespondente + valorServicoMedidoTotal
  const valor_retencao_garantia = baseRetencao * (pctRetencao / 100)

  // Andamento físico = total executado (mat + serv) / valor total do contrato
  const andamento_fisico_pct = valorTotalContrato > 0
    ? (baseRetencao / valorTotalContrato) * 100
    : 0

  // UPDATE da medição com snapshots
  const updateBase: Record<string, unknown> = {
    status: 'aprovado',
    data_aprovacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const updateExtra: Record<string, unknown> = {
    ...updateBase,
    andamento_fisico_pct,
    valor_material_correspondente: valorMaterialCorrespondente,
    valor_retencao_garantia,
  }

  const tryUpdate = await supabase.from('medicoes').update(updateExtra).eq('id', id)
  if (tryUpdate.error) {
    const msg = (tryUpdate.error as any).message || ''
    const code = (tryUpdate.error as any).code || ''
    const isSchemaStale =
      code === 'PGRST204' ||
      ['andamento_fisico_pct', 'valor_material_correspondente', 'valor_retencao_garantia']
        .some(c => msg.includes(c))
    if (isSchemaStale) {
      const retry = await supabase.from('medicoes').update(updateBase).eq('id', id)
      if (retry.error) throw retry.error
    } else {
      throw tryUpdate.error
    }
  }

  // UPDATE dos itens (snapshot mat/serv correspondente). Em paralelo,
  // resiliente: se colunas ainda não estão no schema cache, ignora.
  if (updatesItens.length > 0) {
    await Promise.all(updatesItens.map(async u => {
      const { error } = await supabase
        .from('medicao_itens')
        .update({
          valor_material_correspondente: u.mat,
          valor_servico_correspondente: u.serv,
        })
        .eq('id', u.id)
      if (error) {
        const msg = (error as any).message || ''
        const code = (error as any).code || ''
        const isSchemaStale = code === 'PGRST204' ||
          ['valor_material_correspondente', 'valor_servico_correspondente'].some(c => msg.includes(c))
        if (!isSchemaStale) throw error
      }
    }))
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
