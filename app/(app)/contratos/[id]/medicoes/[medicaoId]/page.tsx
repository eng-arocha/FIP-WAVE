'use client'

import { use, useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  ArrowLeft, CheckCircle2, XCircle, MessageSquare, Download,
  FileText, User, Calendar, Hash, Clock, Paperclip, AlertCircle, Loader2, Trash2, Undo2,
  Mail, TrendingUp, ChevronRight, ChevronDown, Pencil, Building2, Table2,
} from 'lucide-react'
import { detectarPavRange, listarPavimentos } from '@/lib/pavimentos'
import { nomeVao } from '@/lib/vaos'
import { detectarGradeBinaria } from '@/lib/grade-binaria'
import {
  formatCurrency, formatDatetime, formatDate, formatPercent,
  getMedicaoStatusColor
} from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, TIPO_MEDICAO_LABELS, MedicaoStatus } from '@/types'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { EmailLiberacaoMedicaoModal } from '@/components/medicoes/email-liberacao-medicao-modal'

// Tipos da rota /api/contratos/[id]/medicoes/[medicaoId]/planilha
type ItemPlanilha = {
  medicao_item_id: string
  detalhamento_id: string | null
  codigo: string
  descricao: string
  unidade?: string | null
  disciplina?: string | null
  local?: string | null
  quantidade_contratada: number
  valor_unitario_contratual: number
  valor_global_item: number
  qtd_anterior: number
  valor_anterior: number
  pct_anterior: number
  qtd_atual: number
  valor_atual: number
  pct_atual: number
  qtd_total: number
  valor_total: number
  pct_total: number
  qtd_saldo: number
  valor_saldo: number
  pct_saldo: number
  material_atual: number
  servico_atual: number
  pavimentos_pct?: Record<string, number> | null
  pavimentos_pct_anterior?: Record<string, number> | null
  // Cronograma físico (null/ausente = item sem cronograma cadastrado)
  pct_prev_anterior?: number | null
  pct_prev_atual?: number | null
  pct_prev_total?: number | null
  qtd_prev_total?: number | null
}

type TotaisPlanilha = {
  valor_global_total: number
  valor_anterior_total: number
  valor_atual_total: number
  valor_total_medido: number
  valor_saldo_total: number
  pct_anterior_total: number
  pct_atual_total: number
  pct_total_medido: number
  pct_saldo_total: number
  material_atual_total: number
  servico_atual_total: number
  pct_prev_anterior_total?: number | null
  pct_prev_atual_total?: number | null
  pct_prev_total_medido?: number | null
}

// Tipos hierárquicos: Grupo → Tarefa → Detalhamento (folha = ItemPlanilha)
type DetalhamentoPlanilha = ItemPlanilha

type TarefaPlanilha = {
  id: string
  codigo: string
  nome: string
  disciplina?: string | null
  local?: string | null
  valor_global: number
  valor_anterior: number
  valor_atual: number
  valor_total: number
  valor_saldo: number
  pct_anterior: number
  pct_atual: number
  pct_total: number
  pct_saldo: number
  pct_prev_anterior?: number | null
  pct_prev_atual?: number | null
  pct_prev_total?: number | null
  detalhamentos: DetalhamentoPlanilha[]
}

type GrupoPlanilha = {
  id: string
  codigo: string
  nome: string
  disciplina?: string | null
  valor_global: number
  valor_anterior: number
  valor_atual: number
  valor_total: number
  valor_saldo: number
  pct_anterior: number
  pct_atual: number
  pct_total: number
  pct_saldo: number
  pct_prev_anterior?: number | null
  pct_prev_atual?: number | null
  pct_prev_total?: number | null
  tarefas: TarefaPlanilha[]
}

type PlanilhaResponse = {
  medicao: { id: string; numero: number; status: string; contrato_id: string }
  itens: ItemPlanilha[]
  grupos: GrupoPlanilha[]
  totais: TotaisPlanilha
}

// Tipo da rota /api/contratos/[id]/medicoes/[medicaoId]/conciliacao-informakon
// (espelha ConciliacaoMedicao de lib/db/medicao-conciliacao-informakon.ts).
type ConciliacaoInformakon = {
  temDados: boolean
  referencia: string | null
  informakon: { contratual: number; material: number; retencao: number; aPagar: number } | null
  sistema: { contratual: number; material: number; retencao: number; aPagar: number }
  divergencias: { campo: string; rotulo: string; informakon: number; sistema: number; diferenca: number }[]
  maiorDivergencia: number
}

// Farol realizado × previsto (cronograma físico):
// verde = em dia/adiantado · âmbar = atraso ≤ 2 p.p. · vermelho = atrasado
function farolColor(realPct: number, prevPct: number): string {
  if (realPct >= prevPct - 0.05) return '#10B981'
  if (prevPct - realPct <= 2) return '#F59E0B'
  return '#EF4444'
}

/**
 * Linha "prev X% (n)" + bolinha de farol, exibida sob o percentual realizado
 * quando o item tem cronograma físico cadastrado. prevQtd só aparece quando
 * showQtd (itens com múltiplas unidades/pavimentos).
 */
function PrevFarol({ realPct, prevPct, prevQtd, showQtd }: {
  realPct: number
  prevPct?: number | null
  prevQtd?: number | null
  showQtd?: boolean
}) {
  if (prevPct === null || prevPct === undefined) return null
  const q = showQtd && prevQtd != null && prevQtd > 0
    ? ` (${Number.isInteger(prevQtd) ? prevQtd : prevQtd.toFixed(2).replace(/\.?0+$/, '')})`
    : ''
  return (
    <div className="flex items-center justify-end gap-1 text-[9px] tabular-nums" style={{ color: 'var(--text-3)' }}>
      <span>prev {prevPct.toFixed(1)}%{q}</span>
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: farolColor(realPct, prevPct) }}
        title={realPct >= prevPct - 0.05 ? 'Em dia / adiantado' : prevPct - realPct <= 2 ? 'Atraso leve (≤ 2 p.p.)' : 'Atrasado vs cronograma'}
      />
    </div>
  )
}

