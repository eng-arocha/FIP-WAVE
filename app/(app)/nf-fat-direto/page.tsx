'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { ColumnFilter, passaFiltro } from '@/components/ui/column-filter'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  Receipt, Clock, CheckCircle2, Plus,
  ArrowRight, Package, Loader2, ChevronDown, ChevronUp,
  Upload, FileText, AlertTriangle, X, Download,
  ChevronsUpDown, RotateCcw,
} from 'lucide-react'
import { useTableLayout, type ColumnDef } from '@/lib/hooks/use-table-layout'

// ── Tolerância de saldo ─────────────────────────────────────────────────────
const TOLERANCE = 100 // R$ 100,00

// Precisa ser módulo-level pra poder ser usado em useMemo no topo do componente
const STATUS_BADGE_RAW: Record<string, { label: string; color: string; bg: string }> = {
  aprovado:             { label: 'APROVADO',   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  aguardando_aprovacao: { label: 'AGUARDANDO', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  encerrado:            { label: 'ENCERRADO',  color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
}

// ── Máscara CNPJ ────────────────────────────────────────────────────────────
function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

// ── Dias até a data ──────────────────────────────────────────────────────────
function diasAte(dateStr: string): number {
  if (!dateStr) return Infinity
  const target = new Date(dateStr + 'T00:00:00')
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

interface Solicitacao {
  id: string
  numero: number
  numero_pedido_fip?: number | null
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string | null
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  contrato_id: string
  contrato: { id: string; numero: string; descricao: string }
  solicitante?: { nome: string }
  notas_fiscais: {
    id: string
    numero_nf: string
    valor: number
    status: string
    divergencia_valor?: boolean
    divergencia_excedente?: number
    override_excede_saldo?: boolean
  }[]
  itens: { id: string }[]
}

interface NfForm {
  numero_nf: string
  cnpj_emitente: string
  valor: string
  data_emissao: string
  data_recebimento: string
  data_vencimento: string
  igual_ao_saldo: boolean
}

const EMPTY_FORM: NfForm = {
  numero_nf: '',
  cnpj_emitente: '',
  valor: '',
  data_emissao: '',
  data_recebimento: '',
  data_vencimento: '',
  igual_ao_saldo: false,
}

export default function NfFatDiretoPage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'com_saldo' | 'sem_saldo'>('com_saldo')
  const [expandedSolId, setExpandedSolId] = useState<string | null>(null)
  const [nfForm, setNfForm] = useState<NfForm>(EMPTY_FORM)
  const [nfFile, setNfFile] = useState<File | null>(null)
  const [savingNf, setSavingNf] = useState(false)
  const [nfError, setNfError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch('/api/nf-fat-direto')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitacoes(data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  const getNfsValidas = (sol: Solicitacao) => sol.notas_fiscais.filter(n => n.status !== 'rejeitada')
  const getTotalNfs   = (sol: Solicitacao) => getNfsValidas(sol).reduce((a, n) => a + n.valor, 0)
  const getSaldo      = (sol: Solicitacao) => sol.valor_total - getTotalNfs(sol)

  // Com saldo = saldo > TOLERANCE | Sem saldo = saldo ≤ TOLERANCE (inclui negativo dentro da tolerância)
  const temSaldo = (sol: Solicitacao) => getSaldo(sol) > TOLERANCE

  const totalAprovado   = solicitacoes.filter(s => s.status === 'aprovado').reduce((a, s) => a + s.valor_total, 0)
  const totalAguardando = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((a, s) => a + s.valor_total, 0)
  const totalNFs        = solicitacoes.reduce((a, s) => a + getTotalNfs(s), 0)
  const totalSol        = solicitacoes.length

  // ── Filtros estilo Excel por coluna ────────────────────────────
  const [fNumero, setFNumero] = useState<Set<string>>(new Set())
  const [fContrato, setFContrato] = useState<Set<string>>(new Set())
  const [fFornecedor, setFFornecedor] = useState<Set<string>>(new Set())
  const [fCnpj, setFCnpj] = useState<Set<string>>(new Set())
  const [fData, setFData] = useState<Set<string>>(new Set())
  const [fValor, setFValor] = useState<Set<string>>(new Set())
  const [fStatusCol, setFStatusCol] = useState<Set<string>>(new Set())

  const filtradasStatus = solicitacoes.filter(s => {
    if (filtroStatus === 'com_saldo') return s.status === 'aprovado' && temSaldo(s)
    if (filtroStatus === 'sem_saldo') return !temSaldo(s)
    return true
  })

  const valoresUnicos = useMemo(() => ({
    numero:     [...new Set(filtradasStatus.map(s => `FIP-${String(s.numero).padStart(4, '0')}`))],
    contrato:   [...new Set(filtradasStatus.map(s => s.contrato?.numero || '—'))],
    fornecedor: [...new Set(filtradasStatus.map(s => s.fornecedor_razao_social || '—'))],
    cnpj:       [...new Set(filtradasStatus.map(s => s.fornecedor_cnpj ? maskCnpj(s.fornecedor_cnpj) : '—'))],
    data:       [...new Set(filtradasStatus.map(s => s.data_solicitacao ? formatDate(s.data_solicitacao) : '—'))],
    valor:      [...new Set(filtradasStatus.map(s => formatCurrency(s.valor_total || 0)))],
    status:     [...new Set(filtradasStatus.map(s => STATUS_BADGE_RAW[s.status]?.label ?? s.status))],
  }), [filtradasStatus])

  const filtradas = filtradasStatus.filter(s =>
    passaFiltro(fNumero,     `FIP-${String(s.numero).padStart(4, '0')}`) &&
    passaFiltro(fContrato,   s.contrato?.numero || '—') &&
    passaFiltro(fFornecedor, s.fornecedor_razao_social || '—') &&
    passaFiltro(fCnpj,       s.fornecedor_cnpj ? maskCnpj(s.fornecedor_cnpj) : '—') &&
    passaFiltro(fData,       s.data_solicitacao ? formatDate(s.data_solicitacao) : '—') &&
    passaFiltro(fValor,      formatCurrency(s.valor_total || 0)) &&
    passaFiltro(fStatusCol,  STATUS_BADGE_RAW[s.status]?.label ?? s.status)
  )

  // ── Layout (sort + resize) com persistência por usuário ─────────
  type ColKey =
    | 'numero' | 'contrato' | 'fornecedor' | 'cnpj' | 'data'
    | 'valor' | 'nfs' | 'saldo' | 'status' | 'observacoes'

  const tabelaColumns = useMemo<ColumnDef<ColKey>[]>(() => [
    { key: 'numero',      defaultWidth: 120, min: 100, type: 'number' },
    { key: 'contrato',    defaultWidth: 130, min: 90,  type: 'string' },
    { key: 'fornecedor',  defaultWidth: 280, min: 140, type: 'string' },
    { key: 'cnpj',        defaultWidth: 160, min: 120, type: 'string' },
    { key: 'data',        defaultWidth: 110, min: 90,  type: 'date'   },
    { key: 'valor',       defaultWidth: 130, min: 100, type: 'number' },
    { key: 'nfs',         defaultWidth: 150, min: 100, type: 'number' },
    { key: 'saldo',       defaultWidth: 130, min: 100, type: 'number' },
    { key: 'status',      defaultWidth: 130, min: 100, type: 'string' },
    { key: 'observacoes', defaultWidth: 320, min: 160, type: 'string' },
  ], [])

  const {
    sortKey, sortDir, gridTemplateColumns, toggleSort, startResize, reset, compare,
  } = useTableLayout<ColKey>('nf-fat-direto:tabela:v1', tabelaColumns, '64px')

  const filtradasOrdenadas = useMemo(() => {
    if (!sortKey || !sortDir) return filtradas
    const arr = [...filtradas]
    arr.sort((a, b) => {
      // Mapeia ColKey → valor do registro pra comparar
      const get = (s: Solicitacao): any => {
        switch (sortKey) {
          case 'numero':      return s.numero
          case 'contrato':    return s.contrato?.numero || ''
          case 'fornecedor':  return s.fornecedor_razao_social || ''
          case 'cnpj':        return s.fornecedor_cnpj || ''
          case 'data':        return s.data_solicitacao || ''
          case 'valor':       return s.valor_total || 0
          case 'nfs':         return getTotalNfs(s)
          case 'saldo':       return getSaldo(s)
          case 'status':      return STATUS_BADGE_RAW[s.status]?.label ?? s.status
          case 'observacoes': return s.observacoes || ''
        }
      }
      const r = compare({ [sortKey]: get(a) }, { [sortKey]: get(b) }, sortKey)
      return sortDir === 'asc' ? r : -r
    })
    return arr
  }, [filtradas, sortKey, sortDir, compare])

  const COL_LABELS: Record<ColKey, string> = {
    numero: 'Nº', contrato: 'Contrato', fornecedor: 'Fornecedor', cnpj: 'CNPJ',
    data: 'Data', valor: 'Valor', nfs: 'NFs Recebidas', saldo: 'Saldo',
    status: 'Status', observacoes: 'Observações',
  }

  const filtroPorColuna: Partial<Record<ColKey, { values: string[]; selected: Set<string>; onChange: (s: Set<string>) => void }>> = {
    numero:     { values: valoresUnicos.numero,     selected: fNumero,     onChange: setFNumero },
    contrato:   { values: valoresUnicos.contrato,   selected: fContrato,   onChange: setFContrato },
    fornecedor: { values: valoresUnicos.fornecedor, selected: fFornecedor, onChange: setFFornecedor },
    cnpj:       { values: valoresUnicos.cnpj,       selected: fCnpj,       onChange: setFCnpj },
    data:       { values: valoresUnicos.data,       selected: fData,       onChange: setFData },
    valor:      { values: valoresUnicos.valor,      selected: fValor,      onChange: setFValor },
    status:     { values: valoresUnicos.status,     selected: fStatusCol,  onChange: setFStatusCol },
  }

  const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    aprovado:             { label: 'APROVADO',   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    aguardando_aprovacao: { label: 'AGUARDANDO', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  }

  function resetForm() {
    setNfForm(EMPTY_FORM)
    setNfFile(null)
    setNfError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function toggleExpand(sol: Solicitacao) {
    if (expandedSolId === sol.id) {
      setExpandedSolId(null)
      resetForm()
    } else {
      setExpandedSolId(sol.id)
      setNfForm({ ...EMPTY_FORM, cnpj_emitente: maskCnpj(sol.fornecedor_cnpj || '') })
      setNfError('')
      setNfFile(null)
    }
  }

  function handleFileSelect(file: File) {
    if (file.size > 50 * 1024 * 1024) { setNfError('Arquivo muito grande (máx. 50 MB).'); return }
    setNfFile(file)
    setNfError('')
  }

  // Confirmação pendente de NF com data anterior à aprovação. Quando preenchido,
  // mostra um banner inline com botões "Confirmar mesmo assim" / "Cancelar".
  const [confirmDataAnterior, setConfirmDataAnterior] = useState<{
    sol: Solicitacao
    data_emissao: string
    data_aprovacao: string
  } | null>(null)

  // Confirmação pendente de NF que excede a tolerância de saldo configurada.
  // Exige motivo da divergência (auditado).
  const [confirmExcedeSaldo, setConfirmExcedeSaldo] = useState<{
    sol: Solicitacao
    valor_nf: number
    saldo: number
    excedente: number
    tolerancia: number
  } | null>(null)
  const [motivoDivergencia, setMotivoDivergencia] = useState('')

  // Preview de email após escolher caminho B (cobrir) ou C (recusar)
  const [previewDivergencia, setPreviewDivergencia] = useState<{
    sol: Solicitacao
    acao: 'cobrir' | 'recusar'
    motivo: string
    excedente: number
    saldo_teto: number
    teto: number
    total_aprov_antes: number
    preview: { subject: string; html: string }
    envolvidos: { id: string; nome: string; email: string; perfil: string }[]
  } | null>(null)
  const [destinatariosSelecionados, setDestinatariosSelecionados] = useState<Set<string>>(new Set())

  // Alerta contextual de pedidos anteriores pendentes (pós-cadastro NF)
  const [alertaPedidosAtrasados, setAlertaPedidosAtrasados] = useState<{
    contrato_id: string
    ref_solicitacao_id: string
    numero_nf_recente: string
    qtd: number
  } | null>(null)

  // Relatórios mensais pendentes de revisão (PR 3)
  const [relatoriosMensaisPendentes, setRelatoriosMensaisPendentes] = useState<Array<{
    id: string
    contrato_id: string
    ano: number
    mes: number
    qtd_pedidos: number
    valor_total_atrasado: number
    sequencia_cobranca: number
    contrato: { numero: string; descricao: string }
  }>>([])

  // Modal de revisão de relatório mensal
  const [previewRelatorioMensal, setPreviewRelatorioMensal] = useState<{
    relatorio_id: string
    contrato_numero: string
    ano: number
    mes: number
    sequencia: number
    qtd_pedidos: number
    valor_total: number
    preview: { subject: string; html: string }
    envolvidos: { id: string; nome: string; email: string; perfil: string }[]
  } | null>(null)
  const [destinatariosRelatorio, setDestinatariosRelatorio] = useState<Set<string>>(new Set())

  // Fetch relatórios pendentes quando a página monta
  useEffect(() => {
    fetch('/api/relatorios-mensais?status=pendente')
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setRelatoriosMensaisPendentes(data || []))
      .catch(() => { /* silencioso */ })
  }, [])

  async function abrirRevisarRelatorioMensal(relatorioId: string) {
    setSavingNf(true)
    try {
      const res = await fetch(`/api/relatorios-mensais/${relatorioId}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setNfError(d.error || 'Erro ao carregar relatório.')
        return
      }
      const d = await res.json()
      setPreviewRelatorioMensal({
        relatorio_id: relatorioId,
        contrato_numero: d.relatorio.contrato.numero,
        ano: d.relatorio.ano,
        mes: d.relatorio.mes,
        sequencia: d.relatorio.sequencia_cobranca,
        qtd_pedidos: d.relatorio.qtd_pedidos,
        valor_total: Number(d.relatorio.valor_total_atrasado),
        preview: d.preview,
        envolvidos: d.envolvidos || [],
      })
      setDestinatariosRelatorio(new Set((d.envolvidos || []).map((u: any) => u.id)))
    } finally {
      setSavingNf(false)
    }
  }

  async function executarAcaoRelatorio(acao: 'enviar' | 'descartar') {
    if (!previewRelatorioMensal) return
    if (acao === 'enviar' && destinatariosRelatorio.size === 0) {
      if (!confirm('Nenhum destinatário selecionado — descartar este relatório?')) return
    }
    setSavingNf(true)
    try {
      const payload = acao === 'enviar'
        ? { acao, destinatarios_ids: Array.from(destinatariosRelatorio) }
        : { acao }
      const res = await fetch(`/api/relatorios-mensais/${previewRelatorioMensal.relatorio_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) {
        setNfError(d.error || 'Erro ao executar ação.')
        return
      }
      // Remove da lista de pendentes
      setRelatoriosMensaisPendentes(prev =>
        prev.filter(r => r.id !== previewRelatorioMensal.relatorio_id),
      )
      setPreviewRelatorioMensal(null)
    } catch (e: any) {
      setNfError(e?.message || 'Erro.')
    } finally {
      setSavingNf(false)
    }
  }
  // Modal de preview do email de pedidos atrasados
  const [previewPedidosAtrasados, setPreviewPedidosAtrasados] = useState<{
    contrato_id: string
    ref_solicitacao_id: string
    numero_nf_recente: string
    preview: { subject: string; html: string }
    envolvidos: { id: string; nome: string; email: string; perfil: string }[]
    pedidos_atrasados: Array<{
      numero_pedido_fip: number
      data_aprovacao: string
      valor_total: number
      total_nfs: number
      saldo: number
      dias_decorridos: number
    }>
    dias_alerta: number
  } | null>(null)
  const [destinatariosAtraso, setDestinatariosAtraso] = useState<Set<string>>(new Set())

  /**
   * Sobe arquivo direto pro Supabase Storage via signed URL.
   * Bypassa o limite de body do Vercel (~4.5MB) — funciona com PDFs de
   * qualquer tamanho até o limite do bucket (50MB).
   */
  async function uploadArquivoDireto(file: File, solId: string): Promise<string> {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    // eslint-disable-next-line no-console
    console.info('[NF] Upload direto iniciado', { name: file.name, sizeMB: (file.size / 1024 / 1024).toFixed(2), solId })
    // 1. Pega signed upload URL do servidor (admin-side)
    const signRes = await fetch('/api/fat-direto/sign-nf-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solId, ext }),
    })
    if (!signRes.ok) {
      const e = await signRes.json().catch(() => ({}))
      throw new Error(e.error || 'Falha ao preparar upload do arquivo.')
    }
    const { signedUrl, publicUrl } = await signRes.json()
    // 2. PUT direto no Supabase Storage (não passa pelo Vercel)
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
    if (!putRes.ok) {
      throw new Error(`Falha no upload do arquivo (HTTP ${putRes.status}).`)
    }
    // eslint-disable-next-line no-console
    console.info('[NF] Upload direto OK', { publicUrl })
    return publicUrl
  }

  async function postNf(
    sol: Solicitacao,
    overrideDataAnterior: boolean,
    overrideExcedeSaldo = false,
    motivoDivergenciaArg = '',
  ): Promise<{ ok: true } | { ok: false; status: number; data: any }> {
    // Se há arquivo, sobe direto pro Storage primeiro (sem passar pelo Vercel)
    let arquivo_url: string | undefined
    if (nfFile) {
      try {
        arquivo_url = await uploadArquivoDireto(nfFile, sol.id)
      } catch (e: any) {
        return { ok: false, status: 0, data: { error: e?.message || 'Erro ao enviar arquivo.' } }
      }
    }

    // Posta os metadados como JSON puro — payload pequeno, sem risco de 413
    const payload: Record<string, unknown> = {
      numero_nf: nfForm.numero_nf,
      emitente:  sol.fornecedor_razao_social || undefined,
      cnpj_emitente: nfForm.cnpj_emitente.replace(/\D/g, '') || undefined,
      valor: parseFloat(nfForm.valor),
      data_emissao: nfForm.data_emissao,
    }
    if (nfForm.data_recebimento) payload.data_recebimento = nfForm.data_recebimento
    if (nfForm.data_vencimento)  payload.data_vencimento  = nfForm.data_vencimento
    if (arquivo_url)             payload.arquivo_url      = arquivo_url
    if (overrideDataAnterior)    payload.override_data_anterior = true
    if (overrideExcedeSaldo) {
      payload.override_excede_saldo = true
      payload.motivo_divergencia = motivoDivergenciaArg
    }

    const res = await fetch(
      `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/nfs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, status: res.status, data }
    }
    return { ok: true }
  }

  async function handleRegistrarNf(
    sol: Solicitacao,
    overrideDataAnterior = false,
    overrideExcedeSaldo = false,
    motivoDivergenciaArg = '',
  ) {
    if (savingNf) return // bloqueia duplo-click
    if (!nfForm.numero_nf || !nfForm.valor || !nfForm.data_emissao) {
      setNfError('Preencha os campos obrigatórios: Número NF, Valor e Data Emissão.')
      return
    }
    setSavingNf(true)
    setNfError('')
    try {
      const result = await postNf(sol, overrideDataAnterior, overrideExcedeSaldo, motivoDivergenciaArg)
      if (!result.ok) {
        // Caso especial: data anterior à aprovação → não bloqueia, abre confirmação.
        // Aberto SEMPRE em DATA_INVALIDA, mesmo sem override_disponivel no detail
        // (defesa contra deploy/cache stale do flag).
        const code = result.data?.code
        const detail = result.data?.detail || {}
        // Caso especial: NF excede tolerância de saldo → abre modal com motivo
        if (result.status === 422 && code === 'VALOR_EXCEDE_SALDO' && detail.override_disponivel && !overrideExcedeSaldo) {
          setConfirmExcedeSaldo({
            sol,
            valor_nf:   Number(detail.valor_nf ?? 0),
            saldo:      Number(detail.saldo ?? 0),
            excedente:  Number(detail.excedente ?? 0),
            tolerancia: Number(detail.tolerancia ?? 0),
          })
          setMotivoDivergencia('')
          return
        }
        if (result.status === 422 && code === 'DATA_INVALIDA') {
          // Se já estávamos no override e ainda assim deu DATA_INVALIDA, isso
          // indica que o servidor não está honrando o flag — exibe o erro real
          // pra usuário/dev ver, em vez de loop infinito.
          if (overrideDataAnterior) {
            setNfError(
              `Servidor não aceitou o override (${result.data?.error}). ` +
              `Avise o suporte — a checagem de data não está respeitando 'override_data_anterior'.`,
            )
            return
          }
          setConfirmDataAnterior({
            sol,
            data_emissao: detail.data_emissao || nfForm.data_emissao,
            data_aprovacao: String(detail.data_aprovacao || '').slice(0, 10) || '—',
          })
          return
        }
        // Mensagem visível com o código pra facilitar diagnóstico:
        // ex: "[VALOR_EXCEDE_SALDO] Valor da NF (R$ 10.000) excede o saldo do pedido (R$ 5.000)."
        const errorMsg = result.data?.error || 'Erro ao registrar NF.'
        const errorCode = result.data?.code
        setNfError(errorCode ? `[${errorCode}] ${errorMsg}` : errorMsg)
        return
      }
      setConfirmDataAnterior(null)
      setExpandedSolId(null)
      // Antes de resetar, captura dados pra checagem de pedidos atrasados
      const numeroNfCadastrada = nfForm.numero_nf
      resetForm()
      reload()

      // Após cadastrar NF com sucesso, checa pedidos anteriores pendentes
      try {
        const r = await fetch(
          `/api/contratos/${sol.contrato_id}/fat-direto/pedidos-atrasados?ref=${sol.id}`,
        )
        if (r.ok) {
          const d = await r.json()
          if (Array.isArray(d.pedidos) && d.pedidos.length > 0) {
            setAlertaPedidosAtrasados({
              contrato_id: sol.contrato_id,
              ref_solicitacao_id: sol.id,
              numero_nf_recente: numeroNfCadastrada,
              qtd: d.pedidos.length,
            })
          }
        }
      } catch { /* silencioso — alerta é opcional */ }
    } finally {
      setSavingNf(false)
    }
  }

  async function abrirPreviewPedidosAtrasados() {
    if (!alertaPedidosAtrasados) return
    setSavingNf(true)
    try {
      const res = await fetch(
        `/api/contratos/${alertaPedidosAtrasados.contrato_id}/fat-direto/pedidos-atrasados`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref_solicitacao_id: alertaPedidosAtrasados.ref_solicitacao_id,
            numero_nf_recente: alertaPedidosAtrasados.numero_nf_recente,
            dry_run: true,
          }),
        },
      )
      const d = await res.json()
      if (!res.ok) {
        setNfError(d.error || 'Erro ao gerar preview.')
        return
      }
      setPreviewPedidosAtrasados({
        contrato_id: alertaPedidosAtrasados.contrato_id,
        ref_solicitacao_id: alertaPedidosAtrasados.ref_solicitacao_id,
        numero_nf_recente: alertaPedidosAtrasados.numero_nf_recente,
        preview: d.preview,
        envolvidos: d.envolvidos || [],
        pedidos_atrasados: d.pedidos_atrasados || [],
        dias_alerta: d.dias_alerta || 15,
      })
      setDestinatariosAtraso(new Set((d.envolvidos || []).map((u: any) => u.id)))
      setAlertaPedidosAtrasados(null)
    } catch (e: any) {
      setNfError(e?.message || 'Erro ao gerar preview.')
    } finally {
      setSavingNf(false)
    }
  }

  async function confirmarEnviarPedidosAtrasados() {
    if (!previewPedidosAtrasados) return
    if (destinatariosAtraso.size === 0) {
      if (!confirm('Nenhum envolvido selecionado — fechar sem enviar email?')) return
      setPreviewPedidosAtrasados(null)
      return
    }
    setSavingNf(true)
    try {
      const res = await fetch(
        `/api/contratos/${previewPedidosAtrasados.contrato_id}/fat-direto/pedidos-atrasados`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref_solicitacao_id: previewPedidosAtrasados.ref_solicitacao_id,
            numero_nf_recente: previewPedidosAtrasados.numero_nf_recente,
            dry_run: false,
            destinatarios_ids: Array.from(destinatariosAtraso),
          }),
        },
      )
      const d = await res.json()
      if (!res.ok) {
        setNfError(d.error || 'Erro ao enviar.')
        return
      }
      setPreviewPedidosAtrasados(null)
    } catch (e: any) {
      setNfError(e?.message || 'Erro ao enviar.')
    } finally {
      setSavingNf(false)
    }
  }

  async function confirmarMesmoAssim() {
    if (!confirmDataAnterior) return
    const { sol } = confirmDataAnterior
    setConfirmDataAnterior(null)
    await handleRegistrarNf(sol, true)
  }

  // Caminho A: aprovação override puro (NF cabe no teto, mas excede pedido)
  async function confirmarExcedeSaldo() {
    if (!confirmExcedeSaldo) return
    if (!motivoDivergencia.trim()) {
      setNfError('Informe o motivo da divergência (obrigatório para auditoria).')
      return
    }
    const { sol } = confirmExcedeSaldo
    const motivo = motivoDivergencia.trim()
    setConfirmExcedeSaldo(null)
    await handleRegistrarNf(sol, false, true, motivo)
  }

  // Caminhos B (cobrir) e C (recusar): chama divergencia/resolver com dry_run=true
  // pra trazer preview do email + envolvidos. Depois usuário confirma e envia.
  async function abrirPreviewDivergencia(acao: 'cobrir' | 'recusar') {
    if (!confirmExcedeSaldo) return
    const motivo = motivoDivergencia.trim()
    if (!motivo || motivo.length < 5) {
      setNfError('Informe o motivo da divergência (mínimo 5 caracteres).')
      return
    }
    const { sol } = confirmExcedeSaldo

    // Sobe arquivo direto se houver
    let arquivo_url: string | undefined
    if (nfFile) {
      try {
        arquivo_url = await uploadArquivoDireto(nfFile, sol.id)
      } catch (e: any) {
        setNfError(e?.message || 'Erro ao enviar arquivo.')
        return
      }
    }

    const payload = {
      acao,
      motivo,
      dry_run: true,
      nf: {
        numero_nf: nfForm.numero_nf,
        emitente: sol.fornecedor_razao_social || undefined,
        cnpj_emitente: nfForm.cnpj_emitente.replace(/\D/g, '') || undefined,
        valor: parseFloat(nfForm.valor),
        data_emissao: nfForm.data_emissao,
        data_recebimento: nfForm.data_recebimento || undefined,
        data_vencimento: nfForm.data_vencimento || undefined,
        arquivo_url,
      },
    }
    setSavingNf(true)
    try {
      const res = await fetch(
        `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/divergencia/resolver`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      const data = await res.json()
      if (!res.ok) {
        setNfError(data.error || 'Erro ao gerar preview.')
        return
      }
      setConfirmExcedeSaldo(null)
      setPreviewDivergencia({
        sol,
        acao,
        motivo,
        excedente: Number(data.excedente),
        saldo_teto: Number(data.saldo_teto),
        teto: Number(data.teto),
        total_aprov_antes: Number(data.total_aprov_antes),
        preview: data.preview,
        envolvidos: data.envolvidos || [],
      })
      // Pré-seleciona todos
      setDestinatariosSelecionados(new Set((data.envolvidos || []).map((u: any) => u.id)))
      // Guarda arquivo_url no estado pra reusar no envio
      ;(window as any).__divergencia_arquivo_url__ = arquivo_url
    } catch (e: any) {
      setNfError(e?.message || 'Erro ao gerar preview.')
    } finally {
      setSavingNf(false)
    }
  }

  async function confirmarEnviarDivergencia() {
    if (!previewDivergencia) return
    if (destinatariosSelecionados.size === 0) {
      if (!confirm('Nenhum envolvido selecionado — registrar a NF SEM enviar email?')) return
    }
    const { sol, acao, motivo } = previewDivergencia
    const arquivo_url = (window as any).__divergencia_arquivo_url__
    setSavingNf(true)
    try {
      const payload = {
        acao,
        motivo,
        dry_run: false,
        nf: {
          numero_nf: nfForm.numero_nf,
          emitente: sol.fornecedor_razao_social || undefined,
          cnpj_emitente: nfForm.cnpj_emitente.replace(/\D/g, '') || undefined,
          valor: parseFloat(nfForm.valor),
          data_emissao: nfForm.data_emissao,
          data_recebimento: nfForm.data_recebimento || undefined,
          data_vencimento: nfForm.data_vencimento || undefined,
          arquivo_url,
        },
        destinatarios_ids: Array.from(destinatariosSelecionados),
      }
      const res = await fetch(
        `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/divergencia/resolver`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      const data = await res.json()
      if (!res.ok) {
        setNfError(data.error || 'Erro ao registrar.')
        return
      }
      setPreviewDivergencia(null)
      setExpandedSolId(null)
      resetForm()
      delete (window as any).__divergencia_arquivo_url__
      reload()
    } catch (e: any) {
      setNfError(e?.message || 'Erro ao registrar.')
    } finally {
      setSavingNf(false)
    }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20'

  const RowContent = ({ sol }: { sol: Solicitacao }) => {
    const nfsValidas  = getNfsValidas(sol)
    const totalNfSol  = getTotalNfs(sol)
    const saldo       = getSaldo(sol)
    const hasSaldo    = temSaldo(sol)
    const badge       = STATUS_BADGE[sol.status] ?? { label: sol.status, color: '#64748B', bg: 'rgba(100,116,139,0.12)' }
    const isExpanded  = expandedSolId === sol.id
    const isExpandable = sol.status === 'aprovado' && hasSaldo

    const saldoColor = saldo > TOLERANCE ? '#10B981' : saldo < -TOLERANCE ? '#EF4444' : 'var(--text-3)'

    return (
      <div
        className="grid transition-colors cursor-pointer"
        style={{
          gridTemplateColumns,
          background: isExpanded ? 'rgba(6,182,212,0.04)' : undefined,
          borderBottom: '1px solid var(--border)',
          alignItems: 'stretch',
          minWidth: 'max-content',
        }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? 'rgba(6,182,212,0.04)' : '' }}
      >
        {/* Nº */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: nfsValidas.length > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)' }}>
            {nfsValidas.length > 0
              ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              : <Clock className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />}
          </div>
          <p className="font-bold text-xs font-mono break-all" style={{ color: 'var(--accent)' }}>
            FIP-{String(sol.numero).padStart(4, '0')}
          </p>
        </div>

        {/* Contrato */}
        <div className="flex items-center px-3 py-2.5 text-xs break-words" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
          {sol.contrato?.numero || '—'}
        </div>

        {/* Fornecedor */}
        <div className="px-3 py-2.5 text-xs break-words flex flex-col justify-center" style={{ color: 'var(--text-1)', borderRight: '1px solid var(--border)' }} title={sol.fornecedor_razao_social || ''}>
          <span className="font-medium">{sol.fornecedor_razao_social || '—'}</span>
          <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {sol.itens.length} item(ns)
          </span>
        </div>

        {/* CNPJ */}
        <div className="flex items-center px-3 py-2.5 text-xs font-mono break-all" style={{ color: 'var(--text-2)', borderRight: '1px solid var(--border)' }}>
          {sol.fornecedor_cnpj ? maskCnpj(sol.fornecedor_cnpj) : '—'}
        </div>

        {/* Data */}
        <div className="flex items-center px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
          {sol.data_solicitacao ? formatDate(sol.data_solicitacao) : '—'}
        </div>

        {/* Valor */}
        <div className="flex items-center justify-end px-3 py-2.5 text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--text-1)', borderRight: '1px solid var(--border)' }}>
          {formatCurrency(sol.valor_total || 0)}
        </div>

        {/* NFs Recebidas */}
        <div className="flex flex-col items-end justify-center px-3 py-2.5 text-xs tabular-nums" style={{ borderRight: '1px solid var(--border)' }}>
          <span style={{ color: nfsValidas.length > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>
            {formatCurrency(totalNfSol)}
          </span>
          <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            {nfsValidas.length} NF{nfsValidas.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Saldo */}
        <div className="flex items-center justify-end px-3 py-2.5 text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: saldoColor, borderRight: '1px solid var(--border)' }}>
          {formatCurrency(saldo)}
        </div>

        {/* Status */}
        <div className="flex items-center px-3 py-2.5" style={{ borderRight: '1px solid var(--border)' }}>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
        </div>

        {/* Observações */}
        <div
          className="px-3 py-2.5 text-xs whitespace-pre-wrap break-words"
          style={{
            color: sol.observacoes ? 'var(--text-2)' : 'var(--text-3)',
            borderRight: '1px solid var(--border)',
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
          title={sol.observacoes || ''}
        >
          {sol.observacoes || '—'}
        </div>

        {/* Ações */}
        <div className="flex items-center justify-center px-2 py-2.5">
          {isExpandable && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', border: '1px solid rgba(6,182,212,0.3)' }}>
              <Plus className="w-2.5 h-2.5" /> NF
            </span>
          )}
          {isExpandable
            ? (isExpanded
                ? <ChevronUp className="w-3.5 h-3.5 ml-1" style={{ color: '#06B6D4' }} />
                : <ChevronDown className="w-3.5 h-3.5 ml-1" style={{ color: 'var(--text-3)' }} />)
            : <ArrowRight className="w-3.5 h-3.5 ml-1" style={{ color: 'var(--text-3)' }} />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar title="NF — Faturamento Direto" subtitle="Registrar notas fiscais para solicitações aprovadas" />

      <div className="p-4 sm:p-6 space-y-5">
        {/* Banner: relatórios mensais pendentes de revisão */}
        {relatoriosMensaisPendentes.length > 0 && (
          <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.30)' }}>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
                <Receipt className="w-4 h-4" style={{ color: '#3B82F6' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  📋 {relatoriosMensaisPendentes.length} relatório(s) mensal(is) aguardando revisão
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
                  Relatórios de pedidos fat-direto com saldo pendente há &gt; 30 dias. Revise e envie pra FIP.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {relatoriosMensaisPendentes.map(r => (
                <button
                  key={r.id}
                  onClick={() => abrirRevisarRelatorioMensal(r.id)}
                  className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2"
                  style={{ background: 'var(--surface-1)', border: '1px solid rgba(59,130,246,0.40)', color: 'var(--text-1)' }}
                  title={`${r.qtd_pedidos} pedido(s) — ${r.sequencia_cobranca}ª cobrança`}
                >
                  <strong>{r.contrato.numero}</strong>
                  <span style={{ color: 'var(--text-3)' }}>· {r.qtd_pedidos} ped.</span>
                  <span style={{ color: '#3B82F6' }}>{formatCurrency(r.valor_total_atrasado)}</span>
                  {r.sequencia_cobranca > 1 && (
                    <span className="text-[10px] px-1.5 rounded" style={{ background: r.sequencia_cobranca >= 3 ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)', color: r.sequencia_cobranca >= 3 ? '#EF4444' : '#F59E0B' }}>
                      {r.sequencia_cobranca}ª cobrança
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'TOTAL SOLICITAÇÕES', value: String(totalSol),           color: '#3B82F6', icon: Package,      onClick: () => setFiltroStatus('todos') },
            { label: 'AGUARDANDO APROVAÇÃO', value: formatCurrency(totalAguardando), color: '#F59E0B', icon: Clock, onClick: () => setFiltroStatus('todos') },
            { label: 'TOTAL APROVADO',      value: formatCurrency(totalAprovado),    color: '#10B981', icon: CheckCircle2, onClick: () => setFiltroStatus('com_saldo') },
            { label: 'NFS RECEBIDAS',       value: formatCurrency(totalNFs),         color: '#06B6D4', icon: Receipt, onClick: () => setFiltroStatus('sem_saldo') },
          ].map((kpi, i) => (
            <button key={i} onClick={kpi.onClick}
              className="text-left rounded-2xl p-4 transition-all"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = kpi.color + '60' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{kpi.label}</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: kpi.color + '18', border: `1px solid ${kpi.color}30` }}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>Clique para ver detalhes →</p>
            </button>
          ))}
        </div>

        {/* Filtro pills */}
        <div className="flex gap-2">
          {([
            { id: 'todos',     label: 'Todas' },
            { id: 'com_saldo', label: 'Pedidos com Saldo' },
            { id: 'sem_saldo', label: 'Pedidos sem Saldo' },
          ] as const).map(f => (
            <button key={f.id} onClick={() => setFiltroStatus(f.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{
                background: filtroStatus === f.id ? '#06B6D4' : 'var(--surface-2)',
                color: filtroStatus === f.id ? '#fff' : 'var(--text-2)',
                border: `1px solid ${filtroStatus === f.id ? '#06B6D4' : 'var(--border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        <MaximizableCard title="Solicitações de Autorização" className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="sticky top-0 z-10" style={{ background: 'var(--surface-2)' }}>
            <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Solicitações de Autorização</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{filtradas.length} registro(s)</span>
                <button
                  onClick={() => exportCsv(
                    `nf-fat-direto-${new Date().toISOString().slice(0,10)}`,
                    filtradas,
                    [
                      { header: 'Número Pedido',     get: (s: any) => `FIP-${String(s.numero).padStart(4, '0')}` },
                      { header: 'Status',            get: (s: any) => STATUS_BADGE_RAW[s.status]?.label ?? s.status },
                      { header: 'Contrato',          get: (s: any) => s.contrato?.numero || '' },
                      { header: 'Fornecedor',        get: (s: any) => s.fornecedor_razao_social || '' },
                      { header: 'CNPJ',              get: (s: any) => s.fornecedor_cnpj || '' },
                      { header: 'Data Solicitação',  get: (s: any) => s.data_solicitacao ? formatDate(s.data_solicitacao) : '' },
                      { header: 'Data Aprovação',    get: (s: any) => s.data_aprovacao ? formatDate(s.data_aprovacao) : '' },
                      { header: 'Valor Total',       get: (s: any) => Number(s.valor_total || 0) },
                      { header: 'Valor NFs',         get: (s: any) => Number((s.notas_fiscais || []).reduce((a: number, n: any) => a + Number(n.valor || 0), 0)) },
                      { header: 'Saldo',             get: (s: any) => Number(s.valor_total || 0) - Number((s.notas_fiscais || []).reduce((a: number, n: any) => a + Number(n.valor || 0), 0)) },
                      { header: 'Qtde NFs',          get: (s: any) => (s.notas_fiscais || []).length },
                      { header: 'Solicitante',       get: (s: any) => s.solicitante?.nome || '' },
                    ],
                  )}
                  disabled={filtradas.length === 0}
                  title="Exportar CSV (compatível com Excel)"
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              </div>
            </div>
            <div
              className="flex items-center justify-between px-5 py-2 text-[11px]"
              style={{ background: 'var(--surface-3)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', color: 'var(--text-3)' }}
            >
              <span>Clique no cabeçalho para ordenar · Arraste a borda direita para redimensionar</span>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
                style={{ color: 'var(--text-2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                title="Volta larguras e ordenação ao padrão"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={2} /> Resetar layout
              </button>
            </div>
          </div>

          {/* Wrapper com overflow-x permite resize livre — sticky vertical preservado */}
          <div className="overflow-x-auto">
            {/* Header com sort + resize + filtros */}
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
              {tabelaColumns.map(col => {
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
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1 truncate"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }}
                      title={`Ordenar por ${COL_LABELS[col.key]}`}
                    >
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
                      onClick={e => e.stopPropagation()}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                      style={{ background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      title="Arraste para redimensionar"
                    />
                  </div>
                )
              })}
              <div className="px-2 py-2.5 text-center" title="Ações">·</div>
            </div>

          {loading ? (
            <div className="flex justify-center py-12" style={{ color: 'var(--text-3)' }}>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando...
            </div>
          ) : filtradasOrdenadas.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Nenhuma solicitação encontrada</p>
            </div>
          ) : filtradasOrdenadas.map(sol => {
            const saldo       = getSaldo(sol)
            const isExpandable = sol.status === 'aprovado' && temSaldo(sol)
            const isExpanded  = expandedSolId === sol.id
            const nfsValidas  = getNfsValidas(sol)
            const totalNfSol  = getTotalNfs(sol)

            // Saldo projetado após digitação do valor da nova NF
            const valorDigitado = parseFloat(nfForm.valor || '0') || 0
            const saldoApos = isExpanded ? saldo - valorDigitado : null

            // Alerta de vencimento
            const diasVenc = diasAte(nfForm.data_vencimento)
            const alertaVencimento = isExpanded && nfForm.data_vencimento && diasVenc < 16

            return (
              <div key={sol.id}>
                {isExpandable ? (
                  <div onClick={() => toggleExpand(sol)}><RowContent sol={sol} /></div>
                ) : (
                  <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}`}><RowContent sol={sol} /></Link>
                )}

                {/* Painel expandido */}
                {isExpanded && (
                  <div className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    <div className="px-5 py-4 space-y-4">

                      {/* Cards de saldo */}
                      <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[180px] p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#10B981' }}>Saldo Global do Pedido</p>
                          <p className="text-2xl font-black" style={{ color: '#10B981' }}>{formatCurrency(saldo)}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                            de {formatCurrency(sol.valor_total)} aprovado
                            {nfsValidas.length > 0 && ` · ${nfsValidas.length} NF(s) registrada(s)`}
                          </p>
                          {/* Saldo projetado */}
                          {valorDigitado > 0 && saldoApos !== null && (
                            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
                              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>Saldo após esta NF:</p>
                              <p className="text-base font-black" style={{ color: saldoApos >= 0 ? '#10B981' : '#EF4444' }}>
                                {saldoApos >= 0 ? '+' : ''}{formatCurrency(saldoApos)}
                                {Math.abs(saldoApos) <= TOLERANCE && (
                                  <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>(dentro da tolerância)</span>
                                )}
                              </p>
                            </div>
                          )}
                        </div>

                        {nfsValidas.length > 0 && (
                          <div className="flex-1 min-w-[180px] p-3 rounded-xl" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#06B6D4' }}>NFs Registradas</p>
                            <div className="space-y-1">
                              {nfsValidas.map(nf => (
                                <div key={nf.id} className="flex justify-between items-center text-xs gap-2">
                                  <span style={{ color: 'var(--text-2)' }} className="inline-flex items-center gap-1">
                                    NF {nf.numero_nf}
                                    {nf.divergencia_valor && (
                                      <span
                                        title={
                                          nf.override_excede_saldo
                                            ? `Divergência ${formatCurrency(Number(nf.divergencia_excedente || 0))} — aprovada com override`
                                            : `Divergência ${formatCurrency(Number(nf.divergencia_excedente || 0))} — dentro da tolerância`
                                        }
                                        className="inline-flex items-center px-1.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                        style={{
                                          background: nf.override_excede_saldo ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)',
                                          color: nf.override_excede_saldo ? '#EF4444' : '#F59E0B',
                                        }}
                                      >
                                        ⚠ Diverg.
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-bold" style={{ color: '#06B6D4' }}>{formatCurrency(nf.valor)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: 'rgba(6,182,212,0.2)' }}>
                                <span className="font-semibold" style={{ color: 'var(--text-2)' }}>Total NFs</span>
                                <span className="font-bold" style={{ color: '#06B6D4' }}>{formatCurrency(totalNfSol)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Alerta de vencimento */}
                      {alertaVencimento && (
                        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
                          <div className="text-xs" style={{ color: '#F59E0B' }}>
                            <p className="font-bold">Vencimento em {diasVenc <= 0 ? 'hoje/vencido' : `${diasVenc} dia(s)`} — solicite prorrogação do boleto!</p>
                            <p className="font-normal mt-0.5" style={{ color: 'var(--text-2)' }}>
                              Vencimentos com menos de 16 dias devem ter boleto prorrogado para evitar multa por atraso.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Formulário */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Nova Nota Fiscal</p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Linha 1 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Número NF *</label>
                            <input placeholder="Ex: 001234" value={nfForm.numero_nf}
                              onChange={e => setNfForm(p => ({ ...p, numero_nf: e.target.value }))}
                              className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data de Recebimento</label>
                            <input type="date" value={nfForm.data_recebimento}
                              onChange={e => setNfForm(p => ({ ...p, data_recebimento: e.target.value }))}
                              className={inputCls} />
                          </div>

                          {/* Linha 2 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>CNPJ Emitente</label>
                            <input placeholder="00.000.000/0000-00" value={nfForm.cnpj_emitente}
                              onChange={e => setNfForm(p => ({ ...p, cnpj_emitente: maskCnpj(e.target.value) }))}
                              className={inputCls} />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Valor (R$) *</label>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input type="checkbox" checked={nfForm.igual_ao_saldo}
                                  onChange={e => {
                                    const checked = e.target.checked
                                    setNfForm(p => ({ ...p, igual_ao_saldo: checked, valor: checked ? String(saldo.toFixed(2)) : p.valor }))
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-cyan-500" />
                                <span className="text-[10px]" style={{ color: '#06B6D4' }}>Igual ao saldo do pedido</span>
                              </label>
                            </div>
                            <input type="number" step="0.01" placeholder="0,00"
                              value={nfForm.valor}
                              readOnly={nfForm.igual_ao_saldo}
                              onChange={e => setNfForm(p => ({ ...p, valor: e.target.value }))}
                              className={inputCls + (nfForm.igual_ao_saldo ? ' opacity-70 cursor-not-allowed' : '')} />
                          </div>

                          {/* Linha 3 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data Emissão *</label>
                            <input type="date" value={nfForm.data_emissao}
                              onChange={e => setNfForm(p => ({ ...p, data_emissao: e.target.value }))}
                              className={inputCls} />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data do Vencimento</label>
                            <input type="date" value={nfForm.data_vencimento}
                              onChange={e => setNfForm(p => ({ ...p, data_vencimento: e.target.value }))}
                              className={inputCls + (alertaVencimento ? ' border-amber-500/60' : '')} />
                          </div>
                        </div>

                        {/* Upload da NF */}
                        <div className="mt-3">
                          <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Arquivo da NF (PDF / Imagem)</label>
                          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xml"
                            className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                          {nfFile ? (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                              style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.3)' }}>
                              <FileText className="w-4 h-4 flex-shrink-0" style={{ color: '#06B6D4' }} />
                              <span className="flex-1 truncate text-xs" style={{ color: 'var(--text-1)' }}>{nfFile.name}</span>
                              <button onClick={() => { setNfFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div
                              className="flex flex-col items-center justify-center gap-1 px-4 py-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
                              style={{
                                borderColor: dragOver ? '#06B6D4' : 'var(--border)',
                                background: dragOver ? 'rgba(6,182,212,0.06)' : 'transparent',
                              }}
                              onClick={() => fileInputRef.current?.click()}
                              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                              onDragLeave={() => setDragOver(false)}
                              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
                            >
                              <Upload className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
                              <p className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Clique ou arraste o arquivo aqui</p>
                              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>PDF, PNG, JPG, XML · máx. 50 MB</p>
                              <p className="text-[9px] font-semibold mt-0.5" style={{ color: '#10B981' }} title="O arquivo é enviado direto ao Supabase Storage via signed URL — bypassa o limite de 4.5MB do Vercel.">
                                ✓ Upload direto ativo
                              </p>
                            </div>
                          )}
                        </div>

                        {nfError && (
                          <div
                            className="mt-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span className="font-medium break-words">{nfError}</span>
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          <button onClick={() => handleRegistrarNf(sol)} disabled={savingNf}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            style={{ background: '#06B6D4', color: '#fff' }}>
                            {savingNf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                            {savingNf ? 'Registrando...' : 'Registrar NF'}
                          </button>
                          <button onClick={() => toggleExpand(sol)}
                            className="px-4 py-2 rounded-lg text-sm font-medium"
                            style={{ background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                            Cancelar
                          </button>
                          <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}`} className="ml-auto flex items-center gap-1 text-xs self-center"
                            style={{ color: 'var(--text-3)' }}>
                            Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          </div>{/* /overflow-x-auto */}

          {/* Footer com contagem + sort ativo */}
          {!loading && filtradasOrdenadas.length > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: 'var(--surface-3)', borderTop: '1px solid var(--border)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {filtradasOrdenadas.length} de {filtradasStatus.length} item(ns)
                {sortKey && sortDir && (
                  <> · ordenado por <strong>{COL_LABELS[sortKey]}</strong> ({sortDir === 'asc' ? '↑' : '↓'})</>
                )}
              </span>
            </div>
          )}
        </MaximizableCard>
      </div>

      {/* Modal: confirmar NF com data anterior à aprovação */}
      {confirmDataAnterior && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => !savingNf && setConfirmDataAnterior(null)}
        >
          <div
            className="rounded-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.30)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.06)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>NF emitida antes da aprovação</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Confirme se você quer continuar</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm" style={{ color: 'var(--text-2)' }}>
              <p>
                A data de emissão da NF (<strong>{formatDate(confirmDataAnterior.data_emissao)}</strong>) é
                anterior à aprovação do pedido (<strong>{formatDate(confirmDataAnterior.data_aprovacao)}</strong>).
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                Isso pode acontecer quando a NF foi emitida durante a negociação,
                antes da aprovação formal. Ao continuar, o registro fica auditado
                como override do aprovador.
              </p>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setConfirmDataAnterior(null)}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMesmoAssim}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#F59E0B' }}
              >
                {savingNf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                  : <>Confirmar mesmo assim</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar NF que excede a tolerância de saldo */}
      {confirmExcedeSaldo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => !savingNf && setConfirmExcedeSaldo(null)}
        >
          <div
            className="rounded-2xl max-w-md w-full overflow-hidden"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.30)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(239,68,68,0.06)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: '#EF4444' }} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>NF excede tolerância do contrato</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Confirme com motivo (auditado)</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm" style={{ color: 'var(--text-2)' }}>
              <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between text-xs"><span>Valor da NF</span><strong className="tabular-nums" style={{ color: 'var(--text-1)' }}>R$ {confirmExcedeSaldo.valor_nf.toFixed(2).replace('.', ',')}</strong></div>
                <div className="flex justify-between text-xs"><span>Saldo do pedido</span><strong className="tabular-nums">R$ {confirmExcedeSaldo.saldo.toFixed(2).replace('.', ',')}</strong></div>
                <div className="flex justify-between text-xs" style={{ color: '#EF4444' }}><span>Excedente</span><strong className="tabular-nums">R$ {confirmExcedeSaldo.excedente.toFixed(2).replace('.', ',')}</strong></div>
                <div className="flex justify-between text-xs"><span>Tolerância configurada</span><strong className="tabular-nums">R$ {confirmExcedeSaldo.tolerancia.toFixed(2).replace('.', ',')}</strong></div>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                A NF passa em <strong style={{ color: '#EF4444' }}>R$ {(confirmExcedeSaldo.excedente - confirmExcedeSaldo.tolerancia).toFixed(2).replace('.', ',')}</strong> além
                da tolerância do contrato. Pra registrar mesmo assim, descreva o motivo —
                fica auditado e visível em relatórios de divergência.
              </p>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
                  Motivo da divergência <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  value={motivoDivergencia}
                  onChange={e => setMotivoDivergencia(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ex.: ICMS-ST não considerado no orçamento; frete adicional negociado; ajuste de cotação."
                  className="w-full rounded-lg px-3 py-2 text-sm border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                />
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setConfirmExcedeSaldo(null)}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => abrirPreviewDivergencia('recusar')}
                disabled={savingNf || !motivoDivergencia.trim() || motivoDivergencia.trim().length < 5}
                title="Recusa a NF e gera email à FIP exigindo pagamento direto"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.40)' }}
              >
                ❌ Recusar e notificar FIP
              </button>
              <button
                type="button"
                onClick={() => abrirPreviewDivergencia('cobrir')}
                disabled={savingNf || !motivoDivergencia.trim() || motivoDivergencia.trim().length < 5}
                title="Aumenta o saldo do PRÓPRIO pedido em R$ excedente, criando item de ajuste. Requer saldo no item contratual."
                className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.40)' }}
              >
                🔁 Ajustar Saldo do Pedido
              </button>
              <button
                type="button"
                onClick={confirmarExcedeSaldo}
                disabled={savingNf || !motivoDivergencia.trim()}
                title="Aprova a NF com override puro (sem novo pedido). Use só pra divergências menores."
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: '#F59E0B' }}
              >
                {savingNf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                  : <>⚠ Aprovar com override</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: revisar relatório mensal */}
      {previewRelatorioMensal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.50)' }}
          onClick={() => !savingNf && setPreviewRelatorioMensal(null)}
        >
          <div
            className="rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: previewRelatorioMensal.sequencia >= 3 ? 'rgba(239,68,68,0.06)' : previewRelatorioMensal.sequencia === 2 ? 'rgba(245,158,11,0.06)' : 'rgba(59,130,246,0.06)' }}>
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  📋 Relatório mensal · Contrato {previewRelatorioMensal.contrato_numero}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {String(previewRelatorioMensal.mes).padStart(2, '0')}/{previewRelatorioMensal.ano} ·
                  {previewRelatorioMensal.qtd_pedidos} pedido(s) ·
                  Total {formatCurrency(previewRelatorioMensal.valor_total)} ·
                  <strong style={{ color: previewRelatorioMensal.sequencia >= 3 ? '#EF4444' : previewRelatorioMensal.sequencia === 2 ? '#F59E0B' : '#3B82F6' }}>
                    {' '}{previewRelatorioMensal.sequencia}ª cobrança
                  </strong>
                </p>
              </div>
              <button onClick={() => setPreviewRelatorioMensal(null)} disabled={savingNf} className="rounded-lg p-1 hover:bg-[var(--surface-2)]">
                <span className="text-lg" style={{ color: 'var(--text-2)' }}>×</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Assunto</p>
                <p className="text-sm" style={{ color: 'var(--text-1)' }}>{previewRelatorioMensal.preview.subject}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Corpo do email</p>
                <iframe
                  srcDoc={previewRelatorioMensal.preview.html}
                  className="w-full rounded-lg"
                  style={{ height: 420, border: '1px solid var(--border)', background: 'white' }}
                  sandbox=""
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Destinatários ({destinatariosRelatorio.size}/{previewRelatorioMensal.envolvidos.length})
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                  {previewRelatorioMensal.envolvidos.length === 0
                    ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nenhum envolvido neste contrato.</p>
                    : previewRelatorioMensal.envolvidos.map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[var(--surface-2)] p-1 rounded">
                        <input
                          type="checkbox"
                          checked={destinatariosRelatorio.has(u.id)}
                          onChange={e => {
                            const next = new Set(destinatariosRelatorio)
                            if (e.target.checked) next.add(u.id); else next.delete(u.id)
                            setDestinatariosRelatorio(next)
                          }}
                        />
                        <span style={{ color: 'var(--text-1)' }}>{u.nome}</span>
                        <span style={{ color: 'var(--text-3)' }}>· {u.email}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button
                onClick={() => executarAcaoRelatorio('descartar')}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Descartar
              </button>
              <button
                onClick={() => executarAcaoRelatorio('enviar')}
                disabled={savingNf || destinatariosRelatorio.size === 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: '#3B82F6' }}
              >
                {savingNf ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Enviando...</> : <>Revisar e enviar email</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner contextual: pedidos anteriores pendentes (15 dias) */}
      {alertaPedidosAtrasados && (
        <div
          className="fixed bottom-4 right-4 z-40 max-w-md rounded-2xl shadow-lg"
          style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.50)' }}
        >
          <div className="px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <div className="flex-1 text-sm">
              <p className="font-bold mb-0.5" style={{ color: 'var(--text-1)' }}>
                {alertaPedidosAtrasados.qtd} pedido(s) anterior(es) pendente(s)
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
                Detectamos pedidos aprovados antes deste sem NF lançada há mais de 15 dias.
                Pode notificar a FIP por email.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setAlertaPedidosAtrasados(null)}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  Dispensar
                </button>
                <button
                  onClick={abrirPreviewPedidosAtrasados}
                  disabled={savingNf}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
                  style={{ background: '#F59E0B' }}
                >
                  {savingNf ? 'Carregando...' : 'Notificar FIP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: preview email pedidos atrasados */}
      {previewPedidosAtrasados && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.50)' }}
          onClick={() => !savingNf && setPreviewPedidosAtrasados(null)}
        >
          <div
            className="rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.06)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  Notificar FIP — pedidos anteriores pendentes
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {previewPedidosAtrasados.pedidos_atrasados.length} pedido(s) sem NF há mais de {previewPedidosAtrasados.dias_alerta} dias
                </p>
              </div>
              <button onClick={() => setPreviewPedidosAtrasados(null)} disabled={savingNf} className="rounded-lg p-1 hover:bg-[var(--surface-2)]">
                <span className="text-lg" style={{ color: 'var(--text-2)' }}>×</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Assunto</p>
                <p className="text-sm" style={{ color: 'var(--text-1)' }}>{previewPedidosAtrasados.preview.subject}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Corpo do email</p>
                <iframe
                  srcDoc={previewPedidosAtrasados.preview.html}
                  className="w-full rounded-lg"
                  style={{ height: 380, border: '1px solid var(--border)', background: 'white' }}
                  sandbox=""
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Destinatários ({destinatariosAtraso.size}/{previewPedidosAtrasados.envolvidos.length})
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                  {previewPedidosAtrasados.envolvidos.length === 0
                    ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nenhum envolvido cadastrado neste contrato.</p>
                    : previewPedidosAtrasados.envolvidos.map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[var(--surface-2)] p-1 rounded">
                        <input
                          type="checkbox"
                          checked={destinatariosAtraso.has(u.id)}
                          onChange={e => {
                            const next = new Set(destinatariosAtraso)
                            if (e.target.checked) next.add(u.id); else next.delete(u.id)
                            setDestinatariosAtraso(next)
                          }}
                        />
                        <span style={{ color: 'var(--text-1)' }}>{u.nome}</span>
                        <span style={{ color: 'var(--text-3)' }}>· {u.email}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button onClick={() => setPreviewPedidosAtrasados(null)} disabled={savingNf} className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={confirmarEnviarPedidosAtrasados} disabled={savingNf} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60" style={{ background: '#F59E0B' }}>
                {savingNf ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Enviando...</> : <>Enviar email</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: preview de email de divergência (caminho B ou C) */}
      {previewDivergencia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.50)' }}
          onClick={() => !savingNf && setPreviewDivergencia(null)}
        >
          <div
            className="rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.30)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{
              borderBottom: '1px solid var(--border)',
              background: previewDivergencia.acao === 'cobrir' ? 'rgba(59,130,246,0.06)' : 'rgba(239,68,68,0.06)',
            }}>
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  {previewDivergencia.acao === 'cobrir'
                    ? '🔁 Ajustar saldo do pedido — revisar email'
                    : '❌ Recusa de NF — revisar email'}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  Excedente {formatCurrency(previewDivergencia.excedente)} ·
                  {previewDivergencia.acao === 'cobrir'
                    ? ` O saldo do pedido será aumentado em ${formatCurrency(previewDivergencia.excedente)} (item de ajuste registrado no histórico).`
                    : ' NF será marcada como rejeitada (tipo: divergência sem saldo)'}
                </p>
              </div>
              <button onClick={() => setPreviewDivergencia(null)} disabled={savingNf} className="rounded-lg p-1 hover:bg-[var(--surface-2)] disabled:opacity-50">
                <span className="text-lg" style={{ color: 'var(--text-2)' }}>×</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Assunto</p>
                <p className="text-sm" style={{ color: 'var(--text-1)' }}>{previewDivergencia.preview.subject}</p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Corpo do email</p>
                <iframe
                  srcDoc={previewDivergencia.preview.html}
                  className="w-full rounded-lg"
                  style={{ height: 380, border: '1px solid var(--border)', background: 'white' }}
                  sandbox=""
                />
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Destinatários ({destinatariosSelecionados.size}/{previewDivergencia.envolvidos.length} selecionados)
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                  {previewDivergencia.envolvidos.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nenhum envolvido cadastrado neste contrato.</p>
                  ) : previewDivergencia.envolvidos.map(u => (
                    <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[var(--surface-2)] p-1 rounded">
                      <input
                        type="checkbox"
                        checked={destinatariosSelecionados.has(u.id)}
                        onChange={e => {
                          const next = new Set(destinatariosSelecionados)
                          if (e.target.checked) next.add(u.id); else next.delete(u.id)
                          setDestinatariosSelecionados(next)
                        }}
                      />
                      <span style={{ color: 'var(--text-1)' }}>{u.nome}</span>
                      <span style={{ color: 'var(--text-3)' }}>· {u.email}</span>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>{u.perfil}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setPreviewDivergencia(null)}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEnviarDivergencia}
                disabled={savingNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white inline-flex items-center gap-1.5 disabled:opacity-60"
                style={{ background: previewDivergencia.acao === 'cobrir' ? '#3B82F6' : '#EF4444' }}
              >
                {savingNf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                  : <>{previewDivergencia.acao === 'cobrir' ? 'Confirmar e enviar' : 'Recusar e enviar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
