'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, Building2, Calendar, ArrowRight
} from 'lucide-react'
import { formatCurrency, formatDate, formatDatetime, getMedicaoStatusColor } from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, MedicaoStatus } from '@/types'

const PENDING_MEDICOES = [
  {
    id: '4',
    numero: 4,
    periodo_referencia: '2026-03',
    tipo: 'misto' as const,
    status: 'submetido' as const,
    valor_total: 580000,
    solicitante_nome: 'Engenheiro Wave',
    solicitante_email: 'eng@waveinstalacoes.com.br',
    data_submissao: '2026-03-28T10:00:00Z',
    contrato: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      numero: 'WAVE-2025-001',
      descricao: 'Contrato de Instalações - Empreendimento Wave',
      contratado: { nome: 'Wave Instalações SPE LTDA' },
    },
    anexos_count: 3,
    nfs_count: 2,
  },
]

const HISTORICO_APROVACOES = [
  {
    id: '3',
    numero: 3,
    periodo_referencia: '2026-02',
    tipo: 'misto' as const,
    status: 'aprovado' as const,
    valor_total: 620000,
    data_aprovacao: '2026-03-05T14:30:00Z',
    aprovador_nome: 'Fiscal FIP',
    contrato: { numero: 'WAVE-2025-001', contratado: { nome: 'Wave Instalações SPE LTDA' } },
    contrato_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
  {
    id: '2',
    numero: 2,
    periodo_referencia: '2026-01',
    tipo: 'servico' as const,
    status: 'aprovado' as const,
    valor_total: 1200000,
    data_aprovacao: '2026-02-04T11:00:00Z',
    aprovador_nome: 'Fiscal FIP',
    contrato: { numero: 'WAVE-2025-001', contratado: { nome: 'Wave Instalações SPE LTDA' } },
    contrato_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
  {
    id: '1',
    numero: 1,
    periodo_referencia: '2025-12',
    tipo: 'faturamento_direto' as const,
    status: 'aprovado' as const,
    valor_total: 1420000,
    data_aprovacao: '2026-01-07T16:00:00Z',
    aprovador_nome: 'Fiscal FIP',
    contrato: { numero: 'WAVE-2025-001', contratado: { nome: 'Wave Instalações SPE LTDA' } },
    contrato_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
]

export default function AprovacoesPage() {
  const [pendentes, setPendentes] = useState(PENDING_MEDICOES)
  const [historico, setHistorico] = useState(HISTORICO_APROVACOES)
  const [aba, setAba] = useState<'pendentes' | 'historico'>('pendentes')
  const [modalAprovar, setModalAprovar] = useState<string | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const medicaoAprovar = pendentes.find(m => m.id === modalAprovar)
  const medicaoRejeitar = pendentes.find(m => m.id === modalRejeitar)

  async function confirmarAprovacao() {
    if (!modalAprovar) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 1200))
    setPendentes(prev => prev.filter(m => m.id !== modalAprovar))
    setSaving(false)
    setModalAprovar(null)
    setComentario('')
  }

  async function confirmarRejeicao() {
    if (!modalRejeitar || !motivo) return
    setSaving(true)
    await new Promise(r => setTimeout(r, 1200))
    setPendentes(prev => prev.filter(m => m.id !== modalRejeitar))
    setSaving(false)
    setModalRejeitar(null)
    setMotivo('')
  }

  const TIPO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Fat. Direto',
    misto: 'Misto',
  }
  const TIPO_COLORS: Record<string, string> = {
    servico: 'bg-purple-100 text-purple-700 border-purple-200',
    faturamento_direto: 'bg-blue-100 text-blue-700 border-blue-200',
    misto: 'bg-teal-100 text-teal-700 border-teal-200',
  }

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Fila de Aprovações"
        subtitle="Medições aguardando análise e histórico"
      />

      <div className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <Card className={pendentes.length > 0 ? 'border-yellow-300' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${pendentes.length > 0 ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                <Clock className={`w-5 h-5 ${pendentes.length > 0 ? 'text-yellow-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${pendentes.length > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>{pendentes.length}</p>
                <p className="text-xs text-gray-500">Aguardando aprovação</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{historico.filter(h => h.status === 'aprovado').length}</p>
                <p className="text-xs text-gray-500">Aprovadas (total)</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency([...historico].reduce((a, m) => a + m.valor_total, 0))}
                </p>
                <p className="text-xs text-gray-500">Total aprovado</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setAba('pendentes')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              aba === 'pendentes' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Pendentes
            {pendentes.length > 0 && (
              <span className="bg-yellow-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendentes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setAba('historico')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              aba === 'historico' ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Histórico
          </button>
        </div>

        {/* Pendentes */}
        {aba === 'pendentes' && (
          <div className="space-y-3">
            {pendentes.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="font-semibold text-gray-600">Nenhuma medição pendente</p>
                <p className="text-sm mt-1">Todas as medições foram analisadas</p>
              </div>
            ) : pendentes.map(m => (
              <Card key={m.id} className="border-yellow-200 bg-yellow-50/30">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900">Medição #{String(m.numero).padStart(3, '0')}</span>
                            <Badge className={getMedicaoStatusColor(m.status)}>
                              {MEDICAO_STATUS_LABELS[m.status]}
                            </Badge>
                            <Badge className={TIPO_COLORS[m.tipo]}>{TIPO_LABELS[m.tipo]}</Badge>
                          </div>
                          <p className="text-sm text-gray-600">{m.contrato.numero} · {m.contrato.descricao}</p>
                        </div>
                        <p className="text-xl font-bold text-[#1e3a5f] flex-shrink-0">{formatCurrency(m.valor_total)}</p>
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-xs text-gray-500 mb-3">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {m.periodo_referencia}</span>
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {m.contrato.contratado.nome}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Subm. {formatDate(m.data_submissao)}</span>
                        <span>{m.anexos_count} anexo(s) · {m.nfs_count} NF(s)</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="success" size="sm" onClick={() => setModalAprovar(m.id)}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aprovar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setModalRejeitar(m.id)}>
                          <XCircle className="w-3.5 h-3.5" />
                          Rejeitar
                        </Button>
                        <Link href={`/contratos/${m.contrato.id}/medicoes/${m.id}`}>
                          <Button variant="outline" size="sm">
                            Ver detalhes <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Histórico */}
        {aba === 'historico' && (
          <div className="space-y-2">
            {historico.map(m => (
              <Card key={m.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      m.status === 'aprovado' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {m.status === 'aprovado'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <XCircle className="w-4 h-4 text-red-500" />
                      }
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Medição #{String(m.numero).padStart(3, '0')}</span>
                        <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                          {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                        </Badge>
                        <Badge className={TIPO_COLORS[m.tipo]}>{TIPO_LABELS[m.tipo]}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">{m.contrato.numero} · {m.periodo_referencia}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{formatCurrency(m.valor_total)}</p>
                      <p className="text-xs text-gray-400">{m.status === 'aprovado' ? 'Aprovado' : 'Rejeitado'} em {formatDate(m.data_aprovacao)}</p>
                    </div>
                    <Link href={`/contratos/${m.contrato_id}/medicoes/${m.id}`}>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Aprovar */}
      <Dialog open={!!modalAprovar} onOpenChange={() => setModalAprovar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição
            </DialogTitle>
            <DialogDescription>
              {medicaoAprovar && <>
                <strong>{medicaoAprovar.contrato.numero}</strong> · Período {medicaoAprovar.periodo_referencia} ·{' '}
                <strong>{formatCurrency(medicaoAprovar.valor_total)}</strong>
              </>}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-green-50 rounded-lg text-xs text-green-700">
              Um e-mail de confirmação será enviado automaticamente para o fornecedor e para os envolvidos no contrato.
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Comentário (opcional)</label>
              <Textarea
                placeholder="Observações sobre a aprovação..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(null)}>Cancelar</Button>
            <Button variant="success" onClick={confirmarAprovacao} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Aprovar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={!!modalRejeitar} onOpenChange={() => setModalRejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeitar Medição
            </DialogTitle>
            <DialogDescription>
              Informe o motivo. O fornecedor receberá um e-mail explicando o que precisa ser corrigido.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo da Rejeição *</label>
              <Textarea
                placeholder="Descreva detalhadamente o que precisa ser corrigido..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarRejeicao} loading={saving} disabled={!motivo}>
              <XCircle className="w-4 h-4" />
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
