'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Mail, X } from 'lucide-react'

const TOLERANCE_EMAIL = 100 // saldo ≤ R$100: não pergunta sobre email

interface ItemPedido {
  id: string
  descricao: string
  valor_unitario: number
  valor_devolvido: number
  /** "tarefa.codigo" se disponível (ex.: "1.1.1") */
  codigo?: string | null
}

interface Envolvido {
  id: string
  nome: string | null
  email: string
}

export interface EncerrarPedidoModalProps {
  open: boolean
  onClose: () => void
  contratoId: string
  solId: string
  numeroPedidoFip: number | null | undefined
  valorTotalPedido: number
  totalNfsRecebidas: number
  itens: ItemPedido[]
  /** Lista de usuários do contrato pra notificação (pode ser vazia). */
  envolvidos?: Envolvido[]
  onSuccess?: (resp: { saldo_devolvido: number; total_nfs: number; valor_original: number }) => void
}

export function EncerrarPedidoModal(props: EncerrarPedidoModalProps) {
  const { open, onClose, contratoId, solId, valorTotalPedido, totalNfsRecebidas, itens, envolvidos = [], onSuccess } = props

  const saldoPedido = Math.max(0, valorTotalPedido - totalNfsRecebidas)
  const precisaEmail = saldoPedido > TOLERANCE_EMAIL

  // Saldo disponível por item = valor_unitario − valor_devolvido (já existente)
  const itensComSaldo = useMemo(
    () => itens.map(it => ({
      ...it,
      saldo_disponivel: Math.max(0, it.valor_unitario - it.valor_devolvido),
    })),
    [itens],
  )
  const totalSaldoItens = itensComSaldo.reduce((s, it) => s + it.saldo_disponivel, 0)

  // Estado: valor a devolver por item (string pra não atrapalhar digitação)
  const [valoresStr, setValoresStr] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [notificar, setNotificar] = useState(false)
  const [destinatariosSel, setDestinatariosSel] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Reset ao abrir/fechar
  useEffect(() => {
    if (!open) return
    // Default: distribui proporcionalmente
    const base: Record<string, string> = {}
    if (totalSaldoItens > 0 && saldoPedido > 0) {
      itensComSaldo.forEach(it => {
        const v = (it.saldo_disponivel / totalSaldoItens) * saldoPedido
        base[it.id] = v > 0 ? v.toFixed(2) : '0.00'
      })
    } else {
      itensComSaldo.forEach(it => { base[it.id] = '0.00' })
    }
    setValoresStr(base)
    setMotivo('')
    setNotificar(precisaEmail)
    // Marca todos envolvidos por default
    setDestinatariosSel(new Set(envolvidos.map(e => e.id)))
    setErro('')
    setSalvando(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function setValor(itemId: string, raw: string) {
    // Permite só números e vírgula/ponto
    const sanitized = raw.replace(/[^\d.,]/g, '').replace(',', '.')
    setValoresStr(prev => ({ ...prev, [itemId]: sanitized }))
  }

  const valoresNum: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {}
    for (const it of itensComSaldo) {
      const v = parseFloat(valoresStr[it.id] ?? '0')
      out[it.id] = Number.isFinite(v) && v >= 0 ? v : 0
    }
    return out
  }, [valoresStr, itensComSaldo])

  const totalDevolvido = Object.values(valoresNum).reduce((s, v) => s + v, 0)
  const diff = totalDevolvido - saldoPedido
  const valido = Math.abs(diff) <= 0.01 && itensComSaldo.every(it => valoresNum[it.id] <= it.saldo_disponivel + 0.01)

  function distribuirIgualmente() {
    if (itensComSaldo.length === 0) return
    const elegiveis = itensComSaldo.filter(it => it.saldo_disponivel > 0)
    if (elegiveis.length === 0) return
    let restante = saldoPedido
    const base: Record<string, string> = {}
    // Inicializa zerado
    itensComSaldo.forEach(it => { base[it.id] = '0.00' })
    // Distribui igualmente respeitando o teto de cada um
    const cota = saldoPedido / elegiveis.length
    let extra = 0
    for (const it of elegiveis) {
      const v = Math.min(cota, it.saldo_disponivel)
      if (v < cota) extra += cota - v
      base[it.id] = v.toFixed(2)
      restante -= v
    }
    // Se sobrou (alguns itens tiveram teto), redistribui pra quem ainda tem espaço
    if (extra > 0.01) {
      for (const it of elegiveis) {
        const atual = parseFloat(base[it.id] || '0')
        const cabe = it.saldo_disponivel - atual
        if (cabe > 0.01 && extra > 0.01) {
          const adicional = Math.min(extra, cabe)
          base[it.id] = (atual + adicional).toFixed(2)
          extra -= adicional
        }
      }
    }
    setValoresStr(base)
  }

  function distribuirProporcionalmente() {
    if (totalSaldoItens <= 0) return
    const base: Record<string, string> = {}
    itensComSaldo.forEach(it => {
      const v = (it.saldo_disponivel / totalSaldoItens) * saldoPedido
      base[it.id] = v > 0 ? v.toFixed(2) : '0.00'
    })
    setValoresStr(base)
  }

  function zerarTodos() {
    const base: Record<string, string> = {}
    itensComSaldo.forEach(it => { base[it.id] = '0.00' })
    setValoresStr(base)
  }

  function toggleEnvolvido(id: string) {
    setDestinatariosSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function confirmar() {
    if (motivo.trim().length < 3) {
      setErro('Informe um motivo para o encerramento (mín. 3 caracteres).')
      return
    }
    if (!valido) {
      setErro(
        Math.abs(diff) > 0.01
          ? `Soma das devoluções (${formatCurrency(totalDevolvido)}) precisa ser igual ao saldo (${formatCurrency(saldoPedido)}). Diferença: ${formatCurrency(diff)}.`
          : 'Algum item ultrapassou o saldo disponível.',
      )
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const devolucoes = itensComSaldo
        .filter(it => valoresNum[it.id] > 0)
        .map(it => ({ item_id: it.id, valor: Number(valoresNum[it.id].toFixed(2)) }))

      const body: Record<string, unknown> = {
        motivo: motivo.trim(),
        devolucoes,
      }
      if (precisaEmail && notificar && destinatariosSel.size > 0) {
        body.notificar_envolvidos = true
        body.destinatarios_ids = Array.from(destinatariosSel)
      }

      const res = await fetch(`/api/contratos/${contratoId}/fat-direto/solicitacoes/${solId}/encerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data?.code ? `[${data.code}] ` : ''
        setErro(`${code}${data?.error || 'Erro ao encerrar o pedido.'}`)
        return
      }
      onSuccess?.({
        saldo_devolvido: data.saldo_devolvido,
        total_nfs: data.total_nfs,
        valor_original: data.valor_original,
      })
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !salvando) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <DialogTitle className="flex items-center gap-2 text-base" style={{ color: 'var(--text-1)' }}>
            <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              <RotateCcw className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </span>
            Encerrar pedido e devolver saldo
          </DialogTitle>
          <DialogDescription className="text-xs" style={{ color: 'var(--text-3)' }}>
            Apenas o <strong style={{ color: '#F59E0B' }}>saldo a devolver de {formatCurrency(saldoPedido)}</strong>{' '}
            ({formatCurrency(valorTotalPedido)} do pedido − {formatCurrency(totalNfsRecebidas)} já em NF) será
            distribuído de volta aos itens originais. O pedido não é excluído e as NFs lançadas
            continuam valendo. Ação irreversível.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-3)' }}>Pedido</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatCurrency(valorTotalPedido)}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--text-3)' }}>NFs recebidas</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalNfsRecebidas)}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: '#F59E0B' }}>Saldo a devolver</p>
              <p className="text-sm font-bold tabular-nums" style={{ color: '#F59E0B' }}>{formatCurrency(saldoPedido)}</p>
            </div>
          </div>

          {saldoPedido <= 0.01 && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)', color: '#10B981' }}>
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>Saldo zerado. Confirmar apenas marca o pedido como encerrado (auditoria).</span>
            </div>
          )}

          {/* Botões de distribuição */}
          {saldoPedido > 0.01 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={distribuirProporcionalmente} className="text-xs">
                Distribuir proporcionalmente
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={distribuirIgualmente} className="text-xs">
                Distribuir igualmente
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={zerarTodos} className="text-xs" style={{ color: 'var(--text-3)' }}>
                Zerar
              </Button>
            </div>
          )}

          {/* Lista de itens */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="grid text-[10px] font-semibold uppercase tracking-wide px-3 py-2"
              style={{ gridTemplateColumns: '24px 80px 1fr 110px 120px', gap: '8px', background: 'var(--surface-3)', color: 'var(--text-3)' }}>
              <span>#</span>
              <span>Código</span>
              <span>Descrição</span>
              <span className="text-right">Saldo disponível</span>
              <span className="text-right">Devolver (R$)</span>
            </div>
            {itensComSaldo.map((it, idx) => {
              const v = valoresNum[it.id] ?? 0
              const excede = v > it.saldo_disponivel + 0.01
              return (
                <div key={it.id}
                  className="grid items-center px-3 py-2 text-xs"
                  style={{ gridTemplateColumns: '24px 80px 1fr 110px 120px', gap: '8px', borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}>
                  <span style={{ color: 'var(--text-3)' }}>{idx + 1}</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{it.codigo || '—'}</span>
                  <span className="truncate" title={it.descricao} style={{ color: 'var(--text-1)' }}>{it.descricao}</span>
                  <span className="text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(it.saldo_disponivel)}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valoresStr[it.id] ?? ''}
                    onChange={e => setValor(it.id, e.target.value)}
                    placeholder="0,00"
                    className="text-right tabular-nums rounded-lg px-2 py-1 outline-none"
                    style={{
                      background: 'var(--surface-2)',
                      border: `1px solid ${excede ? '#EF4444' : 'var(--border)'}`,
                      color: excede ? '#EF4444' : 'var(--text-1)',
                    }}
                  />
                </div>
              )
            })}
            {/* Total */}
            <div className="grid items-center px-3 py-2 text-xs font-bold"
              style={{ gridTemplateColumns: '24px 80px 1fr 110px 120px', gap: '8px', background: 'var(--surface-3)', borderTop: '2px solid var(--border)' }}>
              <span></span>
              <span></span>
              <span style={{ color: 'var(--text-2)' }}>Total devolvido</span>
              <span className="text-right tabular-nums" style={{ color: Math.abs(diff) > 0.01 ? '#EF4444' : '#10B981' }}>
                {formatCurrency(saldoPedido)}
              </span>
              <span className="text-right tabular-nums" style={{ color: Math.abs(diff) > 0.01 ? '#EF4444' : '#10B981' }}>
                {formatCurrency(totalDevolvido)}
              </span>
            </div>
          </div>

          {Math.abs(diff) > 0.01 && saldoPedido > 0.01 && (
            <p className="text-xs" style={{ color: '#EF4444' }}>
              Diferença: {diff > 0 ? '+' : ''}{formatCurrency(diff)} — ajuste pra fechar com o saldo do pedido.
            </p>
          )}

          {/* Motivo */}
          <div>
            <label className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Motivo do encerramento *</label>
            <Textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: Fornecedor não precisará mais do saldo restante; aguardando definição de novo fornecedor."
              rows={3}
              className="mt-1"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>

          {/* Email (só pergunta se saldo > R$100) */}
          {precisaEmail && envolvidos.length > 0 && (
            <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notificar} onChange={e => setNotificar(e.target.checked)} />
                <Mail className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                  Notificar envolvidos por e-mail
                </span>
              </label>
              {notificar && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {envolvidos.map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-xs cursor-pointer rounded px-2 py-1 hover:bg-[var(--surface-3)]">
                      <input
                        type="checkbox"
                        checked={destinatariosSel.has(e.id)}
                        onChange={() => toggleEnvolvido(e.id)}
                      />
                      <span style={{ color: 'var(--text-1)' }}>{e.nome || e.email.split('@')[0]}</span>
                      <span style={{ color: 'var(--text-3)' }}>· {e.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {erro && (
            <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF4444' }}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span className="break-words">{erro}</span>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={salvando || (saldoPedido > 0.01 && !valido)}
            className="gap-2 text-white"
            style={{ background: salvando ? 'var(--surface-3)' : 'linear-gradient(135deg, #F59E0B, #EF4444)' }}
          >
            {salvando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Encerrando...</>
              : <>Encerrar pedido</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
