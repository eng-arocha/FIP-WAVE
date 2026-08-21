/**
 * Exportação da MEDIÇÃO para Excel — planilha "plana e filtrável".
 *
 * Motivação (pedido de campo): na tela a medição é uma árvore
 * grupo → tarefa → detalhamento, e o breakdown por pavimento fica escondido
 * atrás de um botão por item. Pra conferir o 3º pavimento o engenheiro
 * precisava abrir esgoto, depois elétrica, depois hidráulica, um por um.
 *
 * Aqui a mesma medição vira uma tabela DESNORMALIZADA: uma linha por
 * (detalhamento × local), com toda a hierarquia repetida em colunas. Com o
 * AutoFiltro do Excel, filtrar `Local = "3º pav"` mostra de uma vez tudo que
 * foi medido naquele pavimento, em qualquer disciplina.
 *
 * "Local" cobre os três tipos de grade que o contrato usa (a coluna
 * `pavimentos_pct`, migration 066, é a mesma pros três):
 *   - Pavimento — "PAV TIPO ( 1º AO 36º PAV )", 0/25/50/75/100 por pavto
 *   - Vão       — vãos nomeados (SS4…Cobertura), binário
 *   - Mês       — parcelas mensais ("1º mês"…), binário
 * Itens sem grade viram uma única linha, usando o `local` contratual do
 * detalhamento quando existir.
 *
 * As funções de montagem de linhas são puras e não importam o XLSX — só
 * `exportarExcelMedicao` carrega a lib (dinâmico, client-side).
 */

import { detectarPavRange, listarPavimentos } from '@/lib/pavimentos'
import { detectarGradeBinaria } from '@/lib/grade-binaria'
import { nomeVao } from '@/lib/vaos'

// ---------------------------------------------------------------------------
// Tipos de entrada (subconjunto estrutural do payload de /planilha)
// ---------------------------------------------------------------------------

export interface ItemLike {
  medicao_item_id?: string
  detalhamento_id?: string | null
  codigo: string
  descricao: string
  unidade?: string | null
  disciplina?: string | null
  local?: string | null
  quantidade_contratada: number
  valor_unitario_contratual: number
  valor_global_item: number
  qtd_anterior: number
  valor_anterior: number
  pct_anterior: number
  qtd_atual: number
  valor_atual: number
  pct_atual: number
  qtd_total: number
  valor_total: number
  pct_total: number
  qtd_saldo: number
  valor_saldo: number
  pct_saldo: number
  material_atual: number
  servico_atual: number
  pavimentos_pct?: Record<string, number> | null
  pavimentos_pct_anterior?: Record<string, number> | null
  pct_prev_anterior?: number | null
  pct_prev_atual?: number | null
  pct_prev_total?: number | null
  qtd_prev_total?: number | null
}

export interface TarefaLike {
  id?: string
  codigo: string
  nome: string
  disciplina?: string | null
  local?: string | null
  valor_global?: number
  valor_atual?: number
  detalhamentos: ItemLike[]
}

export interface GrupoLike {
  id?: string
  codigo: string
  nome: string
  disciplina?: string | null
  valor_global?: number
  valor_anterior?: number
  valor_atual?: number
  valor_total?: number
  valor_saldo?: number
  pct_total?: number
  tarefas: TarefaLike[]
}

export interface TotaisLike {
  valor_global_total: number
  valor_anterior_total: number
  valor_atual_total: number
  valor_total_medido: number
  valor_saldo_total: number
  pct_anterior_total: number
  pct_atual_total: number
  pct_total_medido: number
  pct_saldo_total: number
  material_atual_total: number
  servico_atual_total: number
}

/** Cabeçalho da medição — só o que aparece na aba Resumo / título das abas. */
export interface MedicaoHeader {
  numero: number | string
  periodo_referencia?: string | null
  status?: string | null
  tipo?: string | null
  descricao?: string | null
  observacoes?: string | null
  solicitante_nome?: string | null
  solicitante_email?: string | null
  aprovador_nome?: string | null
  data_submissao?: string | null
  data_aprovacao?: string | null
  contrato?: {
    numero?: string | null
    descricao?: string | null
    valor_total?: number | null
    percentual_retencao?: number | null
    contratante?: { nome?: string | null } | null
    contratado?: { nome?: string | null } | null
  } | null
}

// ---------------------------------------------------------------------------
// Resolução de LOCAIS
// ---------------------------------------------------------------------------

export type TipoLocal = 'Pavimento' | 'Vão' | 'Mês' | 'Item'

