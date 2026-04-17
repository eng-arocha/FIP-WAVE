'use client'

import { use, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, TrendingUp, Calendar, Pencil, Lock, Save, ChevronRight, ChevronDown, Download, Upload } from 'lucide-react'
import { EditableGridCell, GridCellCoordinator, parseNumber } from '@/components/shared/editable-grid-cell'

interface CurvaSPoint {
  mes: string
  planejado_fisico: number
  planejado_fatd: number
  planejado_total: number
  realizado_fisico: number
  realizado_fatd: number
  realizado_total: number
  planejado_fisico_acum: number
  planejado_fatd_acum: number
  planejado_total_acum: number
  realizado_fisico_acum: number
  realizado_fatd_acum: number
  realizado_total_acum: number
}

interface Det {
  id: string
  codigo: string
  descricao: string
  quantidade_contratada: number
  valor_material_unit: number
  valor_servico_unit: number
  peso_servico: number
  peso_material: number
}
interface Tarefa {
  id: string; codigo: string; nome: string
  valor_servico: number; valor_material: number
  detalhamentos: Det[]
}
interface Grupo {
  id: string; codigo: string; nome: string
  valor_servico: number; valor_material: number
  tarefas: Tarefa[]
}
interface Matriz {
  grupos: Grupo[]
  meses: string[]
  fisico: Record<string, Record<string, number>>     // det_id → mes → pct
  fatdireto: Record<string, Record<string, number>>
  contrato: { valor_servicos: number; valor_material_direto: number }
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  const months = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m)]}/${y.slice(2)}`
}

type Tipo = 'fisico' | 'fatdireto'

export default function CronogramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<CurvaSPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'acumulado' | 'mensal'>('acumulado')
  const [tipo, setTipo] = useState<'total' | 'servico' | 'material'>('total')

  const [matriz, setMatriz] = useState<Matriz | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [savingMsg, setSavingMsg] = useState<string>('')

  useEffect(() => {
    fetch(`/api/contratos/${id}/cronograma`).then(r => r.json()).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
  }, [id])

  useEffect(() => {
    fetch(`/api/contratos/${id}/cronograma/matriz`).then(r => r.json()).then(m => setMatriz(m))
  }, [id])

  useEffect(() => {
    fetch('/api/auth/me/permissoes').then(r => r.json()).then(p => {
      const can = p.isAdmin || (p.permissoes || []).some((x: any) => x.modulo === 'cronograma' && x.acao === 'editar')
      setCanEdit(!!can)
    }).catch(() => setCanEdit(false))
  }, [])

  const chartData = data.map(d => {
    const suffix = view === 'acumulado' ? '_acum' : ''
    const planKey = tipo === 'total' ? `planejado_total${suffix}` : tipo === 'servico' ? `planejado_fisico${suffix}` : `planejado_fatd${suffix}`
    const realKey = tipo === 'total' ? `realizado_total${suffix}` : tipo === 'servico' ? `realizado_fisico${suffix}` : `realizado_fatd${suffix}`
    return { mes: formatMes(d.mes), 'Planejado': (d as any)[planKey] ?? 0, 'Realizado': (d as any)[realKey] ?? 0 }
  })

  const lastPoint = data[data.length - 1]
  const totalPlanejado = lastPoint?.planejado_total_acum ?? 0
  const totalPlanejadoFis = lastPoint?.planejado_fisico_acum ?? 0
  const totalPlanejadoFatD = lastPoint?.planejado_fatd_acum ?? 0

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Cronograma Físico-Financeiro" />
      <div className="flex-1 p-3 sm:p-6 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href={`/contratos/${id}`}>
            <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
              <ArrowLeft className="w-4 h-4" /> Contrato
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Cronograma Físico-Financeiro
            </h1>
            <p className="text-sm text-[var(--text-3)]">
              Preenchimento no nível 3 (detalhamento). Níveis 1 e 2 são rollups automáticos ponderados pelo orçamento.
            </p>
          </div>
          {canEdit ? (
            <Button size="sm" onClick={() => setEditMode(v => !v)} className={editMode ? 'gap-2 bg-blue-600 hover:bg-blue-700' : 'gap-2'} variant={editMode ? 'default' : 'outline'}>
              {editMode ? <><Save className="w-4 h-4" /> Concluir edição</> : <><Pencil className="w-4 h-4" /> Editar cronograma</>}
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[var(--text-3)]"><Lock className="w-3.5 h-3.5" />Somente admin / autorizados podem editar</div>
          )}
          {savingMsg && <span className="text-xs text-[var(--text-3)]">{savingMsg}</span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Total Planejado</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalPlanejado)}</p>
            </CardContent>
          </Card>
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Serviço Planejado</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(totalPlanejadoFis)}</p>
            </CardContent>
          </Card>
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Material Planejado</p>
              <p className="text-xl font-bold text-cyan-400">{formatCurrency(totalPlanejadoFatD)}</p>
            </CardContent>
          </Card>
        </div>

        {matriz && matriz.grupos.length > 0 && matriz.meses.length > 0 && (
          <>
            <CronogramaTreeMatriz contratoId={id} tipo="fisico" title="Físico — % por Detalhamento/Mês (rollups em grupo e tarefa)" matriz={matriz} editMode={editMode} canEdit={canEdit} setMatriz={setMatriz} setSavingMsg={setSavingMsg} refetchMatriz={() => fetch(`/api/contratos/${id}/cronograma/matriz`).then(r => r.json()).then(setMatriz)} />
            <CronogramaTreeMatriz contratoId={id} tipo="fatdireto" title="Fat. Direto — % por Detalhamento/Mês (rollups em grupo e tarefa)" matriz={matriz} editMode={editMode} canEdit={canEdit} setMatriz={setMatriz} setSavingMsg={setSavingMsg} refetchMatriz={() => fetch(`/api/contratos/${id}/cronograma/matriz`).then(r => r.json()).then(setMatriz)} />
          </>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['acumulado', 'mensal'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{ background: view === v ? 'rgba(59,130,246,0.20)' : 'transparent', color: view === v ? 'var(--accent)' : 'var(--text-3)' }}>
                {v === 'acumulado' ? 'Curva S (Acum.)' : 'Mensal'}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['total', 'Total'], ['servico', 'Serviço'], ['material', 'Material']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTipo(v)} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{ background: tipo === v ? 'rgba(59,130,246,0.20)' : 'transparent', color: tipo === v ? 'var(--accent)' : 'var(--text-3)' }}>{label}</button>
            ))}
          </div>
        </div>

        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Curva S — {view === 'acumulado' ? 'Acumulado' : 'Mensal'} · {tipo === 'total' ? 'Total' : tipo === 'servico' ? 'Serviço (MDO)' : 'Material (Fat. Direto)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">Carregando dados...</div>
            ) : chartData.length === 0 ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">Nenhum dado — preencha a matriz acima para visualizar a Curva S.</div>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.25} /><stop offset="95%" stopColor="#10B981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1e6).toFixed(1)}M`} width={60} />
                  <Tooltip contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-1)' }} formatter={(value: any) => formatCurrency(Number(value))} labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }} />
                  <Legend wrapperStyle={{ paddingTop: 16 }} formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{v}</span>} />
                  <Area type="monotone" dataKey="Planejado" stroke="#3B82F6" strokeWidth={2} fill="url(#colorPlan)" dot={false} activeDot={{ r: 4, fill: '#3B82F6' }} />
                  <Area type="monotone" dataKey="Realizado" stroke="#10B981" strokeWidth={2} fill="url(#colorReal)" dot={false} activeDot={{ r: 4, fill: '#10B981' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {!loading && data.length > 0 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <Calendar className="w-4 h-4 text-blue-400" />
                Desembolso Mensal Planejado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-2.5 text-left text-[var(--text-3)] font-semibold uppercase tracking-wide">Mês</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Serviço</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Material</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Total</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Acum. Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.mes} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-2.5 text-[var(--text-2)] font-medium">{formatMes(row.mes)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: 'var(--accent)' }}>{formatCurrency(row.planejado_fisico)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: 'var(--accent-glow)' }}>{formatCurrency(row.planejado_fatd)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--text-1)' }}>{formatCurrency(row.planejado_total)}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-2)]">{formatCurrency(row.planejado_total_acum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ============================================================ *
 * Matriz em árvore (grupo → tarefa → detalhamento × mês)       *
 * Editável APENAS no nível detalhamento. Grupos e tarefas      *
 * exibem rollup ponderado pelos pesos (qtd×valor unit).         *
 * ============================================================ */

function CronogramaTreeMatriz({
  contratoId, tipo, title, matriz, editMode, canEdit, setMatriz, setSavingMsg, refetchMatriz,
}: {
  contratoId: string
  tipo: Tipo
  title: string
  matriz: Matriz
  editMode: boolean
  canEdit: boolean
  setMatriz: (fn: (prev: Matriz | null) => Matriz | null) => void
  setSavingMsg: (s: string) => void
  refetchMatriz: () => void | Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setSavingMsg('Importando planilha…')
    const fd = new FormData()
    fd.append('file', file)
    try {
      // Endpoint unificado: processa as 3 abas (Orcamento + Fisico + FatDireto) se presentes.
      const r = await fetch(`/api/contratos/${contratoId}/planilha/upload`, { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) { setSavingMsg(`Erro no upload: ${j.error || r.status}`); return }
      const o = j.orcamento || {}, cr = j.cronograma || {}
      const parts: string[] = []
      parts.push(`Tipo: ${j.tipo_detectado === 'fisico' ? 'Físico' : 'Fat Direto'}`)
      if (o.atualizados) parts.push(`Orçamento: ${o.atualizados}${o.falhas ? ` (${o.falhas} falhas)` : ''}`)
      if (cr.celulas)    parts.push(`Cronograma: ${cr.celulas} célula(s)`)
      setSavingMsg(`Importado · ${parts.join(' · ')}`)
      await refetchMatriz()
      setTimeout(() => setSavingMsg(''), 5000)
    } catch (e: any) { setSavingMsg(`Erro: ${e?.message || e}`) }
  }
  const { grupos, meses } = matriz
  const mapa = tipo === 'fisico' ? matriz.fisico : matriz.fatdireto
  const pesoField: 'peso_servico' | 'peso_material' = tipo === 'fisico' ? 'peso_servico' : 'peso_material'
  const grupoPesoField: 'valor_servico' | 'valor_material' = tipo === 'fisico' ? 'valor_servico' : 'valor_material'

  // Expand state (default: grupos + tarefas colapsados)
  const [openGrupo, setOpenGrupo] = useState<Record<string, boolean>>({})
  const [openTarefa, setOpenTarefa] = useState<Record<string, boolean>>({})

  function toggleGrupo(id: string) { setOpenGrupo(s => ({ ...s, [id]: !s[id] })) }
  function toggleTarefa(id: string) { setOpenTarefa(s => ({ ...s, [id]: !s[id] })) }

  // Pct helpers
  const detPct = (detId: string, mes: string) => mapa[detId]?.[mes] ?? 0

  function tarefaPct(t: Tarefa, mes: string): { pct: number; peso: number } {
    let soma = 0, pesoT = 0
    for (const d of t.detalhamentos) {
      const p = d[pesoField]
      pesoT += p
      soma += detPct(d.id, mes) * p
    }
    return { pct: pesoT > 0 ? soma / pesoT : 0, peso: pesoT }
  }
  function grupoPct(g: Grupo, mes: string): { pct: number; peso: number } {
    let soma = 0, pesoG = 0
    for (const t of g.tarefas) {
      for (const d of t.detalhamentos) {
        const p = d[pesoField]
        pesoG += p
        soma += detPct(d.id, mes) * p
      }
    }
    return { pct: pesoG > 0 ? soma / pesoG : 0, peso: pesoG }
  }

  // Coordinator ───────────────────────────────────────────────
  const cellsRef = useRef<Map<string, { rowIdx: number; colIdx: number; el: HTMLInputElement }>>(new Map())
  const orderRef = useRef<string[]>([])
  const rebuildOrder = useCallback(() => {
    const keys: { k: string; r: number; c: number }[] = []
    cellsRef.current.forEach((v, k) => keys.push({ k, r: v.rowIdx, c: v.colIdx }))
    keys.sort((a, b) => a.r === b.r ? a.c - b.c : a.r - b.r)
    orderRef.current = keys.map(x => x.k)
  }, [])

  // Build flat list of visible detalhamentos for row indexing (tree order)
  const visibleDets: { detId: string; row: number }[] = useMemo(() => {
    const out: { detId: string; row: number }[] = []
    let row = 0
    for (const g of grupos) {
      if (!openGrupo[g.id]) continue
      for (const t of g.tarefas) {
        if (!openTarefa[t.id]) continue
        for (const d of t.detalhamentos) {
          out.push({ detId: d.id, row })
          row++
        }
      }
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos, openGrupo, openTarefa])

  const setLocalPct = useCallback((detId: string, mes: string, pct: number) => {
    setMatriz(prev => {
      if (!prev) return prev
      const target = tipo === 'fisico' ? { ...prev.fisico } : { ...prev.fatdireto }
      target[detId] = { ...(target[detId] || {}), [mes]: pct }
      return tipo === 'fisico' ? { ...prev, fisico: target } : { ...prev, fatdireto: target }
    })
  }, [setMatriz, tipo])

  async function sendBulk(updates: { detalhamento_id: string; mes: string; pct_planejado: number }[]) {
    if (updates.length === 0) return
    setSavingMsg('Salvando…')
    try {
      const r = await fetch(`/api/contratos/${contratoId}/cronograma/bulk`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, updates }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        setSavingMsg(`Erro: ${err.error ? JSON.stringify(err.error) : r.status}`)
      } else {
        const j = await r.json()
        setSavingMsg(`Salvo: ${j.atualizados} célula(s)`)
        setTimeout(() => setSavingMsg(''), 2500)
      }
    } catch (e: any) { setSavingMsg(`Erro: ${e?.message || e}`) }
  }

  const coord: GridCellCoordinator = useMemo(() => ({
    editMode,
    register(key, meta, el) { cellsRef.current.set(key, { ...meta, el }); rebuildOrder() },
    unregister(key) { cellsRef.current.delete(key); rebuildOrder() },
    focusNext(key, dir) {
      const cur = cellsRef.current.get(key); if (!cur) return
      const { rowIdx, colIdx } = cur
      let target: string | undefined
      if (dir === 'down' || dir === 'up') {
        const want = rowIdx + (dir === 'down' ? 1 : -1)
        cellsRef.current.forEach((v, k) => { if (v.rowIdx === want && v.colIdx === colIdx) target = k })
      } else if (dir === 'left' || dir === 'right') {
        const want = colIdx + (dir === 'right' ? 1 : -1)
        cellsRef.current.forEach((v, k) => { if (v.rowIdx === rowIdx && v.colIdx === want) target = k })
      } else {
        const idx = orderRef.current.indexOf(key)
        target = orderRef.current[idx + (dir === 'next' ? 1 : -1)]
      }
      if (target) cellsRef.current.get(target)?.el.focus()
    },
    onPasteMatrix(anchorKey, rows) {
      const anchor = cellsRef.current.get(anchorKey); if (!anchor) return
      const updates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const targetRow = anchor.rowIdx + r
          const targetCol = anchor.colIdx + c
          if (targetCol >= meses.length) continue
          const det = visibleDets.find(v => v.row === targetRow)
          if (!det) continue
          const mes = meses[targetCol]
          const pct = parseNumber(rows[r][c])
          setLocalPct(det.detId, mes, pct)
          updates.push({ detalhamento_id: det.detId, mes, pct_planejado: pct })
        }
      }
      sendBulk(updates)
    },
    onCommit(key, value) {
      const parts = key.split(':')
      const detId = parts[1], mes = parts[2]
      setLocalPct(detId, mes, value)
      sendBulk([{ detalhamento_id: detId, mes, pct_planejado: value }])
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [editMode, meses, visibleDets, tipo, setLocalPct, rebuildOrder])

  // Row totals (Σ% na linha). Para det: soma direta. Para rollup: idem (ponderado)
  function detRowTotal(detId: string) { return meses.reduce((a, m) => a + detPct(detId, m), 0) }

  // Col totals em R$
  const colTotalsValor = meses.map(m => {
    let acc = 0
    for (const g of grupos) {
      for (const t of g.tarefas) {
        for (const d of t.detalhamentos) {
          acc += (detPct(d.id, m) / 100) * d[pesoField]
        }
      }
    }
    return acc
  })
  const grandTotalValor = colTotalsValor.reduce((a, b) => a + b, 0)

  // Assign row index per detalhamento (stable — based on full tree order)
  const detRowIdx: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {}
    let i = 0
    for (const g of grupos) for (const t of g.tarefas) for (const d of t.detalhamentos) { m[d.id] = i++; }
    return m
  }, [grupos])

  return (
    <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-1)' }}>
          <Calendar className="w-4 h-4 text-blue-400" />
          {title}
          {editMode && <span className="text-[10px] font-normal text-[var(--text-3)] ml-2">Enter/Tab/Setas · cole do Excel · F2 edita · só nível 3 edita</span>}
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/api/contratos/${contratoId}/planilha/template?tipo=${tipo}`}
              className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--border)] hover:border-blue-500 hover:text-blue-400 text-[var(--text-2)]"
              title={tipo === 'fisico'
                ? 'Baixa planilha FÍSICO FINANCEIRO (com PR.Mat + PR.MO e curva física)'
                : 'Baixa planilha FATURAMENTO DIRETO (só PR.Mat e curva de fat direto)'}
            >
              <Download className="w-3 h-3" /> Baixar {tipo === 'fisico' ? 'Físico' : 'Fat Direto'}
            </a>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-500/60 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                  title="Sobe .xlsx com o mesmo formato do template — só linhas com detalhamento_id válido são importadas"
                >
                  <Upload className="w-3 h-3" /> Subir planilha
                </button>
              </>
            )}
            <button onClick={() => { const all: Record<string, boolean> = {}; const allT: Record<string, boolean> = {}; grupos.forEach(g => { all[g.id] = true; g.tarefas.forEach(t => { allT[t.id] = true }) }); setOpenGrupo(all); setOpenTarefa(allT) }} className="text-[10px] text-blue-400 hover:underline">expandir tudo</button>
            <button onClick={() => { setOpenGrupo({}); setOpenTarefa({}) }} className="text-[10px] text-[var(--text-3)] hover:underline">recolher tudo</button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10" style={{ background: 'var(--background)' }}>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="px-3 py-2 text-left text-[var(--text-3)] font-semibold uppercase tracking-wide sticky left-0 z-10 min-w-[280px]" style={{ background: 'var(--background)' }}>EAP</th>
                {meses.map(m => (
                  <th key={m} className="px-2 py-2 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide whitespace-nowrap">{formatMes(m)}</th>
                ))}
                <th className="px-3 py-2 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Σ %</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const gOpen = !!openGrupo[g.id]
                const gTotalLinha = meses.reduce((a, m) => a + grupoPct(g, m).pct, 0)
                const gInvalid = Math.abs(gTotalLinha - 100) > 0.01 && gTotalLinha !== 0
                return (
                  <FragmentRow key={g.id}>
                    {/* GRUPO */}
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }} className="font-semibold">
                      <td className="px-2 py-1.5 sticky left-0 whitespace-nowrap" style={{ background: 'var(--surface-2)' }}>
                        <button onClick={() => toggleGrupo(g.id)} className="inline-flex items-center gap-1 hover:text-blue-400">
                          {gOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span className="text-[var(--text-3)]">{g.codigo}</span>
                          <span className="text-[var(--text-1)]">{g.nome}</span>
                        </button>
                      </td>
                      {meses.map(m => {
                        const { pct } = grupoPct(g, m)
                        return <td key={m} className="px-2 py-1.5 text-right tabular-nums text-[var(--text-2)]">{pct ? `${pct.toFixed(2)}%` : '—'}</td>
                      })}
                      <td className={`px-3 py-1.5 text-right tabular-nums ${gInvalid ? 'text-red-400' : 'text-[var(--text-2)]'}`}>{gTotalLinha.toFixed(2)}%</td>
                    </tr>

                    {/* TAREFAS */}
                    {gOpen && g.tarefas.map(t => {
                      const tOpen = !!openTarefa[t.id]
                      const tTotalLinha = meses.reduce((a, m) => a + tarefaPct(t, m).pct, 0)
                      const tInvalid = Math.abs(tTotalLinha - 100) > 0.01 && tTotalLinha !== 0
                      return (
                        <FragmentRow key={t.id}>
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                            <td className="px-2 py-1.5 sticky left-0 whitespace-nowrap pl-6" style={{ background: 'var(--surface-1)' }}>
                              <button onClick={() => toggleTarefa(t.id)} className="inline-flex items-center gap-1 hover:text-blue-400">
                                {tOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span className="text-[var(--text-3)]">{t.codigo}</span>
                                <span className="text-[var(--text-2)]">{t.nome}</span>
                              </button>
                            </td>
                            {meses.map(m => {
                              const { pct } = tarefaPct(t, m)
                              return <td key={m} className="px-2 py-1.5 text-right tabular-nums text-[var(--text-3)]">{pct ? `${pct.toFixed(2)}%` : '—'}</td>
                            })}
                            <td className={`px-3 py-1.5 text-right tabular-nums ${tInvalid ? 'text-red-400' : 'text-[var(--text-3)]'}`}>{tTotalLinha.toFixed(2)}%</td>
                          </tr>

                          {/* DETALHAMENTOS (editáveis) */}
                          {tOpen && t.detalhamentos.map(d => {
                            const dRowIdx = detRowIdx[d.id]
                            const totalLinha = detRowTotal(d.id)
                            const invalid = Math.abs(totalLinha - 100) > 0.01 && totalLinha !== 0
                            const pesoDet = d[pesoField]
                            return (
                              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--surface-2)] transition-colors">
                                <td className="px-2 py-0.5 sticky left-0 whitespace-nowrap pl-12" style={{ background: 'var(--surface-1)' }}>
                                  <span className="text-[var(--text-3)]">{d.codigo}</span>{' '}
                                  <span className="text-[var(--text-2)]">{d.descricao}</span>
                                  {pesoDet === 0 && <span className="ml-1 text-[10px] text-[var(--text-3)]">(sem peso)</span>}
                                </td>
                                {meses.map((m, colIdx) => {
                                  const key = `${tipo}:${d.id}:${m}`
                                  return (
                                    <td key={m} className="px-1 py-0.5">
                                      <EditableGridCell
                                        cellKey={key}
                                        rowIdx={dRowIdx}
                                        colIdx={colIdx}
                                        value={detPct(d.id, m)}
                                        formatDisplay={n => n ? `${n.toFixed(2)}%` : '—'}
                                        coord={coord}
                                        readOnly={pesoDet === 0}
                                      />
                                    </td>
                                  )
                                })}
                                <td className={`px-3 py-0.5 text-right font-semibold tabular-nums ${invalid ? 'text-red-400' : 'text-[var(--text-2)]'}`}>
                                  {totalLinha.toFixed(2)}%
                                </td>
                              </tr>
                            )
                          })}
                        </FragmentRow>
                      )
                    })}
                  </FragmentRow>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                <td className="px-3 py-2 text-[var(--text-2)] font-bold uppercase text-[11px] sticky left-0" style={{ background: 'var(--surface-2)' }}>Total R$</td>
                {colTotalsValor.map((v, i) => (
                  <td key={i} className="px-2 py-2 text-right tabular-nums text-[var(--text-2)] whitespace-nowrap">{formatCurrency(v)}</td>
                ))}
                <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatCurrency(grandTotalValor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// React.Fragment with key helper for nested rows
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
