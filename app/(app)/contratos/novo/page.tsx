'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Info } from 'lucide-react'
import { ContratoTipo } from '@/types'

interface Empresa {
  id: string
  nome: string
  tipo: string
}

export default function NovoContratoPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [loadingEmpresas, setLoadingEmpresas] = useState(true)
  const [contratantes, setContratantes] = useState<Empresa[]>([])
  const [contratados, setContratados] = useState<Empresa[]>([])
  const [form, setForm] = useState({
    numero: '',
    descricao: '',
    escopo: '',
    contratante_id: '',
    contratado_id: '',
    tipo: '' as ContratoTipo | '',
    valor_total: '',
    valor_servicos: '',
    valor_material_direto: '',
    data_inicio: '',
    data_fim: '',
    local_obra: '',
    fiscal_obra: '',
    email_fiscal: '',
    objeto: '',
  })

  useEffect(() => {
    async function loadEmpresas() {
      try {
        const res = await fetch('/api/empresas')
        if (res.ok) {
          const data: Empresa[] = await res.json()
          const ct = data.filter(e => e.tipo === 'contratante')
          const cd = data.filter(e => e.tipo === 'contratado')
          setContratantes(ct)
          setContratados(cd)
          if (ct.length > 0) {
            setForm(f => ({ ...f, contratante_id: ct[0].id }))
          }
        }
      } finally {
        setLoadingEmpresas(false)
      }
    }
    loadEmpresas()
  }, [])

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const isPercentual = form.tipo === 'percentual_servico_material'

  async function salvar() {
    setSaving(true)
    try {
      const payload = {
        numero: form.numero,
        descricao: form.descricao,
        escopo: form.escopo,
        objeto: form.objeto,
        contratante_id: form.contratante_id,
        contratado_id: form.contratado_id,
        tipo: form.tipo,
        valor_total: parseFloat(form.valor_total),
        valor_servicos: parseFloat(form.valor_servicos) || undefined,
        valor_material_direto: parseFloat(form.valor_material_direto) || undefined,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        local_obra: form.local_obra,
        fiscal_obra: form.fiscal_obra,
        email_fiscal: form.email_fiscal,
        status: 'ativo',
      }
      const res = await fetch('/api/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const newContrato = await res.json()
        router.push(`/contratos/${newContrato.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--surface-1)]">
      <Topbar
        title="Novo Contrato"
        subtitle="Cadastro de contrato"
        actions={
          <Link href="/contratos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        }
      />

      <div className="p-6 max-w-4xl">
        <div className="space-y-6">
          {/* Identificação */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text-1)] font-semibold text-sm tracking-wide">1. Identificação do Contrato</h2>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Número do Contrato *</label>
                  <input
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="Ex: WAVE-2025-001"
                    value={form.numero}
                    onChange={e => set('numero', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Tipo de Contrato *</label>
                  <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                    <SelectTrigger className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] rounded-lg px-3 py-2.5 text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)]">
                      <SelectItem value="global" className="text-[var(--text-1)] focus:bg-[#1E293B]">Preço Global (Lump Sum)</SelectItem>
                      <SelectItem value="preco_unitario" className="text-[var(--text-1)] focus:bg-[#1E293B]">Preço Unitário</SelectItem>
                      <SelectItem value="percentual_servico_material" className="text-[var(--text-1)] focus:bg-[#1E293B]">% Serviço / Faturamento Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Descrição *</label>
                  <input
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="Título/descrição do contrato"
                    value={form.descricao}
                    onChange={e => set('descricao', e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Objeto do Contrato</label>
                  <textarea
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors resize-none min-h-[80px]"
                    placeholder="Descrição detalhada do objeto contratual..."
                    value={form.objeto}
                    onChange={e => set('objeto', e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Escopo Resumido</label>
                  <input
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="Resumo do escopo de trabalho"
                    value={form.escopo}
                    onChange={e => set('escopo', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Partes */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text-1)] font-semibold text-sm tracking-wide">2. Partes Contratantes</h2>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Contratante *</label>
                  <Select value={form.contratante_id} onValueChange={v => set('contratante_id', v)} disabled={loadingEmpresas}>
                    <SelectTrigger className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] rounded-lg px-3 py-2.5 text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50">
                      <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Selecione o contratante'} />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)]">
                      {contratantes.map(e => (
                        <SelectItem key={e.id} value={e.id} className="text-[var(--text-1)] focus:bg-[#1E293B]">{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Contratado *</label>
                  <Select value={form.contratado_id} onValueChange={v => set('contratado_id', v)} disabled={loadingEmpresas}>
                    <SelectTrigger className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] rounded-lg px-3 py-2.5 text-sm focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] disabled:opacity-50">
                      <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Selecione o contratado'} />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-1)]">
                      {contratados.map(e => (
                        <SelectItem key={e.id} value={e.id} className="text-[var(--text-1)] focus:bg-[#1E293B]">{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Fiscal de Obra</label>
                  <input
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="Nome do fiscal responsável"
                    value={form.fiscal_obra}
                    onChange={e => set('fiscal_obra', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">E-mail do Fiscal</label>
                  <input
                    type="email"
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="email@empresa.com.br"
                    value={form.email_fiscal}
                    onChange={e => set('email_fiscal', e.target.value)}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Local da Obra</label>
                  <input
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                    placeholder="Cidade, Estado"
                    value={form.local_obra}
                    onChange={e => set('local_obra', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Valores */}
          <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-[var(--text-1)] font-semibold text-sm tracking-wide">3. Valores e Prazos</h2>
            </div>
            <div className="px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                {isPercentual ? (
                  <>
                    <div className="col-span-2 p-3 bg-[var(--surface-1)] border border-[#1E3A5F] rounded-lg flex items-start gap-2 text-xs text-blue-400">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                      <span>Para contrato com <strong className="text-blue-300">% Serviço / Faturamento Direto</strong>, informe os valores separados. O valor total será calculado automaticamente.</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Valor — Serviços (Mão de Obra) *</label>
                      <input
                        type="number"
                        className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                        placeholder="0,00"
                        value={form.valor_servicos}
                        onChange={e => {
                          set('valor_servicos', e.target.value)
                          const total = (parseFloat(e.target.value) || 0) + (parseFloat(form.valor_material_direto) || 0)
                          set('valor_total', String(total))
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Valor — Faturamento Direto (Material) *</label>
                      <input
                        type="number"
                        className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                        placeholder="0,00"
                        value={form.valor_material_direto}
                        onChange={e => {
                          set('valor_material_direto', e.target.value)
                          const total = (parseFloat(form.valor_servicos) || 0) + (parseFloat(e.target.value) || 0)
                          set('valor_total', String(total))
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Valor Total (calculado)</label>
                      <input
                        readOnly
                        className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[#38BDF8] rounded-lg px-3 py-2.5 text-sm font-semibold cursor-not-allowed opacity-80"
                        value={form.valor_total ? `R$ ${parseFloat(form.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                        placeholder="Calculado automaticamente"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Valor Total do Contrato *</label>
                    <input
                      type="number"
                      className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors"
                      placeholder="0,00"
                      value={form.valor_total}
                      onChange={e => set('valor_total', e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Data de Início *</label>
                  <input
                    type="date"
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors [color-scheme:dark]"
                    value={form.data_inicio}
                    onChange={e => set('data_inicio', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider mb-1.5 block">Data de Término *</label>
                  <input
                    type="date"
                    className="w-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-colors [color-scheme:dark]"
                    value={form.data_fim}
                    onChange={e => set('data_fim', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-3 pb-6">
            <Link href="/contratos">
              <Button variant="outline">Cancelar</Button>
            </Link>
            <Button
              onClick={salvar}
              loading={saving}
              disabled={!form.numero || !form.descricao || !form.tipo || !form.contratante_id || !form.contratado_id}
            >
              Cadastrar Contrato
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
