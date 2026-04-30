'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  ArrowLeft, Loader2, Download, Copy, Check, FileText, TrendingUp, Printer, HelpCircle, X,
} from 'lucide-react'

interface Linha {
  medicao_item_id: string
  detalhamento_id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_contratada: number
  quantidade_medida: number
  quantidade_acumulada: number
  pct_medido: number
  pct_acumulado: number
  valor_unitario: number
  valor_material_unit: number
  valor_servico_unit: number
  valor_total_item: number
  valor_material_total_item: number
  valor_servico_total_item: number
  material_medido: number
  servico_medido: number
  // Novos campos: lógica Wave/FIP
  nf_terceiro: number
  saldo_aprovado: number
  nf_descontavel: number
  gap_material: number
  material_retido: number
  fip_faturar: number
  wave_servico: number
  total_informakon: number
  pct_informakon: number
  base_retencao: number
  retencao: number
  material_acumulado: number
  servico_acumulado: number
}

interface Resp {
  medicao: {
    id: string
    numero: number
    periodo_referencia: string
    status: string
    data_aprovacao: string | null
    data_submissao: string | null
    contrato: { id: string; numero: string; valor_total: number; percentual_retencao: number }
  }
  linhas: Linha[]
  totais: {
    material_medido: number
    servico_medido: number
    nf_terceiro: number
    saldo_aprovado: number
    nf_descontavel: number
    gap_material: number
    material_retido: number
    fip_faturar: number
    wave_servico: number
    total_informakon: number
    base_retencao: number
    retencao: number
    material_acumulado: number
    servico_acumulado: number
  }
}