export interface LocalSlot {
  /** Chave dentro de `pavimentos_pct` (sempre string, 1-based). */
  chave: string
  /** Rótulo que vai pra coluna filtrável: "3º pav", "5T", "2º mês". */
  rotulo: string
  /**
   * Número do pavimento pra filtro/ordenação numérica. Só é preenchido pra
   * Pavimento e Vão — em "Mês" o ordinal é tempo, não altura, e misturar os
   * dois numa mesma coluna faria "3" casar mês 3 com 3º pavimento.
   */
  numero: number | null
}

export interface GradeLocais {
  tipo: TipoLocal
  slots: LocalSlot[]
}

/** Extrai o número inicial de um rótulo ("3º pav" → 3, "12T" → 12, "SS2" → null). */
export function numeroDoRotulo(rotulo: string): number | null {
  const m = /^(\d+)/.exec(rotulo.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Descobre em quantos locais o detalhamento é medido e como se chamam.
 *
 * A detecção usa APENAS descrição + quantidade contratada (igual à tela de
 * Nova Medição), nunca a presença de `pavimentos_pct`. Assim um item com
 * grade que não foi tocado nesta medição continua exportando os 36 pavtos
 * (todos zerados ou com o acumulado anterior), em vez de sumir da planilha.
 */
export function resolverLocais(it: ItemLike): GradeLocais {
  const qtd = Number(it.quantidade_contratada || 0)

  const pavRange = detectarPavRange(it.descricao, qtd)
  if (pavRange) {
    return {
      tipo: 'Pavimento',
      slots: listarPavimentos(pavRange).map(n => ({
        chave: String(n),
        rotulo: `${n}º pav`,
        numero: n,
      })),
    }
  }

  const grade = detectarGradeBinaria(it.descricao, qtd)
  if (grade) {
    const isVao = grade.termo === 'vão'
    return {
      tipo: isVao ? 'Vão' : 'Mês',
      slots: grade.nomes.map((_, i) => {
        const rotulo = isVao ? nomeVao(grade.nomes, i + 1) : grade.nomes[i]
        return { chave: String(i + 1), rotulo, numero: isVao ? numeroDoRotulo(rotulo) : null }
      }),
    }
  }

  // Sem grade reconhecida, mas com pcts gravados (contrato antigo / descrição
  // fora do padrão): exporta as chaves que existem, tratando-as como pavtos.
  const chaves = new Set<string>()
  for (const k of Object.keys(it.pavimentos_pct || {})) chaves.add(k)
  for (const k of Object.keys(it.pavimentos_pct_anterior || {})) chaves.add(k)
  if (chaves.size > 0) {
    const nums = [...chaves].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    if (nums.length > 0) {
      return {
        tipo: 'Pavimento',
        slots: nums.map(n => ({ chave: String(n), rotulo: `${n}º pav`, numero: n })),
      }
    }
  }

  // Item convencional: uma linha só. O rótulo vem do `local` contratual
  // quando o orçamento o preencheu — é o que permite filtrar "3º PAV" em
  // itens que não têm grade.
  const localContratual = (it.local || '').trim()
  return {
    tipo: 'Item',
    slots: [{
      chave: '',
      rotulo: localContratual || '(sem local)',
      numero: localContratual ? numeroDoRotulo(localContratual) : null,
    }],
  }
}

// ---------------------------------------------------------------------------
// Linhas da aba "Por Local"
// ---------------------------------------------------------------------------

export type Situacao = 'Medido no período' | 'Medido antes' | 'Não medido'

export interface LinhaLocal {
  local: string
  numeroLocal: number | null
  tipoLocal: TipoLocal
  situacao: Situacao
  disciplina: string
  grupoCodigo: string
  grupoNome: string
  tarefaCodigo: string
  tarefaNome: string
  codigo: string
  descricao: string
  unidade: string
  /** % acumulado no local ao FIM desta medição. */
  pctAcumulado: number
  /** % acumulado no local antes desta medição. */
  pctAnterior: number
  /** Δ do período, em pontos percentuais (nunca negativo). */
  pctPeriodo: number
  qtdContratadaLocal: number
  valorContratadoLocal: number
  valorAcumuladoLocal: number
  valorPeriodoLocal: number
  materialPeriodoLocal: number
  servicoPeriodoLocal: number
  // Contexto do item inteiro (repetido em toda linha, pra planilha ser
  // autossuficiente depois de filtrada).
  qtdContratadaItem: number
  valorUnitarioItem: number
  valorGlobalItem: number
  pctAnteriorItem: number
  pctAtualItem: number
  pctTotalItem: number
  pctSaldoItem: number
  valorAnteriorItem: number
  valorAtualItem: number
  valorTotalItem: number
  valorSaldoItem: number
  pctPrevistoTotalItem: number | null
  desvioItem: number | null
}

function situacaoDe(pctPeriodo: number, pctAcumulado: number): Situacao {
  if (pctPeriodo > 0.0001) return 'Medido no período'
  if (pctAcumulado > 0.0001) return 'Medido antes'
  return 'Não medido'
}

/** Ordenação hierárquica por código ("1.10" depois de "1.2"). */
export function compararCodigo(a: string, b: string): number {
  const pa = String(a || '').split('.').map(Number)
  const pb = String(b || '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = Number.isFinite(pa[i]) ? pa[i] : -Infinity
    const bv = Number.isFinite(pb[i]) ? pb[i] : -Infinity
    if (av !== bv) return av - bv
  }
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true })
}

