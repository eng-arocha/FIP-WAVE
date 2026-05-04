'use client'

import { use, useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { EmailLiberacaoMedicaoModal } from '@/components/medicoes/email-liberacao-medicao-modal'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  ArrowLeft, Loader2, Download, Copy, Check, FileText, TrendingUp, Printer, HelpCircle, X,
  CheckCircle2, XCircle, Mail, AlertTriangle, Info, Undo2,
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
  // Lógica Wave/FIP
  nf_terceiro: number
  saldo_aprovado: number
  nf_descontavel: number
  gap_material: number
  material_retido: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  pct_informakon: number
  base_retencao: number
  retencao: number
  material_acumulado: number
  servico_acumulado: number
  // === Novos campos da migration 060 (confirmação "sem mais NF") ===
  // Ausentes em respostas antigas — UI deve ser resiliente.
  ajuste_aplicado?: boolean
  confirmacao_sem_nf?: boolean
  confirmacao_sem_nf_em?: string | null
  confirmacao_sem_nf_motivo?: string | null
  pct_serv_med?: number
  pct_serv_med_original?: number
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
    valor_total_medido: number
    dados_informakon: number
    total_informakon: number
    base_retencao: number
    retencao: number
    material_acumulado: number
    servico_acumulado: number
    // novo: contagem de itens que tiveram % ajustado
    itens_com_ajuste?: number
  }
}

