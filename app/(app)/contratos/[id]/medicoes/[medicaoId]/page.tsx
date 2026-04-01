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

  const [historicoMedicoes, setHistoricoMedicoes] = useState<any[]>([])

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
    // Load historical measurements for anomaly detection
    fetch(`/api/contratos/${contratoId}/medicoes`)
      .then(r => r.ok ? r.json() : [])
      .then((lista: any[]) => setHistoricoMedicoes(lista.filter((m: any) => m.status === 'aprovado' && m.id !== medicaoId)))
  }, [contratoId, medicaoId])

  useEffect(() => {
    if (status !== null && medicao !== null && status !== medicao.status) {
      fetchMedicao()
    }
  }, [status])

  if (!medicao || !status) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const isPendente = status === 'submetido' || status === 'em_analise'

  // Anomaly detection: flag if value is >2x the average of approved measurements
  const anomalia = (() => {
    if (historicoMedicoes.length < 2) return null
    const media = historicoMedicoes.reduce((s, m) => s + (m.valor_total || 0), 0) / historicoMedicoes.length
    if (media > 0 && medicao.valor_total > media * 2)
      return { media, fator: (medicao.valor_total / media).toFixed(1) }
    return null
  })()

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

  const ACAO_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    aprovado: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-900/30', label: 'Aprovação' },
    rejeitado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Rejeição' },
    solicitou_ajuste: { icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-900/30', label: 'Ajuste Solicitado' },
    comentou: { icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Comentário' },
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const itens: any[] = medicao.medicao_itens || []
  const anexos: any[] = medicao.medicao_anexos || []
  const notas_fiscais: any[] = medicao.notas_fiscais || []
  const aprovacoes: any[] = medicao.aprovacoes || []

  async function downloadPDF() {
    // Dynamic import to avoid SSR issues
    const { pdf } = await import('@react-pdf/renderer')
    const { MedicaoPDF } = await import('@/components/pdf/MedicaoPDF')
    const blob = await pdf(
      <MedicaoPDF medicao={medicao} itens={itens} aprovacoes={aprovacoes} />
    ).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medicao-${String(medicao.numero).padStart(3,'0')}-${medicao.periodo_referencia}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

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
            <Button variant="outline" size="sm" onClick={downloadPDF}>
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
            {/* Anomaly alert */}
            {anomalia && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-red-800/50 bg-red-900/20">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Valor atípico detectado</p>
                  <p className="text-xs text-red-300/70 mt-0.5">
                    Esta medição ({formatCurrency(medicao.valor_total)}) é <strong className="text-red-300">{anomalia.fator}×</strong> a média histórica de medições aprovadas ({formatCurrency(anomalia.media)}). Revise os itens antes de aprovar.
                  </p>
                </div>
              </div>
            )}
            {/* Header card */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getMedicaoStatusColor(status)}>
                        {MEDICAO_STATUS_LABELS[status]}
                      </Badge>
                      <Badge className="bg-teal-900/30 text-teal-400 border-teal-800/50">
                        {TIPO_MEDICAO_LABELS[medicao.tipo as keyof typeof TIPO_MEDICAO_LABELS]}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">{formatCurrency(medicao.valor_total)}</p>
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
                    <Hash className="w-3.5 h-3.5 text-[#475569]" />
                    <div>
                      <p className="text-[#475569]">Medição</p>
                      <p className="font-medium text-[#F1F5F9]">#{String(medicao.numero).padStart(3, '0')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#475569]" />
                    <div>
                      <p className="text-[#475569]">Período</p>
                      <p className="font-medium text-[#F1F5F9]">{medicao.periodo_referencia}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-[#475569]" />
                    <div>
                      <p className="text-[#475569]">Solicitante</p>
                      <p className="font-medium text-[#F1F5F9]">{medicao.solicitante_nome}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#475569]" />
                    <div>
                      <p className="text-[#475569]">Submetido em</p>
                      <p className="font-medium text-[#F1F5F9]">{formatDate(medicao.data_submissao)}</p>
                    </div>
                  </div>
                </div>

                {medicao.observacoes && (
                  <div className="mt-4 pt-4 border-t border-[#1E293B] text-xs text-[#94A3B8]">
                    <p className="font-medium text-[#475569] mb-1">Observações:</p>
                    <p>{medicao.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Itens */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#F1F5F9]">Itens da Medição ({itens.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1E293B]">
                      <th className="text-left py-2 text-[#475569] font-medium">Código</th>
                      <th className="text-left py-2 text-[#475569] font-medium">Descrição</th>
                      <th className="text-center py-2 text-[#475569] font-medium">Un.</th>
                      <th className="text-right py-2 text-[#475569] font-medium">Qtd.</th>
                      <th className="text-right py-2 text-[#475569] font-medium">V. Unit.</th>
                      <th className="text-right py-2 text-[#475569] font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item: any, idx: number) => (
                      <tr key={item.id} className={`border-b border-[#1E293B] ${idx % 2 === 0 ? 'bg-[#0D1421]' : 'bg-[#111827]'}`}>
                        <td className="py-2 font-mono text-[#475569]">{item.detalhamento?.codigo}</td>
                        <td className="py-2 text-[#94A3B8]">{item.detalhamento?.descricao}</td>
                        <td className="py-2 text-center text-[#475569]">{item.detalhamento?.unidade}</td>
                        <td className="py-2 text-right text-[#F1F5F9]">{Number(item.quantidade_medida).toLocaleString('pt-BR')}</td>
                        <td className="py-2 text-right text-[#475569]">{formatCurrency(item.valor_unitario)}</td>
                        <td className="py-2 text-right font-semibold text-[#F1F5F9]">{formatCurrency(item.quantidade_medida * item.valor_unitario)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#2d3f5c]">
                      <td colSpan={5} className="pt-2 font-bold text-[#94A3B8]">Total da Medição</td>
                      <td className="pt-2 text-right font-bold text-blue-400 text-sm">{formatCurrency(medicao.valor_total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>

            {/* Notas Fiscais */}
            {notas_fiscais.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-[#F1F5F9]">Notas Fiscais — Faturamento Direto</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {notas_fiscais.map((nf: any) => (
                      <div key={nf.id} className="flex items-center gap-3 p-3 bg-[#0D1421] rounded-lg border border-[#1E293B]">
                        <FileText className="w-4 h-4 text-[#475569] flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#F1F5F9]">NF {nf.numero_nf}</p>
                          <p className="text-xs text-[#475569]">{nf.emitente} · {formatDate(nf.data_emissao)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm text-[#F1F5F9]">{formatCurrency(nf.valor)}</p>
                          <Badge className={
                            nf.status_validacao === 'aprovada' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' :
                            nf.status_validacao === 'rejeitada' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
                            'bg-amber-900/30 text-amber-400 border-amber-800/50'
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
                <CardTitle className="text-sm flex items-center gap-2 text-[#F1F5F9]">
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
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#1a2236] cursor-pointer group"
                    >
                      <FileText className="w-4 h-4 text-[#475569] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#94A3B8] truncate">{a.nome_original}</p>
                        <p className="text-[10px] text-[#475569]">{formatBytes(a.tamanho_bytes)}</p>
                      </div>
                      <Download className="w-3.5 h-3.5 text-[#475569] group-hover:text-blue-400 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#F1F5F9]">Histórico / Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aprovacoes.map((a: any) => {
                    const config = ACAO_CONFIG[a.acao] || ACAO_CONFIG['comentou']
                    const Icon = config.icon
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className={`w-7 h-7 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0 ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-[#F1F5F9]">{a.aprovador_nome}</p>
                          <p className="text-xs text-[#475569]">{config.label}</p>
                          {a.comentario && <p className="text-xs text-[#94A3B8] mt-1 bg-[#0D1421] p-2 rounded border border-[#1E293B]">{a.comentario}</p>}
                          <p className="text-[10px] text-[#475569] mt-1">{formatDatetime(a.created_at)}</p>
                        </div>
                      </div>
                    )
                  })}

                  {status === 'aprovado' && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-emerald-900/30 flex items-center justify-center flex-shrink-0 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#F1F5F9]">Medição Aprovada</p>
                        <p className="text-xs text-[#475569]">E-mail enviado para o fornecedor</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Partes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#F1F5F9]">Partes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <p className="text-[#475569] font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratante</p>
                  <p className="font-medium text-[#F1F5F9]">{medicao.contrato?.contratante?.nome}</p>
                  <p className="text-[#475569]">{medicao.contrato?.contratante?.email_contato}</p>
                </div>
                <div className="border-t border-[#1E293B] pt-3">
                  <p className="text-[#475569] font-medium uppercase tracking-wide text-[10px] mb-0.5">Contratado</p>
                  <p className="font-medium text-[#F1F5F9]">{medicao.contrato?.contratado?.nome}</p>
                  <p className="text-[#475569]">{medicao.contrato?.contratado?.email_contato}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Aprovar */}
      <Dialog open={modalAprovar} onOpenChange={setModalAprovar}>
        <DialogContent className="bg-[#111827] border border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição #{String(medicao.numero).padStart(3, '0')}
            </DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Valor: <strong className="text-[#F1F5F9]">{formatCurrency(medicao.valor_total)}</strong> · Período: {medicao.periodo_referencia}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="p-3 bg-emerald-900/20 border border-emerald-800/40 rounded-lg text-xs text-emerald-400">
              Ao aprovar, um e-mail automático será enviado para o fornecedor ({medicao.contrato?.contratado?.nome}) com a confirmação.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Comentário (opcional)</Label>
              <Textarea
                placeholder="Adicione observações sobre a aprovação..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                className="bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
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
        <DialogContent className="bg-[#111827] border border-[#1E293B]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Rejeitar Medição #{String(medicao.numero).padStart(3, '0')}
            </DialogTitle>
            <DialogDescription className="text-[#94A3B8]">
              Informe o motivo da rejeição. O fornecedor será notificado por e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#475569] font-medium uppercase tracking-wider">Motivo da Rejeição *</Label>
              <Textarea
                placeholder="Descreva claramente o motivo da rejeição e o que precisa ser corrigido..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-[100px] bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] placeholder:text-[#475569]"
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
