'use client'

import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'

type FlatRow = {
  nivel: 1 | 2 | 3
  disciplina: string | null
  codigo: string
  atividade: string
  local: string | null
  qtde: number
  mat_unit: number
  mat_total: number
  mo_unit: number
  mo_total: number
  total: number
}

type SortDir = 'asc' | 'desc' | null
type SortKey = keyof FlatRow | null

interface Props {
  estrutura: any[] // grupos com tarefas e detalhamentos
}

/**
 * Achata a estrutura hierárquica em linhas para tabela única.
 */
function flatten(estrutura: any[]): FlatRow[] {
  const out: FlatRow[] = []
  for (const g of estrutura) {
    const qG = 1
    const matTotalG = (g.tarefas || []).reduce((s: number, t: any) => s + (t.valor_material || 0), 0)
    const moTotalG  = (g.tarefas || []).reduce((s: number, t: any) => s + (t.valor_servico  || 0), 0)
    out.push({
      nivel: 1,
      disciplina: g.disciplina ?? null,
      codigo: String(g.codigo),
      atividade: g.nome,
      local: null,
      qtde: qG,
      mat_unit: matTotalG,
      mat_total: matTotalG,
      mo_unit: moTotalG,
      mo_total: moTotalG,
      total: Number(g.valor_contratado) || (matTotalG + moTotalG),
    })
    for (const t of g.tarefas || []) {
      const qT = Number(t.quantidade_contratada) || 1
      const matT = Number(t.valor_material) || 0
      const moT  = Number(t.valor_servico)  || 0
      out.push({
        nivel: 2,
        disciplina: t.disciplina ?? g.disciplina ?? null,
        codigo: String(t.codigo),
        atividade: t.nome,
        local: null,
        qtde: qT,
        mat_unit: qT ? matT / qT : matT,
        mat_total: matT,
        mo_unit: qT ? moT / qT : moT,
        mo_total: moT,
        total: Number(t.valor_total) || (matT + moT),
      })
      for (const d of t.detalhamentos || []) {
        const qD = Number(d.quantidade_contratada) || 0
        const matU = Number(d.valor_material_unit) || 0
        const moU  = Number(d.valor_servico_unit)  || 0
        out.push({
          nivel: 3,
          disciplina: d.disciplina ?? t.disciplina ?? g.disciplina ?? null,
          codigo: String(d.codigo),
          atividade: d.descricao,
          local: d.local ?? null,
          qtde: qD,
          mat_unit: matU,
          mat_total: qD * matU,
          mo_unit: moU,
          mo_total: qD * moU,
          total: Number(d.valor_total) || qD * (matU + moU),
        })
      }
    }
  }
  return out
}

const NIVEL_CLASS: Record<number, string> = {
  1: 'bg-[#0B1220] font-bold text-[#F1F5F9] border-l-2 border-l-blue-500',
  2: 'bg-[#0D1421] text-[#E2E8F0]',
  3: 'text-[#94A3B8]',
}

