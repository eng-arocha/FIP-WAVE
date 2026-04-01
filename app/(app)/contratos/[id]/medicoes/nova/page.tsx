'use client'

import { useState, use } from 'react'
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
import { ArrowLeft, Upload, Trash2, Plus, FileText, AlertCircle, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoMedicao, TipoAnexo } from '@/types'

// Estrutura do contrato para lançamento de itens
const ESTRUTURA = [
  {
    id: '1', codigo: '1.0', nome: 'Instalações Elétricas', tipo: 'misto',
    tarefas: [
      {
        id: 't1', codigo: '1.1', nome: 'Quadros de Distribuição',
        detalhamentos: [
          { id: 'd1', codigo: '1.1.1', descricao: 'QDC - Quadro Distribuição Circuitos', unidade: 'un', qtd_contratada: 45, valor_unit: 3200, qtd_acumulada: 12 },
          { id: 'd2', codigo: '1.1.2', descricao: 'QGBT - Quadro Geral Baixa Tensão', unidade: 'un', qtd_contratada: 3, valor_unit: 28000, qtd_acumulada: 1 },
        ]
      },
      {
        id: 't2', codigo: '1.2', nome: 'Eletrodutos e Cabos',
        detalhamentos: [
          { id: 'd3', codigo: '1.2.1', descricao: 'Eletroduto flexível 3/4"', unidade: 'm', qtd_contratada: 8500, valor_unit: 8.5, qtd_acumulada: 2100 },
          { id: 'd4', codigo: '1.2.2', descricao: 'Cabo 2,5mm² 450/750V', unidade: 'm', qtd_contratada: 25000, valor_unit: 4.2, qtd_acumulada: 6500 },
        ]
      }
    ]
  },
  {
    id: '2', codigo: '2.0', nome: 'Instalações Hidráulicas', tipo: 'misto',
    tarefas: [
      {
        id: 't3', codigo: '2.1', nome: 'Tubulações',
        detalhamentos: [
          { id: 'd5', codigo: '2.1.1', descricao: 'Tubo PVC 50mm água fria', unidade: 'm', qtd_contratada: 3200, valor_unit: 18, qtd_acumulada: 800 },
          { id: 'd6', codigo: '2.1.2', descricao: 'Tubo CPVC 22mm água quente', unidade: 'm', qtd_contratada: 1800, valor_unit: 32, qtd_acumulada: 450 },
        ]
      }
    ]
  },
]

type AnexoItem = {
  id: string
  nome: string
  tipo: TipoAnexo
  tamanho: string
}

type ItemMedicao = {
  detalhamento_id: string
  quantidade: number
}

