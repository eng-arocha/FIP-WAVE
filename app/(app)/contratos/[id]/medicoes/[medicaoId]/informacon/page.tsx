'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  ArrowLeft, Loader2, Download, Copy, Check, FileText, TrendingUp, Printer,
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
      'Código', 'Descrição', 'Unidade', 'Qtd Contratada', 'Qtd Medida', '% Medido',
      'Qtd Acumulada', '% Acumulado',
      'Mat. Unit.', 'Mat. Medido', 'Mat. Acumulado',
      'Serv. Unit.', 'Serv. Medido', 'Serv. Acumulado',
      'Base Retenção', 'Retenção',
    ]
    const rows = linhasExibidas.map(l => [
      l.codigo, l.descricao, l.unidade,
      l.quantidade_contratada.toFixed(3).replace('.', ','),
      l.quantidade_medida.toFixed(3).replace('.', ','),
      pctFmt(l.pct_medido),
      l.quantidade_acumulada.toFixed(3).replace('.', ','),
      pctFmt(l.pct_acumulado),
      l.valor_material_unit.toFixed(2).replace('.', ','),
      l.material_medido.toFixed(2).replace('.', ','),
      l.material_acumulado.toFixed(2).replace('.', ','),
      l.valor_servico_unit.toFixed(2).replace('.', ','),
      l.servico_medido.toFixed(2).replace('.', ','),
      l.servico_acumulado.toFixed(2).replace('.', ','),
      l.base_retencao.toFixed(2).replace('.', ','),
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
                  { header: 'Unidade', get: (l: any) => l.unidade },
                  { header: 'Qtd Contratada', get: (l: any) => Number(l.quantidade_contratada) },
                  { header: 'Qtd Medida', get: (l: any) => Number(l.quantidade_medida) },
                  { header: '% Medido', get: (l: any) => Number(l.pct_medido) },
                  { header: 'Qtd Acumulada', get: (l: any) => Number(l.quantidade_acumulada) },
                  { header: '% Acumulado', get: (l: any) => Number(l.pct_acumulado) },
                  { header: 'Mat. Unit.', get: (l: any) => Number(l.valor_material_unit) },
                  { header: 'Mat. Medido', get: (l: any) => Number(l.material_medido) },
                  { header: 'Mat. Acumulado', get: (l: any) => Number(l.material_acumulado) },
                  { header: 'Serv. Unit.', get: (l: any) => Number(l.valor_servico_unit) },
                  { header: 'Serv. Medido', get: (l: any) => Number(l.servico_medido) },
                  { header: 'Serv. Acumulado', get: (l: any) => Number(l.servico_acumulado) },
                  { header: 'Base Retenção', get: (l: any) => Number(l.base_retencao) },
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

        {/* Cards de totais — bom pra lançamento */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card label="Material medido" value={formatCurrency(data.totais.material_medido)} accent="var(--text-1)" />
          <Card label="Serviço medido" value={formatCurrency(data.totais.servico_medido)} accent="#0F766E" hint="(NF a emitir)" />
          <Card label="Base de retenção" value={formatCurrency(data.totais.base_retencao)} accent="var(--text-2)" hint={`(${pctFmt(data.medicao.contrato.percentual_retencao)} aplicado)`} />
          <Card label="Retenção" value={formatCurrency(data.totais.retencao)} accent="#818CF8" />
          <Card label="Líquido NF" value={formatCurrency(data.totais.servico_medido - data.totais.retencao)} accent="#10B981" />
        </div>

        {/* Tabela */}
        <MaximizableCard
          title={`Boletim ${tag} · ${linhasExibidas.length} item${linhasExibidas.length !== 1 ? 's' : ''}`}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1400, color: 'var(--text-1)', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-3)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={th()}>Código</th>
                  <th style={{ ...th(), textAlign: 'left' }}>Descrição</th>
                  <th style={th()}>Un.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Qtd Contr.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Qtd Med.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>% Med.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Qtd Acum.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>% Acum.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Mat. Unit.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Mat. Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Mat. Acum.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.05)' }}>Serv. Unit.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.05)' }}>Serv. Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.05)' }}>Serv. Acum.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(99,102,241,0.05)' }}>Retenção</th>
                </tr>
              </thead>
              <tbody>
                {linhasExibidas.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
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
                    <td style={{ ...td('break-words'), textAlign: 'left', maxWidth: 280 }}>{l.descricao}</td>
                    <td style={{ ...td(), textAlign: 'center' }}>{l.unidade}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{l.quantidade_contratada.toFixed(3).replace('.', ',')}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right' }}>{l.quantidade_medida.toFixed(3).replace('.', ',')}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{pctFmt(l.pct_medido)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: 'var(--text-3)' }}>{l.quantidade_acumulada.toFixed(3).replace('.', ',')}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: 'var(--text-3)' }}>{pctFmt(l.pct_acumulado)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.valor_material_unit)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.material_medido)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: 'var(--text-3)', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.material_acumulado)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>{formatCurrency(l.valor_servico_unit)}</td>
                    <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>{formatCurrency(l.servico_medido)}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', color: 'var(--text-3)', background: 'rgba(59,130,246,0.04)' }}>{formatCurrency(l.servico_acumulado)}</td>
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(99,102,241,0.06)', color: '#818CF8' }}>{formatCurrency(l.retencao)}</td>
                  </tr>
                ))}
              </tbody>
              {linhasExibidas.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-3)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={8} style={{ ...td(), textAlign: 'right' }}>TOTAIS</td>
                    <td style={{ ...td(), background: 'rgba(15,118,110,0.06)' }}></td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)', color: 'var(--text-3)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_acumulado, 0))}</td>
                    <td style={{ ...td(), background: 'rgba(59,130,246,0.06)' }}></td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.servico_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.06)', color: 'var(--text-3)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.servico_acumulado, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(99,102,241,0.10)', color: '#818CF8' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.retencao, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MaximizableCard>

        <p className="text-[11px] print:hidden" style={{ color: 'var(--text-3)' }}>
          <TrendingUp className="inline w-3 h-3 mr-1" />
          Use os valores acima pra lançar a medição no INFORMACON: % medido por item (material e serviço seguem o mesmo %),
          retenção total por item ({pctFmt(data.medicao.contrato.percentual_retencao)} sobre material + serviço executados).
        </p>
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