/**
 * Explode a árvore da medição em linhas (detalhamento × local).
 *
 * Rateios por local:
 *   - contratado  = valor_global_item / nº de locais (grade é homogênea)
 *   - acumulado   = contratado × pctAcumulado
 *   - período     = contratado × Δ
 *   - mat/serv    = mat/serv do item no período, rateados pela fatia de Δ
 *     de cada local (Σ dos Δ = 100% do que a medição andou no item). Se o
 *     item andou sem Δ por local (grade vazia), tudo cai na linha única.
 */
export function montarLinhasPorLocal(grupos: GrupoLike[]): LinhaLocal[] {
  const linhas: LinhaLocal[] = []

  for (const g of grupos || []) {
    for (const t of g.tarefas || []) {
      for (const it of t.detalhamentos || []) {
        const { tipo, slots } = resolverLocais(it)
        const n = slots.length || 1
        const qtdContr = Number(it.quantidade_contratada || 0)
        const valorGlobal = Number(it.valor_global_item || 0)
        const temGrade = tipo !== 'Item'

        // Δ por local, pra ratear material/serviço proporcionalmente.
        const deltas = slots.map(s => {
          if (!temGrade) return Math.max(0, Number(it.pct_atual || 0))
          const acum = Number(it.pavimentos_pct?.[s.chave] ?? 0)
          const ant = Number(it.pavimentos_pct_anterior?.[s.chave] ?? 0)
          return Math.max(0, acum - ant)
        })
        const somaDeltas = deltas.reduce((a, b) => a + b, 0)

        const prevTotal = it.pct_prev_total ?? null
        const desvio = prevTotal != null ? Number(it.pct_total || 0) - prevTotal : null
        const disciplina = (it.disciplina || t.disciplina || g.disciplina || '').trim()

        slots.forEach((s, i) => {
          const pctAcum = temGrade
            ? Number(it.pavimentos_pct?.[s.chave] ?? it.pavimentos_pct_anterior?.[s.chave] ?? 0)
            : Number(it.pct_total || 0)
          const pctAnt = temGrade
            ? Number(it.pavimentos_pct_anterior?.[s.chave] ?? 0)
            : Number(it.pct_anterior || 0)
          const pctPer = deltas[i]
          const fatia = somaDeltas > 0 ? pctPer / somaDeltas : 0

          linhas.push({
            local: s.rotulo,
            numeroLocal: s.numero,
            tipoLocal: tipo,
            situacao: situacaoDe(pctPer, pctAcum),
            disciplina,
            grupoCodigo: g.codigo,
            grupoNome: g.nome,
            tarefaCodigo: t.codigo,
            tarefaNome: t.nome,
            codigo: it.codigo,
            descricao: it.descricao,
            unidade: it.unidade || '',
            pctAcumulado: pctAcum,
            pctAnterior: pctAnt,
            pctPeriodo: pctPer,
            qtdContratadaLocal: qtdContr / n,
            valorContratadoLocal: valorGlobal / n,
            valorAcumuladoLocal: (valorGlobal / n) * (pctAcum / 100),
            valorPeriodoLocal: (valorGlobal / n) * (pctPer / 100),
            materialPeriodoLocal: Number(it.material_atual || 0) * fatia,
            servicoPeriodoLocal: Number(it.servico_atual || 0) * fatia,
            qtdContratadaItem: qtdContr,
            valorUnitarioItem: Number(it.valor_unitario_contratual || 0),
            valorGlobalItem: valorGlobal,
            pctAnteriorItem: Number(it.pct_anterior || 0),
            pctAtualItem: Number(it.pct_atual || 0),
            pctTotalItem: Number(it.pct_total || 0),
            pctSaldoItem: Number(it.pct_saldo || 0),
            valorAnteriorItem: Number(it.valor_anterior || 0),
            valorAtualItem: Number(it.valor_atual || 0),
            valorTotalItem: Number(it.valor_total || 0),
            valorSaldoItem: Number(it.valor_saldo || 0),
            pctPrevistoTotalItem: prevTotal,
            desvioItem: desvio,
          })
        })
      }
    }
  }

  // Ordena por local (o eixo de leitura da aba) e, dentro dele, por código.
  // Locais sem número (Térreo, SS2, meses) vão depois dos numerados.
  const pesoTipo: Record<TipoLocal, number> = { Pavimento: 0, 'Vão': 0, 'Mês': 1, Item: 2 }
  linhas.sort((a, b) => {
    const pa = pesoTipo[a.tipoLocal] ?? 3
    const pb = pesoTipo[b.tipoLocal] ?? 3
    if (pa !== pb) return pa - pb
    const na = a.numeroLocal ?? Number.POSITIVE_INFINITY
    const nb = b.numeroLocal ?? Number.POSITIVE_INFINITY
    if (na !== nb) return na - nb
    if (a.local !== b.local) return a.local.localeCompare(b.local, 'pt-BR', { numeric: true })
    return compararCodigo(a.codigo, b.codigo)
  })

  return linhas
}

