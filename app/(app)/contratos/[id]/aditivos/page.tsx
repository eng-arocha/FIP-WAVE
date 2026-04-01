'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { ArrowLeft, Plus, FileText, TrendingUp, Calendar, AlignLeft, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, getAditivoStatusColor } from '@/lib/utils'
import { AditivoTipo, AditivoStatus, ADITIVO_TIPO_LABELS } from '@/types'

const ADITIVO_STATUS_LABELS: Record<AditivoStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
}

export default function AditivosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)
  const [aditivos, setAditivos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tipo: '' as AditivoTipo | '',
    descricao: '',
    valor_anterior: '',
    valor_adicional: '',
    data_fim_anterior: '',
    data_fim_nova: '',
  })

  useEffect(() => {
    fetch(`/api/contratos/${contratoId}/aditivos`)
      .then(r => r.json())
      .then(data => setAditivos(data))
      .finally(() => setLoading(false))
  }, [contratoId])

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const isValor = form.tipo === 'valor' || form.tipo === 'misto'
  const isPrazo = form.tipo === 'prazo' || form.tipo === 'misto'

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch(`/api/contratos/${contratoId}/aditivos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          descricao: form.descricao,
          valor_anterior: isValor ? parseFloat(form.valor_anterior) || undefined : undefined,
          valor_adicional: isValor ? parseFloat(form.valor_adicional) || undefined : undefined,
          valor_novo: isValor && form.valor_anterior && form.valor_adicional
            ? parseFloat(form.valor_anterior) + parseFloat(form.valor_adicional)
            : undefined,
          data_fim_anterior: isPrazo ? form.data_fim_anterior || undefined : undefined,
          data_fim_nova: isPrazo ? form.data_fim_nova || undefined : undefined,
        }),
      })
      const novo = await res.json()
      setAditivos(prev => [...prev, novo])
      setModalOpen(false)
      setForm({ tipo: '', descricao: '', valor_anterior: '', valor_adicional: '', data_fim_anterior: '', data_fim_nova: '' })
    } finally {
      setSaving(false)
    }
  }

  const TIPO_ICON: Record<AditivoTipo, React.ElementType> = {
    valor: TrendingUp,
    prazo: Calendar,
    escopo: AlignLeft,
    misto: FileText,
  }

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Aditivos Contratuais"
        subtitle="WAVE-2025-001"
        actions={
          <div className="flex gap-2">
            <Link href={`/contratos/${contratoId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Novo Aditivo
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Carregando aditivos...</span>
          </div>
        ) : aditivos.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-600">Nenhum aditivo cadastrado</p>
            <p className="text-sm text-gray-400 mt-1 mb-4">Registre aditivos de valor, prazo ou escopo aqui</p>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Cadastrar Primeiro Aditivo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {aditivos.map(aditivo => {
              const Icon = TIPO_ICON[aditivo.tipo as AditivoTipo]
              return (
                <Card key={aditivo.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-gray-900">Aditivo #{aditivo.numero}</span>
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                            {ADITIVO_TIPO_LABELS[aditivo.tipo as AditivoTipo]}
                          </Badge>
                          <Badge className={getAditivoStatusColor(aditivo.status)}>
                            {ADITIVO_STATUS_LABELS[aditivo.status as AditivoStatus]}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{aditivo.descricao}</p>
                        {aditivo.valor_novo && (
                          <div className="mt-2 text-xs text-gray-500">
                            <span>Valor anterior: {formatCurrency(aditivo.valor_anterior || 0)}</span>
                            <span className="mx-2">→</span>
                            <span className="font-semibold text-green-700">Novo valor: {formatCurrency(aditivo.valor_novo)}</span>
                            <span className="ml-2 text-green-600">(+{formatCurrency(aditivo.valor_adicional || 0)})</span>
                          </div>
                        )}
                        {aditivo.data_fim_nova && (
                          <div className="mt-1 text-xs text-gray-500">
                            <span>Prazo anterior: {formatDate(aditivo.data_fim_anterior || '')}</span>
                            <span className="mx-2">→</span>
                            <span className="font-semibold text-blue-700">Novo prazo: {formatDate(aditivo.data_fim_nova)}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(aditivo.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Aditivo Contratual</DialogTitle>
            <DialogDescription>Registre alterações de valor, prazo ou escopo ao contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Tipo de Aditivo *</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor">Acréscimo de Valor</SelectItem>
                  <SelectItem value="prazo">Prorrogação de Prazo</SelectItem>
                  <SelectItem value="escopo">Alteração de Escopo</SelectItem>
                  <SelectItem value="misto">Valor + Prazo (Misto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição / Justificativa *</Label>
              <Textarea placeholder="Descreva o motivo e objeto do aditivo..." value={form.descricao} onChange={e => set('descricao', e.target.value)} />
            </div>
            {isValor && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Valor Anterior (R$)</Label>
                  <Input type="number" placeholder="0,00" value={form.valor_anterior} onChange={e => set('valor_anterior', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor do Acréscimo (R$)</Label>
                  <Input type="number" placeholder="0,00" value={form.valor_adicional} onChange={e => set('valor_adicional', e.target.value)} />
                </div>
                {form.valor_anterior && form.valor_adicional && (
                  <div className="col-span-2 p-2 bg-green-50 rounded text-xs text-green-700 text-center">
                    Novo valor total: <strong>{formatCurrency(parseFloat(form.valor_anterior) + parseFloat(form.valor_adicional))}</strong>
                  </div>
                )}
              </div>
            )}
            {isPrazo && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data Fim Anterior</Label>
                  <Input type="date" value={form.data_fim_anterior} onChange={e => set('data_fim_anterior', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nova Data de Término</Label>
                  <Input type="date" value={form.data_fim_nova} onChange={e => set('data_fim_nova', e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} disabled={!form.tipo || !form.descricao}>
              Registrar Aditivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
