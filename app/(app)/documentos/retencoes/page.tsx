'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { ColumnFilter, passaFiltro } from '@/components/ui/column-filter'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import { useTableLayout, type ColumnDef } from '@/lib/hooks/use-table-layout'
import {
  TrendingUp, FileText, Loader2, Download, ChevronUp, ChevronDown, ChevronsUpDown, RotateCcw,
  ArrowRight, Calendar,
} from 'lucide-react'

interface LinhaRelatorio {
  medicao_id: string
  numero: number
  periodo_referencia: string
  data_aprovacao: string
  contrato: {
    id: string | null
    numero: string
    valor_total: number
    valor_servicos: number
    percentual_retencao: number
  }
  valor_medido: number
  andamento_fisico_pct: number
  valor_financeiro_proporcional: number
  valor_retencao: number
  liquido_a_pagar: number
  aprovador_nome: string | null
}

interface ResumoContrato {
  contrato_id: string | null
  contrato_numero: string
  total_retencao: number
  total_medido: number
  qtd_medicoes: number
}

interface RespostaRelatorio {
  linhas: LinhaRelatorio[]
  por_contrato: ResumoContrato[]
  total_geral: {
    retencao: number
    medido: number
    qtd_medicoes: number
    qtd_contratos: number
  }
}

