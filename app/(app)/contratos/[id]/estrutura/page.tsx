'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Layers, Loader2, ArrowUpDown, Filter } from 'lucide-react'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { TipoMedicao } from '@/types'

type SortKey = 'padrao' | 'valor_global_desc' | 'valor_global_asc' | 'valor_medido_desc' | 'valor_medido_asc' | 'saldo_desc' | 'saldo_asc'
type FilterTipo = 'todos' | TipoMedicao

const TIPO_MEDICAO_LABELS: Record<TipoMedicao, string> = {
  servico: 'Serviço',
  faturamento_direto: 'Material',
  misto: 'Total',
}
const TIPO_MEDICAO_COLORS: Record<TipoMedicao, string> = {
  servico: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  faturamento_direto: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  misto: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
}

export default function EstruturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const [estrutura, setEstrutura] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sortBy, setSortBy] = useState<SortKey>('padrao')
  const [filterTipo, setFilterTipo] = useState<FilterTipo>('todos')
  const [modalGrupo, setModalGrupo] = useState(false)
  const [modalTarefa, setModalTarefa] = useState<string | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formGrupo, setFormGrupo] = useState({ codigo: '', nome: '', tipo_medicao: 'misto' as TipoMedicao, valor_contratado: '' })
  const [formTarefa, setFormTarefa] = useState({ codigo: '', nome: '', valor_total: '' })
  const [formDetalhe, setFormDetalhe] = useState({ codigo: '', descricao: '', unidade: '', qtd_contratada: '', valor_unitario: '' })

  const gruposExibidos = useMemo(() => {
    let list = [...estrutura]

    // Filtro por tipo
    if (filterTipo !== 'todos') {
      list = list.filter(g => g.tipo_medicao === filterTipo)
    }

    // Ordenação
    list.sort((a, b) => {
      switch (sortBy) {
        case 'padrao':
          return parseFloat(a.codigo) - parseFloat(b.codigo)
        case 'valor_global_desc':
          return b.valor_contratado - a.valor_contratado
        case 'valor_global_asc':
          return a.valor_contratado - b.valor_contratado
        case 'valor_medido_desc':
          return (b.valor_medido ?? 0) - (a.valor_medido ?? 0)
        case 'valor_medido_asc':
          return (a.valor_medido ?? 0) - (b.valor_medido ?? 0)
        case 'saldo_desc':
          return (b.saldo ?? b.valor_contratado) - (a.saldo ?? a.valor_contratado)
        case 'saldo_asc':
          return (a.saldo ?? a.valor_contratado) - (b.saldo ?? b.valor_contratado)
        default:
          return parseFloat(a.codigo) - parseFloat(b.codigo)
      }
    })

    return list
  }, [estrutura, sortBy, filterTipo])

  async function loadEstrutura() {
    try {
      const res = await fetch(`/api/contratos/${contratoId}/estrutura`)
      const data = await res.json()
      setEstrutura(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEstrutura()
  }, [contratoId])

  const toggleExpanded = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  async function salvarGrupo() {
    setSaving(true)
    try {
      await fetch(`/api/contratos/${contratoId}/grupos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: formGrupo.codigo,
          nome: formGrupo.nome,
          tipo_medicao: formGrupo.tipo_medicao,
          valor_contratado: parseFloat(formGrupo.valor_contratado),
          ordem: estrutura.length + 1,
        }),
      })
      await loadEstrutura()
      setModalGrupo(false)
      setFormGrupo({ codigo: '', nome: '', tipo_medicao: 'misto', valor_contratado: '' })
    } finally {
      setSaving(false)
    }
  }

  async function salvarTarefa() {
    if (!modalTarefa) return
    setSaving(true)
    try {
      await fetch(`/api/contratos/${contratoId}/estrutura/tarefas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupo_id: modalTarefa,
          codigo: formTarefa.codigo,
          nome: formTarefa.nome,
          valor_total: parseFloat(formTarefa.valor_total),
        }),
      })
      await loadEstrutura()
      setModalTarefa(null)
      setFormTarefa({ codigo: '', nome: '', valor_total: '' })
    } finally {
      setSaving(false)
    }
  }

  async function salvarDetalhe() {
    if (!modalDetalhe) return
    setSaving(true)
    try {
      await fetch(`/api/contratos/${contratoId}/estrutura/detalhamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarefa_id: modalDetalhe,
          codigo: formDetalhe.codigo,
          descricao: formDetalhe.descricao,
          unidade: formDetalhe.unidade,
          quantidade_contratada: parseFloat(formDetalhe.qtd_contratada),
          valor_unitario: parseFloat(formDetalhe.valor_unitario),
        }),
      })
      await loadEstrutura()
      setModalDetalhe(null)
      setFormDetalhe({ codigo: '', descricao: '', unidade: '', qtd_contratada: '', valor_unitario: '' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1">
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

      <div className="p-3 sm:p-6 space-y-3">
        {/* Barra de filtros e ordenação */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Ordenar:</span>
          </div>
          <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 text-xs w-52 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="padrao">Padrão (1.0 → 19.0)</SelectItem>
              <SelectItem value="valor_global_desc">Valor Global — Maior primeiro</SelectItem>
              <SelectItem value="valor_global_asc">Valor Global — Menor primeiro</SelectItem>
              <SelectItem value="valor_medido_desc">Valor Medido — Maior primeiro</SelectItem>
              <SelectItem value="valor_medido_asc">Valor Medido — Menor primeiro</SelectItem>
              <SelectItem value="saldo_desc">Saldo a Medir — Maior primeiro</SelectItem>
              <SelectItem value="saldo_asc">Saldo a Medir — Menor primeiro</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] ml-2">
            <Filter className="w-3.5 h-3.5" />
            <span>Tipo:</span>
          </div>
          <Select value={filterTipo} onValueChange={v => setFilterTipo(v as FilterTipo)}>
            <SelectTrigger className="h-8 text-xs w-44 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="misto">Total (Mat. + Serviço)</SelectItem>
              <SelectItem value="servico">Serviço</SelectItem>
              <SelectItem value="faturamento_direto">Material (Fat. Direto)</SelectItem>
            </SelectContent>
          </Select>

          {(sortBy !== 'padrao' || filterTipo !== 'todos') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
              onClick={() => { setSortBy('padrao'); setFilterTipo('todos') }}
            >
              Limpar filtros
            </Button>
          )}

          <span className="ml-auto text-xs text-[var(--text-3)]">
            {gruposExibidos.length} de {estrutura.length} grupos
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-blue-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Carregando estrutura...</span>
          </div>
        ) : (
          gruposExibidos.map(grupo => (
            <Card key={grupo.id}>
              {/* Grupo Macro Header */}
              <CardContent className="p-0">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--surface-1)] transition-colors"
                  onClick={() => toggleExpanded(grupo.id)}
                >
                  {expanded[grupo.id] ? (
                    <ChevronDown className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-[var(--text-3)]">{grupo.codigo}</span>
                      <span className="font-bold text-[var(--text-1)]">{grupo.nome}</span>
                      <Badge className={TIPO_MEDICAO_COLORS[grupo.tipo_medicao as TipoMedicao]}>
                        {TIPO_MEDICAO_LABELS[grupo.tipo_medicao as TipoMedicao]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <Progress
                        value={grupo.valor_contratado > 0 ? ((grupo.valor_medido || 0) / grupo.valor_contratado) * 100 : 0}
                        className="h-1.5 w-48"
                      />
                      <span className="text-xs text-[var(--text-3)]">
                        {formatPercent(grupo.valor_contratado > 0 ? ((grupo.valor_medido || 0) / grupo.valor_contratado) * 100 : 0)} medido
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-sm min-w-[160px]">
                    <p className="font-bold text-[var(--text-1)]">{formatCurrency(grupo.valor_contratado)}</p>
                    <p className="text-xs text-[var(--text-3)]">Medido: {formatCurrency(grupo.valor_medido ?? 0)}</p>
                    <p className="text-xs text-emerald-500/80">Saldo: {formatCurrency(grupo.saldo ?? grupo.valor_contratado)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={e => { e.stopPropagation() }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Tarefas */}
                {expanded[grupo.id] && (
                  <div className="border-t border-[var(--border)]">
                    {(grupo.tarefas || []).map((tarefa: any) => (
                      <div key={tarefa.id} className="border-b border-[var(--border)] last:border-0">
                        <div className="flex items-center gap-3 px-8 py-3 bg-[var(--surface-1)]">
                          <span className="font-mono text-xs text-[var(--text-3)]">{tarefa.codigo}</span>
                          <span className="font-semibold text-sm text-[var(--text-2)] flex-1">{tarefa.nome}</span>
                          <span className="text-xs font-medium text-[var(--text-2)]">{formatCurrency(tarefa.valor_total)}</span>
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

                        {/* Detalhamentos — colunas conforme planilha oficial:
                            CÓDIGO / DESCRIÇÃO / LOCAL / QTDE / UNID /
                            PR. MAT / PR. M.O. / SUBTOT MAT / SUBTOT M.O. / TOTAL */}
                        <div className="px-12 py-2">
                          {/* Header de colunas (só mostra quando tem detalhamentos) */}
                          {(tarefa.detalhamentos || []).length > 0 && (
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
                          )}
                          {(tarefa.detalhamentos || []).map((det: any) => {
                            const qtd = Number(det.quantidade_contratada || 0)
                            const prMat = Number(det.valor_material_unit ?? 0)
                            const prMo  = Number(det.valor_servico_unit ?? 0)
                            const subMat = Number(det.subtotal_material ?? qtd * prMat)
                            const subMo  = Number(det.subtotal_mo ?? qtd * prMo)
                            const total = subMat + subMo
                            // Destaque quando filtro ativo ressalta uma das colunas
                            const colMatActive = filterTipo === 'faturamento_direto'
                            const colMoActive  = filterTipo === 'servico'
                            return (
                              <div
                                key={det.id}
                                className="grid grid-cols-[40px_1fr_80px_50px_40px_90px_90px_100px_100px_100px] gap-2 py-1.5 px-2 rounded hover:bg-[var(--surface-1)] text-xs items-center"
                              >
                                <span className="font-mono text-[var(--text-3)]">{det.codigo}</span>
                                <span className="text-[var(--text-2)] truncate" title={det.descricao}>{det.descricao}</span>
                                <span className="text-[10px] text-[var(--text-3)] truncate" title={det.local || ''}>{det.local || '—'}</span>
                                <span className="text-right tabular-nums text-[var(--text-2)]">{qtd.toLocaleString('pt-BR')}</span>
                                <span className="text-center text-[var(--text-3)]">{det.unidade || 'UN'}</span>
                                <span className={`text-right tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-3)]'}`}>
                                  {formatCurrency(prMat)}
                                </span>
                                <span className={`text-right tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-3)]'}`}>
                                  {formatCurrency(prMo)}
                                </span>
                                <span className={`text-right tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-2)]'}`}>
                                  {formatCurrency(subMat)}
                                </span>
                                <span className={`text-right tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-2)]'}`}>
                                  {formatCurrency(subMo)}
                                </span>
                                <span className="text-right tabular-nums font-semibold text-[var(--text-1)]">
                                  {formatCurrency(total)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Add tarefa */}
                    <div className="px-8 py-2">
                      <Button variant="ghost" size="sm" className="text-xs text-[var(--text-3)]" onClick={() => setModalTarefa(grupo.id)}>
                        <Plus className="w-3 h-3 mr-1" />
                        Adicionar Tarefa
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Modal Novo Grupo Macro */}
      <Dialog open={modalGrupo} onOpenChange={setModalGrupo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              Novo Grupo Macro
            </DialogTitle>
            <DialogDescription>Nível 1 da estrutura hierárquica do contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[var(--text-2)]">Código *</Label>
                <Input placeholder="Ex: 6.0" value={formGrupo.codigo} onChange={e => setFormGrupo(f => ({ ...f, codigo: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[var(--text-2)]">Tipo de Medição *</Label>
                <Select value={formGrupo.tipo_medicao} onValueChange={v => setFormGrupo(f => ({ ...f, tipo_medicao: v as TipoMedicao }))}>
                  <SelectTrigger className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="faturamento_direto">Material (Fat. Direto)</SelectItem>
                    <SelectItem value="misto">Total (Mat. + Serviço)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[var(--text-2)]">Nome do Grupo *</Label>
                <Input placeholder="Ex: Instalações de Proteção contra Incêndio" value={formGrupo.nome} onChange={e => setFormGrupo(f => ({ ...f, nome: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-[var(--text-2)]">Valor Contratado (R$) *</Label>
                <Input type="number" placeholder="0,00" value={formGrupo.valor_contratado} onChange={e => setFormGrupo(f => ({ ...f, valor_contratado: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
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

      {/* Modal Nova Tarefa */}
      <Dialog open={!!modalTarefa} onOpenChange={() => setModalTarefa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>Nível 2 da estrutura hierárquica do contrato.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[var(--text-2)]">Código *</Label>
              <Input placeholder="Ex: 1.3" value={formTarefa.codigo} onChange={e => setFormTarefa(f => ({ ...f, codigo: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[var(--text-2)]">Valor Total (R$) *</Label>
              <Input type="number" placeholder="0,00" value={formTarefa.valor_total} onChange={e => setFormTarefa(f => ({ ...f, valor_total: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[var(--text-2)]">Nome da Tarefa *</Label>
              <Input placeholder="Ex: Subestação" value={formTarefa.nome} onChange={e => setFormTarefa(f => ({ ...f, nome: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTarefa(null)}>Cancelar</Button>
            <Button onClick={salvarTarefa} loading={saving} disabled={!formTarefa.codigo || !formTarefa.nome}>
              Adicionar Tarefa
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
              <Label className="text-[var(--text-2)]">Código *</Label>
              <Input placeholder="Ex: 1.1.3" value={formDetalhe.codigo} onChange={e => setFormDetalhe(f => ({ ...f, codigo: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[var(--text-2)]">Unidade *</Label>
              <Input placeholder="un, m, m², kg..." value={formDetalhe.unidade} onChange={e => setFormDetalhe(f => ({ ...f, unidade: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[var(--text-2)]">Descrição *</Label>
              <Input placeholder="Descrição do item" value={formDetalhe.descricao} onChange={e => setFormDetalhe(f => ({ ...f, descricao: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[var(--text-2)]">Quantidade Contratada *</Label>
              <Input type="number" placeholder="0" value={formDetalhe.qtd_contratada} onChange={e => setFormDetalhe(f => ({ ...f, qtd_contratada: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[var(--text-2)]">Valor Unitário (R$) *</Label>
              <Input type="number" placeholder="0,00" value={formDetalhe.valor_unitario} onChange={e => setFormDetalhe(f => ({ ...f, valor_unitario: e.target.value }))} className="bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] focus:border-blue-500" />
            </div>
            {formDetalhe.qtd_contratada && formDetalhe.valor_unitario && (
              <div className="col-span-2 p-2 bg-blue-500/10 rounded text-xs text-blue-400 text-center">
                Valor Total: <strong>{formatCurrency(parseFloat(formDetalhe.qtd_contratada) * parseFloat(formDetalhe.valor_unitario))}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhe(null)}>Cancelar</Button>
            <Button onClick={salvarDetalhe} loading={saving} disabled={!formDetalhe.codigo || !formDetalhe.descricao}>
              Adicionar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
