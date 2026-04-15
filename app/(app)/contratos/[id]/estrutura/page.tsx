'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Layers, Loader2,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TipoMedicao } from '@/types'

type SortKey = 'ordem' | 'codigo' | 'atividade' | 'disciplina' | 'local' | 'qtde' | 'mat_unit' | 'mat_total' | 'mo_unit' | 'mo_total' | 'total'
type SortDir = 'asc' | 'desc'

/** Comparação natural de código "1.1.10" vs "1.1.2" */
function cmpCodigo(a: string, b: string): number {
  const pa = String(a).split('.').map(n => Number(n) || 0)
  const pb = String(b).split('.').map(n => Number(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0, nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }
  return 0
}

export default function EstruturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const [estrutura, setEstrutura] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Sort por coluna
  const [sortKey, setSortKey] = useState<SortKey>('codigo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filtros por coluna (todos strings; numéricos filtram por "contém")
  const [filters, setFilters] = useState({
    disciplina: 'todas',
    codigo: '',
    atividade: '',
    local: '',
  })

  // Modais
  const [modalGrupo, setModalGrupo] = useState(false)
  const [modalTarefa, setModalTarefa] = useState<string | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [formGrupo, setFormGrupo] = useState({ codigo: '', nome: '', tipo_medicao: 'misto' as TipoMedicao, valor_contratado: '' })
  const [formTarefa, setFormTarefa] = useState({ codigo: '', nome: '', valor_total: '' })
  const [formDetalhe, setFormDetalhe] = useState({ codigo: '', descricao: '', unidade: '', qtd_contratada: '', valor_unitario: '' })

  async function loadEstrutura() {
    try {
      const res = await fetch(`/api/contratos/${contratoId}/estrutura`, { cache: 'no-store' })
      const data = await res.json()
      setEstrutura(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadEstrutura() }, [contratoId])

  const toggleExpanded = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  // Lista ordenada e filtrada de grupos (nivel 1)
  const gruposExibidos = useMemo(() => {
    let list = estrutura.map(g => {
      const matTotal = (g.tarefas || []).reduce((s: number, t: any) => s + Number(t.valor_material || 0), 0)
      const moTotal  = (g.tarefas || []).reduce((s: number, t: any) => s + Number(t.valor_servico  || 0), 0)
      return { ...g, mat_total: matTotal, mo_total: moTotal }
    })

    // Filtro disciplina
    if (filters.disciplina !== 'todas') {
      list = list.filter(g => (g.disciplina || '').toUpperCase() === filters.disciplina.toUpperCase())
    }
    if (filters.codigo) list = list.filter(g => String(g.codigo).toLowerCase().includes(filters.codigo.toLowerCase()))
    if (filters.atividade) list = list.filter(g => String(g.nome).toLowerCase().includes(filters.atividade.toLowerCase()))

    // Ordenação
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'codigo':     return dir * cmpCodigo(a.codigo, b.codigo)
        case 'atividade':  return dir * String(a.nome).localeCompare(String(b.nome))
        case 'disciplina': return dir * String(a.disciplina || '').localeCompare(String(b.disciplina || ''))
        case 'qtde':       return dir * 0
        case 'mat_total':  return dir * (a.mat_total - b.mat_total)
        case 'mo_total':   return dir * (a.mo_total - b.mo_total)
        case 'total':      return dir * (Number(a.valor_contratado) - Number(b.valor_contratado))
        default:           return dir * cmpCodigo(a.codigo, b.codigo)
      }
    })

    return list
  }, [estrutura, sortKey, sortDir, filters])

  // Disciplinas únicas (para dropdown de filtro)
  const disciplinas = useMemo(() => {
    const s = new Set<string>()
    for (const g of estrutura) {
      if (g.disciplina) s.add(String(g.disciplina).toUpperCase())
      for (const t of g.tarefas || []) if (t.disciplina) s.add(String(t.disciplina).toUpperCase())
    }
    return Array.from(s).sort()
  }, [estrutura])

  // Subtotal filtrado (apenas grupos exibidos)
  const subtotal = useMemo(
    () => gruposExibidos.reduce((s, g) => s + Number(g.valor_contratado || 0), 0),
    [gruposExibidos]
  )
  const totalGeral = useMemo(
    () => estrutura.reduce((s, g) => s + Number(g.valor_contratado || 0), 0),
    [estrutura]
  )

  // Filtro de tarefas/detalhamentos por texto de atividade e local
  function filterTarefasDets(tarefas: any[]) {
    return (tarefas || []).filter(t => {
      if (filters.atividade && !String(t.nome).toLowerCase().includes(filters.atividade.toLowerCase())) return false
      if (filters.local && !(t.detalhamentos || []).some((d: any) => String(d.local || '').toLowerCase().includes(filters.local.toLowerCase()))) return false
      return true
    })
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

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
    } finally { setSaving(false) }
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
    } finally { setSaving(false) }
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
    } finally { setSaving(false) }
  }

  // ===== Helpers de render =====
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="w-3 h-3 opacity-40" />
    : sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" />
    : <ArrowDown className="w-3 h-3 text-blue-400" />

  const Th = ({
    label, k, numeric, w,
  }: { label: string; k: SortKey; numeric?: boolean; w?: string }) => (
    <th
      className={`sticky top-0 z-10 bg-[var(--surface-1)] border-b border-[var(--border)] px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-2)] ${numeric ? 'text-right' : 'text-left'} ${w || ''}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[var(--text-1)] ${numeric ? 'justify-end w-full' : ''}`}
      >
        {label} <SortIcon k={k} />
      </button>
    </th>
  )

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

      <div className="p-3 sm:p-6 space-y-3">
        {/* Barra de filtros globais por coluna */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div>
            <Label className="text-[var(--text-3)]">Disciplina</Label>
            <Select value={filters.disciplina} onValueChange={v => setFilters(f => ({ ...f, disciplina: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {disciplinas.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[var(--text-3)]">Item</Label>
            <Input
              placeholder="ex: 1.1"
              className="h-8 text-xs mt-1 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]"
              value={filters.codigo}
              onChange={e => setFilters(f => ({ ...f, codigo: e.target.value }))}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-[var(--text-3)]">Atividade</Label>
            <Input
              placeholder="ex: entrada energia"
              className="h-8 text-xs mt-1 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]"
              value={filters.atividade}
              onChange={e => setFilters(f => ({ ...f, atividade: e.target.value }))}
            />
          </div>
          <div>
            <Label className="text-[var(--text-3)]">Local</Label>
            <Input
              placeholder="ex: torre"
              className="h-8 text-xs mt-1 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]"
              value={filters.local}
              onChange={e => setFilters(f => ({ ...f, local: e.target.value }))}
            />
          </div>
        </div>

        {(filters.disciplina !== 'todas' || filters.codigo || filters.atividade || filters.local) && (
          <button
            type="button"
            className="text-xs text-blue-400 hover:text-blue-300"
            onClick={() => setFilters({ disciplina: 'todas', codigo: '', atividade: '', local: '' })}
          >Limpar filtros</button>
        )}

        {/* Tabela expansível (única visão) */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-blue-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Carregando estrutura...</span>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] overflow-hidden">
            <div className="overflow-auto max-h-[78vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 bg-[var(--surface-1)] border-b border-[var(--border)] w-6"></th>
                    <Th label="Item"       k="codigo" />
                    <Th label="Disciplina" k="disciplina" />
                    <Th label="Atividade Instalações Global" k="atividade" />
                    <Th label="Local"      k="local" />
                    <Th label="Qtde"       k="qtde" numeric />
                    <Th label="Pr. Unit — MAT" k="mat_unit"  numeric />
                    <Th label="Total — MAT"    k="mat_total" numeric />
                    <Th label="Pr. Unit — MO"  k="mo_unit"   numeric />
                    <Th label="Total — MO"     k="mo_total"  numeric />
                    <Th label="Total"          k="total"     numeric />
                  </tr>
                </thead>
                <tbody>
                  {gruposExibidos.map(grupo => {
                    const tarefasFiltradas = filterTarefasDets(grupo.tarefas || [])
                    const tarefasOrdenadas = [...tarefasFiltradas].sort((a, b) => cmpCodigo(a.codigo, b.codigo))
                    return (
                      <GrupoRow
                        key={grupo.id}
                        grupo={grupo}
                        tarefas={tarefasOrdenadas}
                        expanded={expanded}
                        toggle={toggleExpanded}
                        onAddTarefa={() => setModalTarefa(grupo.id)}
                        onAddDetalhe={(tid: string) => setModalDetalhe(tid)}
                        filters={filters}
                      />
                    )
                  })}
                  {gruposExibidos.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-10 text-[var(--text-3)]">Nenhum grupo com os filtros atuais.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--surface-1)] flex items-center justify-between text-xs">
              <span className="text-[var(--text-3)]">{gruposExibidos.length} de {estrutura.length} grupos</span>
              <div className="flex gap-4">
                <span className="text-[var(--text-1)]">Subtotal filtrado: <strong>{formatCurrency(subtotal)}</strong></span>
                <span className="text-[var(--text-3)]">Total geral: <strong>{formatCurrency(totalGeral)}</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Modais (inalterados) ===== */}
      <Dialog open={modalGrupo} onOpenChange={setModalGrupo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-blue-400" /> Novo Grupo Macro</DialogTitle>
            <DialogDescription>Nível 1 da estrutura hierárquica.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input placeholder="Ex: 6" value={formGrupo.codigo} onChange={e => setFormGrupo(f => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Medição *</Label>
              <Select value={formGrupo.tipo_medicao} onValueChange={v => setFormGrupo(f => ({ ...f, tipo_medicao: v as TipoMedicao }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="servico">Serviço</SelectItem>
                  <SelectItem value="faturamento_direto">Material (Fat. Direto)</SelectItem>
                  <SelectItem value="misto">Total (Mat. + Serviço)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Nome do Grupo *</Label>
              <Input value={formGrupo.nome} onChange={e => setFormGrupo(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Valor Contratado (R$) *</Label>
              <Input type="number" value={formGrupo.valor_contratado} onChange={e => setFormGrupo(f => ({ ...f, valor_contratado: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalGrupo(false)}>Cancelar</Button>
            <Button onClick={salvarGrupo} loading={saving} disabled={!formGrupo.codigo || !formGrupo.nome}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalTarefa} onOpenChange={() => setModalTarefa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
            <DialogDescription>Nível 2.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Código *</Label>
              <Input placeholder="Ex: 1.3" value={formTarefa.codigo} onChange={e => setFormTarefa(f => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Total (R$) *</Label>
              <Input type="number" value={formTarefa.valor_total} onChange={e => setFormTarefa(f => ({ ...f, valor_total: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Nome da Tarefa *</Label>
              <Input value={formTarefa.nome} onChange={e => setFormTarefa(f => ({ ...f, nome: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTarefa(null)}>Cancelar</Button>
            <Button onClick={salvarTarefa} loading={saving} disabled={!formTarefa.codigo || !formTarefa.nome}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modalDetalhe} onOpenChange={() => setModalDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Detalhamento</DialogTitle>
            <DialogDescription>Nível 3.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5"><Label>Código *</Label>
              <Input value={formDetalhe.codigo} onChange={e => setFormDetalhe(f => ({ ...f, codigo: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Unidade *</Label>
              <Input value={formDetalhe.unidade} onChange={e => setFormDetalhe(f => ({ ...f, unidade: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Descrição *</Label>
              <Input value={formDetalhe.descricao} onChange={e => setFormDetalhe(f => ({ ...f, descricao: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Qtde Contratada *</Label>
              <Input type="number" value={formDetalhe.qtd_contratada} onChange={e => setFormDetalhe(f => ({ ...f, qtd_contratada: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Valor Unitário (R$) *</Label>
              <Input type="number" value={formDetalhe.valor_unitario} onChange={e => setFormDetalhe(f => ({ ...f, valor_unitario: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhe(null)}>Cancelar</Button>
            <Button onClick={salvarDetalhe} loading={saving} disabled={!formDetalhe.codigo || !formDetalhe.descricao}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ===== Subcomponentes =====

function GrupoRow({ grupo, tarefas, expanded, toggle, onAddTarefa, onAddDetalhe, filters }: any) {
  const open = !!expanded[grupo.id]
  const matTotal = (grupo.tarefas || []).reduce((s: number, t: any) => s + Number(t.valor_material || 0), 0)
  const moTotal  = (grupo.tarefas || []).reduce((s: number, t: any) => s + Number(t.valor_servico  || 0), 0)
  const total = Number(grupo.valor_contratado || 0)

  return (
    <>
      <tr
        onClick={() => toggle(grupo.id)}
        className="cursor-pointer bg-blue-500/5 hover:bg-blue-500/10 border-b border-[var(--border)] font-bold text-[var(--text-1)]"
      >
        <td className="px-1 text-center">
          {open ? <ChevronDown className="w-3.5 h-3.5 inline" /> : <ChevronRight className="w-3.5 h-3.5 inline" />}
        </td>
        <td className="px-2 py-1.5 font-mono">
          <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 bg-blue-500/80 text-white text-[10px] rounded font-bold">
            {grupo.codigo}
          </span>
        </td>
        <td className="px-2 py-1.5 text-[var(--text-2)]">{grupo.disciplina || '—'}</td>
        <td className="px-2 py-1.5">{grupo.nome}</td>
        <td className="px-2 py-1.5 text-[var(--text-3)]">—</td>
        <td className="px-2 py-1.5 text-right">1</td>
        <td className="px-2 py-1.5 text-right">—</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(matTotal)}</td>
        <td className="px-2 py-1.5 text-right">—</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(moTotal)}</td>
        <td className="px-2 py-1.5 text-right text-emerald-400">{formatCurrency(total)}</td>
      </tr>

      {open && tarefas.map((t: any) => (
        <TarefaRow
          key={t.id}
          tarefa={t}
          expanded={expanded}
          toggle={toggle}
          onAddDetalhe={onAddDetalhe}
          filters={filters}
        />
      ))}

      {open && (
        <tr className="border-b border-[var(--border)]">
          <td colSpan={11} className="px-10 py-1.5">
            <button
              type="button"
              className="text-[11px] text-[var(--text-3)] hover:text-blue-400 inline-flex items-center gap-1"
              onClick={onAddTarefa}
            >
              <Plus className="w-3 h-3" /> Adicionar Tarefa
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

function TarefaRow({ tarefa, expanded, toggle, onAddDetalhe, filters }: any) {
  const open = !!expanded[tarefa.id]
  const qt = Number(tarefa.quantidade_contratada) || 1
  const matT = Number(tarefa.valor_material) || 0
  const moT  = Number(tarefa.valor_servico)  || 0
  const total = Number(tarefa.valor_total) || (matT + moT)
  const matUnit = qt ? matT / qt : matT
  const moUnit  = qt ? moT  / qt : moT

  const dets = [...(tarefa.detalhamentos || [])].sort((a: any, b: any) => cmpCodigo(a.codigo, b.codigo))
  const detsFiltrados = dets.filter((d: any) => {
    if (filters.local && !String(d.local || '').toLowerCase().includes(filters.local.toLowerCase())) return false
    if (filters.codigo && !String(d.codigo).toLowerCase().includes(filters.codigo.toLowerCase())) return false
    return true
  })

  return (
    <>
      <tr
        onClick={() => toggle(tarefa.id)}
        className="cursor-pointer bg-[var(--surface-1)] hover:bg-[var(--surface-2)] border-b border-[var(--border)] text-[var(--text-1)] font-semibold"
      >
        <td className="pl-5 text-center">
          {open ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        </td>
        <td className="pl-6 py-1.5 font-mono text-[11px]">
          <span className="inline-flex items-center justify-center px-1.5 h-[18px] bg-[var(--surface-2)] text-[var(--text-2)] text-[10px] rounded">
            {tarefa.codigo}
          </span>
        </td>
        <td className="px-2 py-1.5 text-[var(--text-2)]">{tarefa.disciplina || '—'}</td>
        <td className="px-2 py-1.5">{tarefa.nome}</td>
        <td className="px-2 py-1.5 text-[var(--text-3)]">—</td>
        <td className="px-2 py-1.5 text-right">{qt.toLocaleString('pt-BR')}</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(matUnit)}</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(matT)}</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(moUnit)}</td>
        <td className="px-2 py-1.5 text-right">{formatCurrency(moT)}</td>
        <td className="px-2 py-1.5 text-right text-emerald-400 font-bold">{formatCurrency(total)}</td>
      </tr>

      {open && detsFiltrados.map((d: any) => (
        <DetalheRow key={d.id} det={d} />
      ))}

      {open && (
        <tr className="border-b border-[var(--border)]">
          <td colSpan={11} className="px-16 py-1">
            <button
              type="button"
              className="text-[11px] text-[var(--text-3)] hover:text-blue-400 inline-flex items-center gap-1"
              onClick={() => onAddDetalhe(tarefa.id)}
            >
              <Plus className="w-3 h-3" /> Adicionar Detalhamento
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

function DetalheRow({ det }: { det: any }) {
  const qt = Number(det.quantidade_contratada) || 0
  const matU = Number(det.valor_material_unit) || 0
  const moU  = Number(det.valor_servico_unit)  || 0
  const matT = qt * matU
  const moT  = qt * moU
  const total = Number(det.valor_total) || (matT + moT)
  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--surface-1)] text-[var(--text-2)]">
      <td></td>
      <td className="pl-12 py-1 font-mono text-[10px] text-[var(--text-3)]">{det.codigo}</td>
      <td className="px-2 py-1 text-[var(--text-3)]">{det.disciplina || '—'}</td>
      <td className="px-2 py-1">{det.descricao}</td>
      <td className="px-2 py-1 text-[var(--text-3)]">{det.local || '—'}</td>
      <td className="px-2 py-1 text-right">
        {qt.toLocaleString('pt-BR')} {det.unidade ? <span className="text-[var(--text-3)]">{det.unidade}</span> : null}
      </td>
      <td className="px-2 py-1 text-right">{formatCurrency(matU)}</td>
      <td className="px-2 py-1 text-right">{formatCurrency(matT)}</td>
      <td className="px-2 py-1 text-right">{formatCurrency(moU)}</td>
      <td className="px-2 py-1 text-right">{formatCurrency(moT)}</td>
      <td className="px-2 py-1 text-right font-semibold">{formatCurrency(total)}</td>
    </tr>
  )
}