// ---------------------------------------------------------------------------
// Linhas da aba "Itens"
// ---------------------------------------------------------------------------

export interface LinhaItem {
  disciplina: string
  grupoCodigo: string
  grupoNome: string
  tarefaCodigo: string
  tarefaNome: string
  codigo: string
  descricao: string
  localContratual: string
  tipoLocal: TipoLocal
  unidade: string
  situacao: Situacao
  qtdContratada: number
  valorUnitario: number
  valorGlobal: number
  qtdAnterior: number
  valorAnterior: number
  pctAnterior: number
  qtdAtual: number
  valorAtual: number
  pctAtual: number
  qtdTotal: number
  valorTotal: number
  pctTotal: number
  qtdSaldo: number
  valorSaldo: number
  pctSaldo: number
  materialAtual: number
  servicoAtual: number
  pctPrevistoTotal: number | null
  desvio: number | null
  locaisNoPeriodo: string
  qtdLocaisNoPeriodo: number
  locaisConcluidos: number
  totalLocais: number
}

/** Uma linha por detalhamento, com o resumo dos locais tocados no período. */
export function montarLinhasItens(grupos: GrupoLike[]): LinhaItem[] {
  const linhas: LinhaItem[] = []

  for (const g of grupos || []) {
    for (const t of g.tarefas || []) {
      for (const it of t.detalhamentos || []) {
        const { tipo, slots } = resolverLocais(it)
        const temGrade = tipo !== 'Item'

        const noPeriodo: string[] = []
        let concluidos = 0
        if (temGrade) {
          for (const s of slots) {
            const acum = Number(it.pavimentos_pct?.[s.chave] ?? it.pavimentos_pct_anterior?.[s.chave] ?? 0)
            const ant = Number(it.pavimentos_pct_anterior?.[s.chave] ?? 0)
            if (acum - ant > 0.0001) noPeriodo.push(s.rotulo)
            if (acum >= 99.999) concluidos++
          }
        }

        const prevTotal = it.pct_prev_total ?? null
        linhas.push({
          disciplina: (it.disciplina || t.disciplina || g.disciplina || '').trim(),
          grupoCodigo: g.codigo,
          grupoNome: g.nome,
          tarefaCodigo: t.codigo,
          tarefaNome: t.nome,
          codigo: it.codigo,
          descricao: it.descricao,
          localContratual: (it.local || '').trim(),
          tipoLocal: tipo,
          unidade: it.unidade || '',
          situacao: situacaoDe(Number(it.pct_atual || 0), Number(it.pct_total || 0)),
          qtdContratada: Number(it.quantidade_contratada || 0),
          valorUnitario: Number(it.valor_unitario_contratual || 0),
          valorGlobal: Number(it.valor_global_item || 0),
          qtdAnterior: Number(it.qtd_anterior || 0),
          valorAnterior: Number(it.valor_anterior || 0),
          pctAnterior: Number(it.pct_anterior || 0),
          qtdAtual: Number(it.qtd_atual || 0),
          valorAtual: Number(it.valor_atual || 0),
          pctAtual: Number(it.pct_atual || 0),
          qtdTotal: Number(it.qtd_total || 0),
          valorTotal: Number(it.valor_total || 0),
          pctTotal: Number(it.pct_total || 0),
          qtdSaldo: Number(it.qtd_saldo || 0),
          valorSaldo: Number(it.valor_saldo || 0),
          pctSaldo: Number(it.pct_saldo || 0),
          materialAtual: Number(it.material_atual || 0),
          servicoAtual: Number(it.servico_atual || 0),
          pctPrevistoTotal: prevTotal,
          desvio: prevTotal != null ? Number(it.pct_total || 0) - prevTotal : null,
          locaisNoPeriodo: noPeriodo.join(', '),
          qtdLocaisNoPeriodo: noPeriodo.length,
          locaisConcluidos: concluidos,
          totalLocais: temGrade ? slots.length : 0,
        })
      }
    }
  }

  linhas.sort((a, b) => compararCodigo(a.codigo, b.codigo))
  return linhas
}

