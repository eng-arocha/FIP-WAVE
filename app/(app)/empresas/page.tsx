'use client'

import { useState } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Building2, Plus, Search, Pencil, Phone, Mail, User } from 'lucide-react'
import { Empresa, EmpresaTipo } from '@/types'
import { formatCNPJ } from '@/lib/utils'

const TIPO_LABELS: Record<EmpresaTipo, string> = {
  contratante: 'Contratante',
  contratado: 'Contratado',
  ambos: 'Ambos',
}

const TIPO_COLORS: Record<EmpresaTipo, string> = {
  contratante: 'bg-blue-100 text-blue-700 border-blue-200',
  contratado: 'bg-purple-100 text-purple-700 border-purple-200',
  ambos: 'bg-green-100 text-green-700 border-green-200',
}

const MOCK_EMPRESAS: Empresa[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    nome: 'FIP Engenharia',
    cnpj: '00.000.000/0001-00',
    tipo: 'contratado',
    email_contato: 'financeiro@fipengenharia.com.br',
    telefone: '(11) 3000-0000',
    responsavel: 'Equipe FIP',
    ativo: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    nome: 'Wave Instalações SPE LTDA',
    cnpj: '99.999.999/0001-99',
    tipo: 'contratante',
    email_contato: 'medicao@waveinstalacoes.com.br',
    telefone: '(11) 9000-0000',
    responsavel: 'Equipe Wave',
    ativo: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
]

const EMPTY_FORM = {
  nome: '',
  cnpj: '',
  tipo: 'contratado' as EmpresaTipo,
  email_contato: '',
  telefone: '',
  responsavel: '',
  endereco: '',
}

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState(MOCK_EMPRESAS)
  const [busca, setBusca] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const filtradas = empresas.filter(e =>
    e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    e.cnpj?.includes(busca) ||
    e.email_contato?.toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNova() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function abrirEdicao(empresa: Empresa) {
    setEditando(empresa)
    setForm({
      nome: empresa.nome,
      cnpj: empresa.cnpj || '',
      tipo: empresa.tipo,
      email_contato: empresa.email_contato || '',
      telefone: empresa.telefone || '',
      responsavel: empresa.responsavel || '',
      endereco: empresa.endereco || '',
    })
    setModalOpen(true)
  }

  async function salvar() {
    if (!form.nome || !form.tipo) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    if (editando) {
      setEmpresas(prev => prev.map(e => e.id === editando.id ? {
        ...e, ...form, updated_at: new Date().toISOString()
      } : e))
    } else {
      const nova: Empresa = {
        id: crypto.randomUUID(),
        ...form,
        ativo: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setEmpresas(prev => [...prev, nova])
    }
    setSaving(false)
    setModalOpen(false)
  }

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Empresas"
        subtitle="Gerenciamento de contratantes e contratados"
        actions={
          <Button size="sm" onClick={abrirNova}>
            <Plus className="w-4 h-4" />
            Nova Empresa
          </Button>
        }
      />

      <div className="p-6">
        {/* Busca */}
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar empresa..."
            className="pl-9"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map(empresa => (
            <Card key={empresa.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-[#1e3a5f]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm leading-tight">{empresa.nome}</p>
                      {empresa.cnpj && (
                        <p className="text-xs text-gray-400 mt-0.5">{empresa.cnpj}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={TIPO_COLORS[empresa.tipo]}>
                    {TIPO_LABELS[empresa.tipo]}
                  </Badge>
                </div>

                <div className="space-y-1.5 border-t border-gray-100 pt-3">
                  {empresa.responsavel && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      {empresa.responsavel}
                    </div>
                  )}
                  {empresa.email_contato && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      {empresa.email_contato}
                    </div>
                  )}
                  {empresa.telefone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      {empresa.telefone}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => abrirEdicao(empresa)}>
                    <Pencil className="w-3 h-3 mr-1" />
                    Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Modal Nova/Editar Empresa */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            <DialogDescription>Preencha os dados cadastrais da empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Razão Social *</Label>
                <Input
                  placeholder="Nome completo da empresa"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as EmpresaTipo }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contratante">Contratante</SelectItem>
                    <SelectItem value="contratado">Contratado</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Input
                  placeholder="Nome do responsável"
                  value={form.responsavel}
                  onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  placeholder="(00) 00000-0000"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-mail de Contato</Label>
                <Input
                  type="email"
                  placeholder="email@empresa.com.br"
                  value={form.email_contato}
                  onChange={e => setForm(f => ({ ...f, email_contato: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Endereço</Label>
                <Input
                  placeholder="Rua, nº, bairro - cidade/UF"
                  value={form.endereco}
                  onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} disabled={!form.nome}>
              {editando ? 'Salvar Alterações' : 'Cadastrar Empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
