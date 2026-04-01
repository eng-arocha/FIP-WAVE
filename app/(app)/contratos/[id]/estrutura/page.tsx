'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Layers } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { TipoMedicao } from '@/types'

const TIPO_MEDICAO_LABELS: Record<TipoMedicao, string> = {
  servico: 'Serviço',
  faturamento_direto: 'Fat. Direto',
  misto: 'Misto',
}
const TIPO_MEDICAO_COLORS: Record<TipoMedicao, string> = {
  servico: 'bg-purple-100 text-purple-700 border-purple-200',
  faturamento_direto: 'bg-blue-100 text-blue-700 border-blue-200',
  misto: 'bg-teal-100 text-teal-700 border-teal-200',
}

const MOCK_ESTRUTURA = [
  {
    id: '1', codigo: '1.0', nome: 'Instalações Elétricas', tipo_medicao: 'misto' as TipoMedicao,
    valor_contratado: 7200000, valor_medido: 1440000, expanded: true,
    tarefas: [
      {
        id: 't1', codigo: '1.1', nome: 'Quadros de Distribuição', valor_total: 1500000,
        detalhamentos: [
          { id: 'd1', codigo: '1.1.1', descricao: 'QDC - Quadro Distribuição Circuitos', unidade: 'un', qtd_contratada: 45, valor_unitario: 3200, valor_total: 144000, qtd_medida: 12 },
          { id: 'd2', codigo: '1.1.2', descricao: 'QGBT - Quadro Geral Baixa Tensão', unidade: 'un', qtd_contratada: 3, valor_unitario: 28000, valor_total: 84000, qtd_medida: 1 },
        ]
      },
      {
        id: 't2', codigo: '1.2', nome: 'Eletrodutos e Cabos', valor_total: 5700000,
        detalhamentos: [
          { id: 'd3', codigo: '1.2.1', descricao: 'Eletroduto flexível 3/4"', unidade: 'm', qtd_contratada: 8500, valor_unitario: 8.5, valor_total: 72250, qtd_medida: 2100 },
          { id: 'd4', codigo: '1.2.2', descricao: 'Cabo 2,5mm² 450/750V', unidade: 'm', qtd_contratada: 25000, valor_unitario: 4.2, valor_total: 105000, qtd_medida: 6500 },
        ]
      }
    ]
  },
  {
    id: '2', codigo: '2.0', nome: 'Instalações Hidráulicas', tipo_medicao: 'misto' as TipoMedicao,
    valor_contratado: 5400000, valor_medido: 972000, expanded: false,
    tarefas: [
      {
        id: 't3', codigo: '2.1', nome: 'Tubulações', valor_total: 5400000,
        detalhamentos: [
          { id: 'd5', codigo: '2.1.1', descricao: 'Tubo PVC 50mm água fria', unidade: 'm', qtd_contratada: 3200, valor_unitario: 18, valor_total: 57600, qtd_medida: 800 },
          { id: 'd6', codigo: '2.1.2', descricao: 'Tubo CPVC 22mm água quente', unidade: 'm', qtd_contratada: 1800, valor_unitario: 32, valor_total: 57600, qtd_medida: 450 },
        ]
      }
    ]
  },
]