// ---------------------------------------------------------------------------
// Geração do .xlsx
// ---------------------------------------------------------------------------

const AZUL = '1E3A8A'
const CINZA_BORDA = 'E2E8F0'
const FMT_MOEDA = 'R$ #,##0.00'
const FMT_PCT = '0.00"%"'
const FMT_QTD = '#,##0.0000'

/**
 * Célula no formato do xlsx-js-style: `s` é o estilo, `z` o número-formato.
 * O tipo é solto de propósito — a lib não publica typings do objeto de estilo.
 */
type Celula = { v: string | number; t: 's' | 'n'; z?: string; s?: Record<string, unknown> }

/** Namespace do `xlsx-js-style` (sem typings publicados). */
type XlsxNamespace = typeof import('xlsx-js-style')

function bordas(rgb = CINZA_BORDA) {
  const b = { style: 'thin', color: { rgb } }
  return { top: b, bottom: b, left: b, right: b }
}

const ESTILO_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 },
  fill: { fgColor: { rgb: AZUL } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: bordas('CBD5E1'),
}

const ESTILO_TITULO = { font: { bold: true, sz: 13, color: { rgb: AZUL } } }
const ESTILO_SUBTITULO = { font: { italic: true, sz: 9, color: { rgb: '64748B' } } }

const baseCorpo = { font: { sz: 9, color: { rgb: '1F2937' } }, border: bordas() }
const txt = (v: string | null | undefined): Celula => ({ v: v ?? '', t: 's', s: baseCorpo })
const num = (v: number | null | undefined, z: string): Celula =>
  v == null || !Number.isFinite(Number(v))
    ? { v: '', t: 's', s: baseCorpo }
    : { v: Number(v), t: 'n', z, s: { ...baseCorpo, alignment: { horizontal: 'right' } } }
const moeda = (v: number | null | undefined) => num(v, FMT_MOEDA)
const pct = (v: number | null | undefined) => num(v, FMT_PCT)
const qtd = (v: number | null | undefined) => num(v, FMT_QTD)
const inteiro = (v: number | null | undefined) => num(v, '0')

interface ColunaSpec<T> {
  titulo: string
  largura: number
  valor: (linha: T) => Celula
}

/**
 * Monta uma aba tabular: título (2 linhas), cabeçalho azul, corpo, AutoFiltro
 * e larguras. O AutoFiltro é o ponto todo do arquivo — sem ele a planilha
 * volta a ser uma lista pra rolar.
 */
function montarAba<T>(
  XLSX: XlsxNamespace,
  titulo: string,
  subtitulo: string,
  colunas: ColunaSpec<T>[],
  linhas: T[],
) {
  const aoa: Celula[][] = []
  aoa.push([{ v: titulo, t: 's', s: ESTILO_TITULO }])
  aoa.push([{ v: subtitulo, t: 's', s: ESTILO_SUBTITULO }])
  aoa.push(colunas.map(c => ({ v: c.titulo, t: 's', s: ESTILO_HEADER })))
  for (const l of linhas) aoa.push(colunas.map(c => c.valor(l)))

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = colunas.map(c => ({ wch: c.largura }))
  ws['!rows'] = [{}, {}, { hpt: 30 }]
  // Cabeçalho na linha 3 (índice 2); corpo começa na 4.
  const ultimaLinha = Math.max(2, aoa.length - 1)
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range(
      { r: 2, c: 0 },
      { r: ultimaLinha, c: Math.max(0, colunas.length - 1) },
    ),
  }
  // Congelar painéis não é suportado pelo writer do xlsx-js-style — a
  // navegação fica por conta do AutoFiltro e da coluna "Local" ser a primeira.
  return ws
}

function nomeArquivo(medicao: MedicaoHeader) {
  const numero = String(medicao.numero ?? '').padStart(4, '0')
  const periodo = String(medicao.periodo_referencia || '').replace(/[^\w-]/g, '')
  return `medicao-${numero}${periodo ? `-${periodo}` : ''}-filtravel.xlsx`
}

function tituloMedicao(medicao: MedicaoHeader) {
  const numero = String(medicao.numero ?? '').padStart(4, '0')
  return `Medição FIP-${numero}${medicao.periodo_referencia ? ` — ${medicao.periodo_referencia}` : ''}`
}

