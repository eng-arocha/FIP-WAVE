'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Célula editável estilo Excel para orçamento (PR Mat / PR MO).
 *
 * Recursos:
 *  - Setas ↑ ↓ ← → navegam entre células adjacentes (via coordenador)
 *  - Tab / Shift+Tab seguem a mesma malha
 *  - Enter confirma e desce
 *  - Esc cancela e restaura valor
 *  - Blur persiste (onCommit) — com debounce curto
 *  - Paste: se clipboard tem TSV (várias linhas/colunas — Excel default),
 *    dispara onPasteMatrix({ rows: string[][], anchorKey }) para o host
 *    aplicar em cascata.
 *
 * O host mantém um registro (Map) de cellKey -> { detId, field, rowIdx, colIdx }
 * e decide vizinhos por rowIdx/colIdx.
 */

export interface EditableCellCoordinator {
  // Registra/desregistra uma célula. O host constrói o mapa de navegação.
  register: (key: string, meta: { rowIdx: number; colIdx: number; detId: string; field: 'mat' | 'mo' }, el: HTMLInputElement) => void
  unregister: (key: string) => void
  // Move foco
  focusNext: (key: string, dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void
  // Paste matriz (linhas x colunas) a partir desta célula
  onPasteMatrix: (anchorKey: string, rows: string[][]) => void
  // Commit individual
  onCommit: (detId: string, field: 'mat' | 'mo', value: number) => Promise<void> | void
  editMode: boolean
}

interface Props {
  cellKey: string
  detId: string
  field: 'mat' | 'mo'
  rowIdx: number
  colIdx: number
  value: number
  formatDisplay: (n: number) => string
  className?: string
  coord: EditableCellCoordinator
}

/** "R$ 1.234,56" ou "1.234,56" ou "1234.56" → 1234.56 */
export function parseBRLToNumber(input: string): number {
  if (!input) return 0
  let s = String(input).trim()
  s = s.replace(/R\$\s?/i, '').replace(/\s/g, '')
  // Se contém vírgula, assume formato pt-BR (. milhar, , decimal)
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  // Senão, ponto vira decimal (padrão US)
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

export function EditableOrcamentoCell({
  cellKey, detId, field, rowIdx, colIdx,
  value, formatDisplay, className = '', coord,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ref.current) coord.register(cellKey, { rowIdx, colIdx, detId, field }, ref.current)
    return () => coord.unregister(cellKey)
  }, [cellKey, rowIdx, colIdx, detId, field, coord])

  function beginEdit() {
    setDraft(String(value ?? 0).replace('.', ','))
    setEditing(true)
    // selectAll no próximo tick
    setTimeout(() => ref.current?.select(), 0)
  }

  async function commit() {
    if (!editing) return
    const n = parseBRLToNumber(draft)
    setEditing(false)
    if (Math.abs(n - (value || 0)) < 0.0001) return
    setSaving(true)
    try { await coord.onCommit(detId, field, n) } finally { setSaving(false) }
  }

  function cancel() {
    setEditing(false)
    setDraft(String(value ?? 0).replace('.', ','))
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    // Se NÃO está editando, setas navegam direto.
    if (!editing) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); coord.focusNext(cellKey, 'down') }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); coord.focusNext(cellKey, 'up') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); coord.focusNext(cellKey, 'right') }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); coord.focusNext(cellKey, 'left') }
      else if (e.key === 'Tab')        { /* default */ }
      else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit() }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Qualquer tecla entra em edição (Excel behavior)
        beginEdit()
        setDraft(e.key)
        e.preventDefault()
      }
      return
    }
    // Editando
    if (e.key === 'Enter')     { e.preventDefault(); commit().then(() => coord.focusNext(cellKey, 'down')) }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
    else if (e.key === 'Tab')    { commit().then(() => coord.focusNext(cellKey, e.shiftKey ? 'prev' : 'next')) }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    // Excel cola TSV: linhas separadas por \n, colunas por \t
    const rows = text.split(/\r?\n/).filter(r => r.length > 0).map(r => r.split('\t'))
    // Paste de célula única (1x1) — deixa input tratar
    if (rows.length === 1 && rows[0].length === 1) {
      if (!editing) { beginEdit(); setDraft(rows[0][0]) ; e.preventDefault() }
      return
    }
    // Matriz: delega ao coordenador
    e.preventDefault()
    coord.onPasteMatrix(cellKey, rows)
  }

  if (!coord.editMode) {
    // Modo leitura: span compacto
    return <span className={className}>{formatDisplay(value || 0)}</span>
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={editing ? draft : formatDisplay(value || 0)}
      readOnly={!editing}
      onChange={e => setDraft(e.target.value)}
      onDoubleClick={beginEdit}
      onFocus={() => { /* fica focada — setas nav */ }}
      onBlur={commit}
      onKeyDown={onKey}
      onPaste={onPaste}
      className={`${className} w-full px-1 py-0.5 text-right tabular-nums rounded outline-none transition-colors ${
        editing
          ? 'bg-[var(--surface-0)] border border-blue-500 ring-1 ring-blue-500/40'
          : 'border border-transparent hover:border-[var(--border)] focus:border-blue-500 focus:bg-[var(--surface-0)] cursor-cell'
      } ${saving ? 'opacity-60' : ''}`}
      style={{ color: 'inherit' }}
    />
  )
}
