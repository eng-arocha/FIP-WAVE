'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileSpreadsheet, FileText, Loader2, PackageSearch } from 'lucide-react'
import type { DashboardModo } from '@/types/dashboard'
import { exportarExcelVisaoGeral } from '@/lib/export/visao-geral'
import { aplicarFiltrosArvore, algumFiltroAtivo } from '@/lib/export/visao-geral-filtro'
import { useVisaoGeralFiltro } from './filtro-context'

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

/**
 * Exportação da Visão Geral. O filtro mora no cabeçalho de cada coluna da
 * tabela (estilo Excel — ver dashboard-tree.tsx); com filtro ativo, Excel e
 * PDF saem com o mesmo recorte da tela.
 */
export function VisaoGeralToolbar({
  contratoId, modo, contratoNome,
}: { contratoId: string; modo: DashboardModo; contratoNome: string }) {
  const params = useSearchParams()
  const scopeRaw = params.get('scope')
  const scope = scopeRaw === null || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw
  const { rows, carregando, filtrosDo } = useVisaoGeralFiltro(contratoId)
  const filtros = filtrosDo(modo)
  const filtrando = algumFiltroAtivo(filtros)
  const [exportando, setExportando] = useState<null | 'xlsx' | 'pdf'>(null)

  const linhas = useMemo(
    () => (filtrando ? aplicarFiltrosArvore(rows, modo, filtros, scope) : rows),
    [filtrando, rows, modo, filtros, scope],
  )

  async function baixarExcel() {
    if (linhas.length === 0) return
    setExportando('xlsx')
    try { await exportarExcelVisaoGeral(linhas, modo, contratoNome) }
    finally { setExportando(null) }
  }

  async function baixarPDF() {
    if (linhas.length === 0) return
    setExportando('pdf')
    try {
      const [{ pdf }, { VisaoGeralPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf/VisaoGeralPDF'),
      ])
      const chartImage = await capturarGraficoPNG()
      const blob = await pdf(
        <VisaoGeralPDF rows={linhas} modo={modo} contratoNome={contratoNome} chartImage={chartImage} />,
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `visao-geral-${modo}-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally { setExportando(null) }
  }

  const sufixo = filtrando ? ' (filtrado)' : ''

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="flex-1 min-w-[200px] text-[11px] text-[var(--text-3)]">
        {carregando
          ? 'Carregando itens para filtro/exportação…'
          : 'Clique no título de uma coluna para filtrar (como no Excel).'}
      </span>
      <button
        onClick={baixarExcel}
        disabled={carregando || exportando !== null || linhas.length === 0}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
      >
        {exportando === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        Excel{sufixo}
      </button>
      <button
        onClick={baixarPDF}
        disabled={carregando || exportando !== null || linhas.length === 0}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
      >
        {exportando === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        PDF{sufixo}
      </button>
      {modo === 'material' && (
        <Link
          href={`/contratos/${contratoId}/material-sem-nf`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          title="Material medido sem NF nem pedido no item — candidato a NF da FIP"
        >
          <PackageSearch className="w-3.5 h-3.5" />
          Material sem NF
        </Link>
      )}
    </div>
  )
}
