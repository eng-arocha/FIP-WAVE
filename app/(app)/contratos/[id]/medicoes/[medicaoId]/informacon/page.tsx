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
import {
  useBreakdownAjuste, BreakdownAjusteGrid, BreakdownCarregando,
} from '@/components/medicoes/breakdown-ajuste'
import { excedeTeto, mensagemExcedeTeto } from '@/lib/medicao-teto'
import {
  NfDescDrilldown, type NfDescLinha, type ColunaDrilldown,
} from '@/components/medicoes/nf-desc-drilldown'
import { EmailLiberacaoMedicaoModal } from '@/components/medicoes/email-liberacao-medicao-modal'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  ArrowLeft, Loader2, Download, Copy, Check, FileText, TrendingUp, Printer, HelpCircle, X,
  CheckCircle2, XCircle, Mail, AlertTriangle, Info, Undo2, Pencil,
} from 'lucide-react'

interface Linha {
  medicao_item_id: string | null
  existe_no_banco?: boolean
  detalhamento_id: string
  codigo: string
  codigo_informakon: string | null
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
  /**
   * Parte de `nf_descontavel` coberta por NF ociosa de OUTRO detalhamento do
   * mesma tarefa. Explica por que uma linha com `nf_terceiro` = 0 pode
   * ter `nf_descontavel` > 0. Ausente em respostas antigas.
   */
  nf_transbordo_grupo?: number
  /**
   * Parte de `nf_descontavel` que excede o material medido NO PERÍODO — nota
   * de medições anteriores recuperada pela régua acumulada.
   */
  nf_recuperacao_anterior?: number
  gap_material: number
  faturamento_direto_em_aberto: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  pct_informakon: number
  /** Valor que o Informakon deve liberar = serviço medido + material com nota. */
  informakon_a_lancar?: number
  /** O percentual que se DIGITA no Informakon. */
  pct_informakon_a_lancar?: number
  /** dados_informakon − informakon_a_lancar. Positivo = Gap segurado. */
  correcao_informakon?: number
  alterado_por_retido?: boolean
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
  // === Migration 061 — ajustes do admin ===
  foi_ajustado_pelo_admin?: boolean
  ajustes_admin?: Array<{
    quantidade_anterior: number
    quantidade_nova: number
    motivo: string
    ajustado_em: string
    ajustado_por_nome: string | null
  }>
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
    faturamento_direto_em_aberto: number
    fip_faturar: number
    wave_servico: number
    valor_total_medido: number
    dados_informakon: number
    total_informakon: number
    informakon_a_lancar?: number
    correcao_informakon?: number
    base_retencao: number
    retencao: number
    material_acumulado: number
    servico_acumulado: number
    /** Parte do desconto recuperada de medições anteriores (régua acumulada). */
    nf_recuperacao_anterior?: number
    /** Divergência de rateio material/serviço contra o ERP da FIP. */
    ajuste_material_anterior?: number
    /** NF de serviço a emitir = wave_servico − retenção − ajuste. */
    servico_liquido?: number
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

  const [modalAutorizar, setModalAutorizar] = useState(false)
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

