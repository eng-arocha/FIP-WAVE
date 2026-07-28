// Conciliação Informakon × FIP-WAVE — agregações puras de leitura, sem
// gravação. As tabelas de origem são as da migration 075
// (informakon_importacoes / informakon_nf_linhas / informakon_medicoes_servico)
// e a hierarquia contratual (grupos_macro → tarefas → detalhamentos) mais o
// fluxo de faturamento direto (solicitacoes_fat_direto → itens → NFs).
//
// Extraído pra cá pra manter a página `app/(app)/contratos/[id]/informakon/page.tsx`
// enxuta — ver ali o consumo.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Acima disso a diferença por grupo é destacada em vermelho na UI. */
export const LIMIAR_DIVERGENCIA_GRUPO = 1000

/** Tolerância de arredondamento para considerar duas NFs "iguais". */
const TOLERANCIA_NF = 1

export interface LinhaConciliacaoGrupo {
  /** Chave de agrupamento: código do grupo macro ('1'..'18') ou, para o
   *  grupo 19 (que no Informakon vem quebrado em 2 detalhamentos), o
   *  código do detalhamento ('19.1.1' / '19.1.2'). */
  chave: string
  nome: string
  informakon: number
  fipwave: number
  diferenca: number
  divergente: boolean
}

export interface ConciliacaoPorGrupo {
  linhas: LinhaConciliacaoGrupo[]
  totalInformakon: number
  totalFipwave: number
  totalDiferenca: number
}

/**
 * Soma, por grupo macro do contrato, o valor de NF do Informakon (aba
 * "faturamento direto global") contra o valor de NF que o FIP-WAVE enxerga
 * (solicitações de fat-direto aprovadas, rateando cada NF pro-rata entre os
 * itens da solicitação pelo `valor_total` de cada item).
 */