const COLUNAS_LOCAL: ColunaSpec<LinhaLocal>[] = [
  { titulo: 'Local', largura: 14, valor: l => txt(l.local) },
  { titulo: 'Nº Local', largura: 9, valor: l => inteiro(l.numeroLocal) },
  { titulo: 'Tipo de Local', largura: 13, valor: l => txt(l.tipoLocal) },
  { titulo: 'Situação', largura: 18, valor: l => txt(l.situacao) },
  { titulo: 'Disciplina', largura: 18, valor: l => txt(l.disciplina) },
  { titulo: 'Cód. Grupo', largura: 10, valor: l => txt(l.grupoCodigo) },
  { titulo: 'Grupo', largura: 30, valor: l => txt(l.grupoNome) },
  { titulo: 'Cód. Tarefa', largura: 11, valor: l => txt(l.tarefaCodigo) },
  { titulo: 'Tarefa', largura: 34, valor: l => txt(l.tarefaNome) },
  { titulo: 'Código', largura: 12, valor: l => txt(l.codigo) },
  { titulo: 'Descrição do item', largura: 56, valor: l => txt(l.descricao) },
  { titulo: 'Un.', largura: 6, valor: l => txt(l.unidade) },
  { titulo: '% Anterior (local)', largura: 12, valor: l => pct(l.pctAnterior) },
  { titulo: '% no Período (local)', largura: 13, valor: l => pct(l.pctPeriodo) },
  { titulo: '% Acumulado (local)', largura: 13, valor: l => pct(l.pctAcumulado) },
  { titulo: 'Qtd contratada (local)', largura: 13, valor: l => qtd(l.qtdContratadaLocal) },
  { titulo: 'Valor contratado (local)', largura: 16, valor: l => moeda(l.valorContratadoLocal) },
  { titulo: 'Valor no período (local)', largura: 16, valor: l => moeda(l.valorPeriodoLocal) },
  { titulo: 'Valor acumulado (local)', largura: 16, valor: l => moeda(l.valorAcumuladoLocal) },
  { titulo: 'Material no período (local)', largura: 16, valor: l => moeda(l.materialPeriodoLocal) },
  { titulo: 'Serviço no período (local)', largura: 16, valor: l => moeda(l.servicoPeriodoLocal) },
  { titulo: 'Qtd contratada (item)', largura: 13, valor: l => qtd(l.qtdContratadaItem) },
  { titulo: 'Valor unit. (item)', largura: 14, valor: l => moeda(l.valorUnitarioItem) },
  { titulo: 'Valor global (item)', largura: 16, valor: l => moeda(l.valorGlobalItem) },
  { titulo: '% Anterior (item)', largura: 12, valor: l => pct(l.pctAnteriorItem) },
  { titulo: '% Período (item)', largura: 12, valor: l => pct(l.pctAtualItem) },
  { titulo: '% Acumulado (item)', largura: 12, valor: l => pct(l.pctTotalItem) },
  { titulo: '% Saldo (item)', largura: 12, valor: l => pct(l.pctSaldoItem) },
  { titulo: 'Valor anterior (item)', largura: 16, valor: l => moeda(l.valorAnteriorItem) },
  { titulo: 'Valor período (item)', largura: 16, valor: l => moeda(l.valorAtualItem) },
  { titulo: 'Valor acumulado (item)', largura: 16, valor: l => moeda(l.valorTotalItem) },
  { titulo: 'Valor saldo (item)', largura: 16, valor: l => moeda(l.valorSaldoItem) },
  { titulo: '% Previsto acum. (item)', largura: 13, valor: l => pct(l.pctPrevistoTotalItem) },
  { titulo: 'Desvio real−prev. (p.p.)', largura: 13, valor: l => num(l.desvioItem, '0.00') },
]

