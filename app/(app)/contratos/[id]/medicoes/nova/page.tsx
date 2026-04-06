'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Upload, Trash2, Plus, FileText, AlertCircle, Info, Loader2, User } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoMedicao, TipoAnexo } from '@/types'
import { createClient } from '@/lib/supabase/client'

type AnexoItem = {
  id: string
  nome: string
  tipo: TipoAnexo
  tamanho: string
}

const TIPO_MEDICAO_LABELS: Record<string, string> = {
  servico: 'Serviço (Mão de Obra)',
}

export default function NovaMedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [estrutura, setEstrutura] = useState<any[]>([])
  const [loadingEstrutura, setLoadingEstrutura] = useState(true)

  // Auto-fill user info
  const [userNome, setUserNome] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Step 1: Dados gerais
  const [tipo, setTipo] = useState<string>('servico')
  const [periodo, setPeriodo] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Step 2: Itens — percentual por detalhamento (0 | 25 | 50 | 75 | 100)
  const [percentualMedicao, setPercentualMedicao] = useState<Record<string, number>>({})

  // Step 3: Anexos e NFs
  const [anexos, setAnexos] = useState<AnexoItem[]>([])
  const [novasNFs, setNovasNFs] = useState<{ numero: string; emitente: string; valor: string; data: string }[]>([])

  useEffect(() => {
    // Load authenticated user
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserEmail(data.user.email ?? '')
        setUserNome(
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.nome ||
          data.user.email?.split('@')[0] ||
          ''
        )
      }
    })
  }, [])

  useEffect(() => {
    fetch(`/api/contratos/${contratoId}/estrutura`)
      .then(r => r.json())
      .then(data => setEstrutura(data))
      .finally(() => setLoadingEstrutura(false))
  }, [contratoId])

  // Only show service groups in step 2
  const estruturaServico = estrutura.filter(g => g.tipo_medicao !== 'faturamento_direto')

  function setPercentual(detId: string, pct: number) {
    setPercentualMedicao(prev => ({ ...prev, [detId]: pct }))
  }

  function calcularValorTotal() {
    let total = 0
    for (const grupo of estruturaServico) {
      for (const tarefa of (grupo.tarefas || [])) {
        for (const det of (tarefa.detalhamentos || [])) {
          const pct = percentualMedicao[det.id] || 0
          const qtd = (pct / 100) * (det.quantidade_contratada || 0)
          total += qtd * (det.valor_unitario || 0)
        }
      }
    }
    return total
  }

  function adicionarNF() {
    setNovasNFs(prev => [...prev, { numero: '', emitente: '', valor: '', data: '' }])
  }

  function removerNF(idx: number) {
    setNovasNFs(prev => prev.filter((_, i) => i !== idx))
  }

  async function submeter() {
    setSaving(true)
    try {
      const itens = []
      for (const grupo of estruturaServico) {
        for (const tarefa of (grupo.tarefas || [])) {
          for (const det of (tarefa.detalhamentos || [])) {
            const pct = percentualMedicao[det.id] || 0
            if (pct > 0) {
              const qtd = (pct / 100) * (det.quantidade_contratada || 0)
              itens.push({ detalhamento_id: det.id, quantidade_medida: qtd, valor_unitario: det.valor_unitario })
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
        body: JSON.stringify({
          periodo_referencia: periodo,
          tipo,
          solicitante_nome: userNome,
          solicitante_email: userEmail,
          observacoes,
          itens,
          notas_fiscais: nfs,
        }),
      })
      if (res.ok) {
        router.push(`/contratos/${contratoId}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const totalMedicao = calcularValorTotal()
  const itensFilled = Object.values(percentualMedicao).some(v => v > 0)

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Nova Medição"
        subtitle="WAVE-2025-001"
        actions={
          <Link href={`/contratos/${contratoId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <div className="p-6 max-w-5xl">
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[
            { n: 1, label: 'Dados Gerais' },
            { n: 2, label: 'Itens da Medição' },
            { n: 3, label: 'Anexos' },
            { n: 4, label: 'Revisão' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === s.n ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                step > s.n ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' :
                'bg-[#1E293B] text-[#475569]'
              }`}>
                <span>{s.n}</span>
                <span>{s.label}</span>
              </div>
              {i < 3 && <div className="w-6 h-px bg-[#1E293B] mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Dados Gerais */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-[#F1F5F9]">Dados da Medição</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Tipo FIRST */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Tipo de Medição *</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v)}>
                    <SelectTrigger className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9]">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111827] border border-[#1E293B]">
                      {Object.entries(TIPO_MEDICAO_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-[#F1F5F9] focus:bg-[#1E293B] focus:text-[#F1F5F9]">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Período SECOND */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Período de Referência *</Label>
                  <Input
                    type="month"
                    value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                    className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
                  />
                </div>

                {/* Auto-filled user info */}
                <div className="col-span-2">
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="text-xs">
                      <span className="text-[#475569]">Solicitado por: </span>
                      <span className="text-[#F1F5F9] font-medium">{userNome || '—'}</span>
                      {userEmail && <span className="text-[#475569] ml-1">({userEmail})</span>}
                    </div>
                  </div>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Observações</Label>
                  <Textarea
                    placeholder="Informações adicionais sobre a medição..."
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Itens */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-400">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Selecione o percentual executado neste período para cada item: <strong className="text-blue-300">0% · 25% · 50% · 75% · 100%</strong>. Itens em 0% não serão incluídos.</span>
            </div>

            {loadingEstrutura ? (
              <div className="flex items-center justify-center py-16 text-[#475569]">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
                <span>Carregando estrutura...</span>
              </div>
            ) : (
              estruturaServico.map(grupo => (
                <Card key={grupo.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-[#F1F5F9]">
                      <span className="text-[#475569] font-mono">{grupo.codigo}</span>
                      {grupo.nome}
                      <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">
                        Serviço
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(grupo.tarefas || []).map((tarefa: any) => (
                      <div key={tarefa.id} className="mb-4 last:mb-0">
                        <p className="text-xs font-semibold text-[#94A3B8] mb-2 flex items-center gap-1">
                          <span className="font-mono text-[#475569]">{tarefa.codigo}</span>
                          {tarefa.nome}
                        </p>
                        <div className="space-y-2">
                          {(tarefa.detalhamentos || []).map((det: any) => {
                            const pct = percentualMedicao[det.id] || 0
                            const qtdMedida = (pct / 100) * (det.quantidade_contratada || 0)
                            const valorItem = qtdMedida * (det.valor_unitario || 0)
                            return (
                              <div key={det.id} className={`grid grid-cols-12 gap-2 p-2.5 rounded-lg text-xs items-center transition-all ${pct > 0 ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-[#0D1421] border border-transparent'}`}>
                                <div className="col-span-1 text-[#475569] font-mono">{det.codigo}</div>
                                <div className="col-span-3 text-[#F1F5F9] font-medium leading-tight">{det.descricao}</div>
                                <div className="col-span-1 text-center text-[#475569]">{det.unidade}</div>
                                <div className="col-span-1 text-center text-[#475569]">
                                  {formatCurrency(det.valor_unitario || 0)}
                                </div>
                                {/* 0 / 25 / 50 / 75 / 100 % selector */}
                                <div className="col-span-4 flex gap-1">
                                  {[0, 25, 50, 75, 100].map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => setPercentual(det.id, p)}
                                      className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all duration-150 ${
                                        pct === p
                                          ? p === 0
                                            ? 'bg-[#1E293B] text-[#475569] ring-1 ring-[#2d3f5c]'
                                            : 'bg-blue-500 text-white shadow-md shadow-blue-500/40'
                                          : 'bg-[#1a2236] text-[#475569] hover:bg-[#2d3f5c] hover:text-[#94A3B8]'
                                      }`}
                                    >
                                      {p}%
                                    </button>
                                  ))}
                                </div>
                                <div className="col-span-2 text-right font-bold text-blue-400">
                                  {valorItem > 0 ? formatCurrency(valorItem) : <span className="text-[#475569] font-normal">—</span>}
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

            {/* Subtotal */}
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="font-semibold text-[#F1F5F9]">Total da Medição</span>
                <span className="text-2xl font-bold text-blue-400">{formatCurrency(totalMedicao)}</span>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Anexos */}
        {step === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#F1F5F9]">Documentos e Comprovantes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-[#1E293B] rounded-lg p-8 text-center hover:border-blue-500/40 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-[#475569] mx-auto mb-2" />
                  <p className="text-sm text-[#94A3B8] font-medium">Clique para fazer upload ou arraste arquivos</p>
                  <p className="text-xs text-[#475569] mt-1">PDF, PNG, JPG, XLS • Máximo 10MB por arquivo</p>
                  <div className="flex justify-center gap-2 mt-3 flex-wrap">
                    {(['boleto', 'relatorio_fotos', 'medicao_assinada', 'outro'] as TipoAnexo[]).map(t => (
                      <Badge key={t} className="bg-[#1E293B] text-[#94A3B8] border-[#1E293B] text-[10px]">{t.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Revisão */}
        {step === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#F1F5F9]">Resumo da Medição</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs text-[#475569] mb-0.5">Tipo</p>
                    <p className="font-medium text-[#F1F5F9]">{TIPO_MEDICAO_LABELS[tipo] ?? tipo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] mb-0.5">Período</p>
                    <p className="font-medium text-[#F1F5F9]">{periodo}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-[#475569] mb-0.5">Solicitante</p>
                    <p className="font-medium text-[#F1F5F9]">{userNome} {userEmail && <span className="text-[#475569] text-xs">({userEmail})</span>}</p>
                  </div>
                </div>
                <div className="border-t border-[#1E293B] pt-3 flex justify-between items-center">
                  <span className="font-semibold text-[#F1F5F9]">Valor Total da Medição</span>
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

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
            ← Anterior
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={
                (step === 1 && (!periodo || !tipo)) ||
                (step === 2 && !itensFilled)
              }
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
