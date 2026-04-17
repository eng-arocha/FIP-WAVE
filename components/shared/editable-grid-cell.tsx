'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Célula editável estilo Excel, genérica.
 *
 * Uso: o host constrói um `GridCellCoordinator` (mapeando cellKey ↔ meta)
 * e passa a cada célula. A célula só conhece o próprio cellKey — o
 * coordenador resolve vizinhos, paste em matriz e commit.
 *
 * Navegação (mesmo que Excel):
 *   ↑ ↓ ← →  — vizinho na mesma linha/coluna
 *   Tab/Shift+Tab — próximo/anterior da malha linearizada
 *   Enter — confirma e desce
 *   Esc   — cancela e restaura
 *   F2 / duplo clique — entra em edição
 *   Digitar — sobrescreve (Excel behavior)
 *   Ctrl+V — se clipboard é matriz TSV (Excel), delega ao coordenador
 */

export interface GridCellCoordinator {
  editMode: boolean
  register: (key: string, meta: { rowIdx: number; colIdx: number }, el: HTMLInputElement) => void
  unregister: (key: string) => void
  focusNext: (key: string, dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void
  onPasteMatrix: (anchorKey: string, rows: string[][]) => void
  onCommit: (key: string, value: number) => Promise<void> | void
}

interface Props {
  cellKey: string
  rowIdx: number
  colIdx: number
  value: number
  formatDisplay: (n: number) => string
  className?: string
  coord: GridCellCoordinator
  /** Se true, célula é read-only mesmo em editMode (ex: coluna total). */
  readOnly?: boolean
  /** Ajuda visual quando valor precisa atenção (row total ≠ 100%). */
  invalid?: boolean
}

/** "1.234,56" ou "1234.56" ou "1,5%" → 1234.56 / 1.5. */
export function parseNumber(input: string): number {
  if (!input) return 0
  let s = String(input).trim()
  s = s.replace(/R\$\s?/i, '').replace(/%/g, '').replace(/\s/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

export function EditableGridCell({
  cellKey, rowIdx, colIdx, value, formatDisplay, className = '', coord, readOnly, invalid,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (ref.current && !readOnly) coord.register(cellKey, { rowIdx, colIdx }, ref.current)
    return () => coord.unregister(cellKey)
  }, [cellKey, rowIdx, colIdx, coord, readOnly])

  function beginEdit() {
    if (readOnly) return
    setDraft(String(value ?? 0).replace('.', ','))
    setEditing(true)
    setTimeout(() => ref.current?.select(), 0)
  }

  async function commit() {
    if (!editing) return
    const n = parseNumber(draft)
    setEditing(false)
    if (Math.abs(n - (value || 0)) < 0.0001) return
    setSaving(true)
    try { await coord.onCommit(cellKey, n) } finally { setSaving(false) }
  }

  function cancel() {
    setEditing(false)
    setDraft(String(value ?? 0).replace('.', ','))
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (readOnly) return
    if (!editing) {
      if      (e.key === 'ArrowDown')  { e.preventDefault(); coord.focusNext(cellKey, 'down') }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); coord.focusNext(cellKey, 'up') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); coord.focusNext(cellKey, 'right') }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); coord.focusNext(cellKey, 'left') }
      else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdit() }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        beginEdit(); setDraft(e.key); e.preventDefault()
      }
      return
    }
    if      (e.key === 'Enter')  { e.preventDefault(); commit().then(() => coord.focusNext(cellKey, 'down')) }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
    else if (e.key === 'Tab')    { commit().then(() => coord.focusNext(cellKey, e.shiftKey ? 'prev' : 'next')) }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (readOnly) return
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    const rows = text.split(/\r?\n/).filter(r => r.length > 0).map(r => r.split('\t'))
    if (rows.length === 1 && rows[0].length === 1) {
      if (!editing) { beginEdit(); setDraft(rows[0][0]); e.preventDefault() }
      return
    }
    e.preventDefault()
    coord.onPasteMatrix(cellKey, rows)
  }

  if (!coord.editMode || readOnly) {
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
      onBlur={commit}
      onKeyDown={onKey}
      onPaste={onPaste}
      className={`${className} w-full px-1 py-0.5 text-right tabular-nums rounded outline-none transition-colors ${
        editing
          ? 'bg-[var(--surface-0)] border border-blue-500 ring-1 ring-blue-500/40'
          : invalid
            ? 'border border-red-500/60 bg-red-500/5 hover:border-red-500 focus:border-red-500 cursor-cell'
            : 'border border-transparent hover:border-[var(--border)] focus:border-blue-500 focus:bg-[var(--surface-0)] cursor-cell'
      } ${saving ? 'opacity-60' : ''}`}
      style={{ color: 'inherit' }}
    />
  )
}