const COLUNAS_ITEM: ColunaSpec<LinhaItem>[] = [
  { titulo: 'Disciplina', largura: 18, valor: l => txt(l.disciplina) },
  { titulo: 'Cód. Grupo', largura: 10, valor: l => txt(l.grupoCodigo) },
  { titulo: 'Grupo', largura: 30, valor: l => txt(l.grupoNome) },
  { titulo: 'Cód. Tarefa', largura: 11, valor: l => txt(l.tarefaCodigo) },
  { titulo: 'Tarefa', largura: 34, valor: l => txt(l.tarefaNome) },
  { titulo: 'Código', largura: 12, valor: l => txt(l.codigo) },
  { titulo: 'Descrição', largura: 56, valor: l => txt(l.descricao) },
  { titulo: 'Local contratual', largura: 16, valor: l => txt(l.localContratual) },
  { titulo: 'Tipo de Local', largura: 13, valor: l => txt(l.tipoLocal) },
  { titulo: 'Un.', largura: 6, valor: l => txt(l.unidade) },
  { titulo: 'Situação', largura: 18, valor: l => txt(l.situacao) },
  { titulo: 'Qtd contratada', largura: 13, valor: l => qtd(l.qtdContratada) },
  { titulo: 'Valor unitário', largura: 14, valor: l => moeda(l.valorUnitario) },
  { titulo: 'Valor global', largura: 16, valor: l => moeda(l.valorGlobal) },
  { titulo: 'Qtd anterior', largura: 12, valor: l => qtd(l.qtdAnterior) },
  { titulo: 'Valor anterior', largura: 16, valor: l => moeda(l.valorAnterior) },
  { titulo: '% Anterior', largura: 11, valor: l => pct(l.pctAnterior) },
  { titulo: 'Qtd no período', largura: 12, valor: l => qtd(l.qtdAtual) },
  { titulo: 'Valor no período', largura: 16, valor: l => moeda(l.valorAtual) },
  { titulo: '% no Período', largura: 11, valor: l => pct(l.pctAtual) },
  { titulo: 'Qtd acumulada', largura: 12, valor: l => qtd(l.qtdTotal) },
  { titulo: 'Valor acumulado', largura: 16, valor: l => moeda(l.valorTotal) },
  { titulo: '% Acumulado', largura: 11, valor: l => pct(l.pctTotal) },
  { titulo: 'Qtd saldo', largura: 12, valor: l => qtd(l.qtdSaldo) },
  { titulo: 'Valor saldo', largura: 16, valor: l => moeda(l.valorSaldo) },
  { titulo: '% Saldo', largura: 11, valor: l => pct(l.pctSaldo) },
  { titulo: 'Material no período', largura: 16, valor: l => moeda(l.materialAtual) },
  { titulo: 'Serviço no período', largura: 16, valor: l => moeda(l.servicoAtual) },
  { titulo: '% Previsto acum.', largura: 13, valor: l => pct(l.pctPrevistoTotal) },
  { titulo: 'Desvio real−prev. (p.p.)', largura: 13, valor: l => num(l.desvio, '0.00') },
  { titulo: 'Locais medidos no período', largura: 42, valor: l => txt(l.locaisNoPeriodo) },
  { titulo: 'Qtd locais no período', largura: 12, valor: l => inteiro(l.qtdLocaisNoPeriodo) },
  { titulo: 'Locais 100%', largura: 11, valor: l => inteiro(l.locaisConcluidos) },
  { titulo: 'Total de locais', largura: 11, valor: l => inteiro(l.totalLocais) },
]

