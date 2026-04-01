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
import { ArrowLeft, Upload, Trash2, Plus, FileText, AlertCircle, Info, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoMedicao, TipoAnexo } from '@/types'

type AnexoItem = {
  id: string
  nome: string
  tipo: TipoAnexo
  tamanho: string
}

export default function NovaMedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [estrutura, setEstrutura] = useState<any[]>([])
  const [loadingEstrutura, setLoadingEstrutura] = useState(true)

  // Step 1: Dados gerais
  const [periodo, setPeriodo] = useState('')
  const [tipo, setTipo] = useState<TipoMedicao | ''>('')
  const [solicitante, setSolicitante] = useState('')
  const [emailSolicitante, setEmailSolicitante] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Step 2: Itens — percentual por detalhamento (0 | 25 | 50 | 100)
  const [percentualMedicao, setPercentualMedicao] = useState<Record<string, number>>({})

  // Step 3: Anexos e NFs
  const [anexos, setAnexos] = useState<AnexoItem[]>([])
  const [novasNFs, setNovasNFs] = useState<{ numero: string; emitente: string; valor: string; data: string }[]>([])

  useEffect(() => {
    fetch(`/api/contratos/${contratoId}/estrutura`)
      .then(r => r.json())
      .then(data => setEstrutura(data))
      .finally(() => setLoadingEstrutura(false))
  }, [contratoId])

  const TIPO_MEDICAO_LABELS: Record<TipoMedicao, string> = {
    servico: 'Serviço (Mão de Obra)',
    faturamento_direto: 'Faturamento Direto (Material)',
    misto: 'Misto (Serviço + Material)',
  }

  function setPercentual(detId: string, pct: number) {
    setPercentualMedicao(prev => ({ ...prev, [detId]: pct }))
  }

  function calcularValorTotal() {
    let total = 0
    for (const grupo of estrutura) {
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
      for (const grupo of estrutura) {
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
          solicitante_nome: solicitante,
          solicitante_email: emailSolicitante,
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
            { n: 3, label: 'Anexos e NFs' },
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Período de Referência *</Label>
                  <Input
                    type="month"
                    value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                    className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Tipo de Medição *</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v as TipoMedicao)}>
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
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Nome do Solicitante *</Label>
                  <Input
                    placeholder="Nome completo"
                    value={solicitante}
                    onChange={e => setSolicitante(e.target.value)}
                    className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">E-mail do Solicitante *</Label>
                  <Input
                    type="email"
                    placeholder="email@empresa.com.br"
                    value={emailSolicitante}
                    onChange={e => setEmailSolicitante(e.target.value)}
                    className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
                  />
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
              <span>Selecione o percentual executado neste período para cada item: <strong className="text-blue-300">0% · 25% · 50% · 100%</strong>. Itens em 0% não serão incluídos.</span>
            </div>

            {loadingEstrutura ? (
              <div className="flex items-center justify-center py-16 text-[#475569]">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
                <span>Carregando estrutura...</span>
              </div>
            ) : (
              estrutura.map(grupo => (
                <Card key={grupo.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-[#F1F5F9]">
                      <span className="text-[#475569] font-mono">{grupo.codigo}</span>
                      {grupo.nome}
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">
                        {grupo.tipo_medicao === 'misto' ? 'Misto' : grupo.tipo_medicao}
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
                                {/* 0 / 25 / 50 / 100 % selector */}
                                <div className="col-span-4 flex gap-1">
                                  {[0, 25, 50, 100].map(p => (
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
            {/* Upload */}
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
                    {(['nota_fiscal', 'boleto', 'relatorio_fotos', 'medicao_assinada', 'outro'] as TipoAnexo[]).map(t => (
                      <Badge key={t} className="bg-[#1E293B] text-[#94A3B8] border-[#1E293B] text-[10px]">{t.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* NFs - Faturamento Direto */}
            {(tipo === 'faturamento_direto' || tipo === 'misto') && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm text-[#F1F5F9]">Notas Fiscais — Faturamento Direto</CardTitle>
                  <Button size="sm" variant="outline" onClick={adicionarNF}>
                    <Plus className="w-3 h-3" />
                    Adicionar NF
                  </Button>
                </CardHeader>
                <CardContent>
                  {novasNFs.length === 0 ? (
                    <div className="text-center py-6 text-[#475569]">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma NF adicionada</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={adicionarNF}>
                        <Plus className="w-3 h-3" />
                        Adicionar primeira NF
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {novasNFs.map((nf, idx) => (
                        <div key={idx} className="grid grid-cols-5 gap-2 p-3 bg-[#0D1421] border border-[#1E293B] rounded-lg">
                          <div className="space-y-1">
                            <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Número NF *</Label>
                            <Input className="h-7 text-xs bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]" placeholder="000000" value={nf.numero}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, numero: e.target.value } : n))} />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Emitente *</Label>
                            <Input className="h-7 text-xs bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]" placeholder="Razão social do fornecedor" value={nf.emitente}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, emitente: e.target.value } : n))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Valor *</Label>
                            <Input className="h-7 text-xs bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]" type="number" placeholder="0,00" value={nf.valor}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, valor: e.target.value } : n))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Emissão *</Label>
                            <div className="flex gap-1">
                              <Input className="h-7 text-xs bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]" type="date" value={nf.data}
                                onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, data: e.target.value } : n))} />
                              <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0 text-red-400 hover:text-red-300 hover:bg-red-900/20" onClick={() => removerNF(idx)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
                    <p className="text-xs text-[#475569] mb-0.5">Período</p>
                    <p className="font-medium text-[#F1F5F9]">{periodo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] mb-0.5">Tipo</p>
                    <p className="font-medium text-[#F1F5F9]">{tipo ? TIPO_MEDICAO_LABELS[tipo as TipoMedicao] : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] mb-0.5">Solicitante</p>
                    <p className="font-medium text-[#F1F5F9]">{solicitante}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] mb-0.5">E-mail</p>
                    <p className="font-medium text-[#F1F5F9]">{emailSolicitante}</p>
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
                  <li>Os documentos e NFs estão anexados</li>
                  <li>A medição será enviada para aprovação da equipe FIP</li>
                  <li>Um e-mail será gerado automaticamente para os aprovadores</li>
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
                (step === 1 && (!periodo || !tipo || !solicitante || !emailSolicitante)) ||
                (step === 2 && !itensFilled)
              }
            >
              Próximo →
            </Button>
          ) : (
            <Button onClick={submeter} loading={saving} variant="success">
              Submeter para Aprovação
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