  // === Modal "Ajustar quantidade" (admin durante aprovação) — migration 061 ===
  const [modalAjustar, setModalAjustar] = useState<{ item: Linha } | null>(null)
  const [novaQuantidade, setNovaQuantidade] = useState('')
  const [novaPct, setNovaPct] = useState('')
  const [novaReais, setNovaReais] = useState('')
  const [novaInformakon, setNovaInformakon] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)
  const [erroAjuste, setErroAjuste] = useState('')
  /**
   * Itens medidos célula a célula (PAV TIPO, vãos, parcelas mensais) ajustam
   * o % de cada célula, não a quantidade agregada — só assim dá pra corrigir
   * um pavimento de 90% pra 50%. `forcarAgregado` é o escape hatch pra
   * descartar o breakdown e voltar aos campos qtd/%/R$.
   */
  const [forcarAgregado, setForcarAgregado] = useState(false)
  /** Linha + coluna abertas no drill-down de origem (NF Desc. / NF Terceiro / Saldo Aprov.). */
  const [drilldownNf, setDrilldownNf] = useState<{ linha: Linha; coluna: ColunaDrilldown } | null>(null)
  const breakdown = useBreakdownAjuste(contratoId, medicaoId, modalAjustar?.item.detalhamento_id ?? null)
  const usaGradeBreakdown = !!breakdown.estado?.suporta_breakdown && !forcarAgregado

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
      'Código', 'Item Informakon', 'Descrição', '% Informakon (espelho)', '% a lançar',
      'Mat. Medido', 'NF Terceiro', 'Saldo Aprov.', 'NF Desc.', 'NF Desc. da tarefa', 'Gap', 'Retido', 'FIP Fat-Dir',
      'Wave (Serv.)', '% Serv. Med.', 'Valor Total Medido', 'Dados Informakon', 'A lançar (R$)', 'Correção', 'Retenção',
    ]
    const rows = linhasExibidas.map(l => [
      l.codigo,
      l.codigo_informakon ?? '',
      l.descricao,
      pctFmt(l.pct_informakon, 4),
      pctFmt(Number(l.pct_informakon_a_lancar ?? l.pct_informakon), 4),
      l.material_medido.toFixed(2).replace('.', ','),
      l.nf_terceiro.toFixed(2).replace('.', ','),
      l.saldo_aprovado.toFixed(2).replace('.', ','),
      l.nf_descontavel.toFixed(2).replace('.', ','),
      Number(l.nf_transbordo_grupo || 0).toFixed(2).replace('.', ','),
      l.gap_material.toFixed(2).replace('.', ','),
      l.faturamento_direto_em_aberto.toFixed(2).replace('.', ','),
      l.fip_faturar.toFixed(2).replace('.', ','),
      l.wave_servico.toFixed(2).replace('.', ','),
      pctFmt(pctServMedExibido(l)),
      l.valor_total_medido.toFixed(2).replace('.', ','),
      l.dados_informakon.toFixed(2).replace('.', ','),
      Number(l.informakon_a_lancar ?? l.dados_informakon).toFixed(2).replace('.', ','),
      Number(l.correcao_informakon || 0).toFixed(2).replace('.', ','),
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
  // PORTÃO 1 — Autorizar: libera a NF de material FIP (não aprova ainda a
  // emissão da NF de serviço; isso é o portão 2 depois da NF de material).
  async function autorizar() {
    setSaving(true)
    setErroAcao('')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/autorizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErroAcao(body?.error || `Falha (HTTP ${res.status}).`); return }
      setModalAutorizar(false)
      setComentario('')
      await carregar()
    } finally {
      setSaving(false)
    }
  }

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

  // ============================================================
  // Ajustar quantidade (admin durante aprovação) — migration 061
  // ============================================================
  // Formata % sem zeros à direita desnecessários, até 8 casas decimais
  const fmtPct = (n: number) => parseFloat(n.toFixed(8)).toString()
  // Formata quantidade sem zeros desnecessários, até 6 casas decimais (limite do BD)
  const fmtQty = (n: number) => parseFloat(n.toFixed(6)).toString()

  // Replica exatamente a fórmula do servidor para dados_informakon dado um qty alvo.
  // Usa nf_terceiro e saldo_aprovado (campos estáticos do item) para derivar o
  // faturamento_direto_em_aberto correto — ao contrário de item.faturamento_direto_em_aberto
  // que é calculado para o qty atual e fica obsoleto quando qty muda.
  function computeInformakon(qty: number, item: Linha): number {
    const servUnit           = item.valor_servico_unit
    const matUnit            = item.valor_material_unit
    const qtdContr           = item.quantidade_contratada
    const nfTerceiro         = item.nf_terceiro
    const saldoAprov         = item.saldo_aprovado
    const valorServTotal     = qtdContr * servUnit

    const matMedido          = qty * matUnit
    const nfDescontavel      = Math.min(matMedido, nfTerceiro)
    const gapMaterial        = Math.max(0, matMedido - nfDescontavel)
    const fatDir             = Math.min(gapMaterial, saldoAprov)

    const pctServMed         = qtdContr > 0 ? (qty / qtdContr) * 100 : 0
    const ajusteAplicado     = item.confirmacao_sem_nf && fatDir > 0
    const pctAdj             = ajusteAplicado && valorServTotal > 0
      ? Math.max(0, pctServMed - (fatDir / valorServTotal) * 100)
      : pctServMed
    const waveServico        = (pctAdj / 100) * valorServTotal
    // Espelha a fórmula do servidor (ver informacon-data.ts): o Informakon
    // mostra serviço + material medido, sem deduzir pedido sem NF.
    return waveServico + matMedido
  }

  // Inverte dados_informakon → qty por busca binária sobre computeInformakon.
  // Garante resultado correto para qualquer configuração de item (sem análise
  // de casos que pode ter edge-cases). Funciona porque computeInformakon é
  // monotonicamente crescente em qty (d/d_qty ≥ servUnit > 0) no caminho
  // sem sem_nf. Para sem_nf com matUnit > servUnit (raro), usa a fórmula
  // analítica como fallback.
  function invertInformakon(target: number, item: Linha): number {
    const servUnit = item.valor_servico_unit
    if (servUnit <= 0) return 0

    // Estimativa inicial: qty = target / servUnit (cota superior sem material)
    let hi = Math.max(target / servUnit * 2, 1)
    // Garante que hi seja grande o suficiente
    for (let i = 0; i < 30 && computeInformakon(hi, item) < target; i++) hi *= 2

    let lo = 0
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const val = computeInformakon(mid, item)
      if (Math.abs(val - target) < 0.0001) return mid
      if (val < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }

  function abrirModalAjustar(item: Linha) {
    const qty      = item.quantidade_medida
    const qtdContr = item.quantidade_contratada
    const servUnit = item.valor_servico_unit
    setNovaQuantidade(String(qty))
    setNovaPct(qtdContr > 0 ? fmtPct((qty / qtdContr) * 100) : '')
    setNovaReais(servUnit > 0 ? (qty * servUnit).toFixed(2) : '')
    setNovaInformakon(item.dados_informakon.toFixed(2))
    setMotivoAjuste('')
    setErroAjuste('')
    setModalAjustar({ item })
  }

  function syncFromQty(num: number, item: Linha) {
    const qtdContr = item.quantidade_contratada
    const servUnit = item.valor_servico_unit
    if (qtdContr > 0) setNovaPct(fmtPct((num / qtdContr) * 100))
    if (servUnit > 0) setNovaReais((num * servUnit).toFixed(2))
    setNovaInformakon(computeInformakon(num, item).toFixed(2))
  }

  function handleQtdChange(val: string) {
    setNovaQuantidade(val)
    const num = parseFloat(val.replace(',', '.'))
    if (isNaN(num) || !modalAjustar) return
    syncFromQty(num, modalAjustar.item)
  }

  function handlePctChange(val: string) {
    setNovaPct(val)
    const pct = parseFloat(val.replace(',', '.'))
    if (isNaN(pct) || !modalAjustar) return
    const qty = (pct / 100) * modalAjustar.item.quantidade_contratada
    setNovaQuantidade(fmtQty(qty))
    syncFromQty(qty, modalAjustar.item)
  }

  function handleReaisChange(val: string) {
    setNovaReais(val)
    const reais = parseFloat(val.replace(',', '.'))
    if (isNaN(reais) || !modalAjustar) return
    const servUnit = modalAjustar.item.valor_servico_unit
    if (servUnit <= 0) return
    const qty = reais / servUnit
    setNovaQuantidade(fmtQty(qty))
    syncFromQty(qty, modalAjustar.item)
  }

  function handleInformakonChange(val: string) {
    setNovaInformakon(val)
    const informakon = parseFloat(val.replace(',', '.'))
    if (isNaN(informakon) || !modalAjustar) return
    const item = modalAjustar.item
    if (item.valor_servico_unit <= 0) return
    const qty = invertInformakon(informakon, item)
    setNovaQuantidade(fmtQty(qty))
    if (item.quantidade_contratada > 0) setNovaPct(fmtPct((qty / item.quantidade_contratada) * 100))
    if (item.valor_servico_unit > 0) setNovaReais((qty * item.valor_servico_unit).toFixed(2))
  }

  async function salvarAjuste() {
    if (!modalAjustar) return
    const { item } = modalAjustar
    if (motivoAjuste.trim().length < 10) {
      setErroAjuste('Motivo precisa ter pelo menos 10 caracteres.')
      return
    }

    let payload: Record<string, any>
    if (usaGradeBreakdown) {
      if (breakdown.resumo.totalAlteradas === 0) {
        setErroAjuste(`Nenhum ${breakdown.estado?.modo?.termo ?? 'item'} foi alterado.`)
        return
      }
      payload = { pavimentos_pct: breakdown.resumo.mapa, motivo: motivoAjuste.trim() }
    } else {
      const qtyNum = Number(novaQuantidade.replace(',', '.'))
      if (!Number.isFinite(qtyNum) || qtyNum < 0) {
        setErroAjuste('Quantidade inválida.')
        return
      }
      // Teto do contrato — o servidor é a autoridade, isto só evita o 409.
      const tetoItem = breakdown.estado?.teto ?? null
      if (excedeTeto(qtyNum, tetoItem)) {
        setErroAjuste(mensagemExcedeTeto({
          codigo: item.codigo,
          unidade: item.unidade,
          quantidadeContratada: item.quantidade_contratada,
          qtdAnterior: breakdown.estado?.qtd_anterior ?? 0,
          qtdNova: qtyNum,
          teto: tetoItem as number,
        }))
        return
      }
      if (Math.abs(qtyNum - item.quantidade_medida) < 1e-6) {
        setErroAjuste('A quantidade nova é igual à atual.')
        return
      }
      payload = { quantidade_nova: qtyNum, motivo: motivoAjuste.trim() }
      // Item de breakdown ajustado pela quantidade agregada: confirma o
      // descarte do breakdown, senão a rota recusa por inconsistência.
      if (breakdown.estado?.suporta_breakdown) payload.descartar_breakdown = true
    }

    setSalvandoAjuste(true)
    setErroAjuste('')
    try {
      // Usa rota por detalhamento (faz upsert: cria medicao_item se não
      // existir, atualiza se já existe). Funciona pra item virtual também.
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/detalhamentos/${item.detalhamento_id}/ajustar`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroAjuste(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setModalAjustar(null)
      setNovaQuantidade('')
      setNovaPct('')
      setNovaReais('')
      setNovaInformakon('')
      setMotivoAjuste('')
      setForcarAgregado(false)
      await carregar()
    } catch (e: any) {
      setErroAjuste(e?.message || 'Erro de rede.')
    } finally {
      setSalvandoAjuste(false)
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
  // Portão 1 já concluído: material FIP liberado, aguardando lançamento da
  // NF de material pra liberar o portão 2 (emissão da NF de serviço).
  const isAutorizado = data.medicao.status === 'autorizado'

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
      case 'autorizado':
        return {
          label: 'Autorizado · Material FIP liberado (portão 1)',
          descricao: 'Material liberado para faturamento direto. Lance a NF de material no sistema; depois aprove a emissão da NF de serviço (portão 2). Valores ainda podem ser ajustados até a aprovação final.',
          color: '#14B8A6',
          bg: 'rgba(20,184,166,0.10)',
          border: 'rgba(20,184,166,0.40)',
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
      {/* Marca d'água de simulação — só na impressão (rascunho). `fixed`
          repete em todas as páginas impressas. */}
      {data.medicao.status === 'rascunho' && (
        <div aria-hidden className="hidden print:flex fixed inset-0 z-50 items-center justify-center pointer-events-none">
          <span style={{
            transform: 'rotate(-30deg)',
            fontSize: '110px',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: 'rgba(100,116,139,0.14)',
            whiteSpace: 'nowrap',
          }}>
            SIMULAÇÃO
          </span>
        </div>
      )}
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
                  { header: 'Item Informakon', get: (l: any) => l.codigo_informakon ?? '' },
                  { header: 'Descrição', get: (l: any) => l.descricao },
                  { header: '% Informakon (espelho)', get: (l: any) => Number(l.pct_informakon) },
                  { header: '% a lançar', get: (l: any) => Number(l.pct_informakon_a_lancar ?? l.pct_informakon) },
                  { header: 'Correção (não pagar)', get: (l: any) => Number(l.correcao_informakon || 0) },
                  { header: 'Mat. Medido', get: (l: any) => Number(l.material_medido) },
                  { header: 'NF Terceiro', get: (l: any) => Number(l.nf_terceiro) },
                  { header: 'Saldo Aprov.', get: (l: any) => Number(l.saldo_aprovado) },
                  { header: 'NF Desc.', get: (l: any) => Number(l.nf_descontavel) },
                  { header: 'NF Desc. da tarefa', get: (l: any) => Number(l.nf_transbordo_grupo || 0) },
                  { header: 'Gap', get: (l: any) => Number(l.gap_material) },
                  { header: 'Retido', get: (l: any) => Number(l.faturamento_direto_em_aberto) },
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

        {/* PORTÃO 1 — Autorizar (libera NF de material FIP). Visível enquanto
            a medição está pendente (submetido/em_analise). */}
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
                  Portão 1 — Autorizar medição {tag}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Revise item-a-item (incluindo confirmações &quot;sem mais NF&quot;). Ao autorizar,
                  o material FIP é liberado para faturamento direto. A NF de serviço só é liberada
                  no <strong>portão 2</strong>, após a NF de material ser lançada no sistema.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="success"
                size="sm"
                onClick={() => setModalAutorizar(true)}
                title="Autoriza a medição e libera a emissão da NF de material FIP (portão 1)"
              >
                <CheckCircle2 className="w-4 h-4" />
                Autorizar (liberar material FIP)
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

        {/* PORTÃO 2 — Aprovar emissão da NF de serviço. Visível quando a
            medição já foi autorizada (portão 1 concluído). */}
        {isAutorizado && podeAprovar && (
          <div
            className="rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap print:hidden"
            style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.30)',
            }}
          >
            <div className="flex items-start gap-2 flex-1 min-w-[260px]">
              <Info className="w-4 h-4 mt-0.5" style={{ color: '#10B981' }} />
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-1)' }}>
                  Portão 2 — Aprovar emissão da NF de serviço · {tag}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Material já autorizado (portão 1). Aprove a emissão da NF de serviço da Wave
                  <strong> somente após a NF de material FIP ter sido lançada</strong> no sistema —
                  o sistema valida esse pré-requisito.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="success"
                size="sm"
                onClick={() => setModalLiberacao('aprovar')}
                title="Aprova a emissão da NF de serviço e dispara email de liberação"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprovar e liberar NF serviço
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalAprovar(true)}
                title="Aprova a emissão da NF de serviço sem disparar email"
              >
                <CheckCircle2 className="w-4 h-4" />
                Aprovar (sem email)
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
        {(() => {
          // O card "Wave (Serviço)" mostra o LÍQUIDO, que é o valor da nota a
          // emitir — serviço bruto menos retenção menos ajuste de rateio. O
          // bruto vai na dica, senão o número da tela não bate com o do
          // espelho enviado à FIP.
          const ajusteRateio = Number(data.totais.ajuste_material_anterior || 0)
          const liquidoWave = data.totais.servico_liquido != null
            ? Number(data.totais.servico_liquido)
            : data.totais.wave_servico - data.totais.retencao - ajusteRateio
          const recuperacao = Number(data.totais.nf_recuperacao_anterior || 0)
          // Dedução do espelho: a linha "desconto de notas lançadas no
          // Informakon" é o material medido pelo rateio DELES — o nosso mais o
          // ajuste. Não confundir com a NF de terceiro descontada.
          const deducaoEspelho = data.totais.material_medido + ajusteRateio
          return (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card
                label="Wave (Serviço)"
                value={formatCurrency(liquidoWave)}
                accent="#0F766E"
                hint={`NF Wave a emitir · bruto ${formatCurrency(data.totais.wave_servico)} − retenção ${formatCurrency(data.totais.retencao)}${ajusteRateio !== 0 ? ` ${ajusteRateio > 0 ? '−' : '+'} ajuste de rateio ${formatCurrency(Math.abs(ajusteRateio))}` : ''}`}
              />
              <Card label="FIP (Material)" value={formatCurrency(data.totais.fip_faturar)} accent="#3B82F6" hint="Fat-direto FIP a criar" />
              <Card
                label="NF terceiro descontada"
                value={formatCurrency(data.totais.nf_descontavel)}
                accent="var(--text-2)"
                hint={`NF de material abatida${recuperacao > 0 ? `, dos quais ${formatCurrency(recuperacao)} recuperados de medições anteriores` : ''}. Não é a dedução do espelho — essa é o material pelo rateio da FIP: ${formatCurrency(deducaoEspelho)}`}
              />
              <Card label="Fat. Direto em aberto" value={formatCurrency(data.totais.faturamento_direto_em_aberto)} accent="#F59E0B" hint="Pedido FIP fat-direto aprovado, NF a emitir" />
              <Card
                label="Dados Informakon"
                value={formatCurrency(data.totais.dados_informakon)}
                accent="#10B981"
                hint={`Serviço Wave + material medido · − retenção ${pctFmt(data.medicao.contrato.percentual_retencao)} (${formatCurrency(data.totais.retencao)}) − dedução material (${formatCurrency(deducaoEspelho)}) = NF ${formatCurrency(liquidoWave)}`}
              />
            </div>
          )
        })()}

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
            <table className="w-full text-xs" style={{ minWidth: 1620, color: 'var(--text-1)', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface-3)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={th()}>Item</th>
                  <th style={{ ...th(), background: 'rgba(16,185,129,0.05)' }}>Item Informakon</th>
                  <th style={{ ...th(), textAlign: 'left' }}>Descrição</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(16,185,129,0.05)' }} title="Espelho do relatório: (serviço medido + material medido) ÷ valor global. NÃO é o número que se lança — ele inclui o Gap.">% Informakon <span style={{ opacity: 0.55, fontWeight: 400 }}>espelho</span></th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(59,130,246,0.10)', color: '#3B82F6' }} title="É ESTE que se digita no Informakon. Libera exatamente o serviço medido + o material que já virou nota — sem pagar Retido nem FIP Fat-Dir.">% a lançar</th>
                  <th style={{ ...th(), textAlign: 'right' }}>Mat. Medido</th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }} title="Clique no valor de qualquer linha para ver as notas fiscais alocadas ao item.">NF Terceiro <span style={{ opacity: 0.55, fontWeight: 400 }}>⧉</span></th>
                  <th style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }} title="Clique no valor de qualquer linha para ver os pedidos aprovados que ainda aguardam nota.">Saldo Aprov. <span style={{ opacity: 0.55, fontWeight: 400 }}>⧉</span></th>
                  <th
                    style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}
                    title="Clique no valor de qualquer linha para ver a conta passo a passo e as notas fiscais do balde que originou o desconto."
                  >
                    NF Desc. <span style={{ opacity: 0.55, fontWeight: 400 }}>⧉</span>
                  </th>
                  <th
                    style={{ ...th(), textAlign: 'right', background: 'rgba(15,118,110,0.05)' }}
                    title="Quanto do NF Desc. veio de nota alocada a OUTRO item da mesma tarefa (o código de dois níveis: 14.2 SPRINKLER, 16.1 INFRA SDAI). A FIP compra por lote e a medição é por pavimento — sem isso, a nota fica parada num item enquanto o vizinho aparece sem cobertura. Fora da tarefa nada transborda: cabo não é coberto por nota de eletroduto."
                  >
                    ↳ da tarefa
                  </th>
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
                    <td colSpan={17} style={{ padding: 36, textAlign: 'center', color: 'var(--text-3)' }}>
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
                  // Migration 061 — ajuste de quantidade pelo admin
                  const foiAjustadoAdmin = !!l.foi_ajustado_pelo_admin
                  const ajustesAdmin = l.ajustes_admin ?? []
                  const ajusteRecente = ajustesAdmin[ajustesAdmin.length - 1]
                  const tooltipAjusteAdmin = foiAjustadoAdmin && ajusteRecente
                    ? `Quantidade ajustada pelo admin (${ajustesAdmin.length}× ${ajustesAdmin.length === 1 ? 'vez' : 'vezes'}). Último: ${ajusteRecente.quantidade_anterior} → ${ajusteRecente.quantidade_nova} por ${ajusteRecente.ajustado_por_nome ?? '—'}. Motivo: "${ajusteRecente.motivo}"`
                    : undefined
                  const podeEditarQty = isPendente && podeAprovar

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
                          {foiAjustadoAdmin && (
                            <span
                              title={tooltipAjusteAdmin}
                              aria-label="Item com quantidade ajustada pelo admin"
                              className="inline-flex"
                            >
                              <Pencil
                                className="w-3 h-3"
                                style={{ color: '#F97316' }}
                              />
                            </span>
                          )}
                          {l.codigo}
                        </span>
                      </td>
                      <td
                        style={{
                          ...td('font-mono font-semibold'),
                          background: 'rgba(16,185,129,0.06)',
                          color: l.codigo_informakon ? '#10B981' : 'var(--text-3)',
                        }}
                        title={l.codigo_informakon ? `CT/Serv Informakon: ${l.codigo_informakon}` : 'Sem código Informakon vinculado'}
                      >
                        {l.codigo_informakon ?? '—'}
                      </td>
                      <td style={{ ...td('break-words'), textAlign: 'left', maxWidth: 240 }}>{l.descricao}</td>
                      <td
                        style={{
                          ...td('tabular-nums font-semibold'),
                          textAlign: 'right',
                          background: 'rgba(16,185,129,0.06)',
                          color: l.alterado_por_retido ? '#DC2626' : undefined,
                        }}
                        title={l.alterado_por_retido ? `Valor alterado por retido (R$ ${l.faturamento_direto_em_aberto.toFixed(2).replace('.', ',')}). Original sem retido seria maior.` : undefined}
                      >
                        {pctFmt(l.pct_informakon, 4)}
                      </td>
                      {/* O número que se DIGITA. Difere do espelho pelo Gap:
                          lançar o espelho faz o Informakon liberar material
                          sem nota e pagar Retido + FIP Fat-Dir à Wave. */}
                      {(() => {
                        const pctLancar = Number(l.pct_informakon_a_lancar ?? l.pct_informakon)
                        const correcao = Number(l.correcao_informakon || 0)
                        const temCorrecao = Math.abs(correcao) >= 0.01
                        return (
                          <td
                            style={{
                              ...td('tabular-nums font-semibold'),
                              textAlign: 'right',
                              background: 'rgba(59,130,246,0.08)',
                              color: '#3B82F6',
                            }}
                            title={temCorrecao
                              ? (correcao > 0
                                  ? `Corrigido em −${formatCurrency(correcao)} para não pagar material sem nota (Retido ${formatCurrency(l.faturamento_direto_em_aberto)} + FIP Fat-Dir ${formatCurrency(l.fip_faturar)}). Lançar o espelho (${pctFmt(l.pct_informakon, 4)}) pagaria esse valor à Wave.`
                                  : `Corrigido em +${formatCurrency(Math.abs(correcao))}: há nota de medições anteriores voltando pela régua acumulada. Sem esse acréscimo o desconto do Informakon deixaria a Wave no negativo.`)
                              : 'Sem correção: todo o material medido já tem nota lançada.'}
                          >
                            {pctFmt(pctLancar, 4)}
                            {temCorrecao && (
                              <span style={{ display: 'block', fontSize: 9, fontWeight: 400, opacity: 0.8 }}>
                                {correcao > 0 ? '−' : '+'}{formatCurrency(Math.abs(correcao))}
                              </span>
                            )}
                          </td>
                        )
                      })()}
                      <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(l.material_medido)}</td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)', padding: 0 }}>
                        {/* Notas alocadas a ESTE item — aqui a soma bate com a célula. */}
                        <button
                          type="button"
                          onClick={() => setDrilldownNf({ linha: l, coluna: 'nf-terceiro' })}
                          className="w-full h-full text-right px-2 py-1 hover:bg-teal-500/10 hover:underline decoration-dotted underline-offset-2 transition-colors print:hover:bg-transparent"
                          style={{ color: 'inherit', font: 'inherit' }}
                          title="Ver as notas fiscais alocadas a este item"
                        >
                          {formatCurrency(l.nf_terceiro)}
                        </button>
                      </td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.04)', padding: 0 }}>
                        {/* Pedidos aprovados cuja nota ainda não chegou. */}
                        <button
                          type="button"
                          onClick={() => setDrilldownNf({ linha: l, coluna: 'saldo-aprov' })}
                          className="w-full h-full text-right px-2 py-1 hover:bg-teal-500/10 hover:underline decoration-dotted underline-offset-2 transition-colors print:hover:bg-transparent"
                          style={{ color: 'inherit', font: 'inherit' }}
                          title="Ver os pedidos de faturamento direto aprovados que ainda aguardam nota"
                        >
                          {formatCurrency(l.saldo_aprovado)}
                        </button>
                      </td>
                      <td
                        style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(15,118,110,0.04)', padding: 0 }}
                        title={tituloNfDesc(l)}
                      >
                        {/* Clique abre a conta da linha + as notas do balde.
                            Ver components/medicoes/nf-desc-drilldown.tsx pra por
                            que isto NÃO é "as notas que somam este valor". */}
                        <button
                          type="button"
                          onClick={() => setDrilldownNf({ linha: l, coluna: 'nf-desc' })}
                          className="w-full h-full text-right px-2 py-1 hover:bg-teal-500/10 hover:underline decoration-dotted underline-offset-2 transition-colors print:hover:bg-transparent"
                          style={{ color: 'inherit', font: 'inherit' }}
                          title="Ver de onde vem este desconto e as notas do balde"
                        >
                          {formatCurrency(l.nf_descontavel)}
                        </button>
                      </td>
                      <td
                        style={{
                          ...td('tabular-nums'),
                          textAlign: 'right',
                          background: 'rgba(15,118,110,0.04)',
                          color: Number(l.nf_transbordo_grupo || 0) > 0 ? '#0F766E' : 'var(--text-3)',
                        }}
                        title={tituloNfDesc(l)}
                      >
                        {formatCurrency(Number(l.nf_transbordo_grupo || 0))}
                      </td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: 'var(--text-3)' }}>{formatCurrency(l.gap_material)}</td>
                      <td style={{ ...td('tabular-nums font-semibold'), textAlign: 'right', background: 'rgba(245,158,11,0.04)', color: l.faturamento_direto_em_aberto > 0 ? '#F59E0B' : 'var(--text-3)' }}>{formatCurrency(l.faturamento_direto_em_aberto)}</td>
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
                        <span className="inline-flex items-center gap-1.5 justify-end w-full">
                          {podeEditarQty && (
                            <button
                              onClick={() => abrirModalAjustar(l)}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded print:hidden hover:bg-orange-500/10"
                              style={{ color: '#F97316', border: '1px solid rgba(249,115,22,0.4)' }}
                              title="Admin: ajustar quantidade medida deste item"
                            >
                              <Pencil className="inline w-3 h-3 mr-0.5" />Ajustar
                            </button>
                          )}
                          <span>{pctFmt(pctExibido)}</span>
                        </span>
                      </td>
                      <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(l.valor_total_medido)}</td>
                      <td
                        style={{
                          ...td('tabular-nums font-bold'),
                          textAlign: 'right',
                          background: 'rgba(16,185,129,0.06)',
                          color: l.alterado_por_retido ? '#DC2626' : '#10B981',
                        }}
                        title={l.alterado_por_retido ? `Valor alterado por retido (R$ ${l.faturamento_direto_em_aberto.toFixed(2).replace('.', ',')}). Sem retido seria R$ ${(l.dados_informakon + l.faturamento_direto_em_aberto).toFixed(2).replace('.', ',')}.` : undefined}
                      >
                        {formatCurrency(l.dados_informakon)}
                      </td>
                      <td style={{ ...td('tabular-nums font-bold'), textAlign: 'right', background: 'rgba(99,102,241,0.06)', color: '#818CF8' }}>{formatCurrency(l.retencao)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {linhasExibidas.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--surface-3)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={3} style={{ ...td(), textAlign: 'right' }}>TOTAIS</td>
                    <td style={{ ...td(), background: 'rgba(16,185,129,0.10)' }}></td>
                    {/* Total a liberar no Informakon = serviço medido + material com nota. */}
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(59,130,246,0.10)', color: '#3B82F6' }}>
                      {formatCurrency(linhasExibidas.reduce((s, l) => s + Number(l.informakon_a_lancar ?? l.dados_informakon), 0))}
                    </td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.material_medido, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_terceiro, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.saldo_aprovado, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.nf_descontavel, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(15,118,110,0.06)', color: '#0F766E' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + Number(l.nf_transbordo_grupo || 0), 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.gap_material, 0))}</td>
                    <td style={{ ...td('tabular-nums'), textAlign: 'right', background: 'rgba(245,158,11,0.06)', color: '#F59E0B' }}>{formatCurrency(linhasExibidas.reduce((s, l) => s + l.faturamento_direto_em_aberto, 0))}</td>
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

      {/* PORTÃO 1 — Autorizar (liberar material FIP) */}
      <Dialog open={modalAutorizar} onOpenChange={(open) => { if (!open) { setModalAutorizar(false); setErroAcao('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Portão 1 — Autorizar Medição {tag}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Período: {data.medicao.periodo_referencia} · Contrato {data.medicao.contrato.numero}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-blue-900/20 border border-blue-800/40 rounded-lg text-xs text-blue-300 space-y-1">
              <p className="font-semibold">O que acontece ao autorizar:</p>
              <p>• O pedido de <strong>NF de material FIP</strong> (faturamento direto) é gerado/liberado.</p>
              <p>• A medição vai para o status <strong>Autorizado</strong>.</p>
              <p>• A <strong>NF de serviço da Wave NÃO é liberada ainda</strong> — isso é o portão 2,
                 disponível somente após a NF de material ser lançada no sistema.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">Comentário (opcional)</Label>
              <Textarea
                placeholder="Observações sobre a autorização do material..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
            </div>
            {erroAcao && <p className="text-xs text-red-400">{erroAcao}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAutorizar(false)} disabled={saving}>Cancelar</Button>
            <Button variant="success" onClick={autorizar} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Autorização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <NfDescDrilldown
        contratoId={contratoId}
        linha={(drilldownNf?.linha ?? null) as NfDescLinha | null}
        coluna={drilldownNf?.coluna}
        onClose={() => setDrilldownNf(null)}
      />

      {/* Modal Ajustar Quantidade (admin durante aprovação) — migration 061 */}
      <Dialog
        open={!!modalAjustar}
        onOpenChange={(open) => { if (!open && !salvandoAjuste) { setModalAjustar(null); setNovaPct(''); setNovaReais(''); setNovaInformakon(''); setErroAjuste(''); setForcarAgregado(false) } }}
      >
        <DialogContent className={usaGradeBreakdown ? 'max-w-3xl max-h-[92vh] overflow-y-auto' : undefined}>
          {modalAjustar && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2" style={{ color: '#F97316' }}>
                  <Pencil className="w-5 h-5" />
                  {usaGradeBreakdown
                    ? `Ajustar por ${breakdown.estado?.modo?.termo ?? 'célula'} — admin`
                    : 'Ajustar quantidade — admin'}
                </DialogTitle>
                <DialogDescription className="text-[var(--text-2)]">
                  Item <strong className="font-mono">{modalAjustar.item.codigo}</strong>
                  {' — '}
                  {modalAjustar.item.descricao.length > 80
                    ? modalAjustar.item.descricao.slice(0, 80) + '...'
                    : modalAjustar.item.descricao}
                </DialogDescription>
              </DialogHeader>
              <div className="py-3 space-y-3">
                {/* Valores atuais */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      Qtd atual
                    </Label>
                    <div className="px-2 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {modalAjustar.item.quantidade_medida}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      % atual
                    </Label>
                    <div className="px-2 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {modalAjustar.item.quantidade_contratada > 0
                        ? ((modalAjustar.item.quantidade_medida / modalAjustar.item.quantidade_contratada) * 100).toFixed(2) + '%'
                        : '—'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      R$ Wave atual
                    </Label>
                    <div className="px-2 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {(modalAjustar.item.quantidade_medida * modalAjustar.item.valor_servico_unit)
                        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      R$ Informakon atual
                    </Label>
                    <div className="px-2 py-1.5 rounded-lg font-mono text-xs" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {modalAjustar.item.dados_informakon.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                </div>
                {breakdown.carregando ? (
                  <BreakdownCarregando />
                ) : usaGradeBreakdown && breakdown.estado ? (
                  <>
                    <BreakdownAjusteGrid
                      estado={breakdown.estado}
                      mapa={breakdown.mapa}
                      setCelula={breakdown.setCelula}
                      resetar={breakdown.resetar}
                      resumo={breakdown.resumo}
                      unidade={modalAjustar.item.unidade}
                      desabilitado={salvandoAjuste}
                    />
                    <button
                      type="button"
                      onClick={() => { setForcarAgregado(true); setNovaQuantidade(String(modalAjustar.item.quantidade_medida)) }}
                      className="text-[10px] underline hover:no-underline"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Ajustar a quantidade total em vez das células (descarta o breakdown deste item)
                    </button>
                  </>
                ) : (
                  <>
                    {forcarAgregado && breakdown.estado?.suporta_breakdown && (
                      <div className="flex items-start justify-between gap-2 p-2 rounded-lg text-[10px] bg-orange-500/10 border border-orange-500/30 text-orange-300">
                        <span>
                          Este item é medido por {breakdown.estado.modo?.termo}. Salvar aqui apaga o
                          breakdown gravado nesta medição.
                        </span>
                        <button type="button" onClick={() => setForcarAgregado(false)} className="shrink-0 underline hover:no-underline">
                          voltar à grade
                        </button>
                      </div>
                    )}
                  {/* Novos valores — sincronizados */}
                  <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                      Novo valor — edite qualquer campo, os outros calculam automaticamente
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#F97316' }}>
                          Quantidade
                        </Label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={breakdown.estado?.teto ?? undefined}
                          value={novaQuantidade}
                          onChange={e => handleQtdChange(e.target.value)}
                          className="w-full bg-[var(--surface-1)] border border-orange-500/40 text-[var(--text-1)] rounded-lg px-2 py-1.5 outline-none font-mono text-sm"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#F97316' }}>
                          % Medido
                        </Label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={novaPct}
                            onChange={e => handlePctChange(e.target.value)}
                            disabled={modalAjustar.item.quantidade_contratada <= 0}
                            className="w-full bg-[var(--surface-1)] border border-orange-500/40 text-[var(--text-1)] rounded-lg px-2 py-1.5 outline-none font-mono text-sm pr-5 disabled:opacity-40"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-3)' }}>%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#F97316' }}>
                          R$ Wave
                        </Label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={novaReais}
                          onChange={e => handleReaisChange(e.target.value)}
                          disabled={modalAjustar.item.valor_servico_unit <= 0}
                          className="w-full bg-[var(--surface-1)] border border-orange-500/40 text-[var(--text-1)] rounded-lg px-2 py-1.5 outline-none font-mono text-sm disabled:opacity-40"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-medium uppercase tracking-wider" style={{ color: '#F97316' }}>
                          R$ Informakon
                        </Label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={novaInformakon}
                          onChange={e => handleInformakonChange(e.target.value)}
                          disabled={(modalAjustar.item.valor_servico_unit + modalAjustar.item.valor_material_unit) <= 0}
                          className="w-full bg-[var(--surface-1)] border border-orange-500/40 text-[var(--text-1)] rounded-lg px-2 py-1.5 outline-none font-mono text-sm disabled:opacity-40"
                        />
                      </div>
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      Qtd contratada: <strong className="font-mono">{modalAjustar.item.quantidade_contratada}</strong>
                      {' · '}
                      Unit. serviço: <strong className="font-mono">{modalAjustar.item.valor_servico_unit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </p>
                    {breakdown.estado?.teto != null && (
                      <p className="text-[10px]" style={{ color: '#F59E0B' }}>
                        Máximo desta medição: <strong className="font-mono">{breakdown.estado.teto}</strong>
                        {' '}— o contratado menos <strong className="font-mono">{breakdown.estado.qtd_anterior}</strong> já
                        aprovado em medições anteriores. Acima disso seria medir mais de 100% do contrato.
                      </p>
                    )}
                  </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                    Motivo do ajuste <span className="text-red-400">(obrigatório, mín. 10 caracteres)</span>
                  </Label>
                  <Textarea
                    placeholder="Ex.: 'Incluí item 19.1.1 (Administração) que ficou de fora da medição original.'"
                    value={motivoAjuste}
                    onChange={e => setMotivoAjuste(e.target.value)}
                    className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] min-h-[70px]"
                  />
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    O motivo aparece no histórico e no email pro solicitante. Seja específico.
                  </p>
                </div>
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-xs text-orange-400">
                  <strong>Atenção:</strong> esse ajuste fica permanente como histórico (tabela <code className="font-mono">medicao_item_ajustes</code>). Recalcula automaticamente Wave/FIP/% Informakon/retenção do item após salvar.
                </div>
                {erroAjuste && (
                  <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400">
                    {erroAjuste}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => { setModalAjustar(null); setNovaPct(''); setNovaReais(''); setErroAjuste(''); setForcarAgregado(false) }}
                  disabled={salvandoAjuste}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={salvarAjuste}
                  loading={salvandoAjuste}
                  disabled={
                    salvandoAjuste ||
                    breakdown.carregando ||
                    motivoAjuste.trim().length < 10 ||
                    (usaGradeBreakdown
                      ? breakdown.resumo.totalAlteradas === 0
                      : !novaQuantidade || !Number.isFinite(Number(novaQuantidade.replace(',', '.'))))
                  }
                  style={{ background: '#F97316' }}
                >
                  <Pencil className="w-4 h-4" />
                  Salvar ajuste
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Explica de onde veio o NF Desc. da linha.
 *
 * Sem isto o usuário vê "NF Terceiro R$ 0,00" ao lado de "NF Desc.
 * R$ 1.868,28" na mesma linha, sem nenhum caminho na tela pra descobrir a
 * origem da cobertura.
 */
function tituloNfDesc(l: Linha): string {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
  const transbordo = Number(l.nf_transbordo_grupo || 0)
  const recuperacao = Number(l.nf_recuperacao_anterior || 0)
  const partes: string[] = []

  if (transbordo > 0) {
    partes.push(
      `${fmt(transbordo)} vieram de nota alocada a outro item da MESMA TAREFA. ` +
      'A FIP compra por lote (prumada inteira) e a Wave mede por pavimento — o saldo ' +
      'de NF é apurado no nível da tarefa, então a nota parada num item cobre o vizinho. ' +
      'Fora da tarefa nada transborda.',
    )
  }
  if (recuperacao > 0) {
    partes.push(
      `${fmt(recuperacao)} são recuperação de medições anteriores: nota que não ` +
      'descontou no mês certo e voltou agora, porque o desconto é apurado sobre o ' +
      'acumulado da tarefa. É por isso que este valor pode superar o material medido no período.',
    )
  }
  if (partes.length === 0) {
    return `NF de material abatida nesta medição. Coberta pela nota do próprio item (${fmt(l.nf_terceiro)} alocados).`
  }
  return partes.join(' ')
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
              <li>
                <strong>NF Desc.</strong> = o que a nota de material abate nesta medição. <em>Não</em> é
                MIN(Mat. Medido, NF Terceiro) do próprio item: o saldo de NF é apurado no nível da{' '}
                <strong>tarefa</strong> (o código de dois níveis — 14.2 SPRINKLER, 16.1 INFRA SDAI), não
                do item. A FIP compra por lote (a prumada inteira) e a Wave mede por pavimento — sem isso
                a nota fica parada num detalhamento enquanto o vizinho da mesma tarefa aparece sem
                cobertura. Fora da tarefa nada transborda: nota de eletroduto (16.1) não cobre cabo
                (16.2), e Hidráulica não paga material de Elétrica.
              </li>
              <li>
                <strong>↳ da tarefa</strong> = quanto do NF Desc. veio de nota alocada a OUTRO item da
                mesma tarefa. É por isso que uma linha pode ter NF Terceiro R$ 0,00 e NF Desc. maior que
                zero. Note que o Informakon desconta por <em>macro item</em> (grupo), uma fronteira mais
                larga — então pode haver material que aqui aparece como "FIP a criar" e lá já está
                coberto.
              </li>
              <li>
                O desconto é apurado sobre o <strong>acumulado</strong> da tarefa — MENOR(material
                executado acumulado, nota lançada) menos o que as medições anteriores já abateram. Por
                isso o NF Desc. de um período pode <em>superar</em> o material medido nesse período:
                é nota que ficou para trás voltando de uma vez. Passe o mouse sobre o valor pra ver a
                composição.
              </li>
              <li>
                <strong>Gap</strong> = Mat. Medido − NF Desc. — a parte do material medido que
                nenhuma nota de terceiro cobriu ainda. É só um <em>intermediário</em>: não é
                gravado em lugar nenhum e não move dinheiro sozinho. Ele se reparte, sempre
                inteiro, entre as duas colunas seguintes — vale a identidade{' '}
                <strong>Gap = Retido + FIP Fat-Dir</strong>. Quem decide pagamento são elas.
              </li>
              <li>
                <strong>Retido</strong> = a parte do Gap que já tem <em>pedido fat-direto aprovado</em>{' '}
                esperando a nota do fornecedor chegar. Não vira NF da FIP nesta medição.
                <br />
                <span style={{ color: 'var(--text-3)' }}>
                  Atenção ao ler a linha: o saldo aprovado é apurado <strong>por tarefa</strong>, num
                  pool compartilhado entre os detalhamentos irmãos — a FIP compra por lote e o pedido
                  costuma estar lançado num item vizinho. Por isso uma linha pode mostrar{' '}
                  <strong>Saldo Aprov. = 0</strong> e ainda assim ter Retido &gt; 0: o saldo veio de
                  outro item da mesma tarefa. A coluna Saldo Aprov. mostra só o número cru
                  <em> daquele item</em>, não a base do rateio.
                </span>
              </li>
              <li><strong>FIP Fat-Dir</strong> = Gap − Retido. Solicitação de fat-direto criada automaticamente em nome da FIP (status: aprovado). <em>Ainda assim NÃO entra no Dados Informakon</em> — a NF ainda não foi emitida.</li>
              <li><strong>Wave (Serv.)</strong> = qtd × <code>valor_servico_unit</code>. NF da Wave a emitir.</li>
              <li><strong>% Serv. Med.</strong> = qtd medida ÷ qtd contratada × 100 (físico). Quando o aprovador marca &quot;sem mais NF&quot;, este % é reduzido para coincidir com o % Informakon — protegendo a retenção.</li>
              <li><strong>Valor Total Medido</strong> = Mat. Medido + Serv. Medido (físico, sem ajuste).</li>
              <li>
                <strong>Dados Informakon</strong> = Wave + <em>Mat. Medido</em> (o material inteiro,
                não só o que virou nota). É o <strong>espelho</strong> do relatório: o Informakon
                registra o que foi executado. Serve pra conciliar, <strong>não pra lançar</strong>.
              </li>
              <li>
                <strong>% Informakon (espelho)</strong> = Dados Informakon ÷ valor global × 100.
                Mesma coisa em percentual — também não é o número que se digita.
              </li>
              <li>
                <strong>% a lançar</strong> = (Wave + <strong>NF Desc.</strong>) ÷ valor global × 100.
                <strong> É ESTE que vai no Informakon.</strong>
                <br />
                <span style={{ color: 'var(--text-3)' }}>
                  Por quê: ao receber um percentual, o Informakon <em>libera</em>{' '}
                  <code>% × valor global</code> e depois desconta só as notas de material lançadas
                  lá — ele não conhece nosso saldo de pedido aprovado. Então lançar o % físico num
                  item 100% medido faz ele liberar o material inteiro e descontar só o que virou
                  nota, <strong>pagando à Wave o Gap</strong> (Retido + FIP Fat-Dir): material sem
                  nota de terceiro, cujo dinheiro não é dela e que seria pago de novo quando a nota
                  chegasse. Isolando o percentual que entrega exatamente o serviço medido:{' '}
                  <code>% × global − NF Desc. = Wave</code> ⇒{' '}
                  <code>% = (Wave + NF Desc.) ÷ global</code>. O serviço continua pago pelo{' '}
                  <strong>% Serv. Med. integral</strong> — a correção sai toda do lado do material.
                  A diferença entre as duas colunas aparece embaixo do número, e é exatamente o Gap.
                </span>
              </li>
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
