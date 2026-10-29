// Exportação da Visão Geral (Excel formatado via xlsx-js-style).
// PDF fica em components/pdf/VisaoGeralPDF.tsx (react-pdf).
import type { DashboardItem, DashboardModo } from '@/types/dashboard'

export interface FlatRow { item: DashboardItem; level: number }

/**
 * Valores exibidos conforme o modo.
 *
 * FONTE ÚNICA — a tabela, o gráfico, o painel de filtro, o Excel e o PDF
 * importam daqui. Antes a mesma regra estava copiada em 4 arquivos, e os
 * rótulos já tinham divergido entre eles.
 *
 * Saldo = Contratado − Realizado em TODOS os modos — é a conta que a
 * planilha precisa fechar na leitura. Antes, em Material e Serviço a coluna
 * "Saldo" mostrava outra grandeza (aprovado sem NF / medido sem NF), e a
 * linha não batia com Contratado − Realizado. Essa grandeza continua
 * disponível como `pendenteNf` (coluna própria, ver rotuloPendenteNf).
 *
 * Saldo NÃO é clampado em zero: valor negativo significa item estourado, e
 * é exatamente o que precisa aparecer.
 */
export function valoresPorModo(item: DashboardItem, modo: DashboardModo) {
  const [c, r, p]: [number, number, number | null] =
    modo === 'material'
      ? [item.valor_contratado_material, item.realizado_material, item.saldo_aprovado_material]
      : modo === 'servico'
        ? [item.valor_contratado_servico, item.realizado_servico, item.saldo_medicao_servico]
        : [item.valor_contratado_total, item.realizado_total, null]
  // Arredonda em centavos ANTES de subtrair: a conta tem que fechar com os
  // números que aparecem na tela (sem isso sobravam diferenças de R$ 0,01).
  const contratado = centavos(c)
  const realizado = centavos(r)
  return {
    contratado,
    realizado,
    saldo: centavos(contratado - realizado),
    pendenteNf: p === null ? null : centavos(p),
  }
}

/** Arredonda pra 2 casas e normaliza -0 (que aparecia como "-0,00"). */
function centavos(n: number): number {
  return Math.round((n || 0) * 100) / 100 + 0
}

/**
 * Rótulo da coluna de saldo. Não depende de nenhuma linha — antes o PDF e o
 * Excel derivavam de `rows[0]`, passando `{}` quando a lista estava vazia.
 */
export function rotuloSaldo(_modo: DashboardModo): string {
  return 'Saldo'
}

/**
 * Rótulo da coluna "pendente de NF" — só existe em Material (pedido aprovado
 * ainda sem NF) e Serviço (medição aprovada ainda sem NF da Wave).
 */
export function rotuloPendenteNf(modo: DashboardModo): string | null {
  if (modo === 'material') return 'Aprov. s/ NF'
  if (modo === 'servico') return 'Med. s/ NF'
  return null
}

type CamposPercentual = Pick<DashboardItem,
  'valor_contratado_servico' | 'realizado_servico' | 'servico_em_aprovacao' |
  'valor_contratado_material' | 'realizado_material'> &
  Partial<Pick<DashboardItem, 'material_medido' | 'material_descontado'>>

export interface Percentuais {
  /** % do serviço contratado já medido — aprovado + em aprovação. null sem serviço contratado. */
  servMedido: number | null
  /** Pedaço de `servMedido` que vem de medição ainda em aprovação (p.p.). */
  servEmAprovacao: number
  /** % do material contratado já faturado (NF lançada). null sem material contratado. */
  matRealizado: number | null
  /** Material faturado atrás do serviço medido: a FIP precisa faturar. */
  fipAtrasada: boolean
  /** R$ de material que a FIP precisa faturar pra alcançar o % de serviço medido. */
  aFaturar: number
  /** % do material contratado já DESCONTADO da Wave nas medições aprovadas. */
  matDescontado: number | null
  /** R$ de material medido (aprovado) ainda não descontado — falta lastro no ERP. */
  pendenteSemLastro: number
  /** NF de material à frente do serviço medido: se o físico andou, há serviço a medir. */
  matAdiantado: boolean
  /** NF de material acima do contratado do item. */
  matAcimaContrato: boolean
}