export function EstruturaTable({ estrutura }: Props) {
  const allRows = useMemo(() => flatten(estrutura), [estrutura])

  // Filtros por coluna
  const [filters, setFilters] = useState<{
    disciplina: string
    codigo: string
    atividade: string
    local: string
    nivel: string
  }>({ disciplina: '', codigo: '', atividade: '', local: '', nivel: '' })

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  function toggleSort(k: keyof FlatRow) {
    if (sortKey !== k) { setSortKey(k); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    if (sortDir === 'desc') { setSortKey(null); setSortDir(null); return }
    setSortDir('asc')
  }

  const filtered = useMemo(() => {
    let r = allRows
    const f = filters
    if (f.nivel) r = r.filter(x => String(x.nivel) === f.nivel)
    if (f.disciplina) r = r.filter(x => (x.disciplina || '').toLowerCase().includes(f.disciplina.toLowerCase()))
    if (f.codigo) r = r.filter(x => x.codigo.toLowerCase().includes(f.codigo.toLowerCase()))
    if (f.atividade) r = r.filter(x => x.atividade.toLowerCase().includes(f.atividade.toLowerCase()))
    if (f.local) r = r.filter(x => (x.local || '').toLowerCase().includes(f.local.toLowerCase()))

    if (sortKey && sortDir) {
      r = [...r].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey]
        if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
        const sa = String(va ?? ''), sb = String(vb ?? '')
        // tentar ordenação natural por código (1, 1.1, 1.1.1, 2, ...)
        if (sortKey === 'codigo') {
          const pa = sa.split('.').map(Number)
          const pb = sb.split('.').map(Number)
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] ?? 0, nb = pb[i] ?? 0
            if (na !== nb) return sortDir === 'asc' ? na - nb : nb - na
          }
          return 0
        }
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
      })
    }
    return r
  }, [allRows, filters, sortKey, sortDir])

  // Para subtotal, considerar apenas linhas nível 3 (evita double-counting)
  // ou, se usuário filtrou por nível, usar as linhas exibidas
  const subtotal = useMemo(() => {
    const only3 = filtered.filter(r => r.nivel === 3)
    const rows = only3.length > 0 ? only3 : filtered.filter(r => r.nivel === (filters.nivel ? Number(filters.nivel) : r.nivel))
    return rows.reduce((s, r) => s + (r.total || 0), 0)
  }, [filtered, filters.nivel])

  const totalGeral = useMemo(
    () => allRows.filter(r => r.nivel === 3).reduce((s, r) => s + (r.total || 0), 0),
    [allRows]
  )

  const SortIcon = ({ k }: { k: keyof FlatRow }) =>
    sortKey !== k ? <ArrowUpDown className="w-3 h-3 opacity-40" />
    : sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" />
    : <ArrowDown className="w-3 h-3 text-blue-400" />

  const Th = ({
    label, k, numeric, filterField,
  }: {
    label: string; k: keyof FlatRow; numeric?: boolean; filterField?: keyof typeof filters
  }) => (
    <th className={`text-left px-2 py-1.5 sticky top-0 bg-[#0B1220] z-10 border-b border-[#1E293B] ${numeric ? 'text-right' : ''}`}>
      <button
        type="button"
        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] hover:text-[#F1F5F9] ${numeric ? 'justify-end w-full' : ''}`}
        onClick={() => toggleSort(k)}
      >
        {label} <SortIcon k={k} />
      </button>
      {filterField && (
        <Input
          value={filters[filterField]}
          onChange={e => setFilters(f => ({ ...f, [filterField]: e.target.value }))}
          placeholder="filtrar..."
          className="mt-1 h-6 text-[11px] bg-[#0D1421] border-[#1E293B] text-[#F1F5F9] px-1.5"
        />
      )}
    </th>
  )

  return (
    <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1E293B] text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[#94A3B8]">Nível:</span>
          <select
            className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] text-xs rounded px-2 py-1"
            value={filters.nivel}
            onChange={e => setFilters(f => ({ ...f, nivel: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="1">1 — Grupos Macro</option>
            <option value="2">2 — Tarefas</option>
            <option value="3">3 — Detalhamentos</option>
          </select>
          {(filters.disciplina || filters.codigo || filters.atividade || filters.local || filters.nivel) && (
            <button
              type="button"
              onClick={() => setFilters({ disciplina: '', codigo: '', atividade: '', local: '', nivel: '' })}
              className="text-blue-400 hover:text-blue-300"
            >Limpar filtros</button>
          )}
        </div>
        <span className="text-[#94A3B8]">{filtered.length} linhas</span>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <Th label="Nível"      k="nivel" />
              <Th label="Disciplina" k="disciplina" filterField="disciplina" />
              <Th label="Item"       k="codigo"     filterField="codigo" />
              <Th label="Atividade"  k="atividade"  filterField="atividade" />
              <Th label="Local"      k="local"      filterField="local" />
              <Th label="Qtde"       k="qtde"       numeric />
              <Th label="Unit. MAT"  k="mat_unit"   numeric />
              <Th label="Total MAT"  k="mat_total"  numeric />
              <Th label="Unit. MO"   k="mo_unit"    numeric />
              <Th label="Total MO"   k="mo_total"   numeric />
              <Th label="Total"      k="total"      numeric />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.codigo}-${r.nivel}-${i}`} className={`border-b border-[#1E293B] hover:bg-[#0D1421] ${NIVEL_CLASS[r.nivel]}`}>
                <td className="px-2 py-1 font-mono text-[10px] text-[#475569]">N{r.nivel}</td>
                <td className="px-2 py-1">{r.disciplina || '—'}</td>
                <td className="px-2 py-1 font-mono">{r.codigo}</td>
                <td className="px-2 py-1">{r.atividade}</td>
                <td className="px-2 py-1 text-[#94A3B8]">{r.local || '—'}</td>
                <td className="px-2 py-1 text-right">{r.qtde.toLocaleString('pt-BR')}</td>
                <td className="px-2 py-1 text-right">{formatCurrency(r.mat_unit)}</td>
                <td className="px-2 py-1 text-right">{formatCurrency(r.mat_total)}</td>
                <td className="px-2 py-1 text-right">{formatCurrency(r.mo_unit)}</td>
                <td className="px-2 py-1 text-right">{formatCurrency(r.mo_total)}</td>
                <td className="px-2 py-1 text-right font-semibold">{formatCurrency(r.total)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-[#475569]">Nenhum item com os filtros atuais.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 border-t border-[#1E293B] bg-[#0D1421] flex items-center justify-between text-xs">
        <span className="text-[#94A3B8]">
          {filtered.length < allRows.length ? 'Subtotal filtrado' : 'Total geral'} (nível 3):
        </span>
        <div className="flex gap-4">
          <span className="text-[#F1F5F9]">Filtrado: <strong>{formatCurrency(subtotal)}</strong></span>
          <span className="text-[#475569]">Total: <strong>{formatCurrency(totalGeral)}</strong></span>
        </div>
      </div>
    </div>
  )
}
