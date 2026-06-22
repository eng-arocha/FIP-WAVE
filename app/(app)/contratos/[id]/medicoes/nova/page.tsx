'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Upload, Trash2, Plus, AlertCircle, Info, Loader2, User, ChevronDown, ChevronUp, ChevronsUpDown, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoAnexo } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { detectarPavRange, listarPavimentos, somarPavimentos, normalizarPct, PAV_PCTS, type PavRange } from '@/lib/pavimentos'

const MESES = [
  { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
  { v: '04', l: 'Abril' },  { v: '05', l: 'Maio' },      { v: '06', l: 'Junho' },
  { v: '07', l: 'Julho' },  { v: '08', l: 'Agosto' },    { v: '09', l: 'Setembro' },
  { v: '10', l: 'Outubro' },{ v: '11', l: 'Novembro' },  { v: '12', l: 'Dezembro' },
]

const ANOS = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i))

const selCls = 'rounded-lg px-3 py-2 text-sm outline-none border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

export default function NovaMedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [estrutura, setEstrutura] = useState<any[]>([])
  const [loadingEstrutura, setLoadingEstrutura] = useState(true)
  // Acumulado de medicoes anteriores. Cada entry tem qtde absoluta + qtde
  // contratada + pct calculado. Vem do endpoint /medicoes/acumulado.
  // pavimentos_pct: MAX por pavto entre medicoes aprovadas (so PAV TIPO).
  const [acumulado, setAcumulado] = useState<Record<string, {
    qtde: number
    qtde_contratada: number
    pct: number
    pavimentos_pct?: Record<string, number> | null
  }>>({})

  const [userNome, setUserNome] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Período: mês + ano separados
  const now = new Date()
  const [mesRef, setMesRef] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [anoRef, setAnoRef] = useState(String(now.getFullYear()))
  const [observacoes, setObservacoes] = useState('')

  // Quantidade ABSOLUTA acumulada desejada por detalhamento. Inclui o que
  // ja foi medido em medicoes anteriores + o que esta sendo medido agora.
  // O delta (= medicao atual) = qtdeMedicao - acumulado.qtde.
  // Para items com qtde_contratada=1 ainda usamos a granularidade 0/0.25/0.5/0.75/1
  // (botoes de %). Para qtde > 1 usamos input numerico (inteiros se qtde
  // contratada eh inteira, decimais caso contrario).
  const [qtdeMedicao, setQtdeMedicao] = useState<Record<string, number>>({})

  // Breakdown por pavto para itens PAV TIPO (cf. lib/pavimentos.ts + migration 066).
  // Estrutura: { [detId]: { [numPavto]: pct } } onde pct ∈ {0,25,50,75,100} e
  // representa o pct ACUMULADO desse pavto ao fim DESTA medicao (nao o delta).
  // qtdeMedicao[detId] eh derivado: somarPavimentos(pavPctMap[detId]).
  const [pavPctMap, setPavPctMap] = useState<Record<string, Record<string, number>>>({})

  // Grade de pavtos colapsada por padrao (recomendado pelo usuario).
  const [expandedPavGrid, setExpandedPavGrid] = useState<Set<string>>(new Set())
  function togglePavGrid(detId: string) {
    setExpandedPavGrid(prev => {
      const next = new Set(prev)
      if (next.has(detId)) next.delete(detId)
      else next.add(detId)
      return next
    })
  }

  // Collapse state para step 2 — começa com todos fechados
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set())

  function toggleGrupo(id: string) {
    setExpandedGrupos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function expandAll() { setExpandedGrupos(new Set(estruturaServico.map(g => g.id))) }
  function collapseAll() { setExpandedGrupos(new Set()) }

  const [novasNFs, setNovasNFs] = useState<{ numero: string; emitente: string; valor: string; data: string }[]>([])

  const periodo = `${anoRef}-${mesRef}`

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserEmail(data.user.email ?? '')
        setUserNome(
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.nome ||
          data.user.email?.split('@')[0] || ''
        )
      }
    })
  }, [])

  useEffect(() => {
    fetch(`/api/contratos/${contratoId}/estrutura`)
      .then(r => r.json())
      .then(data => setEstrutura(Array.isArray(data) ? data : []))
      .finally(() => setLoadingEstrutura(false))
  }, [contratoId])

  // Carrega dados do contrato pra calcular estimativa de retenção no passo 4
  const [contratoFin, setContratoFin] = useState<{
    valor_total: number
    valor_servicos: number
    percentual_retencao: number
  } | null>(null)
  useEffect(() => {
    fetch(`/api/contratos/${contratoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(c => {
        if (!c?.id) return
        setContratoFin({
          valor_total: Number(c.valor_total || 0),
          valor_servicos: Number(c.valor_servicos || 0),
          percentual_retencao: Number(c.percentual_retencao ?? 5),
        })
      })
      .catch(() => {/* silencioso — card não aparece */})
  }, [contratoId])

  useEffect(() => {
    if (step === 2) {
      fetch(`/api/contratos/${contratoId}/medicoes/acumulado`)
        .then(r => r.json())
        .then(data => {
          setAcumulado(data || {})
          // Inicializa qtdeMedicao com a qtde acumulada (= minimo permitido)
          setQtdeMedicao(prev => {
            const init: Record<string, number> = { ...prev }
            for (const [id, entry] of Object.entries(data || {}) as [string, any][]) {
              const minQtde = Number(entry?.qtde ?? 0)
              if (!(id in init) || init[id] < minQtde) {
                init[id] = minQtde
              }
            }
            return init
          })
          // Seed do breakdown por pavto = MAX por pavto vindo de medicoes
          // aprovadas. Cada pavto so pode crescer dali pra frente.
          setPavPctMap(prev => {
            const init = { ...prev }
            for (const [id, entry] of Object.entries(data || {}) as [string, any][]) {
              const pavto = entry?.pavimentos_pct
              if (pavto && typeof pavto === 'object') {
                init[id] = { ...(init[id] || {}), ...pavto }
              }
            }
            return init
          })
        })
    }
  }, [step, contratoId])

  // Todos os grupos 1–18 (grupo 19 = só material, excluído)
  const estruturaServico = estrutura.filter(g => {
    if (g.tipo_medicao === 'faturamento_direto') return false
    const num = parseInt((g.codigo || '').toString().split('.')[0])
    return isNaN(num) || num <= 18
  })

  // Acumulado em qtde absoluta. Helpers convenientes:
  function getAcumQtde(detId: string): number {
    return Number(acumulado[detId]?.qtde ?? 0)
  }

  // Define qtde absoluta desejada para um item. Aceita qualquer numero >= acumulado.
  // Items com qtde_contratada=1 ainda recebem valores fracionarios (0.25, 0.5, 0.75, 1).
  function setQtdeItem(detId: string, qtde: number, qtdeContratada: number) {
    const min = getAcumQtde(detId)
    const max = qtdeContratada
    let v = qtde
    if (v < min) v = min
    if (v > max) v = max
    setQtdeMedicao(prev => ({ ...prev, [detId]: v }))
  }

  // Click de toggle nos botoes % (item qtde_contratada=1). Comportamento
  // legado: clicar ACIMA da seleção atual zera, clicar abaixo reduz. Min é o
  // acumulado anterior.
  function togglePctUm(detId: string, pctClicado: number, currentQtde: number) {
    const minQtde = getAcumQtde(detId)
    const novaQtdeClicada = pctClicado / 100 // qtde_contratada=1 → qtde absoluta = pct/100
    if (novaQtdeClicada < minQtde) return // nao retroage

    const hasDelta = currentQtde > minQtde
    if (!hasDelta) {
      setQtdeMedicao(prev => ({ ...prev, [detId]: novaQtdeClicada }))
    } else if (novaQtdeClicada > currentQtde) {
      // ACIMA da selecao atual — limpa para min
      setQtdeMedicao(prev => ({ ...prev, [detId]: minQtde }))
    } else {
      // Igual ou abaixo — reduz
      setQtdeMedicao(prev => ({ ...prev, [detId]: novaQtdeClicada }))
    }
  }

  // ============================================================
  // Helpers de medicao por pavimento (itens "PAV TIPO ( X AO Y PAV )")
  // ============================================================

  /**
   * Pct anterior acumulado de um pavto especifico (vindo de medicoes
   * aprovadas). Funciona como "minimo" — o pavto so pode subir dai.
   */
  function getPavPctAnterior(detId: string, pavto: number): number {
    const ant = acumulado[detId]?.pavimentos_pct
    if (!ant) return 0
    const v = Number(ant[String(pavto)])
    return Number.isFinite(v) ? v : 0
  }

  /** Pct atual (acumulado ao fim desta medicao) de um pavto. */
  function getPavPctAtual(detId: string, pavto: number): number {
    const v = Number(pavPctMap[detId]?.[String(pavto)])
    if (Number.isFinite(v) && v > 0) return v
    return getPavPctAnterior(detId, pavto)
  }

  /**
   * Atualiza o pct de um pavto. Regras:
   *  - Clamp em {0,25,50,75,100}
   *  - Nao retroage: pct atual >= pct anterior do mesmo pavto
   *  - Apos atualizar, recalcula qtdeMedicao[detId] = soma(pcts)/100
   */
  function setPavPct(detId: string, pavto: number, pctRaw: number) {
    const pct = normalizarPct(pctRaw)
    const anterior = getPavPctAnterior(detId, pavto)
    const efetivo = pct < anterior ? anterior : pct

    setPavPctMap(prev => {
      const next = { ...prev, [detId]: { ...(prev[detId] || {}), [String(pavto)]: efetivo } }
      // qtdeMedicao deriva da soma — atualiza em batch pra evitar dessincronia.
      const novaQtde = somarPavimentos(next[detId])
      setQtdeMedicao(prevQ => ({ ...prevQ, [detId]: novaQtde }))
      return next
    })
  }

  /**
   * Seta pct de pavto sem normalizar para {0,25,50,75,100}.
   * Usado pelo input customizado de % livre.
   */
  function setPavPctArbitrario(detId: string, pavto: number, pctRaw: number) {
    const anterior = getPavPctAnterior(detId, pavto)
    const efetivo = Math.max(anterior, Math.min(100, Math.round(pctRaw)))
    setPavPctMap(prev => {
      const next = { ...prev, [detId]: { ...(prev[detId] || {}), [String(pavto)]: efetivo } }
      const novaQtde = somarPavimentos(next[detId])
      setQtdeMedicao(prevQ => ({ ...prevQ, [detId]: novaQtde }))
      return next
    })
  }

  /**
   * Click no botao de pct. Se o pavto JA esta nesse pct e ele eh maior que
   * o anterior, "destoggle" (volta pro anterior). Caso contrario, seta.
   */
  function togglePavPct(detId: string, pavto: number, pctClicado: number) {
    const anterior = getPavPctAnterior(detId, pavto)
    const atual = getPavPctAtual(detId, pavto)
    if (pctClicado < anterior) return // nao retroage
    if (pctClicado === atual && atual > anterior) {
      setPavPct(detId, pavto, anterior)
    } else {
      setPavPct(detId, pavto, pctClicado)
    }
  }

  function calcularValorTotal() {
    let total = 0
    for (const grupo of estruturaServico) {
      for (const tarefa of (grupo.tarefas || [])) {
        for (const det of (tarefa.detalhamentos || [])) {
          const qtdeAtual = qtdeMedicao[det.id] || 0
          const acumQtde = getAcumQtde(det.id)
          const deltaQtde = qtdeAtual - acumQtde
          if (deltaQtde > 0) {
            total += deltaQtde * (det.valor_unitario || 0)
          }
        }
      }
    }
    return total
  }

  async function submeter() {
    setSaving(true)
    try {
      const itens: any[] = []
      for (const grupo of estruturaServico) {
        for (const tarefa of (grupo.tarefas || [])) {
          for (const det of (tarefa.detalhamentos || [])) {
            const qtdeAtual = qtdeMedicao[det.id] || 0
            const acumQtde = getAcumQtde(det.id)
            const deltaQtde = qtdeAtual - acumQtde
            if (deltaQtde > 0) {
              // Para itens PAV TIPO, anexa o breakdown acumulado por pavto.
              // O backend grava em medicao_itens.pavimentos_pct (migration 066).
              const pavRange = detectarPavRange(det.descricao, Number(det.quantidade_contratada || 0))
              const pavto = pavRange ? pavPctMap[det.id] : null
              itens.push({
                detalhamento_id: det.id,
                quantidade_medida: deltaQtde,
                valor_unitario: det.valor_unitario,
                ...(pavto && Object.keys(pavto).length > 0 ? { pavimentos_pct: pavto } : {}),
              })
            }
          }
        }
      }
      const nfs = novasNFs
        .filter(nf => nf.numero && nf.valor)
        .map(nf => ({ numero_nf: nf.numero, emitente: nf.emitente, valor: parseFloat(nf.valor), data_emissao: nf.data }))
      const res = await fetch(`/api/contratos/${contratoId}/medicoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo_referencia: periodo, tipo: 'servico', solicitante_nome: userNome, solicitante_email: userEmail, observacoes, itens, notas_fiscais: nfs }),
      })
      if (res.ok) router.push(`/contratos/${contratoId}`)
    } finally {
      setSaving(false)
    }
  }

  const totalMedicao = calcularValorTotal()
  const itensFilled = Object.entries(qtdeMedicao).some(([id, q]) => q > getAcumQtde(id))

  return (
    <div className="flex-1">
      <Topbar
        title="Nova Medição de Serviço"
        subtitle="WAVE-2025-001"
        actions={
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />Voltar
          </Button>
        }
      />

      <div className="p-3 sm:p-6 max-w-5xl">
        {/* Steps */}
        <div className="flex items-center gap-1 mb-8">
          {[{ n: 1, label: 'Dados Gerais' }, { n: 2, label: 'Itens' }, { n: 3, label: 'Anexos' }, { n: 4, label: 'Revisão' }].map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
                step === s.n ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                step > s.n ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                'bg-[var(--surface-1)] text-[var(--text-3)] border border-[var(--border)]'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                  step === s.n ? 'bg-blue-500 text-white' : step > s.n ? 'bg-emerald-500 text-white' : 'bg-[#1E293B] text-[var(--text-3)]'
                }`}>{step > s.n ? '✓' : s.n}</span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < 3 && <div className={`w-4 h-px flex-shrink-0 mx-1 ${step > s.n ? 'bg-emerald-500/40' : 'bg-[#1E293B]'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Dados Gerais */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-[var(--text-1)]">Dados da Medição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Período de Referência — Mês + Ano */}
              <div>
                <label className="block text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5">Período de Referência *</label>
                <div className="flex items-center gap-2">
                  <select value={mesRef} onChange={e => setMesRef(e.target.value)} className={selCls}>
                    {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                  <select value={anoRef} onChange={e => setAnoRef(e.target.value)} className={selCls}>
                    {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  {/* Calendário auxiliar — preenche os dois selects */}
                  <input
                    type="month"
                    value={periodo}
                    onChange={e => {
                      const [y, m] = e.target.value.split('-')
                      if (y) setAnoRef(y)
                      if (m) setMesRef(m)
                    }}
                    className="rounded-lg px-2 py-2 text-sm border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-3)] focus:border-blue-500 cursor-pointer"
                    title="Selecione pelo calendário"
                  />
                </div>
                <p className="text-xs text-[var(--text-3)] mt-1">Período selecionado: <strong className="text-[var(--text-2)]">{MESES.find(m => m.v === mesRef)?.l} / {anoRef}</strong></p>
              </div>

              {/* Solicitante */}
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="text-xs">
                  <span className="text-[var(--text-3)]">Solicitado por: </span>
                  <span className="text-[var(--text-1)] font-medium">{userNome || '—'}</span>
                  {userEmail && <span className="text-[var(--text-3)] ml-1">({userEmail})</span>}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5">Observações</label>
                <Textarea
                  placeholder="Informações adicionais sobre a medição..."
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Itens */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Selecione o <strong>percentual acumulado total</strong> executado. O valor da medição será calculado como a diferença em relação à medição anterior.</span>
            </div>

            {/* Botões expandir / contrair — sempre visíveis no step 2 */}
            <div className="flex items-center gap-2">
              <button
                onClick={expandAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                Expandir Todos
              </button>
              <button
                onClick={collapseAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
              >
                <ChevronUp className="w-3.5 h-3.5" />
                Contrair Todos
              </button>
              <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
                {expandedGrupos.size}/{estruturaServico.length} grupos abertos
              </span>
            </div>

            {loadingEstrutura ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
                <span>Carregando estrutura...</span>
              </div>
            ) : (
              estruturaServico.map(grupo => {
                const isOpen = expandedGrupos.has(grupo.id)
                // Conta itens com delta neste grupo
                const deltaCount = (grupo.tarefas || []).reduce((acc: number, t: any) =>
                  acc + (t.detalhamentos || []).filter((d: any) => (qtdeMedicao[d.id] || 0) > getAcumQtde(d.id)).length, 0)

                return (
                  <Card key={grupo.id}>
                    <CardHeader
                      className="pb-2 cursor-pointer select-none"
                      onClick={() => toggleGrupo(grupo.id)}
                    >
                      <CardTitle className="text-sm flex items-center gap-2 text-[var(--text-1)]">
                        <span className="text-[var(--text-3)] font-mono">{grupo.codigo}</span>
                        <span className="flex-1">{grupo.nome}</span>
                        {deltaCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                            {deltaCount} item(ns) selecionado(s)
                          </span>
                        )}
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-3)' }} />}
                      </CardTitle>
                    </CardHeader>
                    {isOpen && (
                      <CardContent>
                        {(grupo.tarefas || []).map((tarefa: any) => (
                          <div key={tarefa.id} className="mb-4 last:mb-0">
                            <p className="text-xs font-semibold text-[var(--text-2)] mb-2 flex items-center gap-1">
                              <span className="font-mono text-[var(--text-3)]">{tarefa.codigo}</span>
                              {tarefa.nome}
                            </p>
                            <div className="space-y-1.5">
                              {(tarefa.detalhamentos || []).map((det: any) => {
                                const qtdeContratada = Number(det.quantidade_contratada || 0)
                                const pavRange = detectarPavRange(det.descricao, qtdeContratada)
                                // Para itens PAV TIPO, qtdeMedicao deriva da soma do
                                // breakdown por pavto. Para os outros, eh o input do usuario.
                                const qtdeAtual = pavRange
                                  ? somarPavimentos(pavPctMap[det.id])
                                  : (qtdeMedicao[det.id] ?? getAcumQtde(det.id))
                                const qtdeAnt = getAcumQtde(det.id)
                                const deltaQtde = qtdeAtual - qtdeAnt
                                const valorDelta = deltaQtde > 0 ? deltaQtde * (det.valor_unitario || 0) : 0
                                const pctAtual = qtdeContratada > 0 ? (qtdeAtual / qtdeContratada) * 100 : 0
                                const isCompleto = qtdeContratada > 0 && qtdeAtual >= qtdeContratada
                                const useUnidades = qtdeContratada > 1
                                const isInteiro = useUnidades && Number.isInteger(qtdeContratada)
                                const isPavGridOpen = expandedPavGrid.has(det.id)
                                return (
                                  <div key={det.id}>
                                  <div className={`grid grid-cols-12 gap-2 p-2.5 rounded-lg text-xs items-center transition-all ${deltaQtde > 0 ? 'bg-amber-500/8 border border-amber-500/30' : isCompleto ? 'bg-emerald-500/8 border border-emerald-500/20' : 'bg-[var(--surface-1)] border border-transparent'}`}>
                                    <div className="col-span-1 text-[var(--text-3)] font-mono text-[10px]">{det.codigo}</div>
                                    <div className="col-span-3 text-[var(--text-1)] font-medium leading-tight">
                                      {det.descricao}
                                      {useUnidades && (
                                        <span className="block text-[10px] text-slate-400 mt-0.5">
                                          contratado: <strong>{isInteiro ? qtdeContratada : qtdeContratada.toFixed(2)}</strong> {det.unidade}
                                        </span>
                                      )}
                                    </div>
                                    <div className="col-span-1 text-center text-[var(--text-3)]">{det.unidade}</div>
                                    <div className="col-span-1 text-center text-[var(--text-3)]">{formatCurrency(det.valor_unitario || 0)}</div>
                                    {/* Seletor: PAV TIPO (grade) | % buttons (qtde=1) | input numerico (qtde>1) */}
                                    <div className="col-span-4">
                                      {pavRange ? (
                                        // PAV TIPO: resumo + botao expandir grade (cf. migration 066)
                                        <div>
                                          <button
                                            type="button"
                                            onClick={() => togglePavGrid(det.id)}
                                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] font-bold bg-[#1e293b] text-slate-200 hover:bg-[#334155] hover:text-white transition-colors"
                                          >
                                            <span className="flex items-center gap-1.5">
                                              {isPavGridOpen
                                                ? <ChevronUp className="w-3 h-3" />
                                                : <ChevronDown className="w-3 h-3" />}
                                              Medir por pavto ({pavRange.primeiro}º ao {pavRange.ultimo}º)
                                            </span>
                                            <span className="tabular-nums text-slate-300">
                                              {qtdeAtual.toFixed(2).replace(/\.?0+$/, '')} / {pavRange.count}
                                            </span>
                                          </button>
                                          {qtdeAnt > 0 && (
                                            <p className="text-[9px] text-slate-400 mt-0.5">
                                              mín. (acumulado anterior): <strong>{qtdeAnt.toFixed(2).replace(/\.?0+$/, '')}</strong> {det.unidade}
                                            </p>
                                          )}
                                        </div>
                                      ) : !useUnidades ? (
                                        // Item indivisivel — botoes percentuais 0/25/50/75/100 + input livre
                                        <div className="flex gap-0.5 items-center">
                                          {[0, 25, 50, 75, 100].map(p => {
                                            const novaQtdeBotao = p / 100 // qtde_contratada=1 → qtde absoluta=pct/100
                                            const isMin   = novaQtdeBotao < qtdeAnt
                                            const isAccum = Math.abs(novaQtdeBotao - qtdeAnt) < 1e-9 && qtdeAnt > 0
                                            const isDelta = novaQtdeBotao > qtdeAnt && novaQtdeBotao <= qtdeAtual && novaQtdeBotao > 0
                                            return (
                                              <button
                                                key={p}
                                                type="button"
                                                disabled={isMin}
                                                onClick={() => togglePctUm(det.id, p, qtdeAtual)}
                                                className={`flex-1 py-1.5 rounded text-[11px] font-bold transition-all duration-150 ${
                                                  isMin
                                                    ? 'opacity-20 cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-3)]'
                                                    : isAccum
                                                    ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                                                    : isDelta
                                                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/40'
                                                    : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155] hover:text-white'
                                                }`}
                                              >
                                                {p}%
                                              </button>
                                            )
                                          })}
                                          {/* Input de % livre — aceita qualquer valor entre min e 100 */}
                                          {(() => {
                                            const currentPctInt = Math.round(qtdeAtual * 100)
                                            const isStd = [0, 25, 50, 75, 100].includes(currentPctInt)
                                            const minPct = Math.round(qtdeAnt * 100)
                                            return (
                                              <input
                                                key={isStd ? 'std' : currentPctInt}
                                                type="number"
                                                defaultValue={isStd ? '' : String(currentPctInt)}
                                                min={minPct}
                                                max={100}
                                                step={1}
                                                placeholder="…"
                                                onBlur={e => {
                                                  const v = parseFloat(e.target.value)
                                                  if (Number.isFinite(v)) {
                                                    const clamped = Math.max(minPct, Math.min(100, Math.round(v)))
                                                    setQtdeMedicao(prev => ({ ...prev, [det.id]: clamped / 100 }))
                                                  }
                                                  e.target.value = ''
                                                }}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                                className="w-10 py-1.5 rounded text-[11px] font-bold text-center tabular-nums bg-[#1e293b] text-slate-300 border border-[#334155] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 outline-none placeholder-slate-600"
                                              />
                                            )
                                          })()}
                                        </div>
                                      ) : (
                                        // Item divisivel — input numerico de unidades
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            inputMode={isInteiro ? 'numeric' : 'decimal'}
                                            step={isInteiro ? 1 : '0.01'}
                                            min={qtdeAnt}
                                            max={qtdeContratada}
                                            value={qtdeAtual}
                                            onChange={e => {
                                              const v = e.target.value
                                              const num = v === '' ? qtdeAnt : Number(v)
                                              if (Number.isNaN(num)) return
                                              setQtdeItem(det.id, num, qtdeContratada)
                                            }}
                                            className="flex-1 px-2 py-1.5 rounded text-[11px] font-bold tabular-nums bg-[#1e293b] text-white border border-[#334155] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 outline-none"
                                          />
                                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                            de {isInteiro ? qtdeContratada : qtdeContratada.toFixed(2)}
                                          </span>
                                        </div>
                                      )}
                                      {qtdeAnt > 0 && useUnidades && (
                                        <p className="text-[9px] text-slate-400 mt-0.5">
                                          mín. (acumulado anterior): <strong>{isInteiro ? Math.round(qtdeAnt) : qtdeAnt.toFixed(2)}</strong> {det.unidade}
                                        </p>
                                      )}
                                    </div>
                                    <div className="col-span-2 text-right font-bold">
                                      {qtdeAnt > 0 && (
                                        <span className="text-[10px] text-slate-400 block">
                                          ant: {useUnidades
                                            ? `${isInteiro ? Math.round(qtdeAnt) : qtdeAnt.toFixed(2)} ${det.unidade}`
                                            : `${Math.round((qtdeAnt / qtdeContratada) * 100)}%`}
                                        </span>
                                      )}
                                      {valorDelta > 0
                                        ? <span className="text-blue-400">{formatCurrency(valorDelta)}</span>
                                        : <span className="text-[var(--text-3)] font-normal">—</span>}
                                      {useUnidades && qtdeAtual > 0 && (
                                        <span className="text-[9px] text-slate-500 block mt-0.5">
                                          {pctAtual.toFixed(0)}% acum.
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Grade expandida de pavtos: 6 colunas, cada celula com botoes 0/25/50/75/100 */}
                                  {pavRange && isPavGridOpen && (
                                    <div className="mt-1.5 ml-6 p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
                                      <p className="text-[10px] text-slate-400 mb-2">
                                        Selecione o pct acumulado de cada pavto. Cada pavto vale {(1).toFixed(0)} {det.unidade} (100% = 1 {det.unidade}).
                                      </p>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                                        {listarPavimentos(pavRange).map(pavto => {
                                          const pctAnt = getPavPctAnterior(det.id, pavto)
                                          const pctAtu = getPavPctAtual(det.id, pavto)
                                          const isDeltaPav = pctAtu > pctAnt
                                          return (
                                            <div key={pavto} className={`p-1.5 rounded-md border ${isDeltaPav ? 'border-amber-500/40 bg-amber-500/5' : pctAtu >= 100 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>
                                              <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-mono text-slate-400">{pavto}º pav</span>
                                                <span className={`text-[10px] font-bold tabular-nums ${isDeltaPav ? 'text-amber-300' : pctAtu >= 100 ? 'text-emerald-300' : 'text-slate-500'}`}>{pctAtu}%</span>
                                              </div>
                                              <div className="flex gap-0.5">
                                                {PAV_PCTS.map(p => {
                                                  const isMin = p < pctAnt
                                                  const isAccum = p === pctAnt && pctAnt > 0
                                                  const isAtual = p === pctAtu && p > pctAnt
                                                  return (
                                                    <button
                                                      key={p}
                                                      type="button"
                                                      disabled={isMin}
                                                      onClick={() => togglePavPct(det.id, pavto, p)}
                                                      className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${
                                                        isMin
                                                          ? 'opacity-20 cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-3)]'
                                                          : isAccum
                                                          ? 'bg-emerald-600 text-white'
                                                          : isAtual
                                                          ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/40'
                                                          : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155] hover:text-white'
                                                      }`}
                                                    >
                                                      {p}
                                                    </button>
                                                  )
                                                })}
                                              </div>
                                              {/* Input de % livre por pavto */}
                                              {(() => {
                                                const isStdPav = [0, 25, 50, 75, 100].includes(pctAtu)
                                                return (
                                                  <input
                                                    key={isStdPav ? 'std' : pctAtu}
                                                    type="number"
                                                    defaultValue={isStdPav ? '' : String(pctAtu)}
                                                    min={pctAnt}
                                                    max={100}
                                                    step={1}
                                                    placeholder="…"
                                                    onBlur={e => {
                                                      const v = parseFloat(e.target.value)
                                                      if (Number.isFinite(v)) setPavPctArbitrario(det.id, pavto, v)
                                                      e.target.value = ''
                                                    }}
                                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                                                    className="mt-0.5 w-full py-0.5 rounded text-[9px] font-bold text-center tabular-nums bg-[#1e293b] text-slate-300 border border-[#334155] focus:border-amber-400 outline-none placeholder-slate-600"
                                                  />
                                                )
                                              })()}
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
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )
              })
            )}

            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="font-semibold text-[var(--text-1)]">Total desta Medição</span>
                <span className="text-2xl font-bold text-blue-400">{formatCurrency(totalMedicao)}</span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Anexos */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-[var(--text-1)]">Documentos e Comprovantes</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center hover:border-blue-500/40 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-[var(--text-3)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-2)] font-medium">Clique para fazer upload ou arraste arquivos</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">PDF, PNG, JPG, XLS • Máximo 10MB por arquivo</p>
                </div>

                {/* Notas Fiscais */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">Notas Fiscais</p>
                    <Button size="sm" variant="ghost" onClick={() => setNovasNFs(p => [...p, { numero: '', emitente: '', valor: '', data: '' }])}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Adicionar NF
                    </Button>
                  </div>
                  {novasNFs.map((nf, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
                      <input placeholder="Nº NF" value={nf.numero} onChange={e => setNovasNFs(p => p.map((x, j) => j === i ? { ...x, numero: e.target.value } : x))} className="text-xs px-2 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)] outline-none" />
                      <input placeholder="Emitente" value={nf.emitente} onChange={e => setNovasNFs(p => p.map((x, j) => j === i ? { ...x, emitente: e.target.value } : x))} className="text-xs px-2 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)] outline-none" />
                      <input placeholder="Valor" type="number" value={nf.valor} onChange={e => setNovasNFs(p => p.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} className="text-xs px-2 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)] outline-none" />
                      <div className="flex gap-1">
                        <input type="date" value={nf.data} onChange={e => setNovasNFs(p => p.map((x, j) => j === i ? { ...x, data: e.target.value } : x))} className="flex-1 text-xs px-2 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)] outline-none" />
                        <button onClick={() => setNovasNFs(p => p.filter((_, j) => j !== i))} className="text-[var(--text-3)] hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Revisão */}
        {step === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm text-[var(--text-1)]">Resumo da Medição</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs text-[var(--text-3)] mb-0.5">Tipo</p>
                    <p className="font-medium text-[var(--text-1)]">Serviço (Mão de Obra)</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] mb-0.5">Período de Referência</p>
                    <p className="font-medium text-[var(--text-1)]">Ref. {MESES.find(m => m.v === mesRef)?.l} de {anoRef}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-[var(--text-3)] mb-0.5">Solicitante</p>
                    <p className="font-medium text-[var(--text-1)]">{userNome} {userEmail && <span className="text-[var(--text-3)] text-xs">({userEmail})</span>}</p>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-3 flex justify-between items-center">
                  <span className="font-semibold text-[var(--text-1)]">Valor Total da Medição</span>
                  <span className="text-2xl font-bold text-blue-400">{formatCurrency(totalMedicao)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Estimativa de Retenção Contratual (nova fórmula contratual)
                Calcula material e serviço executados nesta medição (delta × qtd ×
                valor_unit_mat ou _serv). Retenção = (mat + serv) × percentual. */}
            {contratoFin && totalMedicao > 0 && (() => {
              let totalMaterial = 0
              let totalServico = 0
              for (const grupo of estrutura || []) {
                for (const tarefa of (grupo as any).tarefas || []) {
                  for (const det of (tarefa as any).detalhamentos || []) {
                    const qtdeAtual = qtdeMedicao[det.id] ?? 0
                    const acumQtde = getAcumQtde(det.id)
                    const deltaQtde = qtdeAtual - acumQtde
                    if (deltaQtde > 0) {
                      totalMaterial += deltaQtde * (Number(det.valor_material_unit) || 0)
                      totalServico  += deltaQtde * (Number(det.valor_servico_unit)  || 0)
                    }
                  }
                }
              }
              const baseRetencao = totalMaterial + totalServico
              if (baseRetencao <= 0) return null
              const pctRet = contratoFin.percentual_retencao || 5
              const retencao = baseRetencao * (pctRet / 100)
              const liquidoNF = totalServico - retencao
              const andamento = contratoFin.valor_total > 0 ? (baseRetencao / contratoFin.valor_total) * 100 : 0

              return (
                <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(99,102,241,0.30)' }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2" style={{ color: '#818CF8' }}>
                      <TrendingUp className="w-4 h-4" />
                      Estimativa de retenção contratual
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(99,102,241,0.18)', color: '#818CF8' }}>
                        Prévia
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Material correspondente</p>
                        <p className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                          {formatCurrency(totalMaterial)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Serviço medido</p>
                        <p className="font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                          {formatCurrency(totalServico)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-3)] mb-0.5">Base ({pctRet.toFixed(2).replace('.', ',')}%)</p>
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
                        <p className="text-[var(--text-3)] mb-0.5">Líquido NF</p>
                        <p className="font-bold tabular-nums" style={{ color: '#10B981' }}>
                          {formatCurrency(liquidoNF)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                      <strong style={{ color: 'var(--text-2)' }}>NF integral (serviço):</strong> {formatCurrency(totalServico)}.
                      Retenção descontada no pagamento pelo WAVE, conforme cláusulas contratuais.
                      Andamento físico desta medição: <strong>{andamento.toFixed(2).replace('.', ',')}%</strong> do contrato.
                      Cálculo prévio — valores congelados na aprovação.
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            {/* Aviso de submissão — contraste alto, fundo âmbar sólido + texto escuro/claro com peso */}
            <div className="p-4 rounded-lg flex items-start gap-2.5"
              style={{
                background: 'rgba(245,158,11,0.18)',
                border: '1px solid rgba(245,158,11,0.55)',
              }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} strokeWidth={2.2} />
              <div className="text-sm" style={{ color: 'var(--text-1)' }}>
                <p className="font-bold mb-1" style={{ color: '#F59E0B' }}>Antes de submeter, confirme:</p>
                <ul className="list-disc list-inside space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
                  <li>Todos os quantitativos estão corretos e comprovados.</li>
                  <li>Os documentos estão anexados.</li>
                  <li>A medição será enviada para aprovação da equipe FIP.</li>
                </ul>
              </div>
            </div>

            {/* Link informativo: Boletim INFORMAKON disponível após submeter */}
            <div className="rounded-lg px-4 py-3 flex items-start gap-2.5"
              style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.35)' }}>
              <TrendingUp className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#818CF8' }} strokeWidth={2} />
              <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                <p className="font-semibold mb-0.5" style={{ color: '#818CF8' }}>
                  Após submeter, o Boletim INFORMAKON estará disponível
                </p>
                <p>
                  Página de planilha-resumo pra lançamento manual no INFORMAKON com material/serviço
                  por subitem, percentual acumulado, retenção e botões de Copiar (TSV) / CSV / Imprimir.
                  Acesse pela detail page da medição ou em <strong>Documentos → Med. Serviços</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>← Anterior</Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={(step === 1 && !periodo) || (step === 2 && !itensFilled)}
            >
              Próximo →
            </Button>
          ) : (
            <Button onClick={submeter} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</> : 'Submeter para Aprovação'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