function pctFmt(v: number, casas = 2): string {
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(casas).replace('.', ',')}%`
}

export default function BoletimInformaconPage({ params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const { id: contratoId, medicaoId } = use(params)
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/informacon`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.medicao) setData(d) })
      .finally(() => setLoading(false))
  }, [contratoId, medicaoId])

  // Filtrar só itens com qtde medida nesta medição (mais limpo pro lançamento)
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const linhasExibidas = useMemo(() => {
    if (!data) return []
    return mostrarTodos ? data.linhas : data.linhas.filter(l => l.quantidade_medida > 0)
  }, [data, mostrarTodos])

  function copiarParaClipboard() {
    if (!data) return
    // TSV (cola direto em Excel/Google Sheets)
    const headers = [
      'Código', 'Descrição',
      'Mat. Medido', 'NF Terceiro', 'Saldo Aprov.', 'NF Desc.', 'Gap', 'Retido', 'FIP Fat-Dir',
      'Wave (Serv.)', 'Total Informakon', '% Informakon', 'Retenção',
    ]
    const rows = linhasExibidas.map(l => [
      l.codigo, l.descricao,
      l.material_medido.toFixed(2).replace('.', ','),
      l.nf_terceiro.toFixed(2).replace('.', ','),
      l.saldo_aprovado.toFixed(2).replace('.', ','),
      l.nf_descontavel.toFixed(2).replace('.', ','),
      l.gap_material.toFixed(2).replace('.', ','),
      l.material_retido.toFixed(2).replace('.', ','),
      l.fip_faturar.toFixed(2).replace('.', ','),
      l.wave_servico.toFixed(2).replace('.', ','),
      l.total_informakon.toFixed(2).replace('.', ','),
      pctFmt(l.pct_informakon, 4),
      l.retencao.toFixed(2).replace('.', ','),
    ])
    const tsv = [headers, ...rows].map(r => r.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  function imprimir() {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Boletim INFORMACON" />
        <div className="p-6 flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Boletim INFORMACON" />
        <div className="p-6 text-center" style={{ color: 'var(--text-3)' }}>Medição não encontrada</div>
      </div>
    )
  }

  const tag = `MED-${String(data.medicao.numero).padStart(3, '0')}`
  const dataReferencia = data.medicao.data_aprovacao || data.medicao.data_submissao

  // Mapa visual por status
  const statusInfo = (() => {
    switch (data.medicao.status) {
      case 'aprovado':
        return {
          label: 'Boletim oficial · Medição aprovada',
          descricao: data.medicao.data_aprovacao
            ? `Aprovada em ${formatDate(data.medicao.data_aprovacao)}. Valores congelados (snapshots).`
            : 'Aprovada. Valores congelados (snapshots).',
          color: '#10B981',
          bg: 'rgba(16,185,129,0.10)',
          border: 'rgba(16,185,129,0.40)',
          isPrevia: false,
        }
      case 'submetido':
      case 'em_analise':
        return {
          label: 'Prévia · Aguardando aprovação',
          descricao: 'Cálculo on-the-fly. Valores e acumulado podem mudar até a aprovação. Não use ainda pra lançamento oficial.',
          color: '#3B82F6',
          bg: 'rgba(59,130,246,0.10)',
          border: 'rgba(59,130,246,0.40)',
          isPrevia: true,
        }
      case 'rascunho':
        return {
          label: 'Prévia · Rascunho',
          descricao: 'Medição ainda não submetida. Use pra simulação.',
          color: '#F59E0B',
          bg: 'rgba(245,158,11,0.10)',
          border: 'rgba(245,158,11,0.40)',
          isPrevia: true,
        }
      case 'rejeitado':
        return {
          label: 'Medição rejeitada',
          descricao: 'Esta medição foi rejeitada — boletim apenas referência.',
          color: '#EF4444',
          bg: 'rgba(239,68,68,0.10)',
          border: 'rgba(239,68,68,0.40)',
          isPrevia: true,
        }
      default:
        return {
          label: data.medicao.status,
          descricao: '',
          color: 'var(--text-3)',
          bg: 'var(--surface-2)',
          border: 'var(--border)',
          isPrevia: true,
        }
    }
  })()

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar title={`Boletim INFORMACON · ${tag}`} subtitle={`Período ${data.medicao.periodo_referencia} · Contrato ${data.medicao.contrato.numero}`} />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Cabeçalho com voltar e ações */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <Link href={`/contratos/${contratoId}/medicoes/${medicaoId}`}>
            <button className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar à medição
            </button>
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={mostrarTodos} onChange={e => setMostrarTodos(e.target.checked)} />
              Mostrar todos os itens (não só medidos)
            </label>
            <button
              onClick={copiarParaClipboard}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: copiado ? 'rgba(16,185,129,0.20)' : 'var(--surface-2)', color: copiado ? '#10B981' : 'var(--text-2)', border: `1px solid ${copiado ? 'rgba(16,185,129,0.40)' : 'var(--border)'}` }}
              title="Copia tabela em formato TSV — cola direto no Excel/Sheets/Informacon"
            >
              {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiado ? 'Copiado!' : 'Copiar planilha'}
            </button>
            <button
              onClick={() => exportCsv(
                `boletim-informacon-${tag}-${dataReferencia ? formatDate(dataReferencia) : ''}`,
                linhasExibidas as any[],
                [
                  { header: 'Código', get: (l: any) => l.codigo },
                  { header: 'Descrição', get: (l: any) => l.descricao },
                  { header: 'Mat. Medido', get: (l: any) => Number(l.material_medido) },
                  { header: 'NF Terceiro', get: (l: any) => Number(l.nf_terceiro) },
                  { header: 'Saldo Aprov.', get: (l: any) => Number(l.saldo_aprovado) },
                  { header: 'NF Desc.', get: (l: any) => Number(l.nf_descontavel) },
                  { header: 'Gap', get: (l: any) => Number(l.gap_material) },
                  { header: 'Retido', get: (l: any) => Number(l.material_retido) },
                  { header: 'FIP Fat-Dir', get: (l: any) => Number(l.fip_faturar) },
                  { header: 'Wave (Serv.)', get: (l: any) => Number(l.wave_servico) },
                  { header: 'Total Informakon', get: (l: any) => Number(l.total_informakon) },
                  { header: '% Informakon', get: (l: any) => Number(l.pct_informakon) },
                  { header: 'Retenção', get: (l: any) => Number(l.retencao) },
                ],
              )}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={imprimir}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.40)' }}
              title="Como interpretar as colunas — regra Wave/FIP"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Critério
            </button>
          </div>
        </div>

        {/* Banner de status — esclarece se é prévia ou oficial */}
        <div className="rounded-lg px-4 py-3 flex items-start gap-3"
          style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.border}` }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: statusInfo.bg, border: `1px solid ${statusInfo.border}` }}>
            {statusInfo.isPrevia
              ? <TrendingUp className="w-4 h-4" style={{ color: statusInfo.color }} />
              : <FileText  className="w-4 h-4" style={{ color: statusInfo.color }} />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: statusInfo.color }}>
              {statusInfo.label}
            </p>
            {statusInfo.descricao && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                {statusInfo.descricao}
              </p>
            )}
          </div>
        </div>

        {/* Cards de totais — refletem a lógica Wave/FIP */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card label="Wave (Serviço)" value={formatCurrency(data.totais.wave_servico)} accent="#0F766E" hint="NF Wave a emitir" />
          <Card label="FIP (Material)" value={formatCurrency(data.totais.fip_faturar)} accent="#3B82F6" hint="Fat-direto FIP a criar" />
          <Card label="NF terceiro descontada" value={formatCurrency(data.totais.nf_descontavel)} accent="var(--text-2)" hint="Já lançadas no item" />
          <Card label="Material retido" value={formatCurrency(data.totais.material_retido)} accent="#F59E0B" hint="Aguarda NF terceiro" />
          <Card label="Total Informakon" value={formatCurrency(data.totais.total_informakon)} accent="#10B981" hint={`Retenção ${pctFmt(data.medicao.contrato.percentual_retencao)}: ${formatCurrency(data.totais.retencao)}`} />
        </div>

        {/* Tabela */}
        <MaximizableCard
          title={`Boletim ${tag} · ${linhasExibidas.length} item${linhasExibidas.length !== 1 ? 's' : ''}`}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1500, color: 'var(--text-1)', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-3)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={th()}>Item</th>
                  <th style={{ ...th(), textAlign: 'left' }}>Descrição</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Mat. Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>NF Terceiro</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Saldo Aprov.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>NF Desc.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(245,158,11,0.05)' }}>Gap</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(245,158,11,0.05)' }}>Retido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.05)' }}>FIP Fat-Dir</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Wave (Serv.)</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(16,185,129,0.05)' }}>Total Informakon</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(16,185,129,0.05)' }}>% Informakon</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(99,102,241,0.05)' }}>Retenção</th>
                </tr>
              </thead>
              <tbody>
                {linhasExibidas.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      Nenhum item com quantidade medida nesta medição.
                      {!mostrarTodos && (
                        <div className="mt-1 text-[11px]">
                          Marque "Mostrar todos" pra ver todos os itens do contrato.
                        </div>
                      )}
                    </td>
                  </tr>
                ) : linhasExibidas.map((l, idx) => (
                  <tr key={l.medicao_item_id || l.detalhamento_id}
                    style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}>
                    <td style={td('font-mono font-bold', '#3B82F6')}>{l.codigo}</td>
                    <td style={{ ...td('break-words'), textAlign: 'left', maxWidth: 240 }}>{l.descricao}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(l.material_medido)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.nf_terceiro)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.saldo_aprovado)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.nf_descontavel)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: 'var(--text-3)' }}>{formatCurrency(l.gap_material)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: l.material_retido > 0 ? '#F59E0B' : 'var(--text-3)' }}>{formatCurrency(l.material_retido)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(59,130,246,0.04)', color: l.fip_faturar > 0 ? '#3B82F6' : 'var(--text-3)' }}>{formatCurrency(l.fip_faturar)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)', color: '#0F766E' }}>{formatCurrency(l.wave_servico)}</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(16,185,129,0.06)', color: '#10B981' }}>{formatCurrency(l.total_informakon)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>{pctFmt(l.pct_informakon, 4)}</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(99,102,241,0.06)', color: '#818CF8' }}>{formatCurrency(l.retencao)}</td>
                  </tr>
                ))}
              </tbody>
              {linhasExibidas.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-3)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={2} style={{ ...td(), textAlign: 'right' }}>TOTAIS</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_terceiro, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.saldo_aprovado, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_descontavel, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.gap_material, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)', color: '#F59E0B' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_retido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.06)', color: '#3B82F6' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.fip_faturar, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)', color: '#0F766E' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.wave_servico, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(16,185,129,0.10)', color: '#10B981' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.total_informakon, 0))}</td>
                    <td style={{ ...td(), background: 'rgba(16,185,129,0.10)' }}></td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(99,102,241,0.10)', color: '#818CF8' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.retencao, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MaximizableCard>

        <p className="text-[11px] print:hidden" style={{ color: 'var(--text-3)' }}>
          <TrendingUp className="inline w-3 h-3 mr-1" />
          No Informakon, lance por item o <strong>% Informakon</strong> (já recalculado pra refletir
          NFs descontadas e material retido) — não o % físico medido. Retenção {pctFmt(data.medicao.contrato.percentual_retencao)} aplicada sobre <em>Total Informakon</em> (Wave + NF Desc. + FIP).
          Clique em <strong>Critério</strong> pra ver a regra completa.
        </p>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} pctRetencao={data.medicao.contrato.percentual_retencao} />}
    </div>
  )
}

function HelpModal({ onClose, pctRetencao }: { onClose: () => void; pctRetencao: number }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
            Critério de cálculo Wave / FIP
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--surface-2)]" aria-label="Fechar">
            <X className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
          </button>
        </div>

        <div className="p-5 space-y-4 text-[13px]" style={{ color: 'var(--text-2)' }}>
          <section>
            <h3 className="font-bold mb-1" style={{ color: 'var(--text-1)' }}>Atores</h3>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>WAVE INSTALACOES SPE LTDA</strong> — emite NF do <strong>serviço</strong> (parcela mão-de-obra do item).</li>
              <li><strong>FIP ENGENHARIA ELETRICA LTDA</strong> — empresa garantidora; emite NF de <strong>material</strong> via fat-direto automático quando não há cobertura por NF terceiro nem saldo aprovado.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold mb-1" style={{ color: 'var(--text-1)' }}>Variáveis por item medido</h3>
            <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
              <li><strong>Mat. Medido</strong> = qtd × <code>valor_material_unit</code> do contrato.</li>
              <li><strong>NF Terceiro</strong> = ∑ NFs (validadas/pendentes) de fat-direto APROVADO vinculadas ao item, alocadas proporcionalmente por valor dentro de cada solicitação.</li>
              <li><strong>Saldo Aprov.</strong> = ∑ aprovado em fat-direto − NFs já lançadas (saldo aguardando NF).</li>
              <li><strong>NF Desc.</strong> = MIN(Mat. Medido, NF Terceiro). É o quanto desconta no Informakon.</li>
              <li><strong>Gap</strong> = Mat. Medido − NF Desc. (parte do material não coberta por NF).</li>
              <li><strong>Retido</strong> = MIN(Gap, Saldo Aprov.). Não pago nesta medição — aguarda chegar NF terceiro.</li>
              <li><strong>FIP Fat-Dir</strong> = Gap − Retido. Solicitação de fat-direto criada automaticamente em nome da FIP (status: aprovado).</li>
              <li><strong>Wave (Serv.)</strong> = qtd × <code>valor_servico_unit</code>. NF da Wave a emitir.</li>
              <li><strong>Total Informakon</strong> = Wave + NF Desc. + FIP Fat-Dir. <em>NÃO inclui Retido</em>.</li>
              <li><strong>% Informakon</strong> = Total Informakon ÷ valor global do item × 100. <strong>Recalculado</strong> — use este, não o % físico.</li>
              <li><strong>Retenção</strong> = {pctFmt(pctRetencao)} × Total Informakon.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold mb-2" style={{ color: 'var(--text-1)' }}>4 cenários (item 1.1.4.1, valor global R$ 30.747,78, medição física 50% → mat 7.687 / serv 7.687)</h3>
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', textTransform: 'uppercase', fontSize: 9.5 }}>
                    <th style={th()}>Cenário</th>
                    <th style={{ ...th(), textAlign: 'right' }}>NF Terc.</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Saldo Aprov.</th>
                    <th style={{ ...th(), textAlign: 'right' }}>NF Desc.</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Gap</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Retido</th>
                    <th style={{ ...th(), textAlign: 'right' }}>FIP</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Wave</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Total</th>
                    <th style={{ ...th(), textAlign: 'right' }}>% Inf.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td()}><strong>A</strong> sem NF, sem saldo</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>7.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#3B82F6' }}>7.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: '#0F766E' }}>7.687</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>15.373,89</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>50,00%</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td()}><strong>B</strong> NF cobre tudo</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>10.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>—</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>7.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: '#0F766E' }}>7.687</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>15.373,89</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>50,00%</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td()}><strong>C</strong> NF parcial, saldo cobre o resto</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>5.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>2.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>5.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>2.000</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#F59E0B' }}>2.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>0</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: '#0F766E' }}>7.687</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>13.373,89</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>43,4955%</td>
                  </tr>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td()}><strong>D</strong> NF parcial, saldo parcial</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>5.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>1.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>5.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>2.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: '#F59E0B' }}>1.000</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#3B82F6' }}>1.000</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: '#0F766E' }}>7.687</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>14.373,89</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>46,7479%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }}>
            <p className="text-[12px]"><strong style={{ color: '#F59E0B' }}>⚠ Atenção pra pesos diferentes mat/serv:</strong> as colunas usam o <code>valor_material_unit</code> e <code>valor_servico_unit</code> de cada item — não há divisão fixa 50/50. O cálculo é por item, com pesos do contrato. Itens onde a parcela de material é dominante terão FIP ou retido proporcionalmente maiores.</p>
          </section>

          <section className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.30)' }}>
            <p className="text-[12px]"><strong style={{ color: '#3B82F6' }}>Nota técnica (1ª iteração):</strong> NFs de terceiro são alocadas por proporção de valor dentro de cada solicitação fat-direto. Os agregados são totais do item — ainda não descontam material consumido em medições aprovadas anteriores. Refinamentos (snapshot por medição) virão depois.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function th(): React.CSSProperties {
  return { padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
}
function td(extra?: string, color?: string): React.CSSProperties {
  // extra é classe CSS — devolvido junto pelo caller via className. Aqui só estilo inline.
  return {
    padding: '6px 10px',
    color: color ?? 'var(--text-1)',
    whiteSpace: 'nowrap',
    fontSize: '11.5px',
    ...(extra?.includes('break-words') ? { whiteSpace: 'normal' } : {}),
  }
}

function Card({ label, value, accent, hint }: { label: string; value: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{label}</p>
      <p className="text-base font-black tabular-nums mt-1" style={{ color: accent }}>{value}</p>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>{hint}</p>}
    </div>
  )
}