export async function calcularConciliacaoPorGrupo(
  admin: SupabaseClient,
  contratoId: string,
  importacaoId: string,
): Promise<ConciliacaoPorGrupo> {
  // ---- 1) Lado Informakon: soma por COALESCE(detalhamento_codigo, grupo_codigo)
  const { data: nfLinhas, error: nfErr } = await admin
    .from('informakon_nf_linhas')
    .select('grupo_codigo, detalhamento_codigo, macro_item, valor_descontado, valor_a_descontar')
    .eq('importacao_id', importacaoId)
  if (nfErr) throw nfErr

  const informakonPorChave = new Map<string, { valor: number; macroItem: string | null }>()
  for (const l of (nfLinhas || []) as any[]) {
    const chave = l.detalhamento_codigo || l.grupo_codigo || `__sem_mapeamento__${l.macro_item ?? ''}`
    const valor = Number(l.valor_descontado || 0) + Number(l.valor_a_descontar || 0)
    const atual = informakonPorChave.get(chave)
    if (atual) atual.valor += valor
    else informakonPorChave.set(chave, { valor, macroItem: l.macro_item ?? null })
  }

  // ---- 2) Hierarquia do contrato: grupos_macro → tarefas → detalhamentos
  const { data: grupos, error: gruposErr } = await admin
    .from('grupos_macro')
    .select('id, codigo, nome')
    .eq('contrato_id', contratoId)
  if (gruposErr) throw gruposErr
  const grupoPorId = new Map((grupos || []).map((g: any) => [g.id, g]))
  const grupoIds = (grupos || []).map((g: any) => g.id).filter(Boolean)

  const nomePorChave = new Map<string, string>()
  for (const g of (grupos || []) as any[]) nomePorChave.set(g.codigo, g.nome)

  let tarefas: any[] = []
  if (grupoIds.length > 0) {
    const { data, error } = await admin
      .from('tarefas')
      .select('id, grupo_macro_id')
      .in('grupo_macro_id', grupoIds)
    if (error) throw error
    tarefas = data || []
  }
  const grupoIdPorTarefa = new Map(tarefas.map((t: any) => [t.id, t.grupo_macro_id]))
  const tarefaIds = tarefas.map((t: any) => t.id).filter(Boolean)

  let detalhamentos: any[] = []
  if (tarefaIds.length > 0) {
    const { data, error } = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, tarefa_id')
      .in('tarefa_id', tarefaIds)
    if (error) throw error
    detalhamentos = data || []
  }

  // detalhamento_id -> chave de agrupamento (mesma granularidade do lado Informakon)
  const chavePorDetalhamento = new Map<string, string>()
  for (const det of detalhamentos as any[]) {
    const grupoId = grupoIdPorTarefa.get(det.tarefa_id)
    const grupo = grupoId ? grupoPorId.get(grupoId) : null
    const grupoCodigo = (grupo as any)?.codigo ?? null
    // Só o grupo 19 é quebrado em detalhamento no relatório do Informakon
    // (ver DE_PARA_MACRO_ITEM em lib/informakon/parser.ts) — os demais
    // grupos ficam no nível de grupo macro mesmo.
    const chave = grupoCodigo === '19' ? det.codigo : (grupoCodigo ?? det.codigo)
    chavePorDetalhamento.set(det.id, chave)
    if (grupoCodigo === '19' && !nomePorChave.has(det.codigo)) {
      nomePorChave.set(det.codigo, `${(grupo as any)?.nome ?? 'Grupo 19'} — ${det.descricao}`)
    }
  }

  // ---- 3) Lado FIP-WAVE: solicitações aprovadas de fat-direto (exceto NF de
  // serviço da própria Wave), com NF rateada pro-rata pelos itens.
  const SELECT_SOL = `
    id, tipo, status, deletado_em,
    itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
    nfs:notas_fiscais_fat_direto!solicitacao_id ( valor )
  `
  const { data: solicitacoes, error: solErr } = await admin
    .from('solicitacoes_fat_direto')
    .select(SELECT_SOL)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
    .is('deletado_em', null)
  if (solErr) throw solErr

  const fipwavePorChave = new Map<string, number>()
  for (const sol of (solicitacoes || []) as any[]) {
    if (sol.tipo === 'wave_servico') continue
    const itens = ((sol.itens || []) as any[])
      .map(it => ({ detId: it.detalhamento_id as string | null, valor: Number(it.valor_total || 0) }))
      .filter(it => it.detId)
    const totalItens = itens.reduce((s, it) => s + it.valor, 0)
    const totalNfs = ((sol.nfs || []) as any[]).reduce((s: number, nf: any) => s + Number(nf.valor || 0), 0)
    if (totalItens <= 0 || totalNfs <= 0) continue
    for (const it of itens) {
      const share = it.valor / totalItens
      const chave = chavePorDetalhamento.get(it.detId!) ?? '__sem_grupo__'
      fipwavePorChave.set(chave, (fipwavePorChave.get(chave) || 0) + totalNfs * share)
    }
  }

  // ---- 4) Junta os dois lados
  const chaves = new Set<string>([...informakonPorChave.keys(), ...fipwavePorChave.keys()])
  const linhas: LinhaConciliacaoGrupo[] = []
  for (const chave of chaves) {
    const informakon = informakonPorChave.get(chave)?.valor ?? 0
    const fipwave = fipwavePorChave.get(chave) ?? 0
    const diferenca = informakon - fipwave
    const nome = nomePorChave.get(chave)
      ?? informakonPorChave.get(chave)?.macroItem
      ?? (chave.startsWith('__sem_mapeamento__') ? 'Sem mapeamento (macro item desconhecido)' : chave)
    linhas.push({
      chave,
      nome,
      informakon,
      fipwave,
      diferenca,
      divergente: Math.abs(diferenca) > LIMIAR_DIVERGENCIA_GRUPO,
    })
  }

  linhas.sort((a, b) => {
    const na = parseInt(a.chave, 10)
    const nb = parseInt(b.chave, 10)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return a.chave.localeCompare(b.chave)
  })

  const totalInformakon = linhas.reduce((s, l) => s + l.informakon, 0)
  const totalFipwave = linhas.reduce((s, l) => s + l.fipwave, 0)

  return {
    linhas,
    totalInformakon,
    totalFipwave,
    totalDiferenca: totalInformakon - totalFipwave,
  }
}

export interface NotaDivergente {
  numeroNf: string
  tipo: string | null
  fornecedor: string | null
  macroItem: string | null
  valorInformakon: number
  valorSistema: number
  diferenca: number
  /** Status da NF no FIP-WAVE, ou 'não encontrada' quando o número não bate com nenhuma NF do sistema. */
  situacao: string
}

