'use client'

import { use, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft, Plus, FileText, Loader2, Pencil,
  ChevronRight, ChevronDown, Layers, Filter, Package, TrendingUp,
  DollarSign, Wallet, ClipboardList, Search, X, Maximize2,
  Download, Upload, Ban, FileSpreadsheet,
} from 'lucide-react'
import { DashboardTree, VisaoGeralToolbar } from '@/components/contratos/visao-geral'
import { EditarContratoModal } from '@/components/contratos/editar-contrato-modal'
import { EditableOrcamentoCell, parseBRLToNumber, type EditableCellCoordinator } from '@/components/contratos/editable-orcamento-cell'
import {
  formatCurrency, formatPercent, formatDate,
  getContratoStatusColor, getMedicaoStatusColor
} from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, CONTRATO_TIPO_LABELS, MEDICAO_STATUS_LABELS, MedicaoStatus, ContratoTipo } from '@/types'

interface Contrato {
  id: string
  numero: string
  descricao: string
  escopo: string
  objeto: string
  contratante: { nome: string; cnpj: string }
  contratado: { nome: string; cnpj: string }
  tipo: string
  status: string
  valor_total?: number
  valor_contratado?: number
  valor_servicos?: number
  valor_material_direto?: number
  data_inicio: string
  data_fim: string
  local_obra: string
  fiscal_obra: string
  email_fiscal: string
  valor_medido?: number
  saldo?: number
  percentual_medido?: number
  qtd_medicoes_aprovadas?: number
  qtd_medicoes_pendentes?: number
}

interface Detalhamento {
  id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_contratada: number
  valor_unitario: number
  valor_total: number
  valor_material_unit?: number
  valor_servico_unit?: number
  subtotal_material?: number
  subtotal_mo?: number
  local?: string
  disciplina?: string
}

interface Tarefa {
  id: string
  codigo: string
  nome: string
  valor_contratado: number
  valor_total?: number
  valor_material?: number
  valor_servico?: number
  disciplina?: string
  detalhamentos?: Detalhamento[]
}

interface Grupo {
  id: string
  codigo: string
  nome: string
  tipo_medicao: string
  valor_contratado: number
  valor_material: number
  valor_servico: number
  valor_medido: number
  valor_saldo?: number
  percentual_medido?: number
  tarefas?: Tarefa[]
}

interface Medicao {
  id: string
  numero: number
  periodo_referencia: string
  tipo: string
  status: string
  valor_total: number
  solicitante_nome: string
  data_submissao?: string
  data_aprovacao?: string
}

interface Aditivo {
  id: string
}

