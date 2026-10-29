'use client'
// Exporta o relatório "Material medido sem NF" para Excel (xlsx-js-style).
import { useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import type { RelatorioMaterialSemNf } from '@/lib/relatorios/material-sem-nf'

export function ExcelMaterialSemNf({ data }: { data: RelatorioMaterialSemNf }) {
  const [gerando, setGerando] = useState(false)

  async function baixar() {
    setGerando(true)
    try {
      const XLSX = await import('xlsx-js-style')
      const azul = '1E3A8A'
      const money = '#,##0.00'
      const head = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: azul } } }
      const grupoS = { font: { bold: true, color: { rgb: azul } }, fill: { fgColor: { rgb: 'DBEAFE' } } }
      const n = (v: number, s?: object) => ({ v, t: 'n', z: money, s })

      const aoa: any[][] = [
        [{ v: 'Material medido sem NF nem pedido — candidato a NF da FIP', s: { font: { bold: true, sz: 13, color: { rgb: azul } } } }],
        [{ v: `Gerado em ${new Date().toLocaleString('pt-BR')}`, s: { font: { italic: true, sz: 8 } } }],
        [],
        ['Item', 'Descrição', 'Mat. contratado', 'Mat. medido', 'NF lançada', 'Pedido aprovado', 'Fornecedores (pedido / NF)', 'Sem NF']
          .map(v => ({ v, s: head })),
      ]
      for (const g of data.grupos) {
        aoa.push([
          { v: g.balde, s: grupoS }, { v: g.nome, s: grupoS },
          { v: '', s: grupoS }, { v: '', s: grupoS }, { v: '', s: grupoS },
          { v: `Sobra de NF: ${g.sobra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, s: grupoS },
          { v: '', s: grupoS },
          n(g.semNf, grupoS),
        ])
        for (const l of g.itens) {
          aoa.push([
            l.codigo, l.nome, n(l.materialContratado), n(l.materialMedido),
            n(l.nf), n(l.pedido),
            l.fornecedores.map(f => `${f.fornecedor}: ${f.pedido.toFixed(2)} / ${f.nf.toFixed(2)}`).join(' | ') || 'nenhum pedido',
            n(l.semNf, { font: { bold: true, color: { rgb: 'B45309' } } }),
          ])
        }
      }
      aoa.push([])
      aoa.push([{ v: 'TOTAL', s: { font: { bold: true } } }, '', '', '', '', '', '', n(data.totalSemNf, { font: { bold: true } })])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [{ wch: 10 }, { wch: 55 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 60 }, { wch: 14 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Material sem NF')
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      XLSX.writeFile(wb, `material-sem-nf-${stamp}.xlsx`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <button
      onClick={baixar}
      disabled={gerando}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
    >
      {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
      Excel
    </button>
  )
}