const pct1 = (n: number) => Math.round(n * 10) / 10

/**
 * Avanço físico (serviço medido) × avanço de faturamento de material.
 *
 * Material e serviço do mesmo item andam juntos na obra: se o serviço já foi
 * medido em 60% e a NF de material cobre só 40%, a FIP está atrás no
 * faturamento — é isso que a coluna sinaliza. A comparação é feita com uma
 * casa decimal (a mesma que aparece na tela), pra não acender alerta por
 * diferença invisível.
 */
export function percentuais(item: CamposPercentual): Percentuais {
  const cs = item.valor_contratado_servico || 0
  const cm = item.valor_contratado_material || 0
  const aprovado = item.realizado_servico || 0
  const emAprov = item.servico_em_aprovacao || 0
  const servMedido = cs > 0 ? ((aprovado + emAprov) / cs) * 100 : null
  const matRealizado = cm > 0 ? ((item.realizado_material || 0) / cm) * 100 : null
  const fipAtrasada = servMedido !== null && matRealizado !== null && pct1(matRealizado) < pct1(servMedido)
  const aFaturar = fipAtrasada && servMedido !== null
    ? centavos(Math.max(0, (servMedido / 100) * cm - (item.realizado_material || 0)))
    : 0
  const descontado = item.material_descontado || 0
  return {
    servMedido,
    servEmAprovacao: cs > 0 ? (emAprov / cs) * 100 : 0,
    matRealizado,
    fipAtrasada,
    aFaturar,
    matDescontado: cm > 0 ? (descontado / cm) * 100 : null,
    pendenteSemLastro: centavos(Math.max(0, (item.material_medido || 0) - descontado)),
    matAdiantado: servMedido !== null && matRealizado !== null && pct1(matRealizado) > pct1(servMedido),
    matAcimaContrato: matRealizado !== null && pct1(matRealizado) > 100,
  }
}

/** "52,3%" — ou "—" quando não há base pra calcular. */
export function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/**
 * Aplica filtro por texto (código/nome) e por saldo.
 *
 * "Somente com saldo" descarta apenas o saldo EXATAMENTE zerado. Antes usava
 * `saldo <= 0`, o que escondia justamente os itens estourados (saldo
 * negativo) — os que mais precisam de atenção.
 */
export function filtrarRows(
  rows: FlatRow[],
  modo: DashboardModo,
  opts: { texto?: string; somenteSaldo?: boolean },
): FlatRow[] {
  const t = (opts.texto || '').trim().toLowerCase()
  return rows.filter(({ item }) => {
    if (t) {
      const alvo = `${item.codigo} ${item.nome}`.toLowerCase()
      if (!alvo.includes(t)) return false
    }
    if (opts.somenteSaldo) {
      if (Math.abs(valoresPorModo(item, modo).saldo) < 0.005) return false
    }
    return true
  })
}

/**
 * Soma os totais de um conjunto de linhas SEM dupla contagem.
 *
 * As linhas misturam níveis (grupo, tarefa, detalhamento), então somar tudo
 * contaria o mesmo dinheiro 2-3 vezes. Só entram as linhas "raiz" do
 * conjunto: aquelas cujo ancestral não sobreviveu ao filtro.
 *
 * Antes o total somava apenas `level === 0`; ao filtrar por "1.6" nenhum
 * grupo casava e o rodapé TOTAL saía 0,00 com o corpo cheio de valores.
 */
