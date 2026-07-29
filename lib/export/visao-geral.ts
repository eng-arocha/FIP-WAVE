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
 * Saldo NÃO é clampado em zero: valor negativo significa item estourado, e
 * é exatamente o que precisa aparecer.
 */
export function valoresPorModo(item: DashboardItem, modo: DashboardModo) {
  if (modo === 'material') {
    return {
      contratado: item.valor_contratado_material,
      realizado: item.realizado_material,
      saldo: item.saldo_aprovado_material,
      saldoLabel: 'Saldo aprov.',
    }
  }
  if (modo === 'servico') {
    return {
      contratado: item.valor_contratado_servico,
      realizado: item.realizado_servico,
      saldo: item.saldo_medicao_servico,
      saldoLabel: 'Saldo med.',
    }
  }
  return {
    contratado: item.valor_contratado_total,
    realizado: item.realizado_total,
    saldo: item.valor_contratado_total - item.realizado_total,
    saldoLabel: 'Saldo a executar',
  }
}

/**
 * Rótulo da coluna de saldo. Não depende de nenhuma linha — antes o PDF e o
 * Excel derivavam de `rows[0]`, passando `{}` quando a lista estava vazia.
 */
export function rotuloSaldo(modo: DashboardModo): string {
  if (modo === 'material') return 'Saldo aprov.'
  if (modo === 'servico') return 'Saldo med.'
  return 'Saldo a executar'
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
  for (const { item } of rows) {
    // Se o pai está na lista, este item já foi contado dentro dele.
    if (item.pai_id && idsPresentes.has(item.pai_id)) continue
    const v = valoresPorModo(item, modo)
    contratado += v.contratado
    realizado += v.realizado
    saldo += v.saldo
  }
  return { contratado, realizado, saldo }
}

function nomeArquivo(base: string, ext: string) {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${base}-${stamp}.${ext}`
}

/** Gera e baixa um .xlsx formatado da Visão Geral filtrada. */
export async function exportarExcelVisaoGeral(
  rows: FlatRow[],
  modo: DashboardModo,
  contratoNome: string,
) {
  const XLSX = await import('xlsx-js-style')
  const modoLabel = modo === 'material' ? 'Material' : modo === 'servico' ? 'Serviço' : 'Total'
  const saldoLabel = rotuloSaldo(modo)

  const azul = '1E3A8A'
  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: azul } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: bordas('CBD5E1'),
  }
  const money = '#,##0.00'

  const aoa: any[][] = []
  // Título
  aoa.push([{ v: `Visão Geral — ${contratoNome} (${modoLabel})`, s: { font: { bold: true, sz: 13, color: { rgb: azul } } } }])
  aoa.push([{ v: `Gerado em ${new Date().toLocaleString('pt-BR')}`, s: { font: { italic: true, sz: 8, color: { rgb: '64748B' } } } }])
  aoa.push([])
  // Cabeçalho
  aoa.push([
    cell('Código', headerStyle), cell('Item', headerStyle),
    cell('Contratado', headerStyle), cell('Realizado', headerStyle), cell(saldoLabel, headerStyle),
  ])

  let totC = 0, totR = 0, totS = 0
  for (const { item, level } of rows) {
    const v = valoresPorModo(item, modo)
    const isGrupo = level === 0
    const isTarefa = level === 1
    const base = {
      font: { bold: isGrupo, sz: isGrupo ? 10 : 9, color: { rgb: isGrupo ? azul : '1F2937' } },
      fill: isGrupo ? { fgColor: { rgb: 'DBEAFE' } } : isTarefa ? { fgColor: { rgb: 'F1F5F9' } } : undefined,
      border: bordas('E2E8F0'),
    }
    const num = (val: number) => ({ v: val, t: 'n', z: money, s: { ...base, alignment: { horizontal: 'right' } } })
    aoa.push([
      { v: item.codigo, s: base },
      { v: `${'    '.repeat(level)}${item.nome}`, s: base },
      num(v.contratado), num(v.realizado), num(v.saldo),
    ])
  }
  // Totais: raízes do conjunto filtrado, pra não duplicar entre níveis.
  const tot = totalizarRows(rows, modo)
  totC = tot.contratado; totR = tot.realizado; totS = tot.saldo
  const totStyle = { font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: azul } }, alignment: { horizontal: 'right' }, border: bordas('CBD5E1') }
  aoa.push([
    { v: 'TOTAL', s: { ...totStyle, alignment: { horizontal: 'left' } } }, { v: '', s: totStyle },
    { v: totC, t: 'n', z: money, s: totStyle }, { v: totR, t: 'n', z: money, s: totStyle }, { v: totS, t: 'n', z: money, s: totStyle },
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Visão Geral')
  XLSX.writeFile(wb, nomeArquivo(`visao-geral-${modoLabel.toLowerCase()}`, 'xlsx'))
}

function cell(v: string, s: any) { return { v, s } }
function bordas(rgb: string) {
  const b = { style: 'thin', color: { rgb } }
  return { top: b, bottom: b, left: b, right: b }
}
