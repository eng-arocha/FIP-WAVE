'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { formatCurrency, formatDatetime } from '@/lib/utils'
import {
  ArrowLeft, Ban, CheckCircle2, XCircle, Loader2, Inbox, AlertTriangle,
} from 'lucide-react'

interface SolicitacaoEncerramento {
  id: string
  contrato_id: string
  solicitacao_fat_direto_id: string
  motivo: string
  status: string
  saldo: number
  pedido_numero?: number | null
  pedido_descricao?: string | null
  solicitante?: { nome: string; email: string } | null
  data_solicitacao?: string | null
}

export default function EncerramentosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contratoId } = use(params)

  const [items, setItems] = useState<SolicitacaoEncerramento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // Modais
  const [aprovarItem, setAprovarItem] = useState<SolicitacaoEncerramento | null>(null)
  const [rejeitarItem, setRejeitarItem] = useState<SolicitacaoEncerramento | null>(null)
  const [motivoRejeicao, setMotivoRejeicao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroAcao, setErroAcao] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await fetch(`/api/contratos/${contratoId}/encerramento-saldo`, { cache: 'no-store' })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(body?.error || `Falha ao carregar (HTTP ${r.status}).`)
        setItems([])
        return
      }
      const list: SolicitacaoEncerramento[] = Array.isArray(body)
        ? body
        : Array.isArray(body?.items)
          ? body.items
          : Array.isArray(body?.data)
            ? body.data
            : []
      setItems(list)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [contratoId])

  useEffect(() => { carregar() }, [carregar])

  function abrirAprovar(item: SolicitacaoEncerramento) {
    setErroAcao('')
    setAprovarItem(item)
  }

  function abrirRejeitar(item: SolicitacaoEncerramento) {
    setErroAcao('')
    setMotivoRejeicao('')
    setRejeitarItem(item)
  }

  async function confirmarAprovar() {
    if (!aprovarItem) return
    setSalvando(true)
    setErroAcao('')
    try {
      const res = await fetch(`/api/encerramento-saldo/${aprovarItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'aprovar' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroAcao(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setAprovarItem(null)
      await carregar()
    } catch (e: any) {
      setErroAcao(e?.message || 'Erro de rede.')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarRejeitar() {
    if (!rejeitarItem) return
    if (!motivoRejeicao.trim()) {
      setErroAcao('Informe o motivo da rejeição.')
      return
    }
    setSalvando(true)
    setErroAcao('')
    try {
      const res = await fetch(`/api/encerramento-saldo/${rejeitarItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'rejeitar',
          motivo_rejeicao: motivoRejeicao.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroAcao(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setRejeitarItem(null)
      setMotivoRejeicao('')
      await carregar()
    } catch (e: any) {
      setErroAcao(e?.message || 'Erro de rede.')
    } finally {
      setSalvando(false)
    }
  }

  function formatPedido(item: SolicitacaoEncerramento): string {
    if (typeof item.pedido_numero === 'number') {
      return `FIP-${String(item.pedido_numero).padStart(4, '0')}`
    }
    return item.solicitacao_fat_direto_id?.slice(0, 8) ?? '—'
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Solicitações de Encerramento de Saldo" />

      <div className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${contratoId}`}>
              <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar ao contrato
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
                Solicitações de Encerramento de Saldo
              </h1>
              <p className="text-xs text-[var(--text-3)]">
                Aprove ou rejeite pedidos de cancelamento de saldo dos pedidos FIP. O saldo aprovado
                volta ao teto do contrato.
              </p>
            </div>
          </div>
        </div>

        {/* Erro de carga */}
        {erro && (
          <div className="rounded-lg px-3 py-2 text-sm flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 flex items-center justify-center text-[var(--text-3)] text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando solicitações...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-[var(--text-3)] text-sm">
                <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
                Nenhuma solicitação pendente.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse', minWidth: 960 }}>
                  <thead style={{ background: 'var(--surface-3)' }}>
                    <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <th style={th()}>Pedido</th>
                      <th style={{ ...th(), textAlign: 'right' }}>Saldo</th>
                      <th style={th()}>Solicitado por</th>
                      <th style={th()}>Solicitado em</th>
                      <th style={{ ...th(), textAlign: 'left' }}>Motivo</th>
                      <th style={{ ...th(), textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} style={{
                        borderBottom: '1px solid var(--border)',
                        background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                      }}>
                        <td style={{ ...td(), maxWidth: 220 }}>
                          <Link
                            href={`/contratos/${contratoId}/fat-direto/${item.solicitacao_fat_direto_id}`}
                            className="font-mono font-bold text-blue-400 hover:underline"
                          >
                            {formatPedido(item)}
                          </Link>
                          {item.pedido_descricao && (
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                              {item.pedido_descricao}
                            </p>
                          )}
                        </td>
                        <td style={{ ...td(), textAlign: 'right' }}>
                          <span className="font-bold tabular-nums text-amber-400">
                            {formatCurrency(item.saldo ?? 0)}
                          </span>
                        </td>
                        <td style={td()}>
                          <p className="text-[12px]" style={{ color: 'var(--text-1)' }}>
                            {item.solicitante?.nome || '—'}
                          </p>
                          {item.solicitante?.email && (
                            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                              {item.solicitante.email}
                            </p>
                          )}
                        </td>
                        <td style={td()}>
                          <span className="text-[12px]" style={{ color: 'var(--text-2)' }}>
                            {formatDatetime(item.data_solicitacao)}
                          </span>
                        </td>
                        <td style={{ ...td(), maxWidth: 320, textAlign: 'left' }}>
                          <p className="text-[12px] whitespace-pre-wrap break-words" style={{ color: 'var(--text-2)' }}>
                            {item.motivo || '—'}
                          </p>
                        </td>
                        <td style={{ ...td(), textAlign: 'right' }}>
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => abrirAprovar(item)}
                              className="gap-1.5"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => abrirRejeitar(item)}
                              className="gap-1.5"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Rejeitar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Aprovar */}
      <Dialog
        open={!!aprovarItem}
        onOpenChange={(open) => {
          if (!open && !salvando) { setAprovarItem(null); setErroAcao('') }
        }}
      >
        <DialogContent>
          {aprovarItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Aprovar encerramento de {formatCurrency(aprovarItem.saldo ?? 0)} do pedido {formatPedido(aprovarItem)}?
                </DialogTitle>
                <DialogDescription className="text-[var(--text-2)]">
                  Solicitado por {aprovarItem.solicitante?.nome || '—'}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="p-3 rounded-lg text-xs"
                  style={{
                    background: 'rgba(245,158,11,0.10)',
                    border: '1px solid rgba(245,158,11,0.40)',
                    color: 'var(--text-2)',
                  }}>
                  <p className="font-semibold text-amber-400 mb-1">
                    <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
                    Aviso
                  </p>
                  O saldo será cancelado e devolvido ao teto do contrato.
                  <strong> Esta ação não pode ser desfeita.</strong>
                </div>
                {aprovarItem.motivo && (
                  <div>
                    <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                      Motivo informado
                    </Label>
                    <p className="text-[12px] mt-1 whitespace-pre-wrap break-words"
                      style={{ color: 'var(--text-2)' }}>
                      {aprovarItem.motivo}
                    </p>
                  </div>
                )}
                {erroAcao && <p className="text-xs text-red-400">{erroAcao}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAprovarItem(null)} disabled={salvando}>
                  Cancelar
                </Button>
                <Button variant="success" onClick={confirmarAprovar} loading={salvando}>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Aprovação
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog
        open={!!rejeitarItem}
        onOpenChange={(open) => {
          if (!open && !salvando) { setRejeitarItem(null); setMotivoRejeicao(''); setErroAcao('') }
        }}
      >
        <DialogContent>
          {rejeitarItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-400 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Rejeitar encerramento
                </DialogTitle>
                <DialogDescription className="text-[var(--text-2)]">
                  Pedido {formatPedido(rejeitarItem)} · Saldo {formatCurrency(rejeitarItem.saldo ?? 0)}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                    Motivo da Rejeição *
                  </Label>
                  <Textarea
                    value={motivoRejeicao}
                    onChange={e => setMotivoRejeicao(e.target.value)}
                    placeholder="Descreva o motivo da rejeição..."
                    className="min-h-[100px] bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
                  />
                </div>
                {erroAcao && <p className="text-xs text-red-400">{erroAcao}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejeitarItem(null)} disabled={salvando}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmarRejeitar}
                  loading={salvando}
                  disabled={!motivoRejeicao.trim()}
                >
                  <XCircle className="w-4 h-4" />
                  Confirmar Rejeição
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function th(): React.CSSProperties {
  return { padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
}

function td(): React.CSSProperties {
  return { padding: '10px 12px', verticalAlign: 'top', fontSize: '12px' }
}
