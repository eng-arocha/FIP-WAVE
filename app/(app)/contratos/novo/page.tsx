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
    <div className="flex-1 overflow-auto">
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">1. Identificação do Contrato</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Número do Contrato *</Label>
                  <Input placeholder="Ex: WAVE-2025-001" value={form.numero} onChange={e => set('numero', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Contrato *</Label>
                  <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Preço Global (Lump Sum)</SelectItem>
                      <SelectItem value="preco_unitario">Preço Unitário</SelectItem>
                      <SelectItem value="percentual_servico_material">% Serviço / Faturamento Direto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Descrição *</Label>
                  <Input placeholder="Título/descrição do contrato" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Objeto do Contrato</Label>
                  <Textarea placeholder="Descrição detalhada do objeto contratual..." value={form.objeto} onChange={e => set('objeto', e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Escopo Resumido</Label>
                  <Input placeholder="Resumo do escopo de trabalho" value={form.escopo} onChange={e => set('escopo', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Partes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">2. Partes Contratantes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Contratante *</Label>
                  <Select value={form.contratante_id} onValueChange={v => set('contratante_id', v)} disabled={loadingEmpresas}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Selecione o contratante'} />
                    </SelectTrigger>
                    <SelectContent>
                      {contratantes.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Contratado *</Label>
                  <Select value={form.contratado_id} onValueChange={v => set('contratado_id', v)} disabled={loadingEmpresas}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingEmpresas ? 'Carregando...' : 'Selecione o contratado'} />
                    </SelectTrigger>
                    <SelectContent>
                      {contratados.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fiscal de Obra</Label>
                  <Input placeholder="Nome do fiscal responsável" value={form.fiscal_obra} onChange={e => set('fiscal_obra', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail do Fiscal</Label>
                  <Input type="email" placeholder="email@empresa.com.br" value={form.email_fiscal} onChange={e => set('email_fiscal', e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Local da Obra</Label>
                  <Input placeholder="Cidade, Estado" value={form.local_obra} onChange={e => set('local_obra', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-700">3. Valores e Prazos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {isPercentual ? (
                  <>
                    <div className="col-span-2 p-3 bg-blue-50 rounded-lg flex items-start gap-2 text-xs text-blue-700">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>Para contrato com <strong>% Serviço / Faturamento Direto</strong>, informe os valores separados. O valor total será calculado automaticamente.</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valor — Serviços (Mão de Obra) *</Label>
                      <Input
                        type="number"
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
                      <Label>Valor — Faturamento Direto (Material) *</Label>
                      <Input
                        type="number"
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
                      <Label>Valor Total (calculado)</Label>
                      <Input
                        readOnly
                        className="bg-gray-50 font-semibold"
                        value={form.valor_total ? `R$ ${parseFloat(form.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                        placeholder="Calculado automaticamente"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 space-y-1.5">
                    <Label>Valor Total do Contrato *</Label>
                    <Input
                      type="number"
                      placeholder="0,00"
                      value={form.valor_total}
                      onChange={e => set('valor_total', e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Data de Início *</Label>
                  <Input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data de Término *</Label>
                  <Input type="date" value={form.data_fim} onChange={e => set('data_fim', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex justify-end gap-3">
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
