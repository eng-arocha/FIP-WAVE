/**
 * Geração e download de CSV no cliente (sem servidor, sem deps).
 *
 * Tratamento defensivo:
 *  - Escapa aspas duplas (RFC 4180): "...""..."
 *  - Wrappa qualquer célula que contenha `,` `"` ou newline em aspas
 *  - Adiciona BOM UTF-8 (\uFEFF) pra Excel reconhecer acentuação corretamente
 *  - Aceita valores `null/undefined` (vira string vazia)
 *  - Aceita Date (ISO YYYY-MM-DD), número (toString) e boolean ("Sim"/"Não")
 */

export type CsvCell = string | number | boolean | Date | null | undefined

function formatCell(v: CsvCell): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return String(v)
}

function escapeCell(v: CsvCell): string {
  const s = formatCell(v)
  if (/[",\n;\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface CsvColumn<T> {
  /** Cabeçalho exibido no Excel. */
  header: string
  /** Função que extrai o valor da linha. */
  get: (row: T) => CsvCell
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headers = columns.map(c => escapeCell(c.header)).join(',')
  const body = rows.map(r => columns.map(c => escapeCell(c.get(r))).join(',')).join('\n')
  // BOM pra Excel abrir com encoding correto
  return '\uFEFF' + headers + '\n' + body
}

/**
 * Dispara o download de um CSV no browser.
 * `name` sem extensão — adiciona .csv automaticamente.
 */
export function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 0)
}

/** Atalho: gera + baixa em uma chamada. */
export function exportCsv<T>(name: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadCsv(name, toCsv(rows, columns))
}