export default function NovaMedicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1: Dados gerais
  const [periodo, setPeriodo] = useState('')
  const [tipo, setTipo] = useState<TipoMedicao | ''>('')
  const [solicitante, setSolicitante] = useState('')
  const [emailSolicitante, setEmailSolicitante] = useState('')
  const [observacoes, setObservacoes] = useState('')

  // Step 2: Itens
  const [itensMedicao, setItensMedicao] = useState<Record<string, number>>({})

  // Step 3: Anexos e NFs
  const [anexos, setAnexos] = useState<AnexoItem[]>([])
  const [novasNFs, setNovasNFs] = useState<{ numero: string; emitente: string; valor: string; data: string }[]>([])

  const TIPO_MEDICAO_LABELS: Record<TipoMedicao, string> = {
    servico: 'Serviço (Mão de Obra)',
    faturamento_direto: 'Faturamento Direto (Material)',
    misto: 'Misto (Serviço + Material)',
  }

  function setQtd(detId: string, qtd: number) {
    setItensMedicao(prev => ({ ...prev, [detId]: qtd }))
  }

  function calcularValorTotal() {
    let total = 0
    for (const grupo of ESTRUTURA) {
      for (const tarefa of grupo.tarefas) {
        for (const det of tarefa.detalhamentos) {
          const qtd = itensMedicao[det.id] || 0
          total += qtd * det.valor_unit
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
    await new Promise(r => setTimeout(r, 1500))
    setSaving(false)
    router.push(`/contratos/${contratoId}`)
  }

  const totalMedicao = calcularValorTotal()
  const itensFilled = Object.values(itensMedicao).some(v => v > 0)

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
                step === s.n ? 'bg-[#1e3a5f] text-white' :
                step > s.n ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-400'
              }`}>
                <span>{s.n}</span>
                <span>{s.label}</span>
              </div>
              {i < 3 && <div className="w-6 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Dados Gerais */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dados da Medição</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Período de Referência *</Label>
                  <Input
                    type="month"
                    value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Medição *</Label>
                  <Select value={tipo} onValueChange={v => setTipo(v as TipoMedicao)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_MEDICAO_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome do Solicitante *</Label>
                  <Input
                    placeholder="Nome completo"
                    value={solicitante}
                    onChange={e => setSolicitante(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail do Solicitante *</Label>
                  <Input
                    type="email"
                    placeholder="email@empresa.com.br"
                    value={emailSolicitante}
                    onChange={e => setEmailSolicitante(e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Observações</Label>
                  <Textarea
                    placeholder="Informações adicionais sobre a medição..."
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Itens */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Informe as quantidades medidas neste período para cada item. Apenas os itens com quantidade &gt; 0 serão incluídos na medição.</span>
            </div>

            {ESTRUTURA.map(grupo => (
              <Card key={grupo.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-gray-400 font-mono">{grupo.codigo}</span>
                    {grupo.nome}
                    <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-[10px]">
                      {grupo.tipo === 'misto' ? 'Misto' : grupo.tipo}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {grupo.tarefas.map(tarefa => (
                    <div key={tarefa.id} className="mb-4 last:mb-0">
                      <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                        <span className="font-mono text-gray-400">{tarefa.codigo}</span>
                        {tarefa.nome}
                      </p>
                      <div className="space-y-2">
                        {tarefa.detalhamentos.map(det => {
                          const qtd = itensMedicao[det.id] || 0
                          const saldo = det.qtd_contratada - det.qtd_acumulada
                          const valor = qtd * det.valor_unit
                          return (
                            <div key={det.id} className={`grid grid-cols-12 gap-2 p-2 rounded-lg text-xs items-center ${qtd > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                              <div className="col-span-1 text-gray-400 font-mono">{det.codigo}</div>
                              <div className="col-span-4 text-gray-700 font-medium">{det.descricao}</div>
                              <div className="col-span-1 text-center text-gray-500">{det.unidade}</div>
                              <div className="col-span-2 text-center">
                                <span className="text-gray-400">Saldo: </span>
                                <span className="font-medium text-gray-700">{saldo.toLocaleString('pt-BR')}</span>
                              </div>
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max={saldo}
                                  step="0.001"
                                  className="h-7 text-xs text-center"
                                  placeholder="0"
                                  value={qtd || ''}
                                  onChange={e => setQtd(det.id, parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div className="col-span-2 text-right font-semibold text-[#1e3a5f]">
                                {valor > 0 ? formatCurrency(valor) : '—'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}

            {/* Subtotal */}
            <Card className="border-[#1e3a5f] bg-[#1e3a5f]/5">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="font-semibold text-gray-700">Total da Medição</span>
                <span className="text-2xl font-bold text-[#1e3a5f]">{formatCurrency(totalMedicao)}</span>
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
                <CardTitle className="text-sm">Documentos e Comprovantes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1e3a5f] transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 font-medium">Clique para fazer upload ou arraste arquivos</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG, XLS • Máximo 10MB por arquivo</p>
                  <div className="flex justify-center gap-2 mt-3 flex-wrap">
                    {(['nota_fiscal', 'boleto', 'relatorio_fotos', 'medicao_assinada', 'outro'] as TipoAnexo[]).map(t => (
                      <Badge key={t} className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">{t.replace('_', ' ')}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* NFs - Faturamento Direto */}
            {(tipo === 'faturamento_direto' || tipo === 'misto') && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Notas Fiscais — Faturamento Direto</CardTitle>
                  <Button size="sm" variant="outline" onClick={adicionarNF}>
                    <Plus className="w-3 h-3" />
                    Adicionar NF
                  </Button>
                </CardHeader>
                <CardContent>
                  {novasNFs.length === 0 ? (
                    <div className="text-center py-6 text-gray-400">
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
                        <div key={idx} className="grid grid-cols-5 gap-2 p-3 bg-gray-50 rounded-lg">
                          <div className="space-y-1">
                            <Label className="text-xs">Número NF *</Label>
                            <Input className="h-7 text-xs" placeholder="000000" value={nf.numero}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, numero: e.target.value } : n))} />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Emitente *</Label>
                            <Input className="h-7 text-xs" placeholder="Razão social do fornecedor" value={nf.emitente}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, emitente: e.target.value } : n))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Valor *</Label>
                            <Input className="h-7 text-xs" type="number" placeholder="0,00" value={nf.valor}
                              onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, valor: e.target.value } : n))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Emissão *</Label>
                            <div className="flex gap-1">
                              <Input className="h-7 text-xs" type="date" value={nf.data}
                                onChange={e => setNovasNFs(prev => prev.map((n, i) => i === idx ? { ...n, data: e.target.value } : n))} />
                              <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0 text-red-400 hover:text-red-600" onClick={() => removerNF(idx)}>
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
                <CardTitle className="text-sm">Resumo da Medição</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Período</p>
                    <p className="font-medium">{periodo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Tipo</p>
                    <p className="font-medium">{tipo ? TIPO_MEDICAO_LABELS[tipo as TipoMedicao] : ''}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Solicitante</p>
                    <p className="font-medium">{solicitante}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">E-mail</p>
                    <p className="font-medium">{emailSolicitante}</p>
                  </div>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-semibold text-gray-700">Valor Total da Medição</span>
                  <span className="text-2xl font-bold text-[#1e3a5f]">{formatCurrency(totalMedicao)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-700">
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