export function totalizarRows(rows: FlatRow[], modo: DashboardModo) {
  const idsPresentes = new Set(rows.map(r => r.item.id))
  let contratado = 0
  let realizado = 0
  let saldo = 0
  let pendenteNf = 0
  const base: Required<CamposPercentual> = {
    valor_contratado_servico: 0, realizado_servico: 0, servico_em_aprovacao: 0,
    valor_contratado_material: 0, realizado_material: 0,
    material_medido: 0, material_descontado: 0,
  }
  for (const { item } of rows) {
    // Se o pai está na lista, este item já foi contado dentro dele.
    if (item.pai_id && idsPresentes.has(item.pai_id)) continue
    base.valor_contratado_servico += item.valor_contratado_servico || 0
    base.realizado_servico += item.realizado_servico || 0
    base.servico_em_aprovacao += item.servico_em_aprovacao || 0
    base.valor_contratado_material += item.valor_contratado_material || 0
    base.realizado_material += item.realizado_material || 0
    base.material_medido += item.material_medido || 0
    base.material_descontado += item.material_descontado || 0
    const v = valoresPorModo(item, modo)
    contratado += v.contratado
    realizado += v.realizado
    saldo += v.saldo
    pendenteNf += v.pendenteNf ?? 0
  }
  return { contratado, realizado, saldo, pendenteNf, pct: percentuais(base) }
}