function montarAbaResumo(
  XLSX: XlsxNamespace,
  medicao: MedicaoHeader,
  grupos: GrupoLike[],
  totais: TotaisLike | null,
  linhasLocal: LinhaLocal[],
) {
  const aoa: Celula[][] = []
  const rotulo = (v: string): Celula => ({ v, t: 's', s: { font: { bold: true, sz: 9, color: { rgb: '334155' } } } })
  const valor = (v: string | number | null | undefined, z?: string): Celula =>
    typeof v === 'number' && Number.isFinite(v)
      ? { v, t: 'n', z: z || FMT_MOEDA, s: { font: { sz: 9 } } }
      : { v: v == null || v === '' ? '—' : String(v), t: 's', s: { font: { sz: 9 } } }

  aoa.push([{ v: tituloMedicao(medicao), t: 's', s: ESTILO_TITULO }])
  aoa.push([{ v: `Gerado em ${new Date().toLocaleString('pt-BR')}`, t: 's', s: ESTILO_SUBTITULO }])
  aoa.push([])
  aoa.push([{ v: 'DADOS DA MEDIÇÃO', t: 's', s: { font: { bold: true, sz: 10, color: { rgb: AZUL } } } }])
  const dados: [string, string | number | null | undefined][] = [
    ['Contrato', medicao.contrato?.numero],
    ['Objeto', medicao.contrato?.descricao],
    ['Contratante', medicao.contrato?.contratante?.nome],
    ['Contratado', medicao.contrato?.contratado?.nome],
    ['Medição nº', medicao.numero],
    ['Período de referência', medicao.periodo_referencia],
    ['Tipo', medicao.tipo],
    ['Status', medicao.status],
    ['Descrição', medicao.descricao],
    ['Solicitante', medicao.solicitante_nome || medicao.solicitante_email],
    ['Data de submissão', medicao.data_submissao ? new Date(medicao.data_submissao).toLocaleString('pt-BR') : null],
    ['Aprovador', medicao.aprovador_nome],
    ['Data de aprovação', medicao.data_aprovacao ? new Date(medicao.data_aprovacao).toLocaleString('pt-BR') : null],
    ['Observações', medicao.observacoes],
  ]
  for (const [k, v] of dados) aoa.push([rotulo(k), valor(v)])

  if (totais) {
    aoa.push([])
    aoa.push([{ v: 'TOTAIS', t: 's', s: { font: { bold: true, sz: 10, color: { rgb: AZUL } } } }])
    const ts: [string, number, string?][] = [
      ['Valor contratado (itens)', totais.valor_global_total],
      ['Acumulado anterior', totais.valor_anterior_total],
      ['Medido no período', totais.valor_atual_total],
      ['Acumulado total', totais.valor_total_medido],
      ['Saldo a medir', totais.valor_saldo_total],
      ['% Acumulado anterior', totais.pct_anterior_total, FMT_PCT],
      ['% Medido no período', totais.pct_atual_total, FMT_PCT],
      ['% Acumulado total', totais.pct_total_medido, FMT_PCT],
      ['% Saldo', totais.pct_saldo_total, FMT_PCT],
      ['Material no período', totais.material_atual_total],
      ['Serviço no período', totais.servico_atual_total],
    ]
    for (const [k, v, z] of ts) aoa.push([rotulo(k), valor(v, z)])
  }

  // Quantos locais a medição andou — o número que a aba "Por Local" detalha.
  const locaisTocados = new Set(
    linhasLocal.filter(l => l.situacao === 'Medido no período' && l.tipoLocal !== 'Item').map(l => l.local),
  )
  aoa.push([])
  aoa.push([rotulo('Locais com medição no período'), valor(locaisTocados.size, '0')])
  aoa.push([rotulo('Locais tocados'), valor([...locaisTocados].join(', '))])

  aoa.push([])
  aoa.push([{ v: 'POR GRUPO', t: 's', s: { font: { bold: true, sz: 10, color: { rgb: AZUL } } } }])
  aoa.push([
    { v: 'Código', t: 's', s: ESTILO_HEADER },
    { v: 'Grupo', t: 's', s: ESTILO_HEADER },
    { v: 'Contratado', t: 's', s: ESTILO_HEADER },
    { v: 'Anterior', t: 's', s: ESTILO_HEADER },
    { v: 'Período', t: 's', s: ESTILO_HEADER },
    { v: 'Acumulado', t: 's', s: ESTILO_HEADER },
    { v: 'Saldo', t: 's', s: ESTILO_HEADER },
    { v: '% Acum.', t: 's', s: ESTILO_HEADER },
  ])
  for (const g of grupos || []) {
    aoa.push([
      txt(g.codigo), txt(g.nome),
      moeda(g.valor_global), moeda(g.valor_anterior), moeda(g.valor_atual),
      moeda(g.valor_total), moeda(g.valor_saldo), pct(g.pct_total),
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 28 }, { wch: 46 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }]
  return ws
}

/**
 * Gera e baixa o .xlsx da medição.
 *
 * Abas:
 *   1. "Por Local"  — uma linha por (item × pavimento/vão/mês), com AutoFiltro
 *   2. "Itens"      — uma linha por detalhamento, planilha completa
 *   3. "Resumo"     — cabeçalho da medição, totais e quebra por grupo
 */
export async function exportarExcelMedicao(args: {
  medicao: MedicaoHeader
  grupos: GrupoLike[]
  totais?: TotaisLike | null
}) {
  const { medicao, grupos } = args
  const totais = args.totais ?? null
  const XLSX = await import('xlsx-js-style')

  const linhasLocal = montarLinhasPorLocal(grupos)
  const linhasItem = montarLinhasItens(grupos)
  const titulo = tituloMedicao(medicao)
  const contrato = medicao.contrato?.numero ? `Contrato ${medicao.contrato.numero} · ` : ''

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    montarAba(
      XLSX, `${titulo} — medição por local`,
      `${contrato}Filtre a coluna "Local" (ex.: 3º pav) para ver tudo o que foi medido ali, em todas as disciplinas. Gerado em ${new Date().toLocaleString('pt-BR')}.`,
      COLUNAS_LOCAL, linhasLocal,
    ),
    'Por Local',
  )
  XLSX.utils.book_append_sheet(
    wb,
    montarAba(
      XLSX, `${titulo} — itens`,
      `${contrato}Uma linha por item do contrato, com anterior / período / acumulado / saldo.`,
      COLUNAS_ITEM, linhasItem,
    ),
    'Itens',
  )
  XLSX.utils.book_append_sheet(wb, montarAbaResumo(XLSX, medicao, grupos, totais, linhasLocal), 'Resumo')

  XLSX.writeFile(wb, nomeArquivo(medicao))
}