function pctFmt(v: number, casas = 2): string {
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(casas).replace('.', ',')}%`
}

export default function RelatorioRetencoesPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RespostaRelatorio | null>(null)
  const [filtroContratoId, setFiltroContratoId] = useState<string>('')
  const [dataDe, setDataDe] = useState<string>('')
  const [dataAte, setDataAte] = useState<string>('')

  // Filtros estilo Excel por coluna
  const [fContrato, setFContrato] = useState<Set<string>>(new Set())
  const [fNumero, setFNumero] = useState<Set<string>>(new Set())
  const [fPeriodo, setFPeriodo] = useState<Set<string>>(new Set())
  const [fAprovador, setFAprovador] = useState<Set<string>>(new Set())

  function carregar() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filtroContratoId) qs.set('contrato_id', filtroContratoId)
    if (dataDe) qs.set('de', dataDe)
    if (dataAte) qs.set('ate', dataAte)
    fetch(`/api/relatorios/retencoes${qs.toString() ? '?' + qs.toString() : ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [filtroContratoId, dataDe, dataAte])

  const linhas = data?.linhas || []
  const totalGeral = data?.total_geral || { retencao: 0, medido: 0, qtd_medicoes: 0, qtd_contratos: 0 }
  const porContrato = data?.por_contrato || []

  const valoresUnicos = useMemo(() => ({
    contrato:  [...new Set(linhas.map(l => l.contrato.numero))],
    numero:    [...new Set(linhas.map(l => `MED-${String(l.numero).padStart(3, '0')}`))],
    periodo:   [...new Set(linhas.map(l => l.periodo_referencia))],
    aprovador: [...new Set(linhas.map(l => l.aprovador_nome || '—'))],
  }), [linhas])

  const linhasFiltradas = useMemo(() => linhas.filter(l =>
    passaFiltro(fContrato,  l.contrato.numero) &&
    passaFiltro(fNumero,    `MED-${String(l.numero).padStart(3, '0')}`) &&
    passaFiltro(fPeriodo,   l.periodo_referencia) &&
    passaFiltro(fAprovador, l.aprovador_nome || '—')
  ), [linhas, fContrato, fNumero, fPeriodo, fAprovador])

  // ── Layout (sort + resize) com persistência ───────────────────
  type ColKey =
    | 'contrato' | 'numero' | 'periodo' | 'data_aprovacao'
    | 'valor_medido' | 'andamento_fisico' | 'valor_proporcional'
    | 'pct_retencao' | 'valor_retencao' | 'liquido' | 'aprovador'

  const colunas = useMemo<ColumnDef<ColKey>[]>(() => [
    { key: 'contrato',           defaultWidth: 130, min: 100, type: 'string' },
    { key: 'numero',             defaultWidth: 110, min: 90,  type: 'string' },
    { key: 'periodo',            defaultWidth: 100, min: 80,  type: 'string' },
    { key: 'data_aprovacao',     defaultWidth: 110, min: 90,  type: 'date'   },
    { key: 'valor_medido',       defaultWidth: 130, min: 100, type: 'number' },
    { key: 'andamento_fisico',   defaultWidth: 110, min: 90,  type: 'number' },
    { key: 'valor_proporcional', defaultWidth: 150, min: 110, type: 'number' },
    { key: 'pct_retencao',       defaultWidth: 90,  min: 70,  type: 'number' },
    { key: 'valor_retencao',     defaultWidth: 140, min: 110, type: 'number' },
    { key: 'liquido',            defaultWidth: 140, min: 110, type: 'number' },
    { key: 'aprovador',          defaultWidth: 160, min: 120, type: 'string' },
  ], [])

  const { sortKey, sortDir, gridTemplateColumns, toggleSort, startResize, reset, compare } =
    useTableLayout<ColKey>('relatorio-retencoes:tabela:v1', colunas, '48px')

  const linhasOrdenadas = useMemo(() => {
    if (!sortKey || !sortDir) return linhasFiltradas
    const arr = [...linhasFiltradas]
    arr.sort((a, b) => {
      const get = (l: LinhaRelatorio): any => {
        switch (sortKey) {
          case 'contrato':           return l.contrato.numero
          case 'numero':             return l.numero
          case 'periodo':            return l.periodo_referencia
          case 'data_aprovacao':     return l.data_aprovacao
          case 'valor_medido':       return l.valor_medido
          case 'andamento_fisico':   return l.andamento_fisico_pct
          case 'valor_proporcional': return l.valor_financeiro_proporcional
          case 'pct_retencao':       return l.contrato.percentual_retencao
          case 'valor_retencao':     return l.valor_retencao
          case 'liquido':            return l.liquido_a_pagar
          case 'aprovador':          return l.aprovador_nome ?? ''
        }
      }
      const r = compare({ [sortKey]: get(a) }, { [sortKey]: get(b) }, sortKey)
      return sortDir === 'asc' ? r : -r
    })
    return arr
  }, [linhasFiltradas, sortKey, sortDir, compare])

  const COL_LABELS: Record<ColKey, string> = {
    contrato: 'Contrato', numero: 'Medição', periodo: 'Período', data_aprovacao: 'Data aprov.',
    valor_medido: 'Valor medido', andamento_fisico: 'Andamento %',
    valor_proporcional: 'Proporcional', pct_retencao: '% Ret.',
    valor_retencao: 'Retenção', liquido: 'Líquido', aprovador: 'Aprovador',
  }

  const filtroPorColuna: Partial<Record<ColKey, { values: string[]; selected: Set<string>; onChange: (s: Set<string>) => void }>> = {
    contrato:  { values: valoresUnicos.contrato,  selected: fContrato,  onChange: setFContrato },
    numero:    { values: valoresUnicos.numero,    selected: fNumero,    onChange: setFNumero },
    periodo:   { values: valoresUnicos.periodo,   selected: fPeriodo,   onChange: setFPeriodo },
    aprovador: { values: valoresUnicos.aprovador, selected: fAprovador, onChange: setFAprovador },
  }

  const totalRetencaoFiltrado = linhasOrdenadas.reduce((s, l) => s + l.valor_retencao, 0)
  const totalMedidoFiltrado = linhasOrdenadas.reduce((s, l) => s + l.valor_medido, 0)

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar title="Retenção Contratual" subtitle="Relatório consolidado de retenções de medições aprovadas" />

      <div className="p-4 sm:p-6 space-y-5">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid rgba(99,102,241,0.30)' }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Total Retido</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.30)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: '#818CF8' }} strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-xl font-black" style={{ color: '#818CF8' }}>{formatCurrency(totalGeral.retencao)}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>desde o início das obras</p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Total Medido</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.30)' }}>
                <FileText className="w-4 h-4" style={{ color: '#10B981' }} strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-xl font-black" style={{ color: '#10B981' }}>{formatCurrency(totalGeral.medido)}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{totalGeral.qtd_medicoes} medição{totalGeral.qtd_medicoes !== 1 ? 'ões' : ''} aprovada{totalGeral.qtd_medicoes !== 1 ? 's' : ''}</p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>% Retido</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.30)' }}>
                <TrendingUp className="w-4 h-4" style={{ color: '#F59E0B' }} strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-xl font-black" style={{ color: '#F59E0B' }}>
              {totalGeral.medido > 0 ? pctFmt((totalGeral.retencao / totalGeral.medido) * 100) : '—'}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>retenção / medido</p>
          </div>

          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Contratos</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.30)' }}>
                <FileText className="w-4 h-4" style={{ color: '#3B82F6' }} strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-xl font-black" style={{ color: '#3B82F6' }}>{totalGeral.qtd_contratos}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>com retenção registrada</p>
          </div>
        </div>

        {/* Resumo por contrato (chips clicáveis pra filtrar) */}
        {porContrato.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-3)' }}>
              Por contrato (click para filtrar)
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFiltroContratoId('')}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: !filtroContratoId ? '#818CF8' : 'var(--surface-2)',
                  color: !filtroContratoId ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${!filtroContratoId ? '#818CF8' : 'var(--border)'}`,
                }}
              >
                Todos
              </button>
              {porContrato.map(c => (
                <button
                  key={c.contrato_id || '__sem__'}
                  onClick={() => setFiltroContratoId(filtroContratoId === c.contrato_id ? '' : (c.contrato_id || ''))}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                  style={{
                    background: filtroContratoId === c.contrato_id ? '#818CF8' : 'var(--surface-2)',
                    color: filtroContratoId === c.contrato_id ? '#fff' : 'var(--text-2)',
                    border: `1px solid ${filtroContratoId === c.contrato_id ? '#818CF8' : 'var(--border)'}`,
                  }}
                >
                  <span className="font-mono font-bold">{c.contrato_numero}</span>
                  <span className="opacity-80">·</span>
                  <span>{formatCurrency(c.total_retencao)}</span>
                  <span className="text-[10px] opacity-70">({c.qtd_medicoes})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtros de período */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-semibold block mb-1" style={{ color: 'var(--text-3)' }}>
              <Calendar className="w-3 h-3 inline mr-1" /> De
            </label>
            <input
              type="date" value={dataDe} onChange={e => setDataDe(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide font-semibold block mb-1" style={{ color: 'var(--text-3)' }}>Até</label>
            <input
              type="date" value={dataAte} onChange={e => setDataAte(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>
          {(dataDe || dataAte) && (
            <button onClick={() => { setDataDe(''); setDataAte('') }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              Limpar período
            </button>
          )}
        </div>

        {/* Tabela */}
        <MaximizableCard title="Medições com retenção" className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {linhasOrdenadas.length} de {linhas.length} medição{linhas.length !== 1 ? 'ões' : ''}
              {sortKey && sortDir && (
                <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-3)' }}>
                  · ordenado por <strong>{COL_LABELS[sortKey]}</strong> ({sortDir === 'asc' ? '↑' : '↓'})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportCsv(
                  `retencoes-${new Date().toISOString().slice(0, 10)}`,
                  linhasOrdenadas,
                  [
                    { header: 'Contrato',       get: (l: any) => l.contrato.numero },
                    { header: 'Medição',        get: (l: any) => `MED-${String(l.numero).padStart(3, '0')}` },
                    { header: 'Período',        get: (l: any) => l.periodo_referencia },
                    { header: 'Data Aprovação', get: (l: any) => l.data_aprovacao ? formatDate(l.data_aprovacao) : '' },
                    { header: 'Valor Medido',                  get: (l: any) => Number(l.valor_medido) },
                    { header: 'Andamento Físico %',            get: (l: any) => Number(l.andamento_fisico_pct) },
                    { header: 'Valor Financeiro Proporcional', get: (l: any) => Number(l.valor_financeiro_proporcional) },
                    { header: '% Retenção',                    get: (l: any) => Number(l.contrato.percentual_retencao) },
                    { header: 'Retenção',     get: (l: any) => Number(l.valor_retencao) },
                    { header: 'Líquido',      get: (l: any) => Number(l.liquido_a_pagar) },
                    { header: 'Aprovador',    get: (l: any) => l.aprovador_nome || '' },
                  ],
                )}
                disabled={linhasOrdenadas.length === 0}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40"
                style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium"
                style={{ color: 'var(--text-3)' }}
                title="Volta larguras e ordenação ao padrão"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={2} /> Resetar layout
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {/* Header */}
            <div
              className="grid text-[11px] font-semibold uppercase tracking-wide sticky top-0 z-10"
              style={{
                gridTemplateColumns,
                background: 'var(--surface-3)',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-3)',
                minWidth: 'max-content',
              }}
            >
              {colunas.map(col => {
                const filtro = filtroPorColuna[col.key]
                const isActive = sortKey === col.key
                const isNumeric = col.type === 'number'
                return (
                  <div
                    key={col.key}
                    className="relative flex items-center gap-1 px-3 py-2.5 select-none"
                    style={{
                      borderRight: '1px solid var(--border)',
                      background: isActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined,
                      justifyContent: isNumeric ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 truncate"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }}>
                      <span className="truncate">{COL_LABELS[col.key]}</span>
                      {isActive
                        ? (sortDir === 'asc'
                            ? <ChevronUp className="w-3 h-3" strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
                            : <ChevronDown className="w-3 h-3" strokeWidth={2.5} style={{ color: 'var(--accent)' }} />)
                        : <ChevronsUpDown className="w-3 h-3 opacity-40" strokeWidth={2} />}
                    </button>
                    {filtro && (
                      <ColumnFilter
                        label={COL_LABELS[col.key]}
                        values={filtro.values}
                        selected={filtro.selected}
                        onChange={filtro.onChange}
                      />
                    )}
                    <span
                      onMouseDown={e => startResize(col.key, e)}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    />
                  </div>
                )
              })}
              <div className="px-2 py-2.5 text-center">·</div>
            </div>

            {/* Linhas */}
            {loading ? (
              <div className="flex justify-center py-12" style={{ color: 'var(--text-3)' }}>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...
              </div>
            ) : linhasOrdenadas.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
                <p className="text-sm" style={{ color: 'var(--text-3)' }}>Nenhuma medição com retenção encontrada.</p>
              </div>
            ) : linhasOrdenadas.map((l, idx) => (
              <div
                key={l.medicao_id}
                className="grid transition-colors"
                style={{
                  gridTemplateColumns,
                  background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'stretch',
                  minWidth: 'max-content',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}
              >
                <div className="flex items-center px-3 py-2.5 text-xs font-mono break-words" style={{ color: 'var(--text-1)', borderRight: '1px solid var(--border)' }}>
                  {l.contrato.numero}
                </div>
                <div className="flex items-center px-3 py-2.5 text-xs font-bold font-mono break-all" style={{ color: 'var(--accent)', borderRight: '1px solid var(--border)' }}>
                  MED-{String(l.numero).padStart(3, '0')}
                </div>
                <div className="flex items-center px-3 py-2.5 text-xs" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                  {l.periodo_referencia}
                </div>
                <div className="flex items-center px-3 py-2.5 text-xs" style={{ color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
                  {l.data_aprovacao ? formatDate(l.data_aprovacao) : '—'}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-1)', borderRight: '1px solid var(--border)' }}>
                  {formatCurrency(l.valor_medido)}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs tabular-nums" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                  {pctFmt(l.andamento_fisico_pct)}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs tabular-nums" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                  {formatCurrency(l.valor_financeiro_proporcional)}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs tabular-nums" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                  {pctFmt(l.contrato.percentual_retencao)}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: '#818CF8', borderRight: '1px solid var(--border)' }}>
                  {formatCurrency(l.valor_retencao)}
                </div>
                <div className="flex items-center justify-end px-3 py-2.5 text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: '#10B981', borderRight: '1px solid var(--border)' }}>
                  {formatCurrency(l.liquido_a_pagar)}
                </div>
                <div className="flex items-center px-3 py-2.5 text-xs break-words" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
                  {l.aprovador_nome || '—'}
                </div>
                <div className="flex items-center justify-center px-2 py-2.5">
                  {l.contrato.id && (
                    <Link href={`/contratos/${l.contrato.id}/medicoes/${l.medicao_id}`} title="Abrir medição">
                      <button className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all" style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer com totais filtrados */}
          {linhasOrdenadas.length > 0 && (
            <div className="grid text-xs font-bold tabular-nums px-4 py-3"
              style={{ gridTemplateColumns, background: 'var(--surface-3)', borderTop: '2px solid var(--border)', color: 'var(--text-1)' }}>
              <div className="px-3 col-span-4 flex items-center" style={{ gridColumn: 'span 4' }}>
                Total filtrado ({linhasOrdenadas.length})
              </div>
              <div className="text-right px-3" style={{ color: 'var(--text-2)' }}>{formatCurrency(totalMedidoFiltrado)}</div>
              <div className="px-3"></div>
              <div className="px-3"></div>
              <div className="px-3"></div>
              <div className="text-right px-3" style={{ color: '#818CF8' }}>{formatCurrency(totalRetencaoFiltrado)}</div>
              <div className="text-right px-3" style={{ color: '#10B981' }}>{formatCurrency(totalMedidoFiltrado - totalRetencaoFiltrado)}</div>
              <div className="px-3"></div>
              <div className="px-3"></div>
            </div>
          )}
        </MaximizableCard>
      </div>
    </div>
  )
}