export interface NotasDivergentesResultado {
  linhas: NotaDivergente[]
  totalDivergentes: number
  ocultas: number
}

/**
 * Compara, por número de NF (de-para só pelos dígitos — `numero_nf` pode vir
 * formatado de jeitos diferentes nas duas fontes), o valor lançado no
 * Informakon contra o valor lançado no FIP-WAVE. Devolve só as notas que
 * divergem (não batem em valor ou não existem no FIP-WAVE), maiores
 * diferenças primeiro, limitado a `limite` linhas.
 */
export async function calcularNotasDivergentes(
  admin: SupabaseClient,
  contratoId: string,
  importacaoId: string,
  limite = 50,
): Promise<NotasDivergentesResultado> {
  const { data: nfLinhas, error: nfErr } = await admin
    .from('informakon_nf_linhas')
    .select('numero_nf, tipo_doc, macro_item, fornecedor_nome, valor_descontado, valor_a_descontar')
    .eq('importacao_id', importacaoId)
  if (nfErr) throw nfErr

  type Agg = { valor: number; tipo: string | null; fornecedor: string | null; macroItens: Set<string> }
  const porNumero = new Map<string, Agg>()
  for (const l of (nfLinhas || []) as any[]) {
    const numero = String(l.numero_nf ?? '').replace(/\D/g, '')
    if (!numero) continue
    const valor = Number(l.valor_descontado || 0) + Number(l.valor_a_descontar || 0)
    let agg = porNumero.get(numero)
    if (!agg) {
      agg = { valor: 0, tipo: l.tipo_doc ?? null, fornecedor: l.fornecedor_nome ?? null, macroItens: new Set() }
      porNumero.set(numero, agg)
    }
    agg.valor += valor
    if (!agg.fornecedor && l.fornecedor_nome) agg.fornecedor = l.fornecedor_nome
    if (l.macro_item) agg.macroItens.add(l.macro_item)
  }

  // Notas do FIP-WAVE: todas as solicitações não-deletadas do contrato
  // (qualquer status — a comparação é sobre o que já foi lançado, não só
  // o aprovado).
  const { data: solRows, error: solErr } = await admin
    .from('solicitacoes_fat_direto')
    .select('id')
    .eq('contrato_id', contratoId)
    .is('deletado_em', null)
  if (solErr) throw solErr
  const solIds = (solRows || []).map((s: any) => s.id)

  let nfsSistema: any[] = []
  if (solIds.length > 0) {
    const { data, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('numero_nf, valor, status')
      .in('solicitacao_id', solIds)
    if (error) throw error
    nfsSistema = data || []
  }

  const sistemaPorNumero = new Map<string, { valor: number; status: string }>()
  for (const nf of nfsSistema as any[]) {
    const numero = String(nf.numero_nf ?? '').replace(/\D/g, '')
    if (!numero) continue
    const atual = sistemaPorNumero.get(numero)
    if (atual) atual.valor += Number(nf.valor || 0)
    else sistemaPorNumero.set(numero, { valor: Number(nf.valor || 0), status: nf.status })
  }

  const linhas: NotaDivergente[] = []
  for (const [numero, agg] of porNumero) {
    const sistema = sistemaPorNumero.get(numero)
    const valorSistema = sistema?.valor ?? 0
    const diferenca = agg.valor - valorSistema
    if (Math.abs(diferenca) <= TOLERANCIA_NF) continue
    const macroItens = Array.from(agg.macroItens)
    linhas.push({
      numeroNf: numero,
      tipo: agg.tipo,
      fornecedor: agg.fornecedor,
      macroItem: macroItens.length === 0
        ? null
        : macroItens.length <= 2
          ? macroItens.join('; ')
          : `${macroItens.length} macro itens`,
      valorInformakon: agg.valor,
      valorSistema,
      diferenca,
      situacao: sistema ? sistema.status : 'não encontrada no FIP-WAVE',
    })
  }

  linhas.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  const totalDivergentes = linhas.length
  const visiveis = linhas.slice(0, limite)

  return {
    linhas: visiveis,
    totalDivergentes,
    ocultas: Math.max(0, totalDivergentes - visiveis.length),
  }
}