export default function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [activeTab, setActiveTab] = useState('visao-geral')
  const [showMedidoResumo, setShowMedidoResumo] = useState(false)
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [aditivos, setAditivos] = useState<Aditivo[]>([])
  const [fullscreenChart, setFullscreenChart] = useState<'bar' | null>(null)
  const [qtdEncerramentos, setQtdEncerramentos] = useState(0)

  // === Filtros do dashboard sincronizados com a URL ===
  // Querystring: ?grupo=<id>&tarefa=<id>&det=<id>&modo=total|material|servico&sort=...
  const filtroGrupo = searchParams.get('grupo') ?? 'todos'
  const viewMode = (searchParams.get('modo') ?? 'total') as 'total' | 'material' | 'servico'
  const sortBy = (searchParams.get('sort') ?? 'padrao') as
    | 'padrao' | 'valor_global_desc' | 'valor_global_asc'
    | 'valor_medido_desc' | 'valor_medido_asc'
    | 'saldo_desc' | 'saldo_asc'

  // Helper: atualiza um (ou mais) parâmetros de URL sem recarregar a página
  const setFiltros = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '' || val === 'todos' || val === 'padrao' || val === 'total') {
        next.delete(key)
      } else {
        next.set(key, val)
      }
    }
    // Ao mudar modo ou scope, limpa o estado de expansão da DashboardTree
    if ('modo' in updates || 'scope' in updates) {
      next.delete('expand')
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  // Estrutura detalhada state
  const [estruturaBusca, setEstruturaBusca] = useState('')
  const [estruturaNivel, setEstruturaNivel] = useState<'todos' | '1' | '2' | '3'>('todos')
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set())
  const [expandedTarefas, setExpandedTarefas] = useState<Set<string>>(new Set())
  type Metric = { servico_medido: number; fat_aprovados: number; nfs_lancadas: number; saldo_material: number; saldo_servico: number }
  const [metrics, setMetrics] = useState<{ detalhamentos: Record<string, Metric>; tarefas: Record<string, Metric>; grupos: Record<string, Metric> }>({ detalhamentos: {}, tarefas: {}, grupos: {} })
  // Modo edição do orçamento (PR Mat / PR MO)
  const [editOrcamento, setEditOrcamento] = useState(false)
  const [savingBulk, setSavingBulk] = useState(false)
  const [lastSavedMsg, setLastSavedMsg] = useState<string | null>(null)
  // Modal editar contrato
  const [showEditar, setShowEditar] = useState(false)
  const [contratante, setContratante] = useState<any>(null)
  const [contratado, setContratado] = useState<any>(null)

  // Carrega empresas contratante/contratado quando o modal abre
  useEffect(() => {
    if (!showEditar || !contrato) return
    const contratanteId = (contrato as any).contratante_id
    const contratadoId  = (contrato as any).contratado_id
    if (contratanteId) {
      fetch(`/api/empresas/${contratanteId}`).then(r => r.json()).then(setContratante).catch(() => setContratante(null))
    }
    if (contratadoId) {
      fetch(`/api/empresas/${contratadoId}`).then(r => r.json()).then(setContratado).catch(() => setContratado(null))
    }
  }, [showEditar, contrato])

  function toggleGrupo(id: string) {
    setExpandedGrupos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleTarefa(id: string) {
    setExpandedTarefas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function expandAll() {
    setExpandedGrupos(new Set(grupos.map(g => g.id)))
    setExpandedTarefas(new Set(grupos.flatMap(g => (g.tarefas || []).map(t => t.id))))
  }
  function collapseAll() { setExpandedGrupos(new Set()); setExpandedTarefas(new Set()) }


  useEffect(() => {
    async function loadContrato() {
      try {
        const res = await fetch(`/api/contratos/${id}`)
        if (res.ok) {
          const data = await res.json()
          setContrato(data)
        }
      } finally {
        setLoading(false)
      }
    }
    loadContrato()
  }, [id])

  useEffect(() => {
    async function loadGrupos() {
      const res = await fetch(`/api/contratos/${id}/grupos`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setGrupos(data)
      }
    }
    loadGrupos()
  }, [id])

  useEffect(() => {
    async function loadMedicoes() {
      const res = await fetch(`/api/contratos/${id}/medicoes`)
      if (res.ok) {
        const data = await res.json()
        setMedicoes(data)
      }
    }
    loadMedicoes()
  }, [id])

  useEffect(() => {
    async function loadMetrics() {
      const res = await fetch(`/api/contratos/${id}/estrutura-metrics`)
      if (res.ok) setMetrics(await res.json())
    }
    loadMetrics()
  }, [id])

  useEffect(() => {
    async function loadAditivos() {
      const res = await fetch(`/api/contratos/${id}/aditivos`)
      if (res.ok) {
        const data = await res.json()
        setAditivos(data)
      }
    }
    loadAditivos()
  }, [id])

  // Solicitações de encerramento de saldo pendentes (Fornecedor → Aprovador).
  // Usado pra mostrar o badge no botão "Encerramentos" do cabeçalho.
  useEffect(() => {
    async function loadEncerramentos() {
      try {
        const res = await fetch(`/api/contratos/${id}/encerramento-saldo`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data?.items ?? data?.data ?? [])
        setQtdEncerramentos(Array.isArray(list) ? list.length : 0)
      } catch {
        // silencioso — badge só não aparece
      }
    }
    loadEncerramentos()
  }, [id])

  // Bloco de métricas financeiras (linha horizontal, ocupando a largura cheia)
  function MetricasBloco({ m, align = 'right' }: { m: Metric | undefined; align?: 'right' | 'left' }) {
    const d = m || { servico_medido: 0, fat_aprovados: 0, nfs_lancadas: 0, saldo_material: 0, saldo_servico: 0 }
    const justify = align === 'right' ? 'justify-end' : 'justify-start'
    const sep = <span className="opacity-30" aria-hidden>·</span>
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-tight ${justify}`} style={{ color: 'var(--text-3)' }}>
        <span className="inline-flex items-center gap-1"><span>Serv. Medido:</span><span className="font-semibold text-emerald-500 tabular-nums">{formatCurrency(d.servico_medido)}</span></span>
        {sep}
        <span className="inline-flex items-center gap-1"><span>Fat. Aprovados:</span><span className="font-semibold text-blue-400 tabular-nums">{formatCurrency(d.fat_aprovados)}</span></span>
        {sep}
        <span className="inline-flex items-center gap-1"><span>NFs Lançadas:</span><span className="font-semibold text-amber-400 tabular-nums">{formatCurrency(d.nfs_lancadas)}</span></span>
        {sep}
        <span className="inline-flex items-center gap-1"><span>Saldo Material:</span><span className="font-semibold tabular-nums" style={{ color: d.saldo_material < 0 ? '#EF4444' : 'var(--text-2)' }}>{formatCurrency(d.saldo_material)}</span></span>
        {sep}
        <span className="inline-flex items-center gap-1"><span>Saldo Serviço:</span><span className="font-semibold tabular-nums" style={{ color: d.saldo_servico < 0 ? '#EF4444' : 'var(--text-2)' }}>{formatCurrency(d.saldo_servico)}</span></span>
      </div>
    )
  }

  // === Coordenador de células editáveis (estilo Excel) ===
  const cellsRef = useRef<Map<string, { el: HTMLInputElement; rowIdx: number; colIdx: number; detId: string; field: 'mat' | 'mo' }>>(new Map())
  const cellOrderRef = useRef<string[]>([])

  function rebuildOrder() {
    const arr = Array.from(cellsRef.current.entries())
    arr.sort(([, a], [, b]) => a.rowIdx - b.rowIdx || a.colIdx - b.colIdx)
    cellOrderRef.current = arr.map(([k]) => k)
  }

  // Atualiza um detalhamento local (optimistic) dentro de grupos -> tarefas -> detalhamentos
  function patchDetLocal(detId: string, patch: Partial<Detalhamento>) {
    setGrupos(prev => prev.map(g => ({
      ...g,
      tarefas: (g.tarefas || []).map(t => ({
        ...t,
        detalhamentos: (t.detalhamentos || []).map(d => d.id === detId ? { ...d, ...patch } : d),
      })),
    })))
  }

  async function commitOne(detId: string, field: 'mat' | 'mo', value: number) {
    // Optimistic
    const patch = field === 'mat'
      ? { valor_material_unit: value, subtotal_material: value * (findDet(detId)?.quantidade_contratada || 0) }
      : { valor_servico_unit:  value, subtotal_mo: value * (findDet(detId)?.quantidade_contratada || 0) }
    patchDetLocal(detId, patch as any)
    try {
      const res = await fetch(`/api/contratos/${id}/detalhamentos/${detId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(field === 'mat' ? { valor_material_unit: value } : { valor_servico_unit: value }),
      })
      if (!res.ok) throw new Error('falha ao salvar')
      setLastSavedMsg(`Salvo ${new Date().toLocaleTimeString('pt-BR')}`)
    } catch (e) {
      setLastSavedMsg('⚠ erro ao salvar — recarregue a página')
    }
  }

  function findDet(detId: string): Detalhamento | undefined {
    for (const g of grupos) for (const t of g.tarefas || []) for (const d of t.detalhamentos || []) if (d.id === detId) return d
    return undefined
  }

  async function commitBulk(updates: Array<{ detalhamento_id: string; valor_material_unit?: number; valor_servico_unit?: number }>) {
    // Optimistic
    for (const u of updates) {
      const qtd = findDet(u.detalhamento_id)?.quantidade_contratada || 0
      const patch: any = {}
      if (u.valor_material_unit !== undefined) { patch.valor_material_unit = u.valor_material_unit; patch.subtotal_material = u.valor_material_unit * qtd }
      if (u.valor_servico_unit  !== undefined) { patch.valor_servico_unit  = u.valor_servico_unit;  patch.subtotal_mo = u.valor_servico_unit * qtd }
      patchDetLocal(u.detalhamento_id, patch)
    }
    setSavingBulk(true)
    try {
      const res = await fetch(`/api/contratos/${id}/detalhamentos/bulk`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'erro')
      setLastSavedMsg(`${json.atualizados}/${json.total} atualizados às ${new Date().toLocaleTimeString('pt-BR')}`)
    } catch (e: any) {
      setLastSavedMsg('⚠ erro no paste em massa — recarregue')
    } finally {
      setSavingBulk(false)
    }
  }

  const coord: EditableCellCoordinator = {
    editMode: editOrcamento,
    register(key, meta, el) {
      cellsRef.current.set(key, { el, ...meta })
      rebuildOrder()
    },
    unregister(key) {
      cellsRef.current.delete(key)
      rebuildOrder()
    },
    focusNext(key, dir) {
      const order = cellOrderRef.current
      const i = order.indexOf(key)
      if (i === -1) return
      let target = i
      const cur = cellsRef.current.get(key)
      if (!cur) return
      if (dir === 'next')  target = Math.min(i + 1, order.length - 1)
      else if (dir === 'prev')  target = Math.max(i - 1, 0)
      else if (dir === 'right') {
        // procura próxima célula na mesma linha
        const next = order.slice(i + 1).find(k => cellsRef.current.get(k)?.rowIdx === cur.rowIdx)
        if (next) target = order.indexOf(next)
      }
      else if (dir === 'left') {
        const prev = [...order.slice(0, i)].reverse().find(k => cellsRef.current.get(k)?.rowIdx === cur.rowIdx)
        if (prev) target = order.indexOf(prev)
      }
      else if (dir === 'down') {
        const below = order.slice(i + 1).find(k => {
          const m = cellsRef.current.get(k); return m && m.colIdx === cur.colIdx && m.rowIdx > cur.rowIdx
        })
        if (below) target = order.indexOf(below)
      }
      else if (dir === 'up') {
        const above = [...order.slice(0, i)].reverse().find(k => {
          const m = cellsRef.current.get(k); return m && m.colIdx === cur.colIdx && m.rowIdx < cur.rowIdx
        })
        if (above) target = order.indexOf(above)
      }
      const targetKey = order[target]
      cellsRef.current.get(targetKey)?.el.focus()
    },
    onPasteMatrix(anchorKey, rows) {
      const order = cellOrderRef.current
      const i = order.indexOf(anchorKey)
      const anchor = cellsRef.current.get(anchorKey)
      if (i === -1 || !anchor) return
      // Deriva linhas da malha a partir do anchor (célula focada)
      const updatesById: Record<string, { detalhamento_id: string; valor_material_unit?: number; valor_servico_unit?: number }> = {}
      for (let r = 0; r < rows.length; r++) {
        // Encontra o k-ésimo registro com colIdx igual ao anchor + offset
        // Simples: percorre linha a linha do rowIdx de anchor em diante
        const rowTargetIdx = anchor.rowIdx + r
        const cols = rows[r]
        for (let c = 0; c < cols.length; c++) {
          const colTargetIdx = anchor.colIdx + c
          const key = order.find(k => {
            const m = cellsRef.current.get(k)
            return m && m.rowIdx === rowTargetIdx && m.colIdx === colTargetIdx
          })
          if (!key) continue
          const meta = cellsRef.current.get(key)!
          const n = parseBRLToNumber(cols[c])
          if (!updatesById[meta.detId]) updatesById[meta.detId] = { detalhamento_id: meta.detId }
          if (meta.field === 'mat') updatesById[meta.detId].valor_material_unit = n
          else updatesById[meta.detId].valor_servico_unit = n
        }
      }
      const updates = Object.values(updatesById)
      if (updates.length > 0) commitBulk(updates)
    },
    onCommit: commitOne,
  }

  // Comparação natural de código "1.1.10" vs "1.1.2"
  function cmpCodigo(a: string, b: string): number {
    const pa = String(a).split('.').map(n => Number(n) || 0)
    const pb = String(b).split('.').map(n => Number(n) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] ?? 0, nb = pb[i] ?? 0
      if (na !== nb) return na - nb
    }
    return 0
  }

  const TIPO_MEDICAO_COLORS: Record<string, string> = {
    servico: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
    faturamento_direto: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    misto: 'bg-teal-900/30 text-teal-400 border-teal-800/50',
  }
  const TIPO_MEDICAO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Material',
    misto: 'Total',
  }

  // === Helpers para a aba Estrutura / Orçamento (mantém usar `grupos` cru) ===
  // valor "contratado" segundo modo — versão pra Grupo[]
  const getValorView = (g: Grupo) =>
    viewMode === 'material' ? (g.valor_material ?? 0)
    : viewMode === 'servico' ? (g.valor_servico ?? 0)
    : g.valor_contratado

  // Lista ordenada por código, alimenta o dropdown e seções não-dashboard
  const gruposOrdenados = useMemo(
    () => [...grupos].sort((a, b) => cmpCodigo(a.codigo, b.codigo)),
    [grupos],
  )

  // gruposExibidos antigos — usados em outras seções da página (orçamento)
  const gruposExibidos = useMemo(() => {
    const list = filtroGrupo === 'todos' ? [...grupos] : grupos.filter(g => g.id === filtroGrupo)
    list.sort((a, b) => {
      const va = getValorView(a)
      const vb = getValorView(b)
      switch (sortBy) {
        case 'padrao': return cmpCodigo(a.codigo, b.codigo)
        case 'valor_global_desc': return vb - va
        case 'valor_global_asc': return va - vb
        case 'valor_medido_desc': return (b.valor_medido ?? 0) - (a.valor_medido ?? 0)
        case 'valor_medido_asc': return (a.valor_medido ?? 0) - (b.valor_medido ?? 0)
        case 'saldo_desc': return (vb - (b.valor_medido ?? 0)) - (va - (a.valor_medido ?? 0))
        case 'saldo_asc': return (va - (a.valor_medido ?? 0)) - (vb - (b.valor_medido ?? 0))
        default: return cmpCodigo(a.codigo, b.codigo)
      }
    })
    return list
  }, [grupos, sortBy, viewMode, filtroGrupo])

  // Color map antigo (Grupo[]) — mantido para outras seções da página.
  // Tem que ficar AQUI antes dos early returns abaixo: hooks chamados depois
  // de um `return` condicional violam a regra dos hooks (React #310).

  if (loading) {
    return (
      <div className="flex-1">
        <Topbar title="Carregando..." subtitle="" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="flex-1">
        <Topbar title="Contrato não encontrado" subtitle="" />
        <div className="p-3 sm:p-6">
          <Link href="/contratos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const valorTotal = contrato.valor_total || contrato.valor_contratado || 0
  const valorMedido = contrato.valor_medido ?? 0
  const saldo = contrato.saldo ?? 0
  const percentualMedido = contrato.percentual_medido ?? 0
  const qtdAprovadas = contrato.qtd_medicoes_aprovadas ?? 0
  const qtdPendentes = contrato.qtd_medicoes_pendentes ?? 0

  return (
    <div className="flex-1">
      <Topbar
        title={
          <span className="flex items-center gap-2">
            {contrato.numero}
            <Badge className={getContratoStatusColor(contrato.status as any)}>
              {CONTRATO_STATUS_LABELS[contrato.status as keyof typeof CONTRATO_STATUS_LABELS]}
            </Badge>
          </span>
        }
        subtitle={contrato.descricao}
        actions={
          <div className="flex gap-1 sm:gap-2 flex-wrap">
            <Link href="/contratos">
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#475569', color: '#f1f5f9' }}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Contratos</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/cronograma`}>
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#b45309', color: '#fef3c7' }}>
                <span className="hidden sm:inline">Cronograma</span>
                <span className="sm:hidden text-xs">Cron.</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#0f766e', color: '#ccfbf1' }}>
                <span className="hidden sm:inline">Fat. Direto</span>
                <span className="sm:hidden text-xs">Fat.</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/informakon`}>
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#4d7c0f', color: '#ecfccb' }}>
                <FileSpreadsheet className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Informakon</span>
                <span className="sm:hidden text-xs">Inf.</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/encerramentos`}>
              <Button variant="ghost" size="sm" className="relative px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#9a3412', color: '#ffedd5' }}>
                <Ban className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Encerramentos</span>
                <span className="sm:hidden text-xs">Encerr.</span>
                {qtdEncerramentos > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold animate-pulse"
                    style={{ background: '#f59e0b', color: '#1c1917' }}
                  >
                    {qtdEncerramentos}
                  </span>
                )}
              </Button>
            </Link>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3 font-semibold hover:brightness-110" style={{ background: '#1d4ed8', color: '#eff6ff' }}>
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Med. Serviços</span>
                <span className="sm:hidden text-xs">Med.</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEditar(true)}
              className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110"
              style={{ background: '#6d28d9', color: '#ede9fe' }}
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden sm:inline ml-1">Editar</span>
            </Button>
          </div>
        }
      />

      {/* ── Sticky KPI bar ── */}
      <div className="sticky top-14 z-10 px-3 sm:px-6 py-3 border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* KPI: Valor Total → abre Estrutura */}
          <div onClick={() => setActiveTab('estrutura')} className="cursor-pointer">
            <Card className="group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Valor Total</p>
                  <div className="w-9 h-9 rounded-xl kpi-icon-blue flex items-center justify-center transition-all" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                    <DollarSign className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(valorTotal)}</p>
                <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <span>Serv: {formatCurrency(contrato.valor_servicos ?? 0)}</span>
                  <span>Mat: {formatCurrency(contrato.valor_material_direto ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Medido → abre resumo Fat Direto + Medições */}
          <div onClick={() => setShowMedidoResumo(true)} className="cursor-pointer">
            <Card className="group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medido</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <TrendingUp className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(valorMedido)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(percentualMedido, 100)}%`, background: 'linear-gradient(90deg, #059669, #10B981)', boxShadow: percentualMedido > 0 ? '0 0 6px rgba(16,185,129,0.4)' : 'none' }}
                    />
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--green)' }}>{formatPercent(percentualMedido)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Saldo — sem link */}
          <div>
            <Card className="transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Saldo</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                    <Wallet className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--text-2)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(saldo)}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{formatPercent(100 - percentualMedido)} restante do contrato</p>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Medições → Aprovações */}
          <Link href="/aprovacoes">
            <Card className="cursor-pointer group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medições</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: qtdPendentes > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(6,182,212,0.10)', border: `1px solid ${qtdPendentes > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(6,182,212,0.20)'}` }}>
                    <ClipboardList className="w-4 h-4" strokeWidth={1.5} style={{ color: qtdPendentes > 0 ? 'var(--amber)' : '#06B6D4' }} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{qtdAprovadas}</p>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>aprovadas</p>
                </div>
                {qtdPendentes > 0
                  ? <p className="text-xs mt-1 font-semibold flex items-center gap-1" style={{ color: 'var(--amber)' }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--amber)' }} />
                      {qtdPendentes} aguardando aprovação
                    </p>
                  : <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>nenhuma pendente</p>
                }
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Tabs */}
        {/* Resumo Medido - popup */}
        {showMedidoResumo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowMedidoResumo(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md mx-4 rounded-2xl p-6 space-y-4"
              style={{ background: '#FFFFFF', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Resumo do Faturamento</h3>
                <button onClick={() => setShowMedidoResumo(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#F5F5F7', color: '#86868B' }}>
                  <span className="text-sm font-bold">x</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-xl" style={{ background: '#F5F5F7' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#86868B' }}>Total Medido</p>
                  <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(valorMedido)}</p>
                  <p className="text-xs mt-1" style={{ color: '#86868B' }}>{formatPercent(percentualMedido)} do contrato</p>
                </div>

                <Link href={`/contratos/${id}/medicoes`} onClick={() => setShowMedidoResumo(false)}>
                  <div className="p-4 rounded-xl cursor-pointer transition-all" style={{ border: '1px solid rgba(0,0,0,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Medições de Serviço</p>
                        <p className="text-xs mt-0.5" style={{ color: '#86868B' }}>{medicoes.length} medição(ões) registrada(s)</p>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#86868B' }} />
                    </div>
                  </div>
                </Link>

                <Link href={`/contratos/${id}/fat-direto`} onClick={() => setShowMedidoResumo(false)}>
                  <div className="p-4 rounded-xl cursor-pointer transition-all" style={{ border: '1px solid rgba(0,0,0,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Faturamento Direto</p>
                        <p className="text-xs mt-0.5" style={{ color: '#86868B' }}>Material direto autorizado</p>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#86868B' }} />
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {fullscreenChart === 'bar' && (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--background)' }}>
            <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-4">
                <h2 className="text-base font-bold uppercase tracking-wide" style={{ color: 'var(--text-1)' }}>
                  Visão Geral — Tela Cheia
                </h2>
                <div className="flex gap-2">
                  {(['total', 'material', 'servico'] as const).map(m => (
                    <button key={m} onClick={() => setFiltros({ modo: m })}
                      className="text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                      style={{
                        background: viewMode === m ? 'var(--accent)' : 'var(--surface-2)',
                        color: viewMode === m ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${viewMode === m ? 'var(--accent)' : 'var(--border)'}`,
                      }}>
                      {m === 'total' ? 'Total' : m === 'material' ? 'Material' : 'Serviço'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setFullscreenChart(null)} className="p-2 rounded-lg hover:bg-[var(--surface-2)]">
                <X className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <DashboardTree contratoId={id} modo={viewMode} />
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="dados">Dados do Contrato</TabsTrigger>
            <TabsTrigger value="medicoes">Medições</TabsTrigger>
            <Link
              href={`/contratos/${id}/fat-direto`}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]"
            >
              FAT. DIRETO
            </Link>
            <Link
              href={`/contratos/${id}/cronograma`}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]"
            >
              CRONOGRAMA
            </Link>
            <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
            <TabsTrigger value="aditivos">Aditivos {aditivos.length > 0 && `(${aditivos.length})`}</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>Visão Geral</h3>
                  <div className="flex items-center gap-2">
                    <Select value={viewMode} onValueChange={v => setFiltros({ modo: v })}>
                      <SelectTrigger className="h-7 text-xs w-[110px] bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">Total</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                        <SelectItem value="servico">Serviço</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setFullscreenChart('bar')}
                      className="p-1 rounded hover:bg-[var(--surface-3)]"
                      title="Tela cheia"
                      data-no-maximize
                    >
                      <Maximize2 className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent data-no-maximize>
                <VisaoGeralToolbar contratoId={id} modo={viewMode} contratoNome={contrato.numero || contrato.descricao || 'Contrato'} />
                <DashboardTree contratoId={id} modo={viewMode} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Medições */}
          <TabsContent value="medicoes">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-[var(--text-2)]">{medicoes.length} medição(ões) registrada(s)</p>
              <Link href={`/contratos/${id}/medicoes/nova`}>
                <Button size="sm">
                  <Plus className="w-4 h-4" />
                  Nova Medição
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {medicoes.map(m => (
                <Link key={m.id} href={`/contratos/${id}/medicoes/${m.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-blue-400/60 font-medium">MED</span>
                          <span className="text-base font-bold text-blue-400 leading-tight">#{String(m.numero).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-[var(--text-1)]">Medição {m.periodo_referencia}</span>
                            <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                            </Badge>
                            <Badge className={TIPO_MEDICAO_COLORS[m.tipo]}>
                              {TIPO_MEDICAO_LABELS[m.tipo]}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--text-3)]">Solicitante: {m.solicitante_nome}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-[var(--text-1)]">{formatCurrency(m.valor_total)}</p>
                          <p className="text-xs text-[var(--text-3)] mt-0.5">
                            {m.status === 'aprovado' && m.data_aprovacao
                              ? `Aprovado em ${formatDate(m.data_aprovacao)}`
                              : m.data_submissao
                              ? `Submetido em ${formatDate(m.data_submissao)}`
                              : ''
                            }
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          {/* Estrutura — orçamento detalhado nível 1→3 */}
          <TabsContent value="estrutura">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Search */}
              <div className="relative flex-1 min-w-48 max-w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-3)]" strokeWidth={1.5} />
                <input
                  type="text"
                  value={estruturaBusca}
                  onChange={e => setEstruturaBusca(e.target.value)}
                  placeholder="Buscar código ou descrição..."
                  className="w-full h-8 pl-8 pr-8 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
                {estruturaBusca && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setEstruturaBusca('')}>
                    <X className="w-3 h-3 text-[var(--text-3)]" />
                  </button>
                )}
              </div>

              {/* Level filter */}
              <Select value={estruturaNivel} onValueChange={v => setEstruturaNivel(v as typeof estruturaNivel)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os níveis</SelectItem>
                  <SelectItem value="1">Nível 1 — Grupos</SelectItem>
                  <SelectItem value="2">Nível 2 — Serviços</SelectItem>
                  <SelectItem value="3">Nível 3 — Itens</SelectItem>
                </SelectContent>
              </Select>

              {/* View mode */}
              <Select value={viewMode} onValueChange={v => setFiltros({ modo: v })}>
                <SelectTrigger className="h-8 text-xs w-32 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-1 ml-auto items-center">
                {lastSavedMsg && (
                  <span className="text-[10px] mr-2" style={{ color: lastSavedMsg.startsWith('⚠') ? '#EF4444' : 'var(--text-3)' }}>{lastSavedMsg}</span>
                )}
                <Button
                  variant={editOrcamento ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => { setEditOrcamento(v => !v); setLastSavedMsg(null) }}
                  title="Editar PR Mat / PR MO inline (setas navegam, Ctrl+V cola do Excel)"
                >
                  <Pencil className="w-3.5 h-3.5" /> {editOrcamento ? 'Concluir edição' : 'Editar orçamento'}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>Expandir tudo</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>Recolher</Button>
                <a href={`/api/contratos/${id}/planilha/template?tipo=fisico`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" title="Baixa planilha FÍSICO FINANCEIRO (com PR.Mat + PR.MO e curva física)">
                    <Download className="w-3.5 h-3.5" /> Baixar Físico
                  </Button>
                </a>
                <a href={`/api/contratos/${id}/planilha/template?tipo=fatdireto`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" title="Baixa planilha FATURAMENTO DIRETO (só PR.Mat e curva de fat direto)">
                    <Download className="w-3.5 h-3.5" /> Baixar Fat Direto
                  </Button>
                </a>
                <label>
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      e.currentTarget.value = ''
                      if (!f) return
                      try {
                        setSavingBulk(true)
                        const fd = new FormData()
                        fd.append('file', f)
                        const res = await fetch(`/api/contratos/${id}/planilha/upload?reset=1`, { method: 'POST', body: fd })
                        const json = await res.json()
                        if (!res.ok) throw new Error(json?.error || 'erro')
                        const o = json.orcamento || {}, cr = json.cronograma || {}
                        const parts: string[] = []
                        parts.push(`Tipo: ${json.tipo_detectado === 'fisico' ? 'Físico' : 'Fat Direto'}`)
                        if (o.atualizados) parts.push(`Orçamento: ${o.atualizados}${o.falhas ? ` (${o.falhas} falhas)` : ''}`)
                        if (cr.celulas)    parts.push(`Cronograma: ${cr.celulas} célula(s)`)
                        setLastSavedMsg(`Upload ✓ — ${parts.join(' · ')}`)
                        const gr = await fetch(`/api/contratos/${id}/grupos`, { cache: 'no-store' }).then(r => r.json())
                        setGrupos(gr)
                      } catch (err: any) {
                        setLastSavedMsg('⚠ erro no upload: ' + (err?.message || 'desconhecido'))
                      } finally {
                        setSavingBulk(false)
                      }
                    }}
                  />
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1" title="Sobe a planilha editada — atualiza orçamento + físico + fat direto">
                    <span><Upload className="w-3.5 h-3.5" /> Subir planilha</span>
                  </Button>
                </label>
                <Link href={`/contratos/${id}/estrutura`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Layers className="w-3.5 h-3.5" /> Gerenciar
                  </Button>
                </Link>
              </div>
            </div>
            {editOrcamento && (
              <div className="mb-3 p-2 rounded-lg text-[11px] flex items-start gap-2" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--text-2)' }}>
                <span className="font-semibold" style={{ color: 'var(--accent)' }}>Modo edição ativo.</span>
                <span>Clique em uma célula PR Mat ou PR M.O. → digite, ↑↓←→ navegam como no Excel, Enter confirma, Esc cancela.
                Você pode <strong>copiar/colar do Excel</strong> (Ctrl+V) várias linhas e colunas de uma vez. {savingBulk && <em>(salvando em massa…)</em>}</span>
              </div>
            )}

            {/* Detalhamento — cards por grupo com colunas completas (Cód/Descrição/Local/Qtde/Unid/PR Mat/PR MO/Subt Mat/Subt MO/Total) */}
            {(() => {
              const busca = estruturaBusca.toLowerCase()
              const colMatActive = viewMode === 'material'
              const colMoActive = viewMode === 'servico'

              // Monta lista filtrada + acumula subtotais visíveis
              let subtotalTotal = 0
              let subtotalMat = 0
              let subtotalMo = 0
              let visibleDetCount = 0
              let cellRowIdx = 0 // contador global de linhas editáveis (uma linha por detalhamento)

              const cards: React.ReactNode[] = []

              gruposExibidos.forEach(g => {
                const tarefas = [...(g.tarefas || [])].sort((a, b) => cmpCodigo(a.codigo, b.codigo))
                const grupoMatchBusca = !busca || g.codigo.toLowerCase().includes(busca) || g.nome.toLowerCase().includes(busca)
                const anyTarefaMatch = tarefas.some(t =>
                  t.codigo.toLowerCase().includes(busca) || t.nome.toLowerCase().includes(busca) ||
                  (t.detalhamentos || []).some(d => d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca))
                )
                if (busca && !grupoMatchBusca && !anyTarefaMatch) return

                // Filtro por nivel: '1' apenas grupos (header sem expandir), '2' força recolher detalhamentos,
                // '3' força expandir tarefas; 'todos' respeita expansão do usuário
                const isGrupoExpanded = estruturaNivel === '1'
                  ? false
                  : (estruturaNivel === '2' || estruturaNivel === '3' || busca.length > 0 || expandedGrupos.has(g.id))

                const vGrupo = getValorView(g)
                const saldoGrupo = vGrupo - (g.valor_medido ?? 0)
                const pctMedido = vGrupo > 0 ? ((g.valor_medido ?? 0) / vGrupo) * 100 : 0

                cards.push(
                  <Card key={g.id} className="theme-card">
                    <CardContent className="p-0">
                      {/* Cabeçalho do grupo */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--surface-1)] transition-colors"
                        onClick={() => toggleGrupo(g.id)}
                      >
                        {isGrupoExpanded
                          ? <ChevronDown className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs text-[var(--text-3)]">{g.codigo}</span>
                            <span className="font-bold text-[var(--text-1)] truncate">{g.nome}</span>
                            <Badge className={TIPO_MEDICAO_COLORS[g.tipo_medicao] || ''}>
                              {TIPO_MEDICAO_LABELS[g.tipo_medicao] || g.tipo_medicao}
                            </Badge>
                            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
                              {tarefas.length} serv.
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={Math.min(pctMedido, 100)} className="h-1.5 w-48" />
                            <span className="text-xs text-[var(--text-3)]">{formatPercent(pctMedido)} medido</span>
                          </div>
                        </div>
                        <div className="text-right text-sm min-w-[200px] flex-shrink-0">
                          <p className="font-bold text-[var(--text-1)]">{formatCurrency(vGrupo)}</p>
                          <p className="text-xs text-[var(--text-3)]">Medido: {formatCurrency(g.valor_medido ?? 0)}</p>
                          <p className="text-xs text-emerald-500/80">Saldo: {formatCurrency(saldoGrupo)}</p>
                        </div>
                      </div>
                      <div className="px-4 pb-2 -mt-1">
                        <MetricasBloco m={metrics.grupos[g.id]} />
                      </div>

                      {/* Tarefas + detalhamentos */}
                      {isGrupoExpanded && (
                        <div className="border-t border-[var(--border)]">
                          {tarefas.map(t => {
                            const detalhamentos = [...(t.detalhamentos || [])].sort((a, b) => cmpCodigo(a.codigo, b.codigo))
                            const tarefaMatchBusca = !busca || t.codigo.toLowerCase().includes(busca) || t.nome.toLowerCase().includes(busca) ||
                              detalhamentos.some(d => d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca))
                            if (busca && !grupoMatchBusca && !tarefaMatchBusca) return null

                            const isTarefaExpanded = estruturaNivel === '3' || estruturaNivel === 'todos'
                              ? (busca.length > 0 || expandedTarefas.has(t.id))
                              : false

                            const valorTarefa = t.valor_total ?? t.valor_contratado ?? 0

                            return (
                              <div key={t.id} className="border-b border-[var(--border)] last:border-0">
                                <div
                                  className="flex items-center gap-3 px-8 py-3 bg-[var(--surface-1)] cursor-pointer hover:bg-[var(--surface-2)]"
                                  onClick={() => toggleTarefa(t.id)}
                                >
                                  {detalhamentos.length > 0 ? (
                                    isTarefaExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] flex-shrink-0" />
                                      : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-3)] flex-shrink-0" />
                                  ) : <span className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <span className="font-mono text-xs text-[var(--text-3)]">{t.codigo}</span>
                                  <span className="font-semibold text-sm text-[var(--text-2)] flex-1 truncate">{t.nome}</span>
                                  <div className="text-right min-w-[200px]">
                                    <span className="text-xs font-medium text-[var(--text-2)]">{formatCurrency(valorTarefa)}</span>
                                  </div>
                                </div>
                                <div className="px-8 pb-2 -mt-1 bg-[var(--surface-1)]">
                                  <MetricasBloco m={metrics.tarefas[t.id]} />
                                </div>

                                {/* Detalhamentos — 10 colunas conforme planilha oficial */}
                                {isTarefaExpanded && detalhamentos.length > 0 && (estruturaNivel === 'todos' || estruturaNivel === '3') && (
                                  <div className="px-12 py-2 overflow-x-auto">
                                    <div className="min-w-[980px]">
                                      <div className="grid grid-cols-[40px_1fr_80px_50px_40px_90px_90px_100px_100px_100px] gap-2 px-2 pb-1.5 mb-1 border-b border-[var(--border)]/40 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                                        <span>Cód.</span>
                                        <span>Descrição</span>
                                        <span>Local</span>
                                        <span className="text-right">Qtde</span>
                                        <span className="text-center">Unid</span>
                                        <span className="text-right">PR. Mat</span>
                                        <span className="text-right">PR. M.O.</span>
                                        <span className="text-right">Subt. Mat</span>
                                        <span className="text-right">Subt. M.O.</span>
                                        <span className="text-right">Total</span>
                                      </div>
                                      {detalhamentos.map(d => {
                                        const detMatch = !busca || d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca) || tarefaMatchBusca || grupoMatchBusca
                                        if (busca && !detMatch) return null
                                        const qtd = Number(d.quantidade_contratada || 0)
                                        const prMat = Number(d.valor_material_unit ?? 0)
                                        const prMo = Number(d.valor_servico_unit ?? 0)
                                        const subMat = Number(d.subtotal_material ?? qtd * prMat)
                                        const subMo = Number(d.subtotal_mo ?? qtd * prMo)
                                        const total = d.valor_total || (subMat + subMo) || (qtd * (d.valor_unitario || 0))

                                        // acumula subtotais visíveis
                                        visibleDetCount += 1
                                        subtotalTotal += total
                                        subtotalMat += subMat
                                        subtotalMo += subMo
                                        const thisRowIdx = cellRowIdx
                                        cellRowIdx += 1

                                        const mDet = metrics.detalhamentos[d.id]
                                        return (
                                          <div key={d.id} className="py-1.5 px-2 rounded hover:bg-[var(--surface-1)] border-b border-[var(--border)]/30 last:border-0">
                                            <div className="grid grid-cols-[40px_1fr_80px_50px_40px_90px_90px_100px_100px_100px] gap-2 text-xs items-center">
                                              <span className="font-mono text-[var(--text-3)]">{d.codigo}</span>
                                              <span className="text-[var(--text-2)] truncate" title={d.descricao}>{d.descricao}</span>
                                              <span className="text-[10px] text-[var(--text-3)] truncate" title={d.local || ''}>{d.local || '—'}</span>
                                              <span className="text-right tabular-nums text-[var(--text-2)]">{qtd.toLocaleString('pt-BR')}</span>
                                              <span className="text-center text-[var(--text-3)]">{d.unidade || 'UN'}</span>
                                              <EditableOrcamentoCell
                                                cellKey={`${d.id}:mat`}
                                                detId={d.id}
                                                field="mat"
                                                rowIdx={thisRowIdx}
                                                colIdx={0}
                                                value={prMat}
                                                formatDisplay={formatCurrency}
                                                coord={coord}
                                                className={`text-right text-xs tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-3)]'}`}
                                              />
                                              <EditableOrcamentoCell
                                                cellKey={`${d.id}:mo`}
                                                detId={d.id}
                                                field="mo"
                                                rowIdx={thisRowIdx}
                                                colIdx={1}
                                                value={prMo}
                                                formatDisplay={formatCurrency}
                                                coord={coord}
                                                className={`text-right text-xs tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-3)]'}`}
                                              />
                                              <span className={`text-right tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-2)]'}`}>{formatCurrency(subMat)}</span>
                                              <span className={`text-right tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-2)]'}`}>{formatCurrency(subMo)}</span>
                                              <span className="text-right tabular-nums font-semibold text-[var(--text-1)]">{formatCurrency(total)}</span>
                                            </div>
                                            <div className="mt-0.5 px-2">
                                              <MetricasBloco m={mDet} align="left" />
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })

              if (cards.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)] rounded-xl" style={{ border: '1px solid var(--border)' }}>
                    <Package className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum item encontrado</p>
                  </div>
                )
              }

              const totalGrupos = gruposExibidos.reduce((s, g) => s + getValorView(g), 0)
              const isFiltering = busca.length > 0 || estruturaNivel !== 'todos' || filtroGrupo !== 'todos' || viewMode !== 'total'

              return (
                <div className="space-y-3">
                  {cards}

                  {/* Footer — TOTAL ORÇADO sempre + SUBTOTAL FILTRADO quando há filtro/busca */}
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                        Total orçado ({gruposExibidos.length} grupo{gruposExibidos.length !== 1 ? 's' : ''})
                      </span>
                      <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>
                        {formatCurrency(totalGrupos)}
                      </span>
                    </div>
                    {isFiltering && visibleDetCount > 0 && (
                      <div
                        className="px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2"
                        style={{ borderColor: 'var(--border)', background: 'rgba(16,185,129,0.08)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                            Subtotal filtrado ({visibleDetCount} {visibleDetCount === 1 ? 'item' : 'itens'})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[var(--text-3)]">Mat: <span className="font-semibold text-blue-400">{formatCurrency(subtotalMat)}</span></span>
                          <span className="text-[var(--text-3)]">M.O.: <span className="font-semibold text-amber-400">{formatCurrency(subtotalMo)}</span></span>
                          <span className="text-sm font-black text-emerald-500">{formatCurrency(subtotalTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </TabsContent>

          {/* Aditivos */}
          <TabsContent value="aditivos">
            <Link href={`/contratos/${id}/aditivos`}>
              <div className="flex justify-end mb-4">
                <Button size="sm">
                  <Plus className="w-4 h-4" />
                  Novo Aditivo
                </Button>
              </div>
            </Link>
            {aditivos.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-3)]">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum aditivo registrado</p>
                <p className="text-sm mt-1">Registre aditivos de valor, prazo ou escopo aqui</p>
              </div>
            ) : null}
          </TabsContent>

          {/* Dados */}
          <TabsContent value="dados">
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Número</p>
                    <p className="text-[var(--text-1)] font-medium">{contrato.numero}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Tipo</p>
                    <p className="text-[var(--text-1)]">{CONTRATO_TIPO_LABELS[contrato.tipo as ContratoTipo]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Contratante</p>
                    <p className="text-[var(--text-1)]">{contrato.contratado?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratado?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Contratada</p>
                    <p className="text-[var(--text-1)]">{contrato.contratante?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratante?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-[var(--text-1)]">{formatDate(contrato.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Término</p>
                    <p className="text-[var(--text-1)]">{formatDate(contrato.data_fim)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Local da Obra</p>
                    <p className="text-[var(--text-1)]">{contrato.local_obra}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Fiscal de Obra</p>
                    <p className="text-[var(--text-1)]">{contrato.fiscal_obra}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.email_fiscal}</p>
                  </div>
                  <div className="col-span-2 border-t border-[var(--border)] pt-3">
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Objeto</p>
                    <p className="text-[var(--text-2)]">{contrato.objeto}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal: editar dados contratuais */}
      {contrato && (
        <EditarContratoModal
          open={showEditar}
          onClose={() => setShowEditar(false)}
          contratoId={id}
          initial={{
            numero: contrato.numero,
            descricao: contrato.descricao,
            escopo: (contrato as any).escopo ?? null,
            objeto: (contrato as any).objeto ?? null,
            local_obra: (contrato as any).local_obra ?? null,
            fiscal_obra: (contrato as any).fiscal_obra ?? null,
            email_fiscal: (contrato as any).email_fiscal ?? null,
            data_inicio: (contrato as any).data_inicio ?? null,
            data_fim: (contrato as any).data_fim ?? null,
            status: contrato.status,
            observacoes: (contrato as any).observacoes ?? null,
            contratante: contratante ? {
              id: contratante.id,
              razao_social: contratante.razao_social,
              cnpj: contratante.cnpj,
              endereco: contratante.endereco,
              telefone: contratante.telefone,
              email: contratante.email,
            } : undefined,
            contratado: contratado ? {
              id: contratado.id,
              razao_social: contratado.razao_social,
              cnpj: contratado.cnpj,
              endereco: contratado.endereco,
              telefone: contratado.telefone,
              email: contratado.email,
            } : undefined,
          }}
          onSaved={() => {
            // Recarrega contrato na tela após salvar (ignora 4xx/5xx pra não setar erro como contrato)
            fetch(`/api/contratos/${id}`)
              .then(async r => (r.ok ? r.json() : null))
              .then(d => { if (d?.id) setContrato(d) })
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}
