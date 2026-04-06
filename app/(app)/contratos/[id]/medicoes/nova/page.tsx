'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Upload, Trash2, Plus, AlertCircle, Info, Loader2, User } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoAnexo } from '@/types'
import { createClient } from '@/lib/supabase/client'

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
  const [acumulado, setAcumulado] = useState<Record<string, number>>({})

  const [userNome, setUserNome] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Período: mês + ano separados
  const now = new Date()
  const [mesRef, setMesRef] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [anoRef, setAnoRef] = useState(String(now.getFullYear()))
  const [observacoes, setObservacoes] = useState('')

  // % selecionado por detalhamento (representa o acumulado NOVO desejado)
  const [percentualMedicao, setPercentualMedicao] = useState<Record<string, number>>({})

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

  useEffect(() => {
    if (step === 2) {
      fetch(`/api/contratos/${contratoId}/medicoes/acumulado`)
        .then(r => r.json())
        .then(data => {
          setAcumulado(data || {})
          // Inicializa percentuais com o acumulado (mínimo)
          setPercentualMedicao(prev => {
            const init: Record<string, number> = { ...prev }
            for (const [id, pct] of Object.entries(data || {})) {
              if (!(id in init) || (init[id] < (pct as number))) {
                init[id] = pct as number
              }
            }
            return init
          })
        })
    }
  }, [step, contratoId])

  // Grupos 4–18 apenas (19 = material)
  const estruturaServico = estrutura.filter(g => {
    if (g.tipo_medicao === 'faturamento_direto') return false
    const num = parseInt((g.codigo || '').split('.')[0])
    return !isNaN(num) && num >= 4 && num <= 18
  })

  function setPercentual(detId: string, pct: number) {
    const min = acumulado[detId] || 0
    if (pct < min) return // não pode retroagir
    setPercentualMedicao(prev => ({ ...prev, [detId]: pct }))
  }

  function calcularValorTotal() {
    let total = 0
    for (const grupo of estruturaServico) {
      for (const tarefa of (grupo.tarefas || [])) {
        for (const det of (tarefa.detalhamentos || [])) {
          const pct = percentualMedicao[det.id] || 0
          const delta = pct - (acumulado[det.id] || 0)
          if (delta > 0) {
            total += (delta / 100) * (det.quantidade_contratada || 0) * (det.valor_unitario || 0)
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
            const pct = percentualMedicao[det.id] || 0
            const delta = pct - (acumulado[det.id] || 0)
            if (delta > 0) {
              itens.push({
                detalhamento_id: det.id,
                quantidade_medida: (delta / 100) * (det.quantidade_contratada || 0),
                valor_unitario: det.valor_unitario,
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
  const itensFilled = Object.entries(percentualMedicao).some(([id, pct]) => pct > (acumulado[id] || 0))

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Nova Medição de Serviço"
        subtitle="WAVE-2025-001"
        actions={
          <Link href={`/contratos/${contratoId}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4" />Voltar</Button>
          </Link>
        }
      />

      <div className="p-6 max-w-5xl">
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

            {loadingEstrutura ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
                <span>Carregando estrutura...</span>
              </div>
            ) : (
              estruturaServico.map(grupo => (
                <Card key={grupo.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-[var(--text-1)]">
                      <span className="text-[var(--text-3)] font-mono">{grupo.codigo}</span>
                      {grupo.nome}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(grupo.tarefas || []).map((tarefa: any) => (
                      <div key={tarefa.id} className="mb-4 last:mb-0">
                        <p className="text-xs font-semibold text-[var(--text-2)] mb-2 flex items-center gap-1">
                          <span className="font-mono text-[var(--text-3)]">{tarefa.codigo}</span>
                          {tarefa.nome}
                        </p>
                        <div className="space-y-1.5">
                          {(tarefa.detalhamentos || []).map((det: any) => {
                            const pct = percentualMedicao[det.id] ?? (acumulado[det.id] || 0)
                            const pctAnt = acumulado[det.id] || 0
                            const delta = pct - pctAnt
                            const valorDelta = delta > 0
                              ? (delta / 100) * (det.quantidade_contratada || 0) * (det.valor_unitario || 0)
                              : 0
                            return (
                              <div key={det.id} className={`grid grid-cols-12 gap-2 p-2.5 rounded-lg text-xs items-center transition-all ${delta > 0 ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-[var(--surface-1)] border border-transparent'}`}>
                                <div className="col-span-1 text-[var(--text-3)] font-mono text-[10px]">{det.codigo}</div>
                                <div className="col-span-3 text-[var(--text-1)] font-medium leading-tight">{det.descricao}</div>
                                <div className="col-span-1 text-center text-[var(--text-3)]">{det.unidade}</div>
                                <div className="col-span-1 text-center text-[var(--text-3)]">{formatCurrency(det.valor_unitario || 0)}</div>
                                {/* % selector */}
                                <div className="col-span-4 flex gap-0.5">
                                  {[0, 25, 50, 75, 100].map(p => {
                                    const isMin = p < pctAnt
                                    const isSelected = pct === p
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        disabled={isMin}
                                        onClick={() => setPercentual(det.id, p)}
                                        className={`flex-1 py-1.5 rounded text-[11px] font-bold transition-all duration-150 ${
                                          isMin
                                            ? 'opacity-25 cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-3)]'
                                            : isSelected
                                            ? p === pctAnt
                                              ? 'bg-[#334155] text-white ring-1 ring-slate-500'
                                              : 'bg-blue-500 text-white shadow-md shadow-blue-500/40'
                                            : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155] hover:text-white'
                                        }`}
                                      >
                                        {p}%
                                      </button>
                                    )
                                  })}
                                </div>
                                <div className="col-span-2 text-right font-bold">
                                  {pctAnt > 0 && <span className="text-[10px] text-slate-400 block">ant: {pctAnt}%</span>}
                                  {valorDelta > 0
                                    ? <span className="text-blue-400">{formatCurrency(valorDelta)}</span>
                                    : <span className="text-[var(--text-3)] font-normal">—</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))
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
                    <p className="text-xs text-[var(--text-3)] mb-0.5">Período</p>
                    <p className="font-medium text-[var(--text-1)]">{MESES.find(m => m.v === mesRef)?.l} / {anoRef}</p>
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
            <div className="p-4 bg-amber-900/30 border border-amber-800/50 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-400">
                <p className="font-semibold mb-0.5">Antes de submeter, confirme:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Todos os quantitativos estão corretos e comprovados</li>
                  <li>Os documentos estão anexados</li>
                  <li>A medição será enviada para aprovação da equipe FIP</li>
                </ul>
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