function nomeArquivo(base: string, ext: string) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${base}-${stamp}.${ext}`
}

/**
 * Colunas numéricas exportadas (Excel/PDF/painel de filtro), na MESMA ordem
 * da tabela da tela (components/contratos/visao-geral/colunas.ts).
 * `pct` = percentual (0–100); `alerta` = FIP atrás no faturamento de material.
 */
export interface ColunaExport {
  label: string
  tipo: 'money' | 'pct'
  valor: (v: ReturnType<typeof valoresPorModo>, p: Percentuais) => number | null
  alerta?: (p: Percentuais) => boolean
}

export function colunasExport(modo: DashboardModo): ColunaExport[] {
  const contratado: ColunaExport = { label: 'Contratado', tipo: 'money', valor: v => v.contratado }
  const realizado: ColunaExport = { label: 'Realizado', tipo: 'money', valor: v => v.realizado }
  const saldo: ColunaExport = { label: rotuloSaldo(modo), tipo: 'money', valor: v => v.saldo }
  const pendente: ColunaExport = { label: rotuloPendenteNf(modo) ?? '', tipo: 'money', valor: v => v.pendenteNf ?? 0 }
  if (modo === 'servico') {
    return [contratado, realizado, { label: '% Medido', tipo: 'pct', valor: (_v, p) => p.servMedido }, saldo, pendente]
  }
  if (modo === 'material') {
    return [
      contratado,
      { label: '% Serv. med.', tipo: 'pct', valor: (_v, p) => p.servMedido },
      { ...realizado, alerta: p => p.fipAtrasada },
      { label: '% Realizado', tipo: 'pct', valor: (_v, p) => p.matRealizado, alerta: p => p.fipAtrasada },
      { label: '% Mat. desc.', tipo: 'pct', valor: (_v, p) => p.matDescontado, alerta: p => p.pendenteSemLastro > 0.005 },
      saldo,
      pendente,
    ]
  }
  return [contratado, realizado, saldo]
}

/** Gera e baixa um .xlsx formatado da Visão Geral filtrada. */
export async function exportarExcelVisaoGeral(
  rows: FlatRow[],
  modo: DashboardModo,
  contratoNome: string,
) {
  const XLSX = await import('xlsx-js-style')
  const modoLabel = modo === 'material' ? 'Material' : modo === 'servico' ? 'Serviço' : 'Total'
  const colunas = colunasExport(modo)
  const ultimaCol = 1 + colunas.length

  const azul = '1E3A8A'
  const laranja = 'B45309'
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: azul } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: bordas('CBD5E1'),
  }
  const money = '#,##0.00'
  const pctFmt = '0.0"%"'

  const aoa: any[][] = []
  // Título
  aoa.push([{ v: `Visão Geral — ${contratoNome} (${modoLabel})`, s: { font: { bold: true, sz: 13, color: { rgb: azul } } } }])
  aoa.push([{ v: `Gerado em ${new Date().toLocaleString('pt-BR')}`, s: { font: { italic: true, sz: 8, color: { rgb: '64748B' } } } }])
  aoa.push([])
  // Cabeçalho
  aoa.push([cell('Código', headerStyle), cell('Item', headerStyle), ...colunas.map(c => cell(c.label, headerStyle))])

  const celula = (c: ColunaExport, v: ReturnType<typeof valoresPorModo>, p: Percentuais, estilo: any) => {
    const val = c.valor(v, p)
    const alerta = c.alerta?.(p) ?? false
    const s = {
      ...estilo,
      alignment: { horizontal: 'right' },
      ...(alerta ? { font: { ...estilo.font, bold: true, color: { rgb: laranja } } } : {}),
    }
    if (val === null) return { v: '—', s }
    return { v: val, t: 'n', z: c.tipo === 'pct' ? pctFmt : money, s }
  }

  for (const { item, level } of rows) {
    const v = valoresPorModo(item, modo)
    const p = percentuais(item)
    const isGrupo = level === 0
    const isTarefa = level === 1
    const base = {
      font: { bold: isGrupo, sz: isGrupo ? 10 : 9, color: { rgb: isGrupo ? azul : '1F2937' } },
      fill: isGrupo ? { fgColor: { rgb: 'DBEAFE' } } : isTarefa ? { fgColor: { rgb: 'F1F5F9' } } : undefined,
      border: bordas('E2E8F0'),
    }
    aoa.push([
      { v: item.codigo, s: base },
      { v: `${'    '.repeat(level)}${item.nome}`, s: base },
      ...colunas.map(c => celula(c, v, p, base)),
    ])
  }
  // Totais: raízes do conjunto filtrado, pra não duplicar entre níveis.
  const tot = totalizarRows(rows, modo)
  const totStyle = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: azul } }, border: bordas('CBD5E1') }
  const vTot = { contratado: tot.contratado, realizado: tot.realizado, saldo: tot.saldo, pendenteNf: tot.pendenteNf }
  aoa.push([
    { v: 'TOTAL', s: { ...totStyle, alignment: { horizontal: 'left' } } }, { v: '', s: totStyle },
    ...colunas.map(c => {
      const val = c.valor(vTot, tot.pct)
      const s = { ...totStyle, alignment: { horizontal: 'right' } }
      return val === null ? { v: '—', s } : { v: val, t: 'n', z: c.tipo === 'pct' ? pctFmt : money, s }
    }),
  ])

  if (modo !== 'total') {
    aoa.push([])
    const nota = { font: { italic: true, sz: 8, color: { rgb: '64748B' } } }
    aoa.push([{ v: '% de serviço medido inclui medições em aprovação (submetidas, em análise ou autorizadas). Realizado e Saldo contam só medição aprovada.', s: nota }])
    if (modo === 'material') {
      aoa.push([{ v: 'Em laranja: material faturado atrás do serviço medido — a FIP precisa faturar.', s: nota }])
      aoa.push([{ v: '% Mat. desc. em laranja: material medido ainda não descontado da Wave (falta lastro no ERP).', s: nota }])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, { wch: 60 }, ...colunas.map(c => ({ wch: c.tipo === 'pct' ? 11 : 16 }))]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: ultimaCol } }, { s: { r: 1, c: 0 }, e: { r: 1, c: ultimaCol } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Visão Geral')
  XLSX.writeFile(wb, nomeArquivo(`visao-geral-${modoLabel.toLowerCase()}`, 'xlsx'))
}

function cell(v: string, s: any) { return { v, s } }
function bordas(rgb: string) {
  const b = { style: 'thin', color: { rgb } }
  return { top: b, bottom: b, left: b, right: b }
}
