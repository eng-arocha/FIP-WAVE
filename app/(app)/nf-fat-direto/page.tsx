'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { normalizarNumeroNota } from '@/lib/informakon/conferir-notas'
import { Topbar } from '@/components/layout/topbar'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { ColumnFilter, passaFiltro } from '@/components/ui/column-filter'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportCsv } from '@/lib/utils/csv'
import {
  Receipt, Clock, CheckCircle2, Plus,
  ArrowRight, Package, Loader2, ChevronDown, ChevronUp,
  Upload, FileText, AlertTriangle, X, Download,
  ChevronsUpDown, RotateCcw, Trash2, Paperclip,
} from 'lucide-react'
import { useTableLayout, type ColumnDef } from '@/lib/hooks/use-table-layout'
import {
  TOLERANCE, STATUS_BADGE_RAW, maskCnpj, diasAte,
  getNfsValidas, getTotalNfs, getSaldo, temSaldo,
  type Solicitacao,
} from '@/components/nf-fat-direto/shared'
import { FilaAprovacaoNf } from '@/components/nf-fat-direto/fila-aprovacao-nf'
import {
  PedidosAtrasadosFlow,
  type AlertaPedidosAtrasados,
} from '@/components/nf-fat-direto/pedidos-atrasados-flow'

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
  /**
   * `?nf=546` — chegou clicando no número da nota no painel de conferência do
   * boletim. Sem isto, "a NF 546 não está no Informakon" obrigava a procurar
   * pedido por pedido nesta lista para achar a nota e corrigi-la.
   *
   * O casamento usa `normalizarNumeroNota`, a mesma normalização da
   * conferência — "000546", "546" e "NF-e 546" são a mesma nota.
   */
  // Lido de `window.location` e não de `useSearchParams`: o hook obriga a
  // envolver a página inteira num Suspense (bailout de CSR) e quebra o
  // prerender do build. Para um parâmetro opcional de deep-link não compensa.
  const [nfParam, setNfParam] = useState<string | null>(null)
  useEffect(() => {
    setNfParam(new URLSearchParams(window.location.search).get('nf'))
  }, [])
  const nfBuscada = normalizarNumeroNota(nfParam)
  const [buscaAtiva, setBuscaAtiva] = useState(true)
  const [expandedSolId, setExpandedSolId] = useState<string | null>(null)
  const [nfForm, setNfForm] = useState<NfForm>(EMPTY_FORM)
  const [nfFile, setNfFile] = useState<File | null>(null)
  const [savingNf, setSavingNf] = useState(false)
  const [nfError, setNfError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  // Cancelamento de NF lançada por engano (o "excluir" do produto).
  const [cancelandoNf, setCancelandoNf] = useState<{ nfId: string; solId: string; contratoId: string; numero: string } | null>(null)
  const [motivoCancelNf, setMotivoCancelNf] = useState('')
  const [salvandoCancelNf, setSalvandoCancelNf] = useState(false)
  const [erroCancelNf, setErroCancelNf] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch('/api/nf-fat-direto')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitacoes(data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  /**
   * Cancela a NF selecionada. Não apaga a linha — move pra 'cancelada', que
   * não reserva saldo, então o valor volta pro saldo do pedido na hora e o
   * lançamento continua auditável.
   */
  async function confirmarCancelamentoNf() {
    if (!cancelandoNf) return
    if (motivoCancelNf.trim().length < 3) {
      setErroCancelNf('Informe o motivo do cancelamento (mín. 3 caracteres).')
      return
    }
    setSalvandoCancelNf(true)
    setErroCancelNf('')
    try {
      const { contratoId, solId, nfId } = cancelandoNf
      const res = await fetch(
        `/api/contratos/${contratoId}/fat-direto/solicitacoes/${solId}/nfs/${nfId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: motivoCancelNf.trim() }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErroCancelNf(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setCancelandoNf(null)
      setMotivoCancelNf('')
      reload()
    } catch (e: any) {
      setErroCancelNf(e?.message || 'Erro de rede.')
    } finally {
      setSalvandoCancelNf(false)
    }
  }

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

  const buscandoNf = Boolean(nfBuscada) && buscaAtiva

  useEffect(() => {
    if (!nfBuscada || solicitacoes.length === 0) return
    const alvo = solicitacoes.find(s =>
      (s.notas_fiscais ?? []).some(n => normalizarNumeroNota(n.numero_nf) === nfBuscada))
    if (alvo) setExpandedSolId(alvo.id)
  }, [nfBuscada, solicitacoes])
  const temNfBuscada = (s: Solicitacao) =>
    (s.notas_fiscais ?? []).some(n => normalizarNumeroNota(n.numero_nf) === nfBuscada)

  const filtradasStatus = solicitacoes.filter(s => {
    // Buscando uma nota específica, o filtro de saldo não vale: a nota pode
    // estar num pedido já sem saldo, e escondê-la seria dizer que ela não
    // existe.
    if (buscandoNf) return temNfBuscada(s)
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

  // Alerta contextual de pedidos anteriores pendentes (pós-cadastro NF).
  // O fluxo de preview/envio vive em <PedidosAtrasadosFlow/>.
  const [alertaPedidosAtrasados, setAlertaPedidosAtrasados] = useState<AlertaPedidosAtrasados | null>(null)

  /**
   * Sobe arquivo direto pro Supabase Storage via signed URL.
   * Bypassa o limite de body do Vercel (~4.5MB) — funciona com PDFs de
   * qualquer tamanho até o limite do bucket (50MB).
   */
  async function uploadArquivoDireto(file: File, solId: string): Promise<string> {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
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
        {/* Chegou pelo número da nota, clicando no painel do boletim. */}
        {buscandoNf && (
          <div
            className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap text-xs"
            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.35)' }}
          >
            <span style={{ color: 'var(--text-2)' }}>
              Mostrando {filtradasStatus.length === 0 ? 'nenhum pedido' : `${filtradasStatus.length} pedido(s)`} com a{' '}
              <strong style={{ color: 'var(--text-1)' }}>NF {nfParam}</strong>.
              {filtradasStatus.length === 0 && ' Esta nota não está cadastrada aqui — se ela existe no Informakon, o pedido está faltando no site.'}
            </span>
            <button
              type="button"
              onClick={() => setBuscaAtiva(false)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium"
              style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
            >
              <X className="w-3 h-3" /> Ver todos
            </button>
          </div>
        )}

        {/* Fila: NFs aguardando aprovação (workflow 065) */}
        <FilaAprovacaoNf solicitacoes={solicitacoes} reload={reload} />

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
                                <div key={nf.id} className="flex justify-between items-start text-xs gap-2">
                                  <span style={{ color: 'var(--text-2)' }} className="inline-flex items-center gap-1 flex-wrap">
                                    NF {nf.numero_nf}
                                    {/* Arquivo enviado no lançamento — sem isso não havia
                                        como chegar no PDF/XML depois de registrar a NF. */}
                                    {nf.arquivo_url ? (
                                      <a
                                        href={nf.arquivo_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        title="Abrir arquivo da NF"
                                        className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-400 underline"
                                      >
                                        <Paperclip className="w-3 h-3" /> arquivo
                                      </a>
                                    ) : (
                                      <span title="Nenhum arquivo enviado no lançamento desta NF"
                                        style={{ color: 'var(--text-3)' }}>
                                        (sem arquivo)
                                      </span>
                                    )}
                                    {nf.status === 'aguardando_aprovacao' && (
                                      <span className="inline-flex items-center px-1.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                        style={{ background: 'rgba(245,158,11,0.18)', color: '#F59E0B' }}>
                                        aguardando
                                      </span>
                                    )}
                                    {nf.status === 'em_correcao' && (
                                      <span className="inline-flex items-center px-1.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                        style={{ background: 'rgba(239,68,68,0.18)', color: '#EF4444' }}>
                                        em correção
                                      </span>
                                    )}
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
                                  <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                                    <span className="font-bold" style={{ color: '#06B6D4' }}>{formatCurrency(nf.valor)}</span>
                                    <button
                                      onClick={e => {
                                        e.stopPropagation()
                                        setCancelandoNf({
                                          nfId: nf.id, solId: sol.id,
                                          contratoId: sol.contrato_id, numero: nf.numero_nf,
                                        })
                                        setMotivoCancelNf('')
                                        setErroCancelNf('')
                                      }}
                                      title="Cancelar esta NF (devolve o valor ao saldo do pedido)"
                                      className="p-0.5 rounded hover:bg-red-500/15"
                                      style={{ color: '#EF4444' }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </span>
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

      {/* Pedidos anteriores pendentes (banner contextual + preview de email) */}
      <PedidosAtrasadosFlow
        alerta={alertaPedidosAtrasados}
        onDismiss={() => setAlertaPedidosAtrasados(null)}
      />

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

      {/* Modal — cancelar NF lançada por engano */}
      {cancelandoNf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                Cancelar NF {cancelandoNf.numero}
              </h3>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                O valor volta para o saldo do pedido imediatamente. A NF não é apagada:
                fica registrada como <strong>cancelada</strong>, para manter a trilha de
                auditoria do lançamento. Se ela já foi aprovada, o cancelamento também
                desfaz esse efeito no saldo.
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>
                  Motivo do cancelamento *
                </label>
                <textarea
                  value={motivoCancelNf}
                  onChange={e => setMotivoCancelNf(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ex.: NF lançada em duplicidade; arquivo enviado era de outro pedido."
                  className="w-full rounded-lg px-3 py-2 text-sm border bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                />
              </div>

              {erroCancelNf && (
                <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2"
                  style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{erroCancelNf}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => { setCancelandoNf(null); setMotivoCancelNf(''); setErroCancelNf('') }}
                disabled={salvandoCancelNf}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarCancelamentoNf}
                disabled={salvandoCancelNf || motivoCancelNf.trim().length < 3}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: '#EF4444' }}
              >
                {salvandoCancelNf
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelando...</>
                  : <><Trash2 className="w-3.5 h-3.5" /> Cancelar NF</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
