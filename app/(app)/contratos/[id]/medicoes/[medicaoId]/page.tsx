'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  ArrowLeft, CheckCircle2, XCircle, MessageSquare, Download,
  FileText, User, Calendar, Hash, Clock, Paperclip, AlertCircle, Loader2
} from 'lucide-react'
import {
  formatCurrency, formatDatetime, formatDate,
  getMedicaoStatusColor
} from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, TIPO_MEDICAO_LABELS, MedicaoStatus } from '@/types'

export default function MedicaoDetailPage({ params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const { id: contratoId, medicaoId } = use(params)

  const [medicao, setMedicao] = useState<any>(null)
  const [modalAprovar, setModalAprovar] = useState(false)
  const [modalRejeitar, setModalRejeitar] = useState(false)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<MedicaoStatus | null>(null)

  async function fetchMedicao() {
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}`)
    if (res.ok) {
      const data = await res.json()
      setMedicao(data)
      setStatus(data.status)
    }
  }

  useEffect(() => {
    fetchMedicao()
  }, [contratoId, medicaoId])

  useEffect(() => {
    if (status !== null && medicao !== null && status !== medicao.status) {
      fetchMedicao()
    }
  }, [status])

  if (!medicao || !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e3a5f]" />
      </div>
    )
  }

  const isPendente = status === 'submetido' || status === 'em_analise'

  async function aprovar() {
    setSaving(true)
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovadorNome: 'Fiscal FIP', aprovadorEmail: 'fiscal@fipengenharia.com.br', comentario, medicao })
    })
    setSaving(false)
    if (res.ok) { setStatus('aprovado'); setModalAprovar(false) }
  }

  async function rejeitar() {
    if (!motivo) return
    setSaving(true)
    const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/rejeitar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aprovadorNome: 'Fiscal FIP', aprovadorEmail: 'fiscal@fipengenharia.com.br', comentario: motivo, medicao })
    })
    setSaving(false)
    if (res.ok) { setStatus('rejeitado'); setModalRejeitar(false) }
  }

  const ACAO_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    aprovado: { icon: CheckCircle2, color: 'text-green-600', label: 'Aprovação' },
    rejeitado: { icon: XCircle, color: 'text-red-500', label: 'Rejeição' },
    solicitou_ajuste: { icon: AlertCircle, color: 'text-yellow-500', label: 'Ajuste Solicitado' },
    comentou: { icon: MessageSquare, color: 'text-blue-500', label: 'Comentário' },
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const itens: any[] = medicao.medicao_itens || []
  const anexos: any[] = medicao.medicao_anexos || []
  const notas_fiscais: any[] = medicao.notas_fiscais || []
  const aprovacoes: any[] = medicao.aprovacoes || []

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title={`Medição #${String(medicao.numero).padStart(3, '0')} — ${medicao.periodo_referencia}`}
        subtitle={medicao.contrato?.numero}
        actions={
          <div className="flex gap-2">
            <Link href={`/contratos/${contratoId}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="w-4 h-4" />
              Exportar PDF
            </Button>
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="xl:col-span-2 space-y-5">
            {/* Header card */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getMedicaoStatusColor(status)}>
                        {MEDICAO_STATUS_LABELS[status]}
                      </Badge>
                      <Badge className="bg-teal-100 text-teal-700 border-teal-200">
                        {TIPO_MEDICAO_LABELS[medicao.tipo as keyof typeof TIPO_MEDICAO_LABELS]}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-[#1e3a5f]">{formatCurrency(medicao.valor_total)}</p>
                  </div>
                  {isPendente && (
                    <div className="flex gap-2">
                      <Button variant="success" size="sm" onClick={() => setModalAprovar(true)}>
                        <CheckCircle2 className="w-4 h-4" />
                        Aprovar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setModalRejeitar(true)}>
                        <XCircle className="w-4 h-4" />
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-gray-400" />
                    <div>
                      <p className="text-gray-400">Medição</p>
                      <p className="font-medium">#{String(medicao.numero).padStart(3, '0')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    <div>
                      <p className="text-gray-400">Período</p>
                      <p className="font-medium">{medicao.periodo_referencia}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <div>
                      <p className="text-gray-400">Solicitante</p>
                      <p className="font-medium">{medicao.solicitante_nome}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <div>
                      <p className="text-gray-400">Submetido em</p>
                      <p className="font-medium">{formatDate(medicao.data_submissao)}</p>
                    </div>
                  </div>
                </div>

                {medicao.observacoes && (
                  <div className="mt-4 pt-4 border-t text-xs text-gray-600">
                    <p className="font-medium text-gray-500 mb-1">Observações:</p>
                    <p>{medicao.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Itens */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Itens da Medição ({itens.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-400 font-medium">Código</th>
                      <th className="text-left py-2 text-gray-400 font-medium">Descrição</th>
                      <th className="text-center py-2 text-gray-400 font-medium">Un.</th>
                      <th className="text-right py-2 text-gray-400 font-medium">Qtd.</th>
                      <th className="text-right py-2 text-gray-400 font-medium">V. Unit.</th>
                      <th className="text-right py-2 text-gray-400 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item: any) => (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-2 font-mono text-gray-400">{item.detalhamento?.codigo}</td>
                        <td className="py-2 text-gray-700">{item.detalhamento?.descricao}</td>
                        <td className="py-2 text-center text-gray-500">{item.detalhamento?.unidade}</td>
                        <td className="py-2 text-right">{Number(item.quantidade_medida).toLocaleString('pt-BR')}</td>
                        <td className="py-2 text-right text-gray-500">{formatCurrency(item.valor_unitario)}</td>
                        <td className="py-2 text-right font-semibold text-gray-900">{formatCurrency(item.quantidade_medida * item.valor_unitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={5} className="pt-2 font-bold text-gray-700">Total da Medição</td>
                      <td className="pt-2 text-right font-bold text-[#1e3a5f] text-sm">{formatCurrency(medicao.valor_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* Notas Fiscais */}
            {notas_fiscais.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Notas Fiscais — Faturamento Direto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {notas_fiscais.map((nf: any) => (
                      <div key={nf.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">NF {nf.numero_nf}</p>
                          <p className="text-xs text-gray-500">{nf.emitente} · {formatDate(nf.data_emissao)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{formatCurrency(nf.valor)}</p>
                          <Badge className={
                            nf.status_validacao === 'aprovada' ? 'bg-green-100 text-green-700 border-green-200' :
                            nf.status_validacao === 'rejeitada' ? 'bg-red-100 text-red-700 border-red-200' :
                            'bg-yellow-100 text-yellow-700 border-yellow-200'
                          }>
                            {nf.status_validacao === 'aprovada' ? 'Validada' : nf.status_validacao === 'rejeitada' ? 'Rejeitada' : 'Pendente'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar right */}
          <div className="space-y-5">
            {/* Anexos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  Documentos Anexados ({anexos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {anexos.map((a: any) => (
                    <a
                      key={a.id}
                      href={a.url}
                      download={a.nome_original}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                    >
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{a.nome_original}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(a.tamanho_bytes)}</p>
                      </div>
                      <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#1e3a5f] flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Histórico / Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aprovacoes.map((a: any) => {
                    const config = ACAO_CONFIG[a.acao] || ACAO_CONFIG['comentou']
                    const Icon = config.icon
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-800">{a.aprovador_nome}</p>
                          <p className="text-xs text-gray-500">{config.label}</p>
                          {a.comentario && <p className="text-xs text-gray-600 mt-1 bg-gray-50 p-2 rounded">{a.comentario}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">{formatDatetime(a.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}

                  {status === 'aprovado' && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-800">Medição Aprovada</p>
                        <p className="text-xs text-gray-500">E-mail enviado para o fornecedor</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Partes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Partes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratante</p>
                  <p className="font-medium text-gray-800">{medicao.contrato?.contratante?.nome}</p>
                  <p className="text-gray-400">{medicao.contrato?.contratante?.email_contato}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratado</p>
                  <p className="font-medium text-gray-800">{medicao.contrato?.contratado?.nome}</p>
                  <p className="text-gray-400">{medicao.contrato?.contratado?.email_contato}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Aprovar */}
      <Dialog open={modalAprovar} onOpenChange={setModalAprovar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-700 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição #{String(medicao.numero).padStart(3, '0')}
            </DialogTitle>
            <DialogDescription>
              Valor: <strong>{formatCurrency(medicao.valor_total)}</strong> · Período: {medicao.periodo_referencia}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-green-50 rounded-lg text-xs text-green-700">
              Ao aprovar, um e-mail automático será enviado para o fornecedor ({medicao.contrato?.contratado?.nome}) com a confirmação.
            </div>
            <div className="space-y-1.5">
              <Label>Comentário (opcional)</Label>
              <Textarea
                placeholder="Adicione observações sobre a aprovação..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(false)}>Cancelar</Button>
            <Button variant="success" onClick={aprovar} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Confirmar Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={modalRejeitar} onOpenChange={setModalRejeitar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeitar Medição #{String(medicao.numero).padStart(3, '0')}
            </DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. O fornecedor será notificado por e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label>Motivo da Rejeição *</Label>
              <Textarea
                placeholder="Descreva claramente o motivo da rejeição e o que precisa ser corrigido..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitar} loading={saving} disabled={!motivo}>
              <XCircle className="w-4 h-4" />
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