const MOTIVO_PADRAO_SEM_NF =
  'fornecedor confirmou que não emitirá mais NF — material concluído com NFs já lançadas'

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

  // === Aprovação / rejeição da medição (trazidos da page.tsx — antes viviam lá) ===
  const { perfilAtual, temPermissao } = usePermissoes()
  const podeAprovar = perfilAtual === 'admin' || temPermissao('medicoes', 'aprovar')

  const [modalAprovar,   setModalAprovar]   = useState(false)
  const [modalLiberacao, setModalLiberacao] = useState<'aprovar' | 'reenviar' | null>(null)
  const [modalRejeitar,  setModalRejeitar]  = useState(false)
  const [comentario,     setComentario]     = useState('')
  const [motivo,         setMotivo]         = useState('')
  const [saving,         setSaving]         = useState(false)
  const [erroAcao,       setErroAcao]       = useState('')

  // === Modal de confirmação "sem mais NF" item-a-item ===
  const [modalConfirmar, setModalConfirmar] = useState<{
    item: Linha
    /** marcar = true ou desmarcar = false (intenção do usuário) */
    confirmar: boolean
  } | null>(null)
  const [motivoSemNf, setMotivoSemNf] = useState('')
  const [salvandoConfirmacao, setSalvandoConfirmacao] = useState(false)
  const [erroConfirmacao, setErroConfirmacao] = useState('')

  // === Modal "Desfazer aprovação" da medição ===
  const [modalDesfazer, setModalDesfazer] = useState(false)
  const [motivoDesfazer, setMotivoDesfazer] = useState('')
  const [salvandoDesfazer, setSalvandoDesfazer] = useState(false)
  const [erroDesfazer, setErroDesfazer] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/informacon`, { cache: 'no-store' })
      if (!r.ok) { setData(null); return }
      const d = await r.json()
      if (d?.medicao) setData(d)
    } finally {
      setLoading(false)
    }
  }, [contratoId, medicaoId])

  useEffect(() => { carregar() }, [carregar])

  const [mostrarTodos, setMostrarTodos] = useState(false)
  const linhasExibidas = useMemo(() => {
    if (!data) return []
    return mostrarTodos ? data.linhas : data.linhas.filter(l => l.quantidade_medida > 0)
  }, [data, mostrarTodos])

  // Quantos itens com ajuste aplicado (fonte: totais.itens_com_ajuste se vier
  // da rota; senão calcula no client a partir das linhas).
  const itensComAjuste = useMemo(() => {
    if (!data) return 0
    if (typeof data.totais.itens_com_ajuste === 'number') return data.totais.itens_com_ajuste
    return data.linhas.reduce((acc, l) => acc + (l.ajuste_aplicado ? 1 : 0), 0)
  }, [data])

  function copiarParaClipboard() {
    if (!data) return
    const headers = [
      'Código', 'Descrição', '% Informakon',
      'Mat. Medido', 'NF Terceiro', 'Saldo Aprov.', 'NF Desc.', 'Gap', 'Retido', 'FIP Fat-Dir',
      'Wave (Serv.)', '% Serv. Med.', 'Valor Total Medido', 'Dados Informakon', 'Retenção',
    ]
    const rows = linhasExibidas.map(l => [
      l.codigo, l.descricao,
      pctFmt(l.pct_informakon, 4),
      l.material_medido.toFixed(2).replace('.', ','),
      l.nf_terceiro.toFixed(2).replace('.', ','),
      l.saldo_aprovado.toFixed(2).replace('.', ','),
      l.nf_descontavel.toFixed(2).replace('.', ','),
      l.gap_material.toFixed(2).replace('.', ','),
      l.material_retido.toFixed(2).replace('.', ','),
      l.fip_faturar.toFixed(2).replace('.', ','),
      l.wave_servico.toFixed(2).replace('.', ','),
      pctFmt(pctServMedExibido(l)),
      l.valor_total_medido.toFixed(2).replace('.', ','),
      l.dados_informakon.toFixed(2).replace('.', ','),
      l.retencao.toFixed(2).replace('.', ','),
    ])
    const tsv = [headers, ...rows].map(r => r.join('\t')).join('\n')
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  function imprimir() { window.print() }

  // ============================================================
  // Aprovar / rejeitar a medição (chama backend igual page.tsx fazia)
  // ============================================================
  async function aprovarSemEmail() {
    setSaving(true)
    setErroAcao('')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovadorNome: 'Fiscal FIP',
          aprovadorEmail: 'fiscal@fipengenharia.com.br',
          comentario,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErroAcao(body?.error || `Falha (HTTP ${res.status}).`); return }
      setModalAprovar(false)
      setComentario('')
      await carregar()
    } finally {
      setSaving(false)
    }
  }

  async function rejeitar() {
    if (!motivo.trim()) return
    setSaving(true)
    setErroAcao('')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovadorNome: 'Fiscal FIP',
          aprovadorEmail: 'fiscal@fipengenharia.com.br',
          comentario: motivo,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErroAcao(body?.error || `Falha (HTTP ${res.status}).`); return }
      setModalRejeitar(false)
      setMotivo('')
      await carregar()
    } finally {
      setSaving(false)
    }
  }

  // ============================================================
  // Desfazer aprovação da medição
  // ============================================================
  function abrirDesfazer() {
    setMotivoDesfazer('')
    setErroDesfazer('')
    setModalDesfazer(true)
  }

  async function confirmarDesfazer() {
    const motivoTrim = motivoDesfazer.trim()
    if (motivoTrim.length < 10) {
      setErroDesfazer('O motivo precisa ter pelo menos 10 caracteres.')
      return
    }
    setSalvandoDesfazer(true)
    setErroDesfazer('')
    try {
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/desfazer-aprovacao`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: motivoTrim }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 409: NFs posteriores → mostrar mensagem específica da API
        setErroDesfazer(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setModalDesfazer(false)
      setMotivoDesfazer('')
      await carregar()
    } catch (e: any) {
      setErroDesfazer(e?.message || 'Erro de rede.')
    } finally {
      setSalvandoDesfazer(false)
    }
  }

  // ============================================================
  // Confirmar / reverter "sem mais NF" item-a-item
  // ============================================================
  function abrirModalConfirmacao(item: Linha, confirmar: boolean) {
    setErroConfirmacao('')
    setMotivoSemNf(confirmar ? MOTIVO_PADRAO_SEM_NF : '')
    setModalConfirmar({ item, confirmar })
  }

  async function salvarConfirmacao() {
    if (!modalConfirmar) return
    const { item, confirmar } = modalConfirmar
    setSalvandoConfirmacao(true)
    setErroConfirmacao('')
    try {
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/itens/${item.medicao_item_id}/confirmar-sem-nf`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmar,
            // motivo só faz sentido ao marcar — ao desmarcar, manda string vazia
            motivo: confirmar ? motivoSemNf.trim() : '',
          }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroConfirmacao(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setModalConfirmar(null)
      await carregar()
    } catch (e: any) {
      setErroConfirmacao(e?.message || 'Erro de rede.')
    } finally {
      setSalvandoConfirmacao(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Boletim INFORMAKON" />
        <div className="p-6 flex items-center justify-center" style={{ color: 'var(--text-3)' }}>
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Boletim INFORMAKON" />
        <div className="p-6 text-center" style={{ color: 'var(--text-3)' }}>Medição não encontrada</div>
      </div>
    )
  }

  const tag = `MED-${String(data.medicao.numero).padStart(3, '0')}`
  const dataReferencia = data.medicao.data_aprovacao || data.medicao.data_submissao
  const isPendente =
    data.medicao.status === 'submetido' || data.medicao.status === 'em_analise'

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
      <Topbar title={`Boletim INFORMAKON · ${tag}`} subtitle={`Período ${data.medicao.periodo_referencia} · Contrato ${data.medicao.contrato.numero}`} />

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
                  { header: '% Informakon', get: (l: any) => Number(l.pct_informakon) },
                  { header: 'Mat. Medido', get: (l: any) => Number(l.material_medido) },
                  { header: 'NF Terceiro', get: (l: any) => Number(l.nf_terceiro) },
                  { header: 'Saldo Aprov.', get: (l: any) => Number(l.saldo_aprovado) },
                  { header: 'NF Desc.', get: (l: any) => Number(l.nf_descontavel) },
                  { header: 'Gap', get: (l: any) => Number(l.gap_material) },
                  { header: 'Retido', get: (l: any) => Number(l.material_retido) },
                  { header: 'FIP Fat-Dir', get: (l: any) => Number(l.fip_faturar) },
                  { header: 'Wave (Serv.)', get: (l: any) => Number(l.wave_servico) },
                  { header: '% Serv. Med.', get: (l: any) => Number(pctServMedExibido(l)) },
                  { header: 'Valor Total Medido', get: (l: any) => Number(l.valor_total_medido) },
                  { header: 'Dados Informakon', get: (l: any) => Number(l.dados_informakon) },
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

        {/* Barra de aprovação/rejeição — só visível quando o aprovador pode agir */}
        {isPendente && podeAprovar && (
          <div
            className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap print:hidden"
            style={{
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.30)',
            }}
          >
            <div className="flex items-start gap-2 flex-1 min-w-[260px]">
              <Info className="w-4 h-4 mt-0.5" style={{ color: '#3B82F6' }} />
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-1)' }}>
                  Aprovação da medição {tag}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Revise item-a-item (incluindo confirmações &quot;sem mais NF&quot; pra itens com retido)
                  antes de aprovar e liberar a emissão de NF.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="success"
                size="sm"
                onClick={() => setModalLiberacao('aprovar')}
                title="Aprova a medição e dispara email de liberação para os envolvidos"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprovar e liberar NF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalAprovar(true)}
                title="Aprova sem disparar email"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprovar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setModalRejeitar(true)}
              >
                <XCircle className="w-4 h-4" />
                Rejeitar
              </Button>
            </div>
          </div>
        )}

        {/* Botão de re-disparo de email pós-aprovação (mantém paridade com a page.tsx) +
            botão de "Desfazer aprovação" — disponível apenas para quem pode aprovar. */}
        {!isPendente && data.medicao.status === 'aprovado' && podeAprovar && (
          <div className="flex justify-end gap-2 flex-wrap print:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={abrirDesfazer}
              className="border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              title="Reverte a medição para 'submetido'. Só permitido se nenhuma NF FIP material foi lançada após a aprovação."
            >
              <Undo2 className="w-4 h-4" />
              Desfazer aprovação
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModalLiberacao('reenviar')}
              className="border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              <Mail className="w-4 h-4" />
              Reenviar email de liberação
            </Button>
          </div>
        )}

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
          <Card label="Dados Informakon" value={formatCurrency(data.totais.dados_informakon)} accent="#10B981" hint={`Wave + NF Desc. (sem FIP) · Retenção ${pctFmt(data.medicao.contrato.percentual_retencao)} sobre Valor Total Medido: ${formatCurrency(data.totais.retencao)}`} />
        </div>

        {/* Aviso agregado — só aparece se há ao menos 1 ajuste aplicado */}
        {itensComAjuste > 0 && (
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-3"
            style={{
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.40)',
            }}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <div className="flex-1 text-xs" style={{ color: 'var(--text-2)' }}>
              <p className="font-semibold" style={{ color: '#F59E0B' }}>
                {itensComAjuste} {itensComAjuste === 1 ? 'item' : 'itens'} com confirmação &quot;sem mais NF&quot;
                — % de medição reduzido para proteger retenção contratual.
              </p>
              <p className="mt-0.5" style={{ color: 'var(--text-3)' }}>
                Veja em destaque amarelo nas linhas abaixo (ícone <AlertTriangle className="inline w-3 h-3" /> ao lado do código).
              </p>
            </div>
          </div>
        )}

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
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(16,185,129,0.05)' }}>% Informakon</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Mat. Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>NF Terceiro</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Saldo Aprov.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>NF Desc.</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(245,158,11,0.05)' }}>Gap</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(245,158,11,0.05)' }}>Retido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.05)' }}>FIP Fat-Dir</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>Wave (Serv.)</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}>% Serv. Med.</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Valor Total Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(16,185,129,0.05)' }}>Dados Informakon</th>
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
                          Marque &quot;Mostrar todos&quot; pra ver todos os itens do contrato.
                        </div>
                      )}
                    </td>
                  </tr>
                ) : linhasExibidas.map((l, idx) => {
                  const ajustado = !!l.ajuste_aplicado
                  // % exibido: ajustado se confirmado-sem-NF, físico caso contrário
                  const pctExibido = pctServMedExibido(l)
                  const pctOriginal = l.pct_serv_med_original ?? l.pct_medido
                  const codigoTooltip = ajustado
                    ? `Item teve % ajustado por confirmação 'sem mais NF'. Original: ${pctFmt(pctOriginal)}, atual: ${pctFmt(pctExibido)}`
                    : undefined

                  return (
                    <tr key={l.medicao_item_id || l.detalhamento_id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: ajustado
                          ? 'rgba(245,158,11,0.06)'
                          : (idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)'),
                      }}>
                      <td style={td('font-mono font-bold', '#3B82F6')}>
                        <span className="inline-flex items-center gap-1.5">
                          {ajustado && (
                            <span
                              title={codigoTooltip}
                              aria-label="Item com ajuste sem mais NF"
                              className="inline-flex"
                            >
                              <AlertTriangle
                                className="w-3.5 h-3.5"
                                style={{ color: '#F59E0B' }}
                              />
                            </span>
                          )}
                          {l.codigo}
                        </span>
                      </td>
                      <td style={{ ...td('break-words'), textAlign: 'left', maxWidth: 240 }}>{l.descricao}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>{pctFmt(l.pct_informakon, 4)}</td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(l.material_medido)}</td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.nf_terceiro)}</td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.saldo_aprovado)}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)' }}>{formatCurrency(l.nf_descontavel)}</td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: 'var(--text-3)' }}>{formatCurrency(l.gap_material)}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: l.material_retido > 0 ? '#F59E0B' : 'var(--text-3)' }}>{formatCurrency(l.material_retido)}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(59,130,246,0.04)', color: l.fip_faturar > 0 ? '#3B82F6' : 'var(--text-3)' }}>{formatCurrency(l.fip_faturar)}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)', color: '#0F766E' }}>{formatCurrency(l.wave_servico)}</td>
                      <td
                        style={{
                          ...td('tabular-nums'),
                          textAlign: 'right',
                          background: ajustado ? 'rgba(245,158,11,0.10)' : 'rgba(15,118,110,0.04)',
                          color: ajustado ? '#F59E0B' : '#0F766E',
                        }}
                      >
                        {pctFmt(pctExibido)}
                      </td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(l.valor_total_medido)}</td>
                      <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(16,185,129,0.06)', color: '#10B981' }}>{formatCurrency(l.dados_informakon)}</td>
                      <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(99,102,241,0.06)', color: '#818CF8' }}>{formatCurrency(l.retencao)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {linhasExibidas.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-3)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={2} style={{ ...td(), textAlign: 'right' }}>TOTAIS</td>
                    <td style={{ ...td(), background: 'rgba(16,185,129,0.10)' }}></td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_terceiro, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.saldo_aprovado, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_descontavel, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.gap_material, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)', color: '#F59E0B' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_retido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.06)', color: '#3B82F6' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.fip_faturar, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)', color: '#0F766E' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.wave_servico, 0))}</td>
                    <td style={{ ...td(), background: 'rgba(15,118,110,0.06)' }}></td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.valor_total_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(16,185,129,0.10)', color: '#10B981' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.dados_informakon, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(99,102,241,0.10)', color: '#818CF8' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.retencao, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </MaximizableCard>

        <p className="text-[11px] print:hidden" style={{ color: 'var(--text-3)' }}>
          <TrendingUp className="inline w-3 h-3 mr-1" />
          No Informakon, lance por item o <strong>% Informakon</strong> — Dados Informakon = Wave + NF Desc.
          (FIP Fat-Dir <em>não entra</em>: a NF ainda não existe). Retenção {pctFmt(data.medicao.contrato.percentual_retencao)} aplicada sobre <em>Valor Total Medido</em> (% medido × valor global do item) e abatida da NF da Wave.
          Clique em <strong>Critério</strong> pra ver a regra completa.
        </p>
      </div>

      {/* ============================ */}
      {/*   Modais de aprovação        */}
      {/* ============================ */}

      {/* Aprovar SEM email */}
      <Dialog open={modalAprovar} onOpenChange={(open) => { if (!open) { setModalAprovar(false); setErroAcao('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição {tag}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Período: {data.medicao.periodo_referencia} · Contrato {data.medicao.contrato.numero}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg text-xs text-emerald-400">
              Aprovação simples, sem disparo de email aos envolvidos. Para aprovar e disparar o email de
              liberação, use <strong>Aprovar e liberar NF</strong>.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">Comentário (opcional)</Label>
              <Textarea
                placeholder="Adicione observações sobre a aprovação..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
            </div>
            {erroAcao && <p className="text-xs text-red-400">{erroAcao}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(false)} disabled={saving}>Cancelar</Button>
            <Button variant="success" onClick={aprovarSemEmail} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejeitar */}
      <Dialog open={modalRejeitar} onOpenChange={(open) => { if (!open) { setModalRejeitar(false); setErroAcao('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeitar Medição {tag}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Informe o motivo da rejeição. O fornecedor será notificado por e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">Motivo da Rejeição *</Label>
              <Textarea
                placeholder="Descreva claramente o motivo da rejeição e o que precisa ser corrigido..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-[100px] bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
            </div>
            {erroAcao && <p className="text-xs text-red-400">{erroAcao}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(false)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitar} loading={saving} disabled={!motivo.trim()}>
              <XCircle className="w-4 h-4" />
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aprovar e LIBERAR NF — modal grande com preview de email + envolvidos */}
      <EmailLiberacaoMedicaoModal
        open={modalLiberacao !== null}
        onClose={() => setModalLiberacao(null)}
        contratoId={contratoId}
        medicaoId={medicaoId}
        modo={modalLiberacao ?? 'aprovar'}
        onSent={() => {
          setModalLiberacao(null)
          carregar()
        }}
      />

      {/* ============================ */}
      {/*   Modal Confirmar sem mais NF (item-a-item)  */}
      {/* ============================ */}
      <Dialog
        open={!!modalConfirmar}
        onOpenChange={(open) => { if (!open && !salvandoConfirmacao) { setModalConfirmar(null); setErroConfirmacao('') } }}
      >
        <DialogContent>
          {modalConfirmar && (
            <>
              <DialogHeader>
                <DialogTitle className={modalConfirmar.confirmar ? 'text-amber-400 flex items-center gap-2' : 'text-[var(--text-1)] flex items-center gap-2'}>
                  {modalConfirmar.confirmar
                    ? <><AlertTriangle className="w-5 h-5" /> Confirmar &quot;sem mais NF&quot;</>
                    : <><X className="w-5 h-5" /> Reverter confirmação?</>}
                </DialogTitle>
                <DialogDescription className="text-[var(--text-2)]">
                  Item <strong className="font-mono">{modalConfirmar.item.codigo}</strong>
                  {' · '}
                  {modalConfirmar.item.descricao.length > 80
                    ? modalConfirmar.item.descricao.slice(0, 80) + '...'
                    : modalConfirmar.item.descricao}
                </DialogDescription>
              </DialogHeader>

              {modalConfirmar.confirmar ? (
                <div className="py-2 space-y-3">
                  <div className="p-3 rounded-lg text-xs"
                    style={{
                      background: 'rgba(245,158,11,0.10)',
                      border: '1px solid rgba(245,158,11,0.40)',
                      color: 'var(--text-2)',
                    }}>
                    Ao marcar, o <strong>% Serv. Medido</strong> deste item será reduzido pra coincidir com o
                    <strong> % Informakon</strong> — protege a retenção contratual quando o fornecedor confirma
                    que não emitirá mais NF para o material restante.
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                      Motivo *
                    </Label>
                    <Textarea
                      value={motivoSemNf}
                      onChange={e => setMotivoSemNf(e.target.value)}
                      className="min-h-[80px] bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                      placeholder="Justificativa da confirmação..."
                    />
                  </div>
                  {erroConfirmacao && <p className="text-xs text-red-400">{erroConfirmacao}</p>}
                </div>
              ) : (
                <div className="py-2 space-y-3">
                  <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                    Ao reverter, o <strong>% Serv. Medido</strong> volta para o valor físico
                    {modalConfirmar.item.pct_serv_med_original !== undefined && (
                      <> ({pctFmt(modalConfirmar.item.pct_serv_med_original)})</>
                    )}.
                  </p>
                  {erroConfirmacao && <p className="text-xs text-red-400">{erroConfirmacao}</p>}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setModalConfirmar(null)} disabled={salvandoConfirmacao}>
                  Cancelar
                </Button>
                <Button
                  variant={modalConfirmar.confirmar ? 'success' : 'destructive'}
                  loading={salvandoConfirmacao}
                  disabled={modalConfirmar.confirmar && !motivoSemNf.trim()}
                  onClick={salvarConfirmacao}
                >
                  {modalConfirmar.confirmar ? 'Confirmar' : 'Reverter'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================ */}
      {/*   Modal Desfazer aprovação   */}
      {/* ============================ */}
      <Dialog
        open={modalDesfazer}
        onOpenChange={(open) => {
          if (!open && !salvandoDesfazer) {
            setModalDesfazer(false)
            setErroDesfazer('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Undo2 className="w-5 h-5" />
              Desfazer aprovação desta medição?
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              {tag} · Período {data.medicao.periodo_referencia} · Contrato {data.medicao.contrato.numero}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 rounded-lg text-xs"
              style={{
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.40)',
                color: 'var(--text-2)',
              }}>
              <p className="font-semibold text-amber-400 mb-1">
                <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
                Atenção
              </p>
              A medição voltará para <strong>&quot;submetido&quot;</strong>. Só é permitido se
              <strong> nenhuma NF FIP material </strong>
              foi lançada após a aprovação.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                Motivo * (mínimo 10 caracteres)
              </Label>
              <Textarea
                value={motivoDesfazer}
                onChange={e => setMotivoDesfazer(e.target.value)}
                placeholder="Justificativa do desfazimento da aprovação..."
                className="min-h-[100px] bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
              <p className="text-[10px] text-[var(--text-3)]">
                {motivoDesfazer.trim().length}/10 caracteres
              </p>
            </div>
            {erroDesfazer && <p className="text-xs text-red-400 break-words">{erroDesfazer}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDesfazer(false)} disabled={salvandoDesfazer}>
              Cancelar
            </Button>
            <Button
              variant="warning"
              onClick={confirmarDesfazer}
              loading={salvandoDesfazer}
              disabled={motivoDesfazer.trim().length < 10}
            >
              <Undo2 className="w-4 h-4" />
              Confirmar Desfazer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} pctRetencao={data.medicao.contrato.percentual_retencao} />}
    </div>
  )
}

/** % Serv. Med. exibido — usa o ajustado se disponível, senão o físico. */
function pctServMedExibido(l: Linha): number {
  if (typeof l.pct_serv_med === 'number' && Number.isFinite(l.pct_serv_med)) return l.pct_serv_med
  return l.pct_medido
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
              <li><strong>FIP Fat-Dir</strong> = Gap − Retido. Solicitação de fat-direto criada automaticamente em nome da FIP (status: aprovado). <em>Ainda assim NÃO entra no Dados Informakon</em> — a NF ainda não foi emitida.</li>
              <li><strong>Wave (Serv.)</strong> = qtd × <code>valor_servico_unit</code>. NF da Wave a emitir.</li>
              <li><strong>% Serv. Med.</strong> = qtd medida ÷ qtd contratada × 100 (físico). Quando o aprovador marca &quot;sem mais NF&quot;, este % é reduzido para coincidir com o % Informakon — protegendo a retenção.</li>
              <li><strong>Valor Total Medido</strong> = Mat. Medido + Serv. Medido (físico, sem ajuste).</li>
              <li><strong>Dados Informakon</strong> = Wave + NF Desc. <em>FIP Fat-Dir NÃO entra</em> (NF ainda não existe; só desconta o que já foi efetivamente lançado).</li>
              <li><strong>% Informakon</strong> = Dados Informakon ÷ valor global do item × 100. <strong>Use este pra lançar</strong>, não o % físico.</li>
              <li><strong>Retenção</strong> = % medido × valor global do item × {pctFmt(pctRetencao)} (= Valor Total Medido × {pctFmt(pctRetencao)}). É abatida da NF da Wave (serviço).</li>
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
                    <th style={{ ...th(), textAlign: 'right' }}>FIP (a criar)</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Wave</th>
                    <th style={{ ...th(), textAlign: 'right' }}>Dados Inf.</th>
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
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>7.687</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>25,00%</td>
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
                    <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', color: '#10B981' }}>13.373,89</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>43,4955%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.30)' }}>
            <p className="text-[12px]"><strong style={{ color: '#10B981' }}>Por que C e D dão o mesmo Dados Informakon?</strong> Porque <em>FIP Fat-Dir não entra</em> — só desconta NF efetivamente lançada. A diferença entre C e D fica registrada nas colunas Retido (C: 2.000) e FIP Fat-Dir (D: 1.000 a criar). Quando a NF terceira do saldo aprovado chegar, vira NF Desc. nas próximas medições.</p>
          </section>

          <section className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }}>
            <p className="text-[12px]"><strong style={{ color: '#F59E0B' }}>Atenção pra pesos diferentes mat/serv:</strong> as colunas usam o <code>valor_material_unit</code> e <code>valor_servico_unit</code> de cada item — não há divisão fixa 50/50. O cálculo é por item, com pesos do contrato. Itens onde a parcela de material é dominante terão FIP ou retido proporcionalmente maiores.</p>
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