export default function EstruturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const [estrutura, setEstrutura] = useState(MOCK_ESTRUTURA)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '1': true })
  const [modalGrupo, setModalGrupo] = useState(false)
  const [modalTarefa, setModalTarefa] = useState<string | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formGrupo, setFormGrupo] = useState({ codigo: '', nome: '', tipo_medicao: 'misto' as TipoMedicao, valor_contratado: '' })
  const [formTarefa, setFormTarefa] = useState({ codigo: '', nome: '', valor_total: '' })
  const [formDetalhe, setFormDetalhe] = useState({ codigo: '', descricao: '', unidade: '', qtd_contratada: '', valor_unitario: '' })

  const toggleExpanded = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  async function salvarGrupo() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    setModalGrupo(false)
    setFormGrupo({ codigo: '', nome: '', tipo_medicao: 'misto', valor_contratado: '' })
  }

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Estrutura do Contrato"
        subtitle="Grupos Macro → Tarefas → Detalhamentos"
        actions={
          <div className="flex gap-2">
            <Link href={`/contratos/${contratoId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <Button size="sm" onClick={() => setModalGrupo(true)}>
              <Plus className="w-4 h-4" />
              Novo Grupo Macro
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-3">
        {estrutura.map(grupo => (
          <Card key={grupo.id}>
            {/* Grupo Macro Header */}
            <CardContent className="p-0">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpanded(grupo.id)}
              >
                {expanded[grupo.id] ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-gray-400">{grupo.codigo}</span>
                    <span className="font-bold text-gray-900">{grupo.nome}</span>
                    <Badge className={TIPO_MEDICAO_COLORS[grupo.tipo_medicao]}>
                      {TIPO_MEDICAO_LABELS[grupo.tipo_medicao]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <Progress
                      value={(grupo.valor_medido / grupo.valor_contratado) * 100}
                      className="h-1.5 w-48"
                    />
                    <span className="text-xs text-gray-500">
                      {formatPercent((grupo.valor_medido / grupo.valor_contratado) * 100)} medido
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold text-gray-900">{formatCurrency(grupo.valor_contratado)}</p>
                  <p className="text-xs text-gray-400">{grupo.tarefas.length} tarefa(s)</p>
                </div>
                <Button variant="ghost" size="icon" className="w-7 h-7" onClick={e => { e.stopPropagation() }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Tarefas */}
              {expanded[grupo.id] && (
                <div className="border-t border-gray-100">
                  {grupo.tarefas.map(tarefa => (
                    <div key={tarefa.id} className="border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3 px-8 py-3 bg-gray-50/50">
                        <span className="font-mono text-xs text-gray-400">{tarefa.codigo}</span>
                        <span className="font-semibold text-sm text-gray-800 flex-1">{tarefa.nome}</span>
                        <span className="text-xs font-medium text-gray-600">{formatCurrency(tarefa.valor_total)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setModalDetalhe(tarefa.id)}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Detalhe
                        </Button>
                      </div>

                      {/* Detalhamentos */}
                      <div className="px-12 py-2 space-y-1">
                        {tarefa.detalhamentos.map(det => {
                          const pct = (det.qtd_medida / det.qtd_contratada) * 100
                          return (
                            <div key={det.id} className="grid grid-cols-12 gap-2 py-1.5 px-2 rounded hover:bg-gray-50 text-xs items-center">
                              <span className="col-span-1 font-mono text-gray-400">{det.codigo}</span>
                              <span className="col-span-4 text-gray-700">{det.descricao}</span>
                              <span className="col-span-1 text-center text-gray-500">{det.unidade}</span>
                              <span className="col-span-2 text-right">
                                <span className="text-gray-400">{det.qtd_medida.toLocaleString('pt-BR')}</span>
                                <span className="text-gray-300"> / </span>
                                <span className="text-gray-600">{det.qtd_contratada.toLocaleString('pt-BR')}</span>
                              </span>
                              <div className="col-span-2">
                                <Progress value={pct} className="h-1.5" />
                              </div>
                              <span className="col-span-2 text-right font-medium text-gray-700">{formatCurrency(det.valor_total)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Add tarefa */}
                  <div className="px-8 py-2">
                    <Button variant="ghost" size="sm" className="text-xs text-gray-400" onClick={() => setModalTarefa(grupo.id)}>
                      <Plus className="w-3 h-3 mr-1" />
                      Adicionar Tarefa
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Novo Grupo Macro */}
      <Dialog open={modalGrupo} onOpenChange={setModalGrupo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#1e3a5f]" />
              Novo Grupo Macro
            </DialogTitle>
            <DialogDescription>Nível 1 da estrutura hierárquica do contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Código *</Label>
                <Input placeholder="Ex: 6.0" value={formGrupo.codigo} onChange={e => setFormGrupo(f => ({ ...f, codigo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Medição *</Label>
                <Select value={formGrupo.tipo_medicao} onValueChange={v => setFormGrupo(f => ({ ...f, tipo_medicao: v as TipoMedicao }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="faturamento_direto">Faturamento Direto</SelectItem>
                    <SelectItem value="misto">Misto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do Grupo *</Label>
                <Input placeholder="Ex: Instalações de Proteção contra Incêndio" value={formGrupo.nome} onChange={e => setFormGrupo(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Valor Contratado (R$) *</Label>
                <Input type="number" placeholder="0,00" value={formGrupo.valor_contratado} onChange={e => setFormGrupo(f => ({ ...f, valor_contratado: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalGrupo(false)}>Cancelar</Button>
            <Button onClick={salvarGrupo} loading={saving} disabled={!formGrupo.codigo || !formGrupo.nome}>
              Adicionar Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Novo Detalhamento */}
      <Dialog open={!!modalDetalhe} onOpenChange={() => setModalDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Detalhamento</DialogTitle>
            <DialogDescription>Nível 3 da estrutura — item mensurável da medição.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input placeholder="Ex: 1.1.3" value={formDetalhe.codigo} onChange={e => setFormDetalhe(f => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade *</Label>
              <Input placeholder="un, m, m², kg..." value={formDetalhe.unidade} onChange={e => setFormDetalhe(f => ({ ...f, unidade: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Descrição *</Label>
              <Input placeholder="Descrição do item" value={formDetalhe.descricao} onChange={e => setFormDetalhe(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantidade Contratada *</Label>
              <Input type="number" placeholder="0" value={formDetalhe.qtd_contratada} onChange={e => setFormDetalhe(f => ({ ...f, qtd_contratada: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Unitário (R$) *</Label>
              <Input type="number" placeholder="0,00" value={formDetalhe.valor_unitario} onChange={e => setFormDetalhe(f => ({ ...f, valor_unitario: e.target.value }))} />
            </div>
            {formDetalhe.qtd_contratada && formDetalhe.valor_unitario && (
              <div className="col-span-2 p-2 bg-blue-50 rounded text-xs text-blue-700 text-center">
                Valor Total: <strong>{formatCurrency(parseFloat(formDetalhe.qtd_contratada) * parseFloat(formDetalhe.valor_unitario))}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhe(null)}>Cancelar</Button>
            <Button disabled={!formDetalhe.codigo || !formDetalhe.descricao}>Adicionar Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
