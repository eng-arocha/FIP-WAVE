'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react'
import type { DashboardModo } from '@/types/dashboard'
import {
  filtrarRows, valoresPorModo, rotuloSaldo, totalizarRows,
  exportarExcelVisaoGeral, type FlatRow,
} from '@/lib/export/visao-geral'

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Serializa o 1º SVG do gráfico da Visão Geral em PNG (data URL). */
async function capturarGraficoPNG(): Promise<string | null> {
  try {
    const svg = document.querySelector('.recharts-wrapper svg') as SVGSVGElement | null
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height)
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const xml = new XMLSerializer().serializeToString(clone)
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
    const img = new Image()
    const scale = 2
    const dataUrl: string = await new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = w * scale; canvas.height = h * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no ctx'))
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = reject
      img.src = url
    })
    return dataUrl
  } catch { return null }
}

export function VisaoGeralToolbar({
  contratoId, modo, contratoNome,
}: { contratoId: string; modo: DashboardModo; contratoNome: string }) {
  const [rows, setRows] = useState<FlatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [texto, setTexto] = useState('')
  const [somenteSaldo, setSomenteSaldo] = useState(false)
  const [exportando, setExportando] = useState<null | 'xlsx' | 'pdf'>(null)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    fetch(`/api/contratos/${contratoId}/dashboard/flat`)
      .then(r => r.ok ? r.json() : { itens: [] })
      .then(d => { if (vivo) setRows(Array.isArray(d.itens) ? d.itens : []) })
      .catch(() => { if (vivo) setRows([]) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [contratoId])

  const filtradas = useMemo(
    () => filtrarRows(rows, modo, { texto, somenteSaldo }),
    [rows, modo, texto, somenteSaldo],
  )
  const totais = useMemo(() => totalizarRows(filtradas, modo), [filtradas, modo])
  const filtrando = texto.trim() !== '' || somenteSaldo

  async function baixarExcel() {
    if (filtradas.length === 0) return
    setExportando('xlsx')
    try { await exportarExcelVisaoGeral(filtradas, modo, contratoNome) }
    finally { setExportando(null) }
  }

  async function baixarPDF() {
    if (filtradas.length === 0) return
    setExportando('pdf')
    try {
      const [{ pdf }, { VisaoGeralPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/VisaoGeralPDF'),
      ])
      const chartImage = await capturarGraficoPNG()
      const blob = await pdf(
        <VisaoGeralPDF rows={filtradas} modo={modo} contratoNome={contratoNome} chartImage={chartImage} />,
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `visao-geral-${modo}-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExportando(null) }
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Filtrar por item (ex.: 3.2.1) ou nome…"
            className="w-full pl-7 pr-7 py-1.5 text-xs rounded-lg bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500"
          />
          {texto && (
            <button onClick={() => setTexto('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-1)]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-2)] cursor-pointer select-none">
          <input type="checkbox" checked={somenteSaldo} onChange={e => setSomenteSaldo(e.target.checked)} />
          Somente com saldo
        </label>
        <button
          onClick={baixarExcel}
          disabled={loading || exportando !== null || filtradas.length === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
        >
          {exportando === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          Excel
        </button>
        <button
          onClick={baixarPDF}
          disabled={loading || exportando !== null || filtradas.length === 0}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
        >
          {exportando === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          PDF
        </button>
      </div>

      {loading && <p className="text-xs text-[var(--text-3)]">Carregando itens para filtro/exportação…</p>}

      {!loading && filtrando && (
        <div className="border border-[var(--border)] rounded-md overflow-hidden">
          <div className="px-2 py-1 text-[10px] uppercase text-[var(--text-3)] bg-[var(--surface-2)] border-b border-[var(--border)]">
            {filtradas.length} item(ns) — resultado do filtro
          </div>
          <div className="max-h-[40vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--text-3)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-1 px-2 font-semibold">Código</th>
                  <th className="text-left py-1 px-2 font-semibold">Item</th>
                  <th className="text-right py-1 px-2 font-semibold">Contratado</th>
                  <th className="text-right py-1 px-2 font-semibold">Realizado</th>
                  <th className="text-right py-1 px-2 font-semibold">{rotuloSaldo(modo)}</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(({ item, level }) => {
                  const v = valoresPorModo(item, modo)
                  return (
                    <tr key={`${item.id}-${level}`} className="border-b border-[var(--border)]/40">
                      <td className="py-1 px-2 font-mono text-[10px] text-[var(--text-3)]">{item.codigo}</td>
                      <td className="py-1 px-2 text-[var(--text-2)]" style={{ paddingLeft: 8 + level * 12 }}>{item.nome}</td>
                      <td className="py-1 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(v.contratado)}</td>
                      <td className="py-1 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(v.realizado)}</td>
                      <td
                        className="py-1 px-2 text-right tabular-nums"
                        style={{ color: v.saldo < 0 ? '#EF4444' : v.saldo > 0 ? '#eab308' : 'var(--text-3)' }}
                        title={v.saldo < 0 ? 'Realizado maior que o contratado' : undefined}
                      >
                        {fmt(v.saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Total das RAÍZES do resultado — somar todas as linhas
                  contaria o mesmo dinheiro em grupo, tarefa e detalhamento. */}
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] font-semibold bg-[var(--surface-2)]">
                  <td className="py-1 px-2 text-[10px] uppercase text-[var(--text-3)]" colSpan={2}>Total do resultado</td>
                  <td className="py-1 px-2 text-right tabular-nums text-[var(--text-1)]">{fmt(totais.contratado)}</td>
                  <td className="py-1 px-2 text-right tabular-nums text-[var(--text-1)]">{fmt(totais.realizado)}</td>
                  <td className="py-1 px-2 text-right tabular-nums" style={{ color: totais.saldo < 0 ? '#EF4444' : 'var(--text-1)' }}>
                    {fmt(totais.saldo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