export default function MedicaoDetailPage({ params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const { id: contratoId, medicaoId } = use(params)

  const [medicao, setMedicao] = useState<any>(null)
  const [modalAprovar, setModalAprovar] = useState(false)
  const [modalLiberacao, setModalLiberacao] = useState<'aprovar' | 'reenviar' | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState(false)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<MedicaoStatus | null>(null)

  // Ações do modo SIMULAÇÃO (rascunho). PRECISA ficar aqui no topo, antes do
  // early-return do loader — hook depois de return condicional quebra a ordem
  // dos hooks entre renders (React #310).
  const [acaoRascunho, setAcaoRascunho] = useState<'submetendo' | 'descartando' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const { perfilAtual } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'

  // === Modal "Ajustar quantidade" — admin ajusta na própria página da medição ===
  const [modalAjustar, setModalAjustar] = useState<{
    detalhamento_id: string
    codigo: string
    descricao: string
    quantidade_atual: number
    quantidade_contratada: number
  } | null>(null)
  const [novaQtd, setNovaQtd] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)
  const [erroAjuste, setErroAjuste] = useState('')

  // Totais financeiros (mat, serv, retenção) puxados do endpoint /informacon
  // — fonte da verdade pra evitar inconsistência com o Boletim. Cai pra
  // cálculo on-the-fly se a request falhar.
  const [totaisInformacon, setTotaisInformacon] = useState<{
    material_medido: number
    servico_medido: number
    /** NF FIP material já lançada e descontada da medição (= min(matMedido, nf_terceiro)) */
    nf_descontavel: number
    /**
     * Do `nf_descontavel` acima, quanto veio de saldo ocioso de NF de OUTRO
     * detalhamento da mesma tarefa ("transbordo"). Já está incluído em
     * `nf_descontavel` — não somar de novo em lugar nenhum, é só um detalhamento
     * visual de origem.
     */
    nf_transbordo_grupo: number
    /**
     * Do `nf_descontavel` acima, quanto excede o material medido NO PERIODO —
     * nota de medicoes anteriores recuperada pela regua acumulada por grupo.
     * Ja esta incluido em `nf_descontavel`.
     */
    nf_recuperacao_anterior: number
    /**
     * NF de serviço a emitir = serviço − retenção − ajuste de rateio.
     * `null` quando o servidor ainda não expõe o campo — aí cai no fallback
     * local, que precisa refazer a subtração inteira.
     */
    servico_liquido: number | null
    /**
     * Material da medição que tem pedido fat-direto APROVADO mas NF ainda
     * pendente de chegar — vira "Saldo Ped. Aprovados (NF Pendentes)".
     * = min(gap_material, saldo_aprovado_disponivel)
     */
    faturamento_direto_em_aberto: number
    /**
     * Material da medição que NÃO tem nem NF lançada nem pedido aprovado —
     * a FIP precisa criar uma NF nova. Card "FIP (MATERIAL)" do boletim.
     */
    fip_faturar: number
    base_retencao: number
    retencao: number
    pct_retencao: number
    valor_total_contrato: number
  } | null>(null)

  // Planilha estilo "boletim de medição": fonte da verdade pra tabela de itens
  // (anterior, atual, total medido, saldo). Vem da rota /planilha — calculada
  // server-side pra evitar re-cálculo de quantidades acumuladas no client.
  const [planilha, setPlanilha] = useState<PlanilhaResponse | null>(null)

  // Conciliação com o relatório do Informakon (migration 075) — só existe
  // dado quando o contrato já teve um relatório importado. `null` enquanto
  // carrega; `temDados: false` quando não há importação pra comparar.
  const [conciliacaoInformakon, setConciliacaoInformakon] = useState<ConciliacaoInformakon | null>(null)

  // Estrutura hierárquica: grupos e tarefas expandidos (Set<string> com IDs).
  // - Grupos com `valor_atual > 0` começam abertos (efeito mais abaixo) pra
  //   o usuário já ver o que foi medido sem clicar.
  // - Tarefas começam todas fechadas (clicar abre os detalhamentos).
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set())
  const [expandedTarefas, setExpandedTarefas] = useState<Set<string>>(new Set())
  // Detalhamentos com grade de pavimentos expandida (por medicao_item_id ou detalhamento_id).
  const [expandedPavItems, setExpandedPavItems] = useState<Set<string>>(new Set())
  // Exportação Excel filtrável (por pavimento/vão/mês) — ver downloadExcel().
  const [exportandoExcel, setExportandoExcel] = useState(false)
  const [erroExcel, setErroExcel] = useState('')
  // Toggle "mostrar todos vs só os com medição"; default = só com medição.
  const [mostrarTodos, setMostrarTodos] = useState(false)

  const toggleGrupo = (id: string) => setExpandedGrupos(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })
  const toggleTarefa = (id: string) => setExpandedTarefas(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })
  const togglePavItem = (id: string) => setExpandedPavItems(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  async function fetchMedicao() {
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`)
    if (res.ok) {
      const data = await res.json()
      setMedicao(data)
      setStatus(data.status)
    }
  }

  // Carrega totais financeiros via /informacon (endpoint que calcula mat e serv
  // separadamente por item — fonte da verdade pra evitar inconsistência).
  async function fetchTotaisInformacon() {
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/informacon`)
      if (!res.ok) return
      const data = await res.json()
      setTotaisInformacon({
        material_medido: Number(data.totais?.material_medido || 0),
        servico_medido:  Number(data.totais?.servico_medido  || 0),
        nf_descontavel:  Number(data.totais?.nf_descontavel  || 0),
        nf_transbordo_grupo: Number(data.totais?.nf_transbordo_grupo || 0),
        nf_recuperacao_anterior: Number(data.totais?.nf_recuperacao_anterior || 0),
        servico_liquido: data.totais?.servico_liquido != null
          ? Number(data.totais.servico_liquido)
          : null,
        faturamento_direto_em_aberto: Number(data.totais?.faturamento_direto_em_aberto || 0),
        fip_faturar:     Number(data.totais?.fip_faturar     || 0),
        base_retencao:   Number(data.totais?.base_retencao   || 0),
        retencao:        Number(data.totais?.retencao        || 0),
        pct_retencao:    Number(data.medicao?.contrato?.percentual_retencao ?? 5),
        valor_total_contrato: Number(data.medicao?.contrato?.valor_total || 0),
      })
    } catch {/* fallback pro cálculo client-side existente */}
  }

  // Carrega planilha completa (itens + totais agregados) pra tabela "Itens da Medição".
  // Se falhar, planilha continua null e renderizamos a tabela antiga (fallback).
  async function fetchPlanilha() {
    try {
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/planilha`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data: PlanilhaResponse = await res.json()
      setPlanilha(data)
    } catch {/* fallback pra tabela antiga */}
  }

  // Conciliação com o Informakon: painel de aviso ANTES da aprovação. Falha
  // silenciosa — contratos sem importação do Informakon simplesmente não
  // mostram o painel (ver `temDados` no render).
  async function fetchConciliacaoInformakon() {
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/conciliacao-informakon`)
      if (!res.ok) return
      const data: ConciliacaoInformakon = await res.json()
      setConciliacaoInformakon(data)
    } catch {/* painel simplesmente não aparece */}
  }

  useEffect(() => {
    fetchMedicao()
    fetchTotaisInformacon()
    fetchPlanilha()
    fetchConciliacaoInformakon()
  }, [contratoId, medicaoId])

  useEffect(() => {
    if (status !== null && medicao !== null && status !== medicao.status) {
      fetchMedicao()
    }
  }, [status])

  // Quando a planilha hierárquica chega, abre por padrão todos os grupos que
  // já tiveram medição nesta competência (valor_atual > 0). Tarefas começam
  // fechadas — clicar no chevron abre os detalhamentos.
  useEffect(() => {
    if (!planilha?.grupos) return
    const inicial = new Set<string>(
      planilha.grupos.filter(g => g.valor_atual > 0).map(g => g.id)
    )
    setExpandedGrupos(inicial)
  }, [planilha])

  // Realtime: auto-refresh when this measurement is approved/rejected elsewhere
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
    const channel = supabase
      .channel(`medicao-${medicaoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'medicoes', filter: `id=eq.${medicaoId}` },
        () => { fetchMedicao() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [medicaoId])

  if (!medicao || !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const isPendente = status === 'submetido' || status === 'em_analise'
  const isCriador = userEmail !== null && medicao.solicitante_email === userEmail

  /**
   * Material e serviço congelados na aprovação, quando existem.
   *
   * Usado só nos caminhos de fallback — quando o endpoint /informacon não
   * respondeu. Sem isto, uma medição aprovada com o endpoint fora do ar
   * mostrava o cabeçalho e os rodapés recalculados ao vivo (preço unitário de
   * hoje) enquanto o card de retenção logo abaixo já mostrava o congelado.
   *
   * `material > 0` exclui as medições aprovadas antes de a coluna existir,
   * onde ela ficou gravada como 0 e não como null.
   */
  const snapshotMedicao = (): { material: number; servico: number } | null => {
    if (status !== 'aprovado') return null
    const material = Number(medicao.valor_material_correspondente ?? NaN)
    const total = Number(medicao.valor_total ?? NaN)
    if (!Number.isFinite(material) || !Number.isFinite(total) || material <= 0) return null
    return { material, servico: Math.max(0, total - material) }
  }
  const criadorPodeExcluir = isCriador && !['aprovado', 'autorizado', 'em_analise', 'cancelado'].includes(status)

  // === Ações do modo SIMULAÇÃO (rascunho) ===
  async function submeterRascunho() {
    if (!confirm('Submeter esta medição para aprovação da equipe FIP?')) return
    setAcaoRascunho('submetendo')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'submetido' }),
      })
      if (res.ok) {
        setStatus('submetido' as MedicaoStatus)
        await fetchMedicao()
      }
    } finally {
      setAcaoRascunho(null)
    }
  }
  async function descartarRascunho() {
    if (!confirm('Descartar esta simulação? A medição rascunho será excluída.')) return
    setAcaoRascunho('descartando')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`, { method: 'DELETE' })
      if (res.ok) window.location.href = `/contratos/${contratoId}`
    } finally {
      setAcaoRascunho(null)
    }
  }

  async function desaprovar() {
    if (!confirm('Desaprovar esta medição? Voltará para "Submetido".')) return
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'submetido' }),
    })
    if (res.ok) setStatus('submetido' as MedicaoStatus)
  }

  async function excluir() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`, { method: 'DELETE' })
    if (res.ok) window.history.back()
    else setConfirmDelete(false)
  }

  async function aprovar() {
    setSaving(true)
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovadorNome: 'Fiscal FIP', aprovadorEmail: 'fiscal@fipengenharia.com.br', comentario, medicao })
    })
    setSaving(false)
    if (res.ok) { setStatus('aprovado'); setModalAprovar(false) }
  }

  async function rejeitar() {
    if (!motivo) return
    setSaving(true)
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/rejeitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovadorNome: 'Fiscal FIP', aprovadorEmail: 'fiscal@fipengenharia.com.br', comentario: motivo, medicao })
    })
    setSaving(false)
    if (res.ok) { setStatus('rejeitado'); setModalRejeitar(false) }
  }

  // === Ajustar quantidade (admin) — usa rota PATCH por detalhamento_id que
  // faz upsert (cria medicao_item se não existe). Após salvar, recarrega
  // /planilha pra atualizar números na UI sem refresh full.
  function abrirAjustar(it: { detalhamento_id: string | null; codigo: string; descricao: string; qtd_atual: number; quantidade_contratada: number }) {
    if (!it.detalhamento_id) return
    setModalAjustar({
      detalhamento_id: it.detalhamento_id,
      codigo: it.codigo,
      descricao: it.descricao,
      quantidade_atual: Number(it.qtd_atual ?? 0),
      quantidade_contratada: Number(it.quantidade_contratada ?? 0),
    })
    setNovaQtd(String(it.qtd_atual ?? 0))
    setMotivoAjuste('')
    setErroAjuste('')
  }

  async function salvarAjuste() {
    if (!modalAjustar) return
    const qtyNum = Number(novaQtd.replace(',', '.'))
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setErroAjuste('Quantidade inválida.')
      return
    }
    if (Math.abs(qtyNum - modalAjustar.quantidade_atual) < 1e-6) {
      setErroAjuste('A quantidade nova é igual à atual.')
      return
    }
    if (motivoAjuste.trim().length < 10) {
      setErroAjuste('Motivo precisa ter pelo menos 10 caracteres.')
      return
    }
    setSalvandoAjuste(true)
    setErroAjuste('')
    try {
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/detalhamentos/${modalAjustar.detalhamento_id}/ajustar`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantidade_nova: qtyNum, motivo: motivoAjuste.trim() }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroAjuste(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setModalAjustar(null)
      setNovaQtd('')
      setMotivoAjuste('')
      // Recarrega planilha pra refletir o novo qty
      await fetchPlanilha()
    } catch (e: any) {
      setErroAjuste(e?.message || 'Erro de rede.')
    } finally {
      setSalvandoAjuste(false)
    }
  }

  const ACAO_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    aprovado: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-900/30', label: 'Aprovação' },
    autorizado: { icon: CheckCircle2, color: 'text-teal-400', bg: 'bg-teal-900/30', label: 'Autorização (material liberado)' },
    rejeitado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Rejeição' },
    solicitou_ajuste: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-900/30', label: 'Ajuste Solicitado' },
    comentou: { icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Comentário' },
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const itens: any[] = medicao.medicao_itens || []
  const anexos: any[] = medicao.medicao_anexos || []
  const notas_fiscais: any[] = medicao.notas_fiscais || []
  const aprovacoes: any[] = medicao.aprovacoes || []

  async function downloadPDF(somentePeriodo = true) {
    // Garante que planilha está carregada antes de gerar o PDF
    let planilhaParaPDF = planilha
    if (!planilhaParaPDF) {
      try {
        const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/planilha`, { cache: 'no-store' })
        if (res.ok) planilhaParaPDF = await res.json()
      } catch { /* usa fallback */ }
    }
    // Dynamic import to avoid SSR issues
    const { pdf } = await import('@react-pdf/renderer')
    const { MedicaoPDF } = await import('@/components/pdf/MedicaoPDF')
    const blob = await pdf(
      <MedicaoPDF medicao={medicao} itens={itens} aprovacoes={aprovacoes} planilha={planilhaParaPDF} somentePeriodo={somentePeriodo} />
    ).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const sufixo = somentePeriodo ? 'periodo' : 'acumulado'
    a.download = `medicao-${String(medicao.numero).padStart(3,'0')}-${medicao.periodo_referencia}-${sufixo}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Excel "de campo": uma linha por (item × pavimento/vão/mês), com AutoFiltro.
   * Filtrar Local = "3º pav" mostra tudo que foi medido ali, em qualquer
   * disciplina — sem ter que abrir item por item na árvore da tela.
   */
  async function downloadExcel() {
    setExportandoExcel(true)
    try {
      let dados = planilha
      if (!dados) {
        const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/planilha`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Não foi possível carregar a planilha da medição.')
        dados = await res.json()
      }
      if (!dados?.grupos?.length) throw new Error('Esta medição não tem itens para exportar.')
      const { exportarExcelMedicao } = await import('@/lib/export/medicao-excel')
      await exportarExcelMedicao({ medicao, grupos: dados.grupos, totais: dados.totais })
    } catch (e: any) {
      setErroExcel(e?.message || 'Falha ao gerar o Excel.')
    } finally {
      setExportandoExcel(false)
    }
  }

  return (
    <div className="flex-1">
      <Topbar
        title={`Medição FIP-${String(medicao.numero).padStart(4, '0')} — ${medicao.periodo_referencia}`}
        subtitle={medicao.contrato?.numero}
        actions={
          <div className="flex gap-2">
            <Link href={`/contratos/${contratoId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => downloadPDF(true)}>
              <Download className="w-4 h-4" />
              Exportar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadPDF(false)}>
              <FileText className="w-4 h-4" />
              Exportar Acumulado
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadExcel}
              disabled={exportandoExcel}
              title="Excel com uma linha por pavimento/vão/mês — filtre por local no campo"
            >
              {exportandoExcel
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Table2 className="w-4 h-4" />}
              Exportar Excel
            </Button>
          </div>
        }
      />

      <div className="p-3 sm:p-6">
        {erroExcel && (
          <div
            className="flex items-start gap-2 mb-4 p-3 rounded-lg border text-sm"
            style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.4)', color: '#FCA5A5' }}
          >
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="flex-1">{erroExcel}</span>
            <button onClick={() => setErroExcel('')} className="text-xs underline opacity-80 hover:opacity-100">
              fechar
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="xl:col-span-2 space-y-5">
            {/* Banner de SIMULAÇÃO (rascunho) — prévia completa antes de submeter */}
            {status === 'rascunho' && (
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border"
                style={{ background: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.5)' }}>
                <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-bold" style={{ color: '#F59E0B' }}>SIMULAÇÃO — medição não submetida</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                    Esta é a visão completa que o administrador verá na aprovação. Os PDFs exportados
                    saem com marca d&apos;água “SIMULAÇÃO”. Nada entra no fluxo de aprovação até você submeter.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={submeterRascunho}
                    disabled={acaoRascunho !== null}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {acaoRascunho === 'submetendo'
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Enviando...</>
                      : <><CheckCircle2 className="w-4 h-4 mr-1" />Submeter para Aprovação</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={descartarRascunho}
                    disabled={acaoRascunho !== null}
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                  >
                    {acaoRascunho === 'descartando'
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Excluindo...</>
                      : <><Trash2 className="w-4 h-4 mr-1" />Descartar simulação</>}
                  </Button>
                </div>
              </div>
            )}
            {/* Header card */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getMedicaoStatusColor(status)}>
                        {MEDICAO_STATUS_LABELS[status]}
                      </Badge>
                      <Badge className="bg-teal-900/30 text-teal-400 border-teal-800/50">
                        {TIPO_MEDICAO_LABELS[medicao.tipo as keyof typeof TIPO_MEDICAO_LABELS]}
                      </Badge>
                    </div>
                    {(() => {
                      // Fonte da verdade: totaisInformacon (calculado server-side
                      // pelo endpoint /informacon). Fallback: itens da medição.
                      const valorTotal = Number(medicao.valor_total || 0)
                      let materialMed = totaisInformacon?.material_medido ?? 0
                      let servicoMed  = totaisInformacon?.servico_medido  ?? 0
                      if (!totaisInformacon) {
                        const congelado = snapshotMedicao()
                        if (congelado) {
                          materialMed = congelado.material
                          servicoMed  = congelado.servico
                        } else {
                          for (const it of (medicao.medicao_itens || []) as any[]) {
                            const qtd = Number(it.quantidade_medida || 0)
                            materialMed += qtd * Number(it.detalhamento?.valor_material_unit || 0)
                            servicoMed  += qtd * Number(it.detalhamento?.valor_servico_unit || 0)
                          }
                          if (materialMed === 0 && servicoMed === 0 && valorTotal > 0) {
                            servicoMed = valorTotal
                          }
                        }
                      }
                      // FIP a criar = parte da medição que ainda não tem NF
                      // material lançada NEM pedido fat-direto aprovado — a FIP
                      // precisa emitir NF nova. Card "FIP (MATERIAL)" do boletim.
                      const fipACriar = totaisInformacon?.fip_faturar ?? 0
                      // Líquido a pagar = serviço medido − retenção (NF a ser emitida descontada)
                      const pctRet = totaisInformacon?.pct_retencao ?? Number(medicao.contrato?.percentual_retencao ?? 5)
                      const baseRet = totaisInformacon?.base_retencao ?? (materialMed + servicoMed)
                      const retencaoHeader = totaisInformacon?.retencao ?? (baseRet * pctRet / 100)
                      // Idem card de retenção: o líquido da NF já abate o
                      // ajuste de rateio material/serviço.
                      const ajusteHeader = Number(medicao.ajuste_material_anterior || 0)
                      const liquidoHeader = totaisInformacon?.servico_liquido
                        ?? (servicoMed - retencaoHeader - ajusteHeader)
                      return (
                        <div className="space-y-1.5">
                          {/* 2 destaques lado a lado: FIP a CRIAR (material) + Wave a emitir (serviço) */}
                          <div className="flex items-baseline gap-6 flex-wrap">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold tracking-wide">FIP a criar (Material)</span>
                              <span className="text-2xl font-bold leading-tight" style={{ color: '#3B82F6' }}>{formatCurrency(fipACriar)}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] text-[var(--text-3)] uppercase font-semibold tracking-wide">Serviço (NF a emitir)</span>
                              <span className="text-2xl font-bold leading-tight" style={{ color: '#0F766E' }}>{formatCurrency(liquidoHeader)}</span>
                            </div>
                          </div>
                          <div className="flex items-baseline gap-3 text-xs flex-wrap" style={{ color: 'var(--text-3)' }}>
                            <span>Material total: <strong style={{ color: 'var(--text-2)' }}>{formatCurrency(materialMed)}</strong></span>
                            <span>·</span>
                            <span>Total executado: <strong style={{ color: 'var(--text-1)' }}>{formatCurrency(valorTotal)}</strong></span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  {/* Aprovação/rejeição da medição agora vivem APENAS no Boletim
                      INFORMAKON — porque é onde o aprovador revisa item-a-item
                      (incluindo confirmação "sem mais NF" pra itens com retido)
                      antes de bater o martelo. */}
                  {!isPendente && status === 'aprovado' && (
                    <Button variant="ghost" size="sm" onClick={() => setModalLiberacao('reenviar')} className="border border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                      <Mail className="w-4 h-4" />
                      Reenviar email de liberação
                    </Button>
                  )}
                  {/* Boletim INFORMAKON — disponível em qualquer status (útil em rascunho pra prévia) */}
                  <Link href={`/contratos/${contratoId}/medicoes/${medicaoId}/informacon`}>
                    <Button variant="ghost" size="sm" className="border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10">
                      <FileText className="w-4 h-4" />
                      Boletim INFORMAKON
                    </Button>
                  </Link>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    <div>
                      <p className="text-[var(--text-3)]">Medição</p>
                      <p className="font-medium text-[var(--text-1)]">FIP-{String(medicao.numero).padStart(4, '0')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    <div>
                      <p className="text-[var(--text-3)]">Período</p>
                      <p className="font-medium text-[var(--text-1)]">{medicao.periodo_referencia}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    <div>
                      <p className="text-[var(--text-3)]">Solicitante</p>
                      <p className="font-medium text-[var(--text-1)]">{medicao.solicitante_nome}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[var(--text-3)]" />
                    <div>
                      <p className="text-[var(--text-3)]">Submetido em</p>
                      <p className="font-medium text-[var(--text-1)]">{formatDate(medicao.data_submissao)}</p>
                    </div>
                  </div>
                </div>

                {medicao.observacoes && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] text-xs text-[var(--text-2)]">
                    <p className="font-medium text-[var(--text-3)] mb-1">Observações:</p>
                    <p>{medicao.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cálculo de Retenção Contratual (snapshot pós-aprovação OU estimativa pré-aprovação)
                — visível pra fornecedor/solicitante saber o impacto da retenção desde o início. */}
            {(() => {
              const aprovado = status === 'aprovado'
              const valorTotalMedicao = Number(medicao.valor_total ?? 0)
              const valorContrato = totaisInformacon?.valor_total_contrato
                ?? Number(medicao.contrato?.valor_total ?? 0)
              const pctRetencao = totaisInformacon?.pct_retencao
                ?? Number(medicao.contrato?.percentual_retencao ?? 5)

              // Fonte da verdade: totaisInformacon (calculado server-side).
              // Fallback: cálculo on-the-fly pelos itens.
              let materialCorrespondente = totaisInformacon?.material_medido ?? 0
              let servicoMedido          = totaisInformacon?.servico_medido  ?? 0

              if (!totaisInformacon) {
                if (aprovado && Number(medicao.valor_material_correspondente ?? 0) > 0) {
                  materialCorrespondente = Number(medicao.valor_material_correspondente)
                  servicoMedido = Math.max(0, valorTotalMedicao - materialCorrespondente)
                } else {
                  for (const it of (medicao.medicao_itens || []) as any[]) {
                    const qtd = Number(it.quantidade_medida || 0)
                    materialCorrespondente += qtd * Number(it.detalhamento?.valor_material_unit || 0)
                    servicoMedido          += qtd * Number(it.detalhamento?.valor_servico_unit  || 0)
                  }
                  if (materialCorrespondente === 0 && servicoMedido === 0 && valorTotalMedicao > 0) {
                    servicoMedido = valorTotalMedicao
                  }
                }
              }

              const baseRetencao = totaisInformacon?.base_retencao
                ?? (materialCorrespondente + servicoMedido)
              const retencaoServer = totaisInformacon?.retencao
              // valor_retencao_garantia tem DEFAULT 0 no banco — se ficou 0
              // por schema-fallback na aprovação, usa retencaoServer (informacon)
              // que recalcula a partir das quantidades medidas.
              const retencao = aprovado
                ? Number(medicao.valor_retencao_garantia || retencaoServer || (baseRetencao * pctRetencao / 100))
                : (retencaoServer ?? baseRetencao * pctRetencao / 100)
              // O ajuste de rateio material/serviço também sai da NF — é a
              // diferença entre o nosso rateio e o do ERP da FIP sobre o mesmo
              // total medido. Sem abatê-lo aqui a tela promete uma NF maior do
              // que a que o rodapé e o email instruem a emitir.
              const ajusteRateioCard = Number(medicao.ajuste_material_anterior || 0)
              const liquidoNF = totaisInformacon?.servico_liquido
                ?? (servicoMedido - retencao - ajusteRateioCard)
              const andamento = valorContrato > 0 ? (baseRetencao / valorContrato) * 100 : 0

              if (baseRetencao <= 0) return null

              const titulo = aprovado ? 'Retenção contratual desta medição' : 'Estimativa de retenção contratual'
              const aviso = aprovado
                ? 'NF integral (apenas serviço) será emitida. A retenção é descontada pelo WAVE no pagamento, conforme cláusulas contratuais.'
                : 'Cálculo prévio. Se aprovada, valores são congelados como snapshot.'

              return (
                <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(99,102,241,0.30)' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2" style={{ color: '#818CF8' }}>
                      <TrendingUp className="w-4 h-4" />
                      {titulo}
                      {!aprovado && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(99,102,241,0.18)', color: '#818CF8' }}>
                          Prévia
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Material correspondente</p>
                        <p className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                          {formatCurrency(materialCorrespondente)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Serviço medido <span className="text-[10px] font-bold ml-1 px-1 rounded" style={{ background: 'rgba(15,118,110,0.15)', color: '#0F766E' }}>NF</span></p>
                        <p className="font-bold tabular-nums" style={{ color: '#0F766E' }}>
                          {formatCurrency(servicoMedido)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Base ({pctRetencao.toFixed(2).replace('.', ',')}%)</p>
                        <p className="font-bold tabular-nums" style={{ color: 'var(--text-2)' }}>
                          {formatCurrency(baseRetencao)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Retenção</p>
                        <p className="font-bold tabular-nums" style={{ color: '#818CF8' }}>
                          {formatCurrency(retencao)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Líquido a pagar</p>
                        <p className="font-bold tabular-nums" style={{ color: '#10B981' }}>
                          {formatCurrency(liquidoNF)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                      <strong style={{ color: 'var(--text-2)' }}>Andamento físico:</strong> {andamento.toFixed(2).replace('.', ',')}% do contrato.
                      <strong style={{ color: 'var(--text-2)', marginLeft: 8 }}>NF a emitir (serviço):</strong> {formatCurrency(liquidoNF)}.
                      Material será faturado direto pelos pedidos FIP. {aviso}
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Ações de Administrador */}
            {isAdmin && !isPendente && (
              <Card className="border-red-900/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-400">Ações de Administrador</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2">
                  {status === 'aprovado' && (
                    <Button variant="outline" size="sm" onClick={desaprovar} className="border-amber-700 text-amber-400 hover:bg-amber-900/20">
                      <Undo2 className="w-4 h-4" />
                      Desaprovar
                    </Button>
                  )}
                  <Button
                    variant="outline" size="sm"
                    onClick={excluir}
                    className={confirmDelete ? 'border-red-500 bg-red-900/30 text-red-300' : 'border-red-900 text-red-400 hover:bg-red-900/20'}
                  >
                    <Trash2 className="w-4 h-4" />
                    {confirmDelete ? 'Confirmar Exclusão' : 'Excluir'}
                  </Button>
                  {confirmDelete && (
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Remover medição — disponível para o próprio criador enquanto não aprovada */}
            {!isAdmin && criadorPodeExcluir && (
              <Card className="border-red-900/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-400">Remover Medição</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2 items-center">
                  <Button
                    variant="outline" size="sm"
                    onClick={excluir}
                    className={confirmDelete ? 'border-red-500 bg-red-900/30 text-red-300' : 'border-red-900 text-red-400 hover:bg-red-900/20'}
                  >
                    <Trash2 className="w-4 h-4" />
                    {confirmDelete ? 'Confirmar Exclusão' : 'Excluir Medição'}
                  </Button>
                  {confirmDelete && (
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                  )}
                  {!confirmDelete && (
                    <span className="text-xs text-[var(--text-3)]">Só disponível enquanto não aprovada</span>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Conciliação com o Informakon — só aparece quando o contrato já teve
                um relatório importado (migration 075). Sem ruído nos demais. */}
            {conciliacaoInformakon?.temDados && (
              conciliacaoInformakon.divergencias.length > 0 ? (
                <Card
                  className={conciliacaoInformakon.maiorDivergencia > 1000 ? 'border-red-900/40' : 'border-amber-900/40'}
                  style={{
                    background: conciliacaoInformakon.maiorDivergencia > 1000
                      ? 'rgba(239, 68, 68, 0.06)'
                      : 'rgba(245, 158, 11, 0.06)',
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="text-sm flex items-center gap-2"
                      style={{ color: conciliacaoInformakon.maiorDivergencia > 1000 ? '#F87171' : '#FBBF24' }}
                    >
                      <AlertCircle className="w-4 h-4" />
                      Conferência com o Informakon
                    </CardTitle>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      Relatório de {formatDate(conciliacaoInformakon.referencia)} — os valores abaixo não batem com o que o Informakon fechou para esta medição.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <th className="text-left py-1.5 font-medium" style={{ color: 'var(--text-3)' }}>Campo</th>
                            <th className="text-right py-1.5 font-medium" style={{ color: 'var(--text-3)' }}>Informakon</th>
                            <th className="text-right py-1.5 font-medium" style={{ color: 'var(--text-3)' }}>FIP-WAVE</th>
                            <th className="text-right py-1.5 font-medium" style={{ color: 'var(--text-3)' }}>Diferença</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conciliacaoInformakon.divergencias.map(d => (
                            <tr key={d.campo} className="border-b" style={{ borderColor: 'var(--border)' }}>
                              <td className="py-1.5" style={{ color: 'var(--text-1)' }}>{d.rotulo}</td>
                              <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(d.informakon)}</td>
                              <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(d.sistema)}</td>
                              <td
                                className="py-1.5 text-right tabular-nums font-semibold"
                                style={{ color: Math.abs(d.diferenca) > 1000 ? '#F87171' : '#FBBF24' }}
                              >
                                {d.diferenca > 0 ? '+' : ''}{formatCurrency(d.diferenca)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div
                  className="text-xs px-3 py-2 rounded flex items-center gap-2"
                  style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.25)' }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Bate com o Informakon (relatório de {formatDate(conciliacaoInformakon.referencia)})
                </div>
              )
            )}

            {/* Itens */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[var(--text-1)]">Itens da Medição ({itens.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {planilha && planilha.grupos && planilha.grupos.length > 0 ? (
                  /* Nova tabela HIERÁRQUICA: Grupo → Tarefa → Detalhamento.
                     Mantém o layout "boletim" (Anterior / Atual / Total / Saldo)
                     e o tfoot original com a decomposição mat/serv. */
                  (() => {
                    // Filtro recursivo nos 3 níveis quando "Mostrar todos" está
                    // desligado (default). Sem isso, abrir um grupo medido fazia
                    // aparecer todas as tarefas e detalhamentos zerados — poluía.
                    // Agora um item só aparece se ELE OU algum descendente tem
                    // medição atual > 0.
                    const gruposExibir = mostrarTodos
                      ? planilha.grupos
                      : planilha.grupos
                          .filter(g => g.valor_atual > 0)
                          .map(g => ({
                            ...g,
                            tarefas: g.tarefas
                              .filter(t => t.valor_atual > 0)
                              .map(t => ({
                                ...t,
                                detalhamentos: t.detalhamentos.filter(d => d.valor_atual > 0),
                              })),
                          }))

                    const expandirTudo = () => {
                      setExpandedGrupos(new Set(planilha.grupos.map(g => g.id)))
                      setExpandedTarefas(new Set(
                        planilha.grupos.flatMap(g => g.tarefas.map(t => t.id))
                      ))
                      // Expande também os itens com pavimentos
                      const pavIds = new Set<string>()
                      planilha.grupos.forEach(g => g.tarefas.forEach(t => t.detalhamentos.forEach(d => {
                        if (d.pavimentos_pct && Object.keys(d.pavimentos_pct).length > 0) {
                          const key = d.medicao_item_id || d.detalhamento_id || ''
                          if (key) pavIds.add(key)
                        }
                      })))
                      setExpandedPavItems(pavIds)
                    }
                    const colapsarTudo = () => {
                      setExpandedGrupos(new Set())
                      setExpandedTarefas(new Set())
                      setExpandedPavItems(new Set())
                    }

                    const totalAlgumExpandido =
                      expandedGrupos.size > 0 || expandedTarefas.size > 0

                    return (
                      <>
                        {/* Toolbar acima da tabela */}
                        <div className="flex items-center justify-between mb-2 text-[11px]">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none" style={{ color: 'var(--text-2)' }}>
                            <input
                              type="checkbox"
                              checked={mostrarTodos}
                              onChange={(e) => setMostrarTodos(e.target.checked)}
                              className="accent-blue-500"
                            />
                            <span>Mostrar todos os itens (incluindo sem medição)</span>
                          </label>
                          <button
                            type="button"
                            onClick={totalAlgumExpandido ? colapsarTudo : expandirTudo}
                            className="px-2 py-1 rounded border hover:bg-[var(--surface-3)] transition-colors"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                          >
                            {totalAlgumExpandido ? 'Colapsar tudo' : 'Expandir tudo'}
                          </button>
                        </div>

                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)' }}>
                            <tr className="border-b border-[var(--border)]">
                              <th className="text-left py-2 text-[var(--text-3)] font-medium">Código</th>
                              <th className="text-left py-2 text-[var(--text-3)] font-medium">Descrição</th>
                              <th className="text-right py-2 text-[var(--text-3)] font-medium">Valor Global</th>
                              <th className="text-right py-2 text-[var(--text-3)] font-medium">Acum. Anterior</th>
                              <th className="text-right py-2 font-medium" style={{ color: '#0F766E' }}>Med. Atual</th>
                              <th className="text-right py-2 font-medium" style={{ color: '#10B981' }}>Total Medido</th>
                              <th className="text-right py-2 font-medium" style={{ color: '#F59E0B' }}>Saldo a Medir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gruposExibir.map((g) => {
                              const isGrupoOpen = expandedGrupos.has(g.id)
                              const pctTotalBarG = Math.min(Math.max(g.pct_total, 0), 100)
                              return (
                                <Fragment key={`g-${g.id}`}>
                                  {/* === LINHA DO GRUPO (nivel 1) === */}
                                  <tr
                                    className="border-b border-[var(--border)] cursor-pointer hover:bg-[var(--surface-3)] transition-colors"
                                    style={{ background: 'var(--surface-2)' }}
                                    onClick={() => toggleGrupo(g.id)}
                                  >
                                    <td className="py-2 font-mono font-bold" style={{ color: 'var(--text-1)' }}>
                                      <div className="flex items-center gap-1">
                                        {isGrupoOpen
                                          ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                                          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                                        <span>{g.codigo}</span>
                                      </div>
                                    </td>
                                    <td className="py-2 font-bold" style={{ color: 'var(--text-1)' }}>{g.nome}</td>
                                    <td className="py-2 text-right">
                                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                                        {formatCurrency(g.valor_global)}
                                      </div>
                                    </td>
                                    <td className="py-2 text-right">
                                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-3)' }}>
                                        {formatPercent(g.pct_anterior)}
                                      </div>
                                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                        {formatCurrency(g.valor_anterior)}
                                      </div>
                                      <PrevFarol realPct={g.pct_anterior} prevPct={g.pct_prev_anterior} />
                                    </td>
                                    <td className="py-2 text-right">
                                      <div className="text-sm font-bold tabular-nums" style={{ color: '#0F766E' }}>
                                        {formatPercent(g.pct_atual)}
                                      </div>
                                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                        {formatCurrency(g.valor_atual)}
                                      </div>
                                      <PrevFarol realPct={g.pct_atual} prevPct={g.pct_prev_atual} />
                                    </td>
                                    <td className="py-2 text-right">
                                      <div className="text-sm font-bold tabular-nums" style={{ color: '#10B981' }}>
                                        {formatPercent(g.pct_total)}
                                      </div>
                                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                        {formatCurrency(g.valor_total)}
                                      </div>
                                      <PrevFarol realPct={g.pct_total} prevPct={g.pct_prev_total} />
                                      <div className="h-1 mt-1 rounded-full" style={{ background: 'var(--surface-3)' }}>
                                        <div className="h-full rounded-full transition-all" style={{
                                          width: `${pctTotalBarG}%`,
                                          background: '#10B981',
                                        }} />
                                      </div>
                                    </td>
                                    <td className="py-2 text-right">
                                      <div className="text-sm font-bold tabular-nums" style={{ color: '#F59E0B' }}>
                                        {formatPercent(g.pct_saldo)}
                                      </div>
                                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                        {formatCurrency(g.valor_saldo)}
                                      </div>
                                    </td>
                                  </tr>

                                  {/* === LINHAS DE TAREFA (nivel 2) — só se grupo expandido === */}
                                  {isGrupoOpen && g.tarefas.map((t) => {
                                    const isTarefaOpen = expandedTarefas.has(t.id)
                                    const temDetalhamentos = t.detalhamentos.length > 0
                                    const pctTotalBarT = Math.min(Math.max(t.pct_total, 0), 100)
                                    return (
                                      <Fragment key={`t-${t.id}`}>
                                        <tr
                                          className={`border-b border-[var(--border)] ${temDetalhamentos ? 'cursor-pointer hover:bg-[var(--surface-3)]' : ''} transition-colors`}
                                          style={{ background: 'var(--surface-1)' }}
                                          onClick={() => temDetalhamentos && toggleTarefa(t.id)}
                                        >
                                          <td className="py-2 font-mono font-medium" style={{ color: 'var(--text-2)', paddingLeft: '16px' }}>
                                            <div className="flex items-center gap-1">
                                              {temDetalhamentos
                                                ? (isTarefaOpen
                                                    ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                                                    : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />)
                                                : <span className="w-3.5 h-3.5 flex-shrink-0" />}
                                              <span>{t.codigo}</span>
                                            </div>
                                          </td>
                                          <td className="py-2 font-medium" style={{ color: 'var(--text-2)' }}>{t.nome}</td>
                                          <td className="py-2 text-right">
                                            <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-2)' }}>
                                              {formatCurrency(t.valor_global)}
                                            </div>
                                          </td>
                                          <td className="py-2 text-right">
                                            <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-3)' }}>
                                              {formatPercent(t.pct_anterior)}
                                            </div>
                                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                              {formatCurrency(t.valor_anterior)}
                                            </div>
                                            <PrevFarol realPct={t.pct_anterior} prevPct={t.pct_prev_anterior} />
                                          </td>
                                          <td className="py-2 text-right">
                                            <div className="text-sm font-semibold tabular-nums" style={{ color: '#0F766E' }}>
                                              {formatPercent(t.pct_atual)}
                                            </div>
                                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                              {formatCurrency(t.valor_atual)}
                                            </div>
                                            <PrevFarol realPct={t.pct_atual} prevPct={t.pct_prev_atual} />
                                          </td>
                                          <td className="py-2 text-right">
                                            <div className="text-sm font-semibold tabular-nums" style={{ color: '#10B981' }}>
                                              {formatPercent(t.pct_total)}
                                            </div>
                                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                              {formatCurrency(t.valor_total)}
                                            </div>
                                            <PrevFarol realPct={t.pct_total} prevPct={t.pct_prev_total} />
                                            <div className="h-1 mt-1 rounded-full" style={{ background: 'var(--surface-3)' }}>
                                              <div className="h-full rounded-full transition-all" style={{
                                                width: `${pctTotalBarT}%`,
                                                background: '#10B981',
                                              }} />
                                            </div>
                                          </td>
                                          <td className="py-2 text-right">
                                            <div className="text-sm font-semibold tabular-nums" style={{ color: '#F59E0B' }}>
                                              {formatPercent(t.pct_saldo)}
                                            </div>
                                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                              {formatCurrency(t.valor_saldo)}
                                            </div>
                                          </td>
                                        </tr>

                                        {/* === LINHAS DE DETALHAMENTO (nivel 3) — só se tarefa expandida === */}
                                        {isTarefaOpen && t.detalhamentos.map((it) => {
                                          const pctTotalBarI = Math.min(Math.max(it.pct_total, 0), 100)
                                          const pavItemKey = it.medicao_item_id || it.detalhamento_id || ''
                                          const hasPav = !!(it.pavimentos_pct && Object.keys(it.pavimentos_pct).length > 0)
                                          const isPavExpanded = hasPav && expandedPavItems.has(pavItemKey)
                                          const pavRange = hasPav ? detectarPavRange(it.descricao, it.quantidade_contratada) : null
                                          // Vãos e meses compartilham a grade binária; só muda o rótulo.
                                          const grade = (hasPav && !pavRange)
                                            ? detectarGradeBinaria(it.descricao, it.quantidade_contratada)
                                            : null
                                          const gradeNomes = grade?.nomes ?? null
                                          return (
                                            <Fragment key={`d-${it.medicao_item_id || it.detalhamento_id}`}>
                                              <tr className="border-b border-[var(--border)]" style={{ background: 'var(--surface-1)' }}>
                                                <td className="py-2 font-mono" style={{ color: 'var(--text-3)', paddingLeft: '32px' }}>
                                                  <span className="inline-flex items-center gap-1.5">
                                                    {hasPav && (
                                                      <button
                                                        onClick={() => pavItemKey && togglePavItem(pavItemKey)}
                                                        className={`px-1 py-0.5 rounded print:hidden transition-colors ${isPavExpanded ? 'text-blue-400' : 'text-slate-600 hover:text-blue-400'}`}
                                                        title={isPavExpanded ? 'Ocultar pavimentos' : 'Ver % por pavimento'}
                                                      >
                                                        <Building2 className="inline w-3 h-3" />
                                                      </button>
                                                    )}
                                                    {isAdmin && isPendente && it.detalhamento_id && (
                                                      <button
                                                        onClick={() => abrirAjustar({
                                                          detalhamento_id: it.detalhamento_id!,
                                                          codigo: it.codigo,
                                                          descricao: it.descricao,
                                                          qtd_atual: it.qtd_atual,
                                                          quantidade_contratada: it.quantidade_contratada,
                                                        })}
                                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded print:hidden hover:bg-orange-500/10"
                                                        style={{ color: '#F97316', border: '1px solid rgba(249,115,22,0.4)' }}
                                                        title="Admin: ajustar quantidade medida"
                                                      >
                                                        <Pencil className="inline w-3 h-3" />
                                                      </button>
                                                    )}
                                                    {it.codigo}
                                                  </span>
                                                </td>
                                                <td className="py-2" style={{ color: 'var(--text-2)' }}>{it.descricao}</td>
                                                <td className="py-2 text-right">
                                                  <div className="text-sm tabular-nums" style={{ color: 'var(--text-2)' }}>
                                                    {formatCurrency(it.valor_global_item)}
                                                  </div>
                                                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {Number(it.quantidade_contratada).toLocaleString('pt-BR')} × {formatCurrency(it.valor_unitario_contratual)}
                                                  </div>
                                                </td>
                                                <td className="py-2 text-right">
                                                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {formatPercent(it.pct_anterior)}
                                                  </div>
                                                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {formatCurrency(it.valor_anterior)}
                                                  </div>
                                                  <PrevFarol
                                                    realPct={it.pct_anterior}
                                                    prevPct={it.pct_prev_anterior}
                                                    prevQtd={it.pct_prev_anterior != null ? (it.pct_prev_anterior / 100) * it.quantidade_contratada : null}
                                                    showQtd={it.quantidade_contratada > 1}
                                                  />
                                                </td>
                                                <td className="py-2 text-right">
                                                  <div className="text-sm font-bold tabular-nums" style={{ color: '#0F766E' }}>
                                                    {formatPercent(it.pct_atual)}
                                                  </div>
                                                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {formatCurrency(it.valor_atual)}
                                                  </div>
                                                  <PrevFarol
                                                    realPct={it.pct_atual}
                                                    prevPct={it.pct_prev_atual}
                                                    prevQtd={it.pct_prev_atual != null ? (it.pct_prev_atual / 100) * it.quantidade_contratada : null}
                                                    showQtd={it.quantidade_contratada > 1}
                                                  />
                                                </td>
                                                <td className="py-2 text-right">
                                                  <div className="text-sm font-bold tabular-nums" style={{ color: '#10B981' }}>
                                                    {formatPercent(it.pct_total)}
                                                  </div>
                                                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {formatCurrency(it.valor_total)}
                                                  </div>
                                                  <PrevFarol
                                                    realPct={it.pct_total}
                                                    prevPct={it.pct_prev_total}
                                                    prevQtd={it.qtd_prev_total}
                                                    showQtd={it.quantidade_contratada > 1}
                                                  />
                                                  <div className="h-1 mt-1 rounded-full" style={{ background: 'var(--surface-3)' }}>
                                                    <div className="h-full rounded-full transition-all" style={{
                                                      width: `${pctTotalBarI}%`,
                                                      background: '#10B981',
                                                    }} />
                                                  </div>
                                                </td>
                                                <td className="py-2 text-right">
                                                  <div className="text-sm font-bold tabular-nums" style={{ color: '#F59E0B' }}>
                                                    {formatPercent(it.pct_saldo)}
                                                  </div>
                                                  <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                                    {formatCurrency(it.valor_saldo)}
                                                  </div>
                                                </td>
                                              </tr>
                                              {/* === GRADE DE PAVIMENTOS — expandida sob o detalhamento === */}
                                              {isPavExpanded && it.pavimentos_pct && (
                                                <tr style={{ background: 'var(--surface-1)' }}>
                                                  <td colSpan={7} className="pb-3 px-10">
                                                    <div className="rounded-lg border p-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                                                      <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                                                        {grade ? `Breakdown por ${grade.termo}` : 'Breakdown por pavimento'} · acumulado ao fim desta medição
                                                      </p>
                                                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1">
                                                        {(pavRange
                                                          ? listarPavimentos(pavRange)
                                                          : gradeNomes
                                                          ? gradeNomes.map((_, i) => i + 1)
                                                          : Object.keys(it.pavimentos_pct!).map(Number).sort((a, b) => a - b))
                                                          .map(pavtoNum => {
                                                            const pctAtu = Number(it.pavimentos_pct![String(pavtoNum)] ?? 0)
                                                            const pctAnt = Number(it.pavimentos_pct_anterior?.[String(pavtoNum)] ?? 0)
                                                            const isDelta = pctAtu > pctAnt
                                                            const label = gradeNomes
                                                              ? nomeVao(gradeNomes, pavtoNum)
                                                              : `${pavtoNum}º pav`
                                                            return (
                                                              <div
                                                                key={pavtoNum}
                                                                className={`p-1.5 rounded-md border text-center ${
                                                                  isDelta
                                                                    ? 'border-amber-500/40 bg-amber-500/5'
                                                                    : pctAtu >= 100
                                                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                                                    : 'border-[var(--border)]'
                                                                }`}
                                                              >
                                                                <div className="text-[10px] font-mono" style={{ color: 'var(--text-3)' }}>{label}</div>
                                                                {isDelta && pctAnt > 0 && (
                                                                  <div className="text-[9px]" style={{ color: 'var(--text-3)' }}>ant: {pctAnt}%</div>
                                                                )}
                                                                <div className={`text-[11px] font-bold ${
                                                                  isDelta ? 'text-amber-300' : pctAtu >= 100 ? 'text-emerald-300' : 'text-slate-500'
                                                                }`}>{pctAtu}%</div>
                                                              </div>
                                                            )
                                                          })}
                                                      </div>
                                                    </div>
                                                  </td>
                                                </tr>
                                              )}
                                            </Fragment>
                                          )
                                        })}
                                      </Fragment>
                                    )
                                  })}
                                </Fragment>
                              )
                            })}

                            {gruposExibir.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-6 text-center text-[var(--text-3)] text-xs italic">
                                  Nenhum grupo com medição nesta competência. Ative "Mostrar todos os itens" pra ver a planilha completa.
                                </td>
                              </tr>
                            )}

                            {/* Subtotais agregados (linha em ADIÇÃO antes do tfoot original) */}
                            {(() => {
                              const t = planilha.totais
                              const pctTotalBar = Math.min(Math.max(t.pct_total_medido, 0), 100)
                              return (
                                <tr className="border-t-2 border-[var(--border-hover)]" style={{ background: 'var(--surface-2)' }}>
                                  <td colSpan={2} className="py-2 px-2 text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                                    Subtotal
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                                      {formatCurrency(t.valor_global_total)}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-3)' }}>
                                      {formatPercent(t.pct_anterior_total)}
                                    </div>
                                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                      {formatCurrency(t.valor_anterior_total)}
                                    </div>
                                    <PrevFarol realPct={t.pct_anterior_total} prevPct={t.pct_prev_anterior_total} />
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="text-sm font-bold tabular-nums" style={{ color: '#0F766E' }}>
                                      {formatPercent(t.pct_atual_total)}
                                    </div>
                                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                      {formatCurrency(t.valor_atual_total)}
                                    </div>
                                    <PrevFarol realPct={t.pct_atual_total} prevPct={t.pct_prev_atual_total} />
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="text-sm font-bold tabular-nums" style={{ color: '#10B981' }}>
                                      {formatPercent(t.pct_total_medido)}
                                    </div>
                                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                      {formatCurrency(t.valor_total_medido)}
                                    </div>
                                    <PrevFarol realPct={t.pct_total_medido} prevPct={t.pct_prev_total_medido} />
                                    <div className="h-1 mt-1 rounded-full" style={{ background: 'var(--surface-3)' }}>
                                      <div className="h-full rounded-full transition-all" style={{
                                        width: `${pctTotalBar}%`,
                                        background: '#10B981',
                                      }} />
                                    </div>
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="text-sm font-bold tabular-nums" style={{ color: '#F59E0B' }}>
                                      {formatPercent(t.pct_saldo_total)}
                                    </div>
                                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-3)' }}>
                                      {formatCurrency(t.valor_saldo_total)}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })()}
                          </tbody>
                          <tfoot>
                            {(() => {
                              // tfoot ORIGINAL — decomposição mat/serv do informacon — INTACTO.
                              // Apenas ajustamos colSpans pra novo layout (7 colunas).
                              let mat = totaisInformacon?.material_medido ?? 0
                              let serv = totaisInformacon?.servico_medido ?? 0
                              if (!totaisInformacon) {
                                const congelado = snapshotMedicao()
                                if (congelado) {
                                  mat = congelado.material
                                  serv = congelado.servico
                                } else {
                                  for (const it of (medicao.medicao_itens || []) as any[]) {
                                    const qtd = Number(it.quantidade_medida || 0)
                                    mat += qtd * Number(it.detalhamento?.valor_material_unit || 0)
                                    serv += qtd * Number(it.detalhamento?.valor_servico_unit || 0)
                                  }
                                }
                              }
                              const tot = Number(medicao.valor_total || 0)
                              if (mat === 0 && serv === 0 && tot > 0) serv = tot
                              const nfFipMaterial      = totaisInformacon?.nf_descontavel ?? 0
                              const nfTransbordoGrupo  = totaisInformacon?.nf_transbordo_grupo ?? 0
                              const nfRecuperacao      = totaisInformacon?.nf_recuperacao_anterior ?? 0
                              const saldoPedAprovados  = totaisInformacon?.faturamento_direto_em_aberto ?? 0
                              const fipACriar          = totaisInformacon?.fip_faturar    ?? 0
                              const pctRet = totaisInformacon?.pct_retencao ?? Number(medicao.contrato?.percentual_retencao ?? 5)
                              const retTfoot = totaisInformacon?.retencao ?? ((mat + serv) * pctRet / 100)
                              // Compensação de material faturado a mais em medições
                              // anteriores (migration 074). O desconto de NF é travado
                              // no material medido, então este é o único caminho pro
                              // líquido divergir de (serviço − retenção).
                              const ajusteMatAnterior = Number(medicao.ajuste_material_anterior || 0)
                              const liquidoTfoot = serv - retTfoot - ajusteMatAnterior
                              // 7 colunas: label ocupa 6, valor na última.
                              return (
                                <>
                                  {/* === MATERIAL === */}
                                  <tr className="border-t-2 border-[var(--border-hover)]">
                                    <td colSpan={6} className="pt-2 text-sm font-bold text-right pr-4" style={{ color: 'var(--text-1)' }}>Material correspondente (faturamento direto FIP)</td>
                                    <td className="pt-2 text-right text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatCurrency(mat)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={6} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ NOTA FIP Material <span className="text-[10px] font-medium opacity-75">(já descontada)</span></td>
                                    <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#06B6D4' }}>{formatCurrency(nfFipMaterial)}</td>
                                  </tr>
                                  {nfTransbordoGrupo > 0 && (
                                    <tr>
                                      <td
                                        colSpan={6}
                                        className="text-xs text-right pr-4"
                                        style={{ color: 'var(--text-3)' }}
                                        title="Material medido cujo desconto veio de nota alocada em outro item da mesma tarefa (o código de dois níveis: 14.2 SPRINKLER, 16.1 INFRA SDAI). A FIP compra por lote e a medição é por pavimento — sem isso, a nota fica parada num item enquanto o vizinho aparece sem cobertura. Fora da tarefa nada transborda."
                                      >
                                        ↳ dos quais cobertos por NF da mesma tarefa
                                      </td>
                                      <td
                                        className="text-right text-xs tabular-nums"
                                        style={{ color: 'var(--text-3)' }}
                                        title="Material medido cujo desconto veio de nota alocada em outro item da mesma tarefa (o código de dois níveis: 14.2 SPRINKLER, 16.1 INFRA SDAI). A FIP compra por lote e a medição é por pavimento — sem isso, a nota fica parada num item enquanto o vizinho aparece sem cobertura. Fora da tarefa nada transborda."
                                      >
                                        {formatCurrency(nfTransbordoGrupo)}
                                      </td>
                                    </tr>
                                  )}
                                  {nfRecuperacao > 0 && (
                                    <tr>
                                      <td
                                        colSpan={6}
                                        className="text-xs text-right pr-4"
                                        style={{ color: 'var(--text-3)' }}
                                        title="Nota de medições anteriores que não descontou na época e está sendo recuperada agora. O saldo de NF é apurado sobre o acumulado da tarefa (menor entre material executado e nota lançada), então o desconto de um mês pode superar o material medido nesse mês."
                                      >
                                        ↳ dos quais recuperação de NF de medições anteriores
                                      </td>
                                      <td
                                        className="text-right text-xs tabular-nums"
                                        style={{ color: 'var(--text-3)' }}
                                        title="Nota de medições anteriores que não descontou na época e está sendo recuperada agora. O saldo de NF é apurado sobre o acumulado da tarefa (menor entre material executado e nota lançada), então o desconto de um mês pode superar o material medido nesse mês."
                                      >
                                        {formatCurrency(nfRecuperacao)}
                                      </td>
                                    </tr>
                                  )}
                                  <tr>
                                    <td colSpan={6} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ Saldo Ped. Aprovados <span className="text-[10px] font-medium opacity-75">(NF Pendentes)</span></td>
                                    <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrency(saldoPedAprovados)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={6} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ FIP a criar <span className="text-[10px] font-medium opacity-75">(NF nova)</span></td>
                                    <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#3B82F6' }}>{formatCurrency(fipACriar)}</td>
                                  </tr>
                                  {/* === SERVIÇO === */}
                                  <tr>
                                    <td colSpan={6} className="pt-2 text-sm font-bold text-right pr-4" style={{ color: '#0F766E' }}>
                                      Serviço medido <span className="text-[10px] font-medium opacity-75">(100%)</span>
                                    </td>
                                    <td className="pt-2 text-right font-bold text-sm tabular-nums" style={{ color: '#0F766E' }}>{formatCurrency(serv)}</td>
                                  </tr>
                                  <tr>
                                    <td colSpan={6} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ Retenção contratual <span className="text-[10px] font-medium opacity-75">({pctRet.toFixed(0)}%)</span></td>
                                    <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#818CF8' }}>− {formatCurrency(retTfoot)}</td>
                                  </tr>
                                  {ajusteMatAnterior !== 0 && (
                                    <tr>
                                      <td colSpan={6} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>
                                        ↳ Ajuste de material de medições anteriores
                                        {medicao.ajuste_material_anterior_motivo && (
                                          <span className="text-[10px] font-medium opacity-75 ml-1">({medicao.ajuste_material_anterior_motivo})</span>
                                        )}
                                      </td>
                                      <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#F59E0B' }}>− {formatCurrency(ajusteMatAnterior)}</td>
                                    </tr>
                                  )}
                                  <tr>
                                    <td colSpan={6} className="text-sm font-bold text-right pr-4" style={{ color: '#10B981' }}>
                                      ↳ NF a emitir <span className="text-[10px] font-bold ml-1 px-1 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)' }}>líquido</span>
                                    </td>
                                    <td className="text-right font-bold text-sm tabular-nums" style={{ color: '#10B981' }}>{formatCurrency(liquidoTfoot)}</td>
                                  </tr>
                                  {/* === TOTAL === */}
                                  <tr className="border-t border-[var(--border)]">
                                    <td colSpan={6} className="pt-1.5 pb-1 text-base font-bold text-right pr-4" style={{ color: 'var(--text-1)' }}>Total da Medição (mat + serv)</td>
                                    <td className="pt-1.5 pb-1 text-right font-bold text-base tabular-nums" style={{ color: '#3B82F6' }}>{formatCurrency(tot)}</td>
                                  </tr>
                                </>
                              )
                            })()}
                          </tfoot>
                        </table>
                      </>
                    )
                  })()
                ) : (
                  /* Fallback: tabela antiga (6 colunas) enquanto /planilha não carrega ou se falhar. */
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)' }}>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-2 text-[var(--text-3)] font-medium">Código</th>
                        <th className="text-left py-2 text-[var(--text-3)] font-medium">Descrição</th>
                        <th className="text-center py-2 text-[var(--text-3)] font-medium">Un.</th>
                        <th className="text-right py-2 text-[var(--text-3)] font-medium">Qtd.</th>
                        <th className="text-right py-2 text-[var(--text-3)] font-medium">V. Unit.</th>
                        <th className="text-right py-2 text-[var(--text-3)] font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item: any, idx: number) => (
                        <tr key={item.id} className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--surface-1)]' : 'bg-[var(--surface-2)]'}`}>
                          <td className="py-2 font-mono text-[var(--text-3)]">{item.detalhamento?.codigo}</td>
                          <td className="py-2 text-[var(--text-2)]">{item.detalhamento?.descricao}</td>
                          <td className="py-2 text-center text-[var(--text-3)]">{item.detalhamento?.unidade}</td>
                          <td className="py-2 text-right text-[var(--text-1)]">{Number(item.quantidade_medida).toLocaleString('pt-BR')}</td>
                          <td className="py-2 text-right text-[var(--text-3)]">{formatCurrency(item.valor_unitario)}</td>
                          <td className="py-2 text-right font-semibold text-[var(--text-1)]">{formatCurrency(item.quantidade_medida * item.valor_unitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {(() => {
                        let mat = totaisInformacon?.material_medido ?? 0
                        let serv = totaisInformacon?.servico_medido ?? 0
                        if (!totaisInformacon) {
                          const congelado = snapshotMedicao()
                          if (congelado) {
                            mat = congelado.material
                            serv = congelado.servico
                          } else {
                            for (const it of (medicao.medicao_itens || []) as any[]) {
                              const qtd = Number(it.quantidade_medida || 0)
                              mat += qtd * Number(it.detalhamento?.valor_material_unit || 0)
                              serv += qtd * Number(it.detalhamento?.valor_servico_unit || 0)
                            }
                          }
                        }
                        const tot = Number(medicao.valor_total || 0)
                        if (mat === 0 && serv === 0 && tot > 0) serv = tot
                        const nfFipMaterial      = totaisInformacon?.nf_descontavel ?? 0
                        const nfTransbordoGrupo  = totaisInformacon?.nf_transbordo_grupo ?? 0
                        const nfRecuperacao      = totaisInformacon?.nf_recuperacao_anterior ?? 0
                        const saldoPedAprovados  = totaisInformacon?.faturamento_direto_em_aberto ?? 0
                        const fipACriar          = totaisInformacon?.fip_faturar    ?? 0
                        const pctRet = totaisInformacon?.pct_retencao ?? Number(medicao.contrato?.percentual_retencao ?? 5)
                        const retTfoot = totaisInformacon?.retencao ?? ((mat + serv) * pctRet / 100)
                        // Compensação de material faturado a mais em medições
                        // anteriores (migration 074). O desconto de NF é travado
                        // no material medido, então este é o único caminho pro
                        // líquido divergir de (serviço − retenção).
                        const ajusteMatAnterior = Number(medicao.ajuste_material_anterior || 0)
                        const liquidoTfoot = serv - retTfoot - ajusteMatAnterior
                        return (
                          <>
                            <tr className="border-t-2 border-[var(--border-hover)]">
                              <td colSpan={3} />
                              <td colSpan={2} className="pt-2 text-sm font-bold text-right pr-4" style={{ color: 'var(--text-1)' }}>Material correspondente (faturamento direto FIP)</td>
                              <td className="pt-2 text-right text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatCurrency(mat)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ NOTA FIP Material <span className="text-[10px] font-medium opacity-75">(já descontada)</span></td>
                              <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#06B6D4' }}>{formatCurrency(nfFipMaterial)}</td>
                            </tr>
                            {nfTransbordoGrupo > 0 && (
                              <tr>
                                <td colSpan={3} />
                                <td
                                  colSpan={2}
                                  className="text-xs text-right pr-4"
                                  style={{ color: 'var(--text-3)' }}
                                  title="Material medido cujo desconto veio de nota alocada em outro item da mesma tarefa (o código de dois níveis: 14.2 SPRINKLER, 16.1 INFRA SDAI). A FIP compra por lote e a medição é por pavimento — sem isso, a nota fica parada num item enquanto o vizinho aparece sem cobertura. Fora da tarefa nada transborda."
                                >
                                  ↳ dos quais cobertos por NF da mesma tarefa
                                </td>
                                <td
                                  className="text-right text-xs tabular-nums"
                                  style={{ color: 'var(--text-3)' }}
                                  title="Material medido cujo desconto veio de nota alocada em outro item da mesma tarefa (o código de dois níveis: 14.2 SPRINKLER, 16.1 INFRA SDAI). A FIP compra por lote e a medição é por pavimento — sem isso, a nota fica parada num item enquanto o vizinho aparece sem cobertura. Fora da tarefa nada transborda."
                                >
                                  {formatCurrency(nfTransbordoGrupo)}
                                </td>
                              </tr>
                            )}
                            {nfRecuperacao > 0 && (
                              <tr>
                                <td colSpan={3} />
                                <td
                                  colSpan={2}
                                  className="text-xs text-right pr-4"
                                  style={{ color: 'var(--text-3)' }}
                                  title="Nota de medições anteriores que não descontou na época e está sendo recuperada agora. O saldo de NF é apurado sobre o acumulado da tarefa (menor entre material executado e nota lançada), então o desconto de um mês pode superar o material medido nesse mês."
                                >
                                  ↳ dos quais recuperação de NF de medições anteriores
                                </td>
                                <td
                                  className="text-right text-xs tabular-nums"
                                  style={{ color: 'var(--text-3)' }}
                                  title="Nota de medições anteriores que não descontou na época e está sendo recuperada agora. O saldo de NF é apurado sobre o acumulado da tarefa (menor entre material executado e nota lançada), então o desconto de um mês pode superar o material medido nesse mês."
                                >
                                  {formatCurrency(nfRecuperacao)}
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ Saldo Ped. Aprovados <span className="text-[10px] font-medium opacity-75">(NF Pendentes)</span></td>
                              <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrency(saldoPedAprovados)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ FIP a criar <span className="text-[10px] font-medium opacity-75">(NF nova)</span></td>
                              <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#3B82F6' }}>{formatCurrency(fipACriar)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="pt-2 text-sm font-bold text-right pr-4" style={{ color: '#0F766E' }}>
                                Serviço medido <span className="text-[10px] font-medium opacity-75">(100%)</span>
                              </td>
                              <td className="pt-2 text-right font-bold text-sm tabular-nums" style={{ color: '#0F766E' }}>{formatCurrency(serv)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ Retenção contratual <span className="text-[10px] font-medium opacity-75">({pctRet.toFixed(0)}%)</span></td>
                              <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#818CF8' }}>− {formatCurrency(retTfoot)}</td>
                            </tr>
                            {ajusteMatAnterior !== 0 && (
                              <tr>
                                <td colSpan={3} />
                                <td colSpan={2} className="text-sm text-right pr-4" style={{ color: 'var(--text-2)' }}>↳ Ajuste de material de medições anteriores</td>
                                <td className="text-right text-sm font-semibold tabular-nums" style={{ color: '#F59E0B' }}>− {formatCurrency(ajusteMatAnterior)}</td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={3} />
                              <td colSpan={2} className="text-sm font-bold text-right pr-4" style={{ color: '#10B981' }}>
                                ↳ NF a emitir <span className="text-[10px] font-bold ml-1 px-1 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.15)' }}>líquido</span>
                              </td>
                              <td className="text-right font-bold text-sm tabular-nums" style={{ color: '#10B981' }}>{formatCurrency(liquidoTfoot)}</td>
                            </tr>
                            <tr className="border-t border-[var(--border)]">
                              <td colSpan={3} />
                              <td colSpan={2} className="pt-1.5 pb-1 text-base font-bold text-right pr-4" style={{ color: 'var(--text-1)' }}>Total da Medição (mat + serv)</td>
                              <td className="pt-1.5 pb-1 text-right font-bold text-base tabular-nums" style={{ color: '#3B82F6' }}>{formatCurrency(tot)}</td>
                            </tr>
                          </>
                        )
                      })()}
                    </tfoot>
                  </table>
                )}
              </CardContent>
            </Card>

            {/* Notas Fiscais */}
            {notas_fiscais.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-[var(--text-1)]">Notas Fiscais — Faturamento Direto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {notas_fiscais.map((nf: any) => (
                      <div key={nf.id} className="flex items-center gap-3 p-3 bg-[var(--surface-1)] rounded-lg border border-[var(--border)]">
                        <FileText className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[var(--text-1)]">NF {nf.numero_nf}</p>
                          <p className="text-xs text-[var(--text-3)]">{nf.emitente} · {formatDate(nf.data_emissao)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm text-[var(--text-1)]">{formatCurrency(nf.valor)}</p>
                          <Badge className={
                            nf.status_validacao === 'aprovada' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' :
                            nf.status_validacao === 'rejeitada' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
                            'bg-amber-900/30 text-amber-400 border-amber-800/50'
                          }>
                            {nf.status_validacao === 'aprovada' ? 'Validada' : nf.status_validacao === 'rejeitada' ? 'Rejeitada' : 'Pendente'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar right */}
          <div className="space-y-5">
            {/* Anexos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2 text-[var(--text-1)]">
                  <Paperclip className="w-4 h-4" />
                  Documentos Anexados ({anexos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {anexos.map((a: any) => (
                    <a
                      key={a.id}
                      href={a.url}
                      download={a.nome_original}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--surface-3)] cursor-pointer group"
                    >
                      <FileText className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text-2)] truncate">{a.nome_original}</p>
                        <p className="text-[10px] text-[var(--text-3)]">{formatBytes(a.tamanho_bytes)}</p>
                      </div>
                      <Download className="w-3.5 h-3.5 text-[var(--text-3)] group-hover:text-blue-400 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[var(--text-1)]">Histórico / Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aprovacoes.map((a: any) => {
                    const config = ACAO_CONFIG[a.acao] || ACAO_CONFIG['comentou']
                    const Icon = config.icon
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0 ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-[var(--text-1)]">{a.aprovador_nome}</p>
                          <p className="text-xs text-[var(--text-3)]">{config.label}</p>
                          {a.comentario && <p className="text-xs text-[var(--text-2)] mt-1 bg-[var(--surface-1)] p-2 rounded border border-[var(--border)]">{a.comentario}</p>}
                          <p className="text-[10px] text-[var(--text-3)] mt-1">{formatDatetime(a.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}

                  {status === 'aprovado' && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-1)]">Medição Aprovada</p>
                        <p className="text-xs text-[var(--text-3)]">E-mail enviado para o fornecedor</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Partes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[var(--text-1)]">Partes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="text-[var(--text-3)] font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratante</p>
                  <p className="font-medium text-[var(--text-1)]">{medicao.contrato?.contratante?.nome}</p>
                  <p className="text-[var(--text-3)]">{medicao.contrato?.contratante?.email_contato}</p>
                </div>
                <div className="border-t border-[var(--border)] pt-3">
                  <p className="text-[var(--text-3)] font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratado</p>
                  <p className="font-medium text-[var(--text-1)]">{medicao.contrato?.contratado?.nome}</p>
                  <p className="text-[var(--text-3)]">{medicao.contrato?.contratado?.email_contato}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Aprovar */}
      <Dialog open={modalAprovar} onOpenChange={setModalAprovar}>
        <DialogContent className="bg-[var(--surface-2)] border border-[var(--border)]">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição FIP-{String(medicao.numero).padStart(4, '0')}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Valor: <strong className="text-[var(--text-1)]">{formatCurrency(medicao.valor_total)}</strong> · Período: {medicao.periodo_referencia}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg text-xs text-emerald-400">
              Ao aprovar, um e-mail automático será enviado para o fornecedor ({medicao.contrato?.contratado?.nome}) com a confirmação.
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(false)}>Cancelar</Button>
            <Button variant="success" onClick={aprovar} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={modalRejeitar} onOpenChange={setModalRejeitar}>
        <DialogContent className="bg-[var(--surface-2)] border border-[var(--border)]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeitar Medição FIP-{String(medicao.numero).padStart(4, '0')}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitar} loading={saving} disabled={!motivo}>
              <XCircle className="w-4 h-4" />
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailLiberacaoMedicaoModal
        open={modalLiberacao !== null}
        onClose={() => setModalLiberacao(null)}
        contratoId={contratoId}
        medicaoId={medicaoId}
        modo={modalLiberacao ?? 'aprovar'}
        onSent={() => {
          setStatus('aprovado')
          setModalLiberacao(null)
        }}
      />

      {/* Modal Ajustar Quantidade (admin) — também disponível aqui na página
          da medição, não só no Boletim Informakon. */}
      <Dialog
        open={!!modalAjustar}
        onOpenChange={(open) => { if (!open && !salvandoAjuste) { setModalAjustar(null); setErroAjuste('') } }}
      >
        <DialogContent>
          {modalAjustar && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2" style={{ color: '#F97316' }}>
                  <Pencil className="w-5 h-5" />
                  Ajustar quantidade — admin
                </DialogTitle>
                <DialogDescription className="text-[var(--text-2)]">
                  Item <strong className="font-mono">{modalAjustar.codigo}</strong>
                  {' — '}
                  {modalAjustar.descricao.length > 80
                    ? modalAjustar.descricao.slice(0, 80) + '...'
                    : modalAjustar.descricao}
                </DialogDescription>
              </DialogHeader>
              <div className="py-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      Quantidade atual
                    </Label>
                    <div className="px-3 py-2 rounded-lg font-mono text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                      {modalAjustar.quantidade_atual}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-[var(--text-3)] font-medium uppercase tracking-wider">
                      Quantidade contratada
                    </Label>
                    <div className="px-3 py-2 rounded-lg font-mono text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                      {modalAjustar.quantidade_contratada}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                    Nova quantidade
                  </Label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={novaQtd}
                    onChange={e => setNovaQtd(e.target.value)}
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] rounded-lg px-3 py-2 outline-none font-mono"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                    Motivo do ajuste <span className="text-red-400">(obrigatório, mín. 10 caracteres)</span>
                  </Label>
                  <Textarea
                    placeholder="Ex.: 'Incluí item 19.1.1 (Administração) que ficou de fora.'"
                    value={motivoAjuste}
                    onChange={e => setMotivoAjuste(e.target.value)}
                    className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] min-h-[70px]"
                  />
                  <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                    O motivo aparece no histórico e no email pro solicitante. Seja específico.
                  </p>
                </div>
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg text-xs text-orange-400">
                  <strong>Atenção:</strong> esse ajuste fica permanente como histórico. Recalcula automaticamente os valores da medição após salvar.
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
                  onClick={() => { setModalAjustar(null); setErroAjuste('') }}
                  disabled={salvandoAjuste}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={salvarAjuste}
                  loading={salvandoAjuste}
                  disabled={
                    salvandoAjuste ||
                    motivoAjuste.trim().length < 10 ||
                    !novaQtd ||
                    !Number.isFinite(Number(novaQtd.replace(',', '.')))
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
