import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { calcularTetoMedicao, excedeTeto, mensagemExcedeTeto } from '@/lib/medicao-teto'

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
    // 'autorizado' = portão 1 concluído, aguardando o portão 2 (aprovar
    // emissão da NF de serviço). Mantém na fila de aprovações.
    .in('status', ['submetido', 'em_analise', 'autorizado'])
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
  const { data, error } = await tryWith(cols)
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
  /**
   * Status inicial. 'rascunho' = prévia completa (simulação): a medição é
   * gravada mas fica fora de todos os acumulados/dashboards (que filtram
   * por 'aprovado') e sem ações de aprovação até ser submetida.
   */
  status?: 'rascunho' | 'submetido'
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
    .select('id, codigo, unidade, quantidade_contratada, valor_material_unit, valor_servico_unit')
    .in('id', detIds)
  const unitMap = new Map<string, { mat: number; serv: number }>()
  for (const d of (dets || []) as any[]) {
    unitMap.set(d.id, {
      mat: Number(d.valor_material_unit ?? 0),
      serv: Number(d.valor_servico_unit ?? 0),
    })
  }

  // Teto do contrato — nenhum item pode passar de 100% do contratado somando
  // o que as medições aprovadas anteriores já registraram. A tela de Nova
  // Medição já clampa, mas o clamp da tela não é garantia: esta rota aceita
  // POST direto e o zod só exige `nonnegative()`.
  await assertItensDentroDoContrato(supabase, input.contrato_id, input.itens, (dets || []) as any[])
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
      status: input.status ?? 'submetido',
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
      id, quantidade_medida, detalhamento_id,
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

  // Snapshot de quanto de NF de material foi abatido em cada item nesta
  // medição (migration 074). É o que faz o saldo corrido funcionar: sem
  // congelar isto aqui, as notas desta medição voltariam a ser descontáveis
  // na medição seguinte — a mesma nota abatendo duas vezes, em dois meses.
  //
  // `snapshotOk` distingue "calculei e deu zero" de "não consegui calcular".
  // Antes, qualquer falha aqui era engolida por um console.warn e o UPDATE
  // abaixo gravava 0 em TODOS os itens, com a rota devolvendo sucesso — o
  // resultado é indistinguível de uma medição que legitimamente não abateu
  // nada, e o erro só apareceria meses depois como desconto em dobro.
  const nfDescontadaPorDet = new Map<string, number>()
  let snapshotOk = false
  if (medSnap) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { calcularInformaconData } = await import('@/lib/db/informacon-data')
      const boletim = await calcularInformaconData(
        createAdminClient(),
        String((medSnap as any).contrato_id),
        id,
      )
      if (boletim) {
        for (const l of boletim.linhas ?? []) {
          if (l.nf_descontavel > 0) nfDescontadaPorDet.set(l.detalhamento_id, l.nf_descontavel)
        }
        snapshotOk = true
      } else {
        console.error('[aprovarMedicao] boletim vazio — snapshot de NF não gravado', { medicaoId: id })
      }
    } catch (e: any) {
      console.error('[aprovarMedicao] snapshot de nf_material_descontada falhou:', e?.message, { medicaoId: id })
    }
  }

  // UPDATE dos itens (snapshot mat/serv correspondente). Em paralelo,
  // resiliente: se colunas ainda não estão no schema cache, ignora.
  if (updatesItens.length > 0) {
    const detPorItem = new Map<string, string>()
    for (const it of (itensSnap || []) as any[]) {
      if (it.id && it.detalhamento_id) detPorItem.set(it.id, it.detalhamento_id)
    }
    await Promise.all(updatesItens.map(async u => {
      const detId = detPorItem.get(u.id)
      const nfDescontada = detId ? (nfDescontadaPorDet.get(detId) ?? 0) : 0
      // Sem cálculo confiável, não se grava a coluna: deixar o valor anterior
      // (ou o DEFAULT) é honesto; gravar 0 é uma afirmação falsa de que nada
      // foi abatido, e ela reaparece como desconto em dobro no mês seguinte.
      const payloadCompleto = snapshotOk
        ? {
            valor_material_correspondente: u.mat,
            valor_servico_correspondente: u.serv,
            nf_material_descontada: nfDescontada,
          }
        : {
            valor_material_correspondente: u.mat,
            valor_servico_correspondente: u.serv,
          }
      const { error } = await supabase
        .from('medicao_itens')
        .update(payloadCompleto)
        .eq('id', u.id)
      if (error) {
        const msg = (error as any).message || ''
        const code = (error as any).code || ''
        const isSchemaStale = code === 'PGRST204' ||
          ['valor_material_correspondente', 'valor_servico_correspondente', 'nf_material_descontada']
            .some(c => msg.includes(c))
        if (!isSchemaStale) throw error
        // Migration 074 pendente — tenta sem a coluna nova.
        const retry = await supabase
          .from('medicao_itens')
          .update({
            valor_material_correspondente: u.mat,
            valor_servico_correspondente: u.serv,
          })
          .eq('id', u.id)
        if (retry.error) {
          const rMsg = (retry.error as any).message || ''
          const rCode = (retry.error as any).code || ''
          const rStale = rCode === 'PGRST204' ||
            ['valor_material_correspondente', 'valor_servico_correspondente'].some(c => rMsg.includes(c))
          if (!rStale) throw retry.error
        }
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

/**
 * PORTÃO 1 — Autoriza a medição (submetido/em_analise → autorizado).
 *
 * Significado: a equipe avaliou a execução física dos serviços e LIBERA
 * a emissão da NF de MATERIAL FIP. NÃO libera ainda a NF de serviço da
 * Wave — isso só acontece no portão 2 (`aprovarMedicao`), depois que a
 * NF de material for lançada no sistema.
 *
 * Grava data_autorizacao + autorizado_por (auditoria). Resiliente: se as
 * colunas da migration 073 ainda não existem, cai pro update mínimo
 * (apenas status), mantendo o app vivo.
 */
export async function autorizarMedicao(
  id: string,
  autorizadorNome: string,
  autorizadorEmail: string,
  autorizadorId: string,
  comentario?: string,
) {
  const supabase = await createClient()

  const agora = new Date().toISOString()
  const updateExtra: Record<string, unknown> = {
    status: 'autorizado',
    data_autorizacao: agora,
    autorizado_por_id: autorizadorId,
    autorizado_por_nome: autorizadorNome,
    updated_at: agora,
  }
  const updateBase: Record<string, unknown> = {
    status: 'autorizado',
    updated_at: agora,
  }

  const tryUpdate = await supabase.from('medicoes').update(updateExtra).eq('id', id)
  if (tryUpdate.error) {
    const msg = (tryUpdate.error as any).message || ''
    const code = (tryUpdate.error as any).code || ''
    const isSchemaStale =
      code === 'PGRST204' ||
      ['data_autorizacao', 'autorizado_por_id', 'autorizado_por_nome'].some(c => msg.includes(c))
    if (isSchemaStale) {
      const retry = await supabase.from('medicoes').update(updateBase).eq('id', id)
      if (retry.error) throw retry.error
    } else {
      throw tryUpdate.error
    }
  }

  // Registra na trilha de aprovações (acao='autorizado' reaproveita a
  // coluna existente; se houver CHECK restritivo, cai pra 'comentou').
  const ins = await supabase.from('aprovacoes').insert({
    medicao_id: id,
    aprovador_nome: autorizadorNome,
    aprovador_email: autorizadorEmail,
    acao: 'autorizado',
    comentario: comentario ?? 'Material FIP liberado (portão 1).',
  })
  if (ins.error) {
    const msg = (ins.error as any).message || ''
    if (msg.includes('acao') || (ins.error as any).code === '23514') {
      await supabase.from('aprovacoes').insert({
        medicao_id: id,
        aprovador_nome: autorizadorNome,
        aprovador_email: autorizadorEmail,
        acao: 'comentou',
        comentario: `[AUTORIZADO — material liberado] ${comentario ?? ''}`.trim(),
      })
    }
  }
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

/**
 * Recalcula `medicoes.valor_total` a partir dos itens gravados.
 *
 * `createMedicao` grava esse snapshot na criação (Σ qtd × (mat_unit +
 * serv_unit)), mas as rotas de ajuste de quantidade só mexiam em
 * `medicao_itens.quantidade_medida` — o snapshot ficava defasado e o card
 * "Total da Medição (mat + serv)" da tela, que lê essa coluna, mostrava
 * número errado (no WAVE chegou a R$ 56 mil de diferença).
 *
 * Best-effort: devolve o novo total, ou null se não conseguiu recalcular.
 */
export async function recalcularValorTotalMedicao(
  admin: SupabaseClient,
  medicaoId: string,
): Promise<number | null> {
  // Defesa em profundidade: esta é a única função do repo capaz de sobrescrever
  // `medicoes.valor_total`, que é o snapshot congelado na aprovação e a base do
  // cálculo de serviço/retenção de toda medição aprovada. As rotas que a chamam
  // hoje já barram status 'aprovado', mas um call-site futuro sem essa guarda
  // corromperia o histórico em silêncio.
  {
    const { data: med } = await admin
      .from('medicoes')
      .select('status')
      .eq('id', medicaoId)
      .single()
    if ((med as any)?.status === 'aprovado') {
      console.warn('[recalcularValorTotalMedicao] ignorado: medição aprovada', medicaoId)
      return null
    }
  }

  const { data, error } = await admin
    .from('medicao_itens')
    .select('quantidade_medida, detalhamento:detalhamentos ( valor_material_unit, valor_servico_unit )')
    .eq('medicao_id', medicaoId)
  if (error) {
    console.warn('[recalcularValorTotalMedicao] falha ao ler itens:', error.message)
    return null
  }
  let total = 0
  for (const it of (data || []) as any[]) {
    const qtd = Number(it.quantidade_medida || 0)
    const mat = Number(it.detalhamento?.valor_material_unit || 0)
    const serv = Number(it.detalhamento?.valor_servico_unit || 0)
    total += qtd * (mat + serv)
  }
  const valorTotal = Math.round(total * 100) / 100
  const { error: upErr } = await admin
    .from('medicoes')
    .update({ valor_total: valorTotal })
    .eq('id', medicaoId)
  if (upErr) {
    console.warn('[recalcularValorTotalMedicao] falha ao gravar:', upErr.message)
    return null
  }
  return valorTotal
}

/**
 * Recusa a medição inteira se algum item ultrapassar o contratado.
 *
 * `quantidade_medida` é o DELTA do período, então o teto de cada item é
 * `quantidade_contratada − acumulado aprovado anterior` — a mesma conta de
 * `/medicoes/acumulado` e da rota de ajuste do admin (lib/medicao-teto.ts).
 *
 * Falha em bloco, listando TODOS os itens fora do teto: corrigir um de cada
 * vez, descobrindo o próximo a cada tentativa, é hostil com uma medição de
 * centenas de linhas.
 */
async function assertItensDentroDoContrato(
  supabase: SupabaseClient,
  contratoId: string,
  itens: { detalhamento_id: string; quantidade_medida: number }[],
  dets: any[],
): Promise<void> {
  const detPorId = new Map<string, any>()
  for (const d of dets) detPorId.set(d.id, d)

  // Acumulado aprovado por detalhamento (todas as medições aprovadas do
  // contrato — esta ainda não existe, então não há o que excluir).
  const { data: meds } = await supabase
    .from('medicoes')
    .select('id')
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
  const medIds = (meds || []).map((m: any) => m.id)

  const anteriorPorDet = new Map<string, number>()
  if (medIds.length > 0) {
    const { data: rows } = await supabase
      .from('medicao_itens')
      .select('detalhamento_id, quantidade_medida')
      .in('medicao_id', medIds)
      .in('detalhamento_id', itens.map(i => i.detalhamento_id))
    for (const r of (rows || []) as any[]) {
      if (!r.detalhamento_id) continue
      anteriorPorDet.set(
        r.detalhamento_id,
        (anteriorPorDet.get(r.detalhamento_id) || 0) + Number(r.quantidade_medida || 0),
      )
    }
  }

  const erros: string[] = []
  for (const item of itens) {
    const det = detPorId.get(item.detalhamento_id)
    if (!det) continue
    const qtdAnterior = anteriorPorDet.get(item.detalhamento_id) || 0
    const teto = calcularTetoMedicao(det.quantidade_contratada, qtdAnterior)
    if (excedeTeto(item.quantidade_medida, teto)) {
      erros.push(mensagemExcedeTeto({
        codigo: det.codigo,
        unidade: det.unidade,
        quantidadeContratada: Number(det.quantidade_contratada),
        qtdAnterior,
        qtdNova: Number(item.quantidade_medida),
        teto: teto as number,
      }))
    }
  }

  if (erros.length > 0) {
    const err: any = new Error(
      erros.length === 1
        ? erros[0]
        : `${erros.length} itens ultrapassam o contratado:\n\n` + erros.map(e => `• ${e}`).join('\n'),
    )
    err.status = 400
    err.code = 'ACIMA_DO_CONTRATADO'
    throw err
  }
}
