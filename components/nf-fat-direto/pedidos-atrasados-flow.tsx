'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { Envolvido } from './shared'

/** Dados do alerta contextual disparado após cadastrar uma NF. */
export interface AlertaPedidosAtrasados {
  contrato_id: string
  ref_solicitacao_id: string
  numero_nf_recente: string
  qtd: number
}

interface PreviewPedidosAtrasados {
  contrato_id: string
  ref_solicitacao_id: string
  numero_nf_recente: string
  preview: { subject: string; html: string }
  envolvidos: Envolvido[]
  pedidos_atrasados: Array<{
    numero_pedido_fip: number
    data_aprovacao: string
    valor_total: number
    total_nfs: number
    saldo: number
    dias_decorridos: number
  }>
  dias_alerta: number
}

/**
 * Fluxo de notificação de pedidos anteriores pendentes (> 15 dias sem NF):
 * banner contextual (canto inferior) → preview do email → envio.
 *
 * O gatilho (`alerta`) é setado pela página após o cadastro de uma NF;
 * o restante do fluxo (preview + envio) é autocontido aqui.
 */
export function PedidosAtrasadosFlow({
  alerta,
  onDismiss,
}: {
  alerta: AlertaPedidosAtrasados | null
  onDismiss: () => void
}) {
  const [preview, setPreview] = useState<PreviewPedidosAtrasados | null>(null)
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  async function abrirPreview() {
    if (!alerta) return
    setSaving(true)
    setErro('')
    try {
      const res = await fetch(
        `/api/contratos/${alerta.contrato_id}/fat-direto/pedidos-atrasados`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref_solicitacao_id: alerta.ref_solicitacao_id,
            numero_nf_recente: alerta.numero_nf_recente,
            dry_run: true,
          }),
        },
      )
      const d = await res.json()
      if (!res.ok) {
        setErro(d.error || 'Erro ao gerar preview.')
        return
      }
      setPreview({
        contrato_id: alerta.contrato_id,
        ref_solicitacao_id: alerta.ref_solicitacao_id,
        numero_nf_recente: alerta.numero_nf_recente,
        preview: d.preview,
        envolvidos: d.envolvidos || [],
        pedidos_atrasados: d.pedidos_atrasados || [],
        dias_alerta: d.dias_alerta || 15,
      })
      setDestinatarios(new Set((d.envolvidos || []).map((u: any) => u.id)))
      onDismiss()
    } catch (e: any) {
      setErro(e?.message || 'Erro ao gerar preview.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmarEnviar() {
    if (!preview) return
    if (destinatarios.size === 0) {
      if (!confirm('Nenhum envolvido selecionado — fechar sem enviar email?')) return
      setPreview(null)
      return
    }
    setSaving(true)
    setErro('')
    try {
      const res = await fetch(
        `/api/contratos/${preview.contrato_id}/fat-direto/pedidos-atrasados`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref_solicitacao_id: preview.ref_solicitacao_id,
            numero_nf_recente: preview.numero_nf_recente,
            dry_run: false,
            destinatarios_ids: Array.from(destinatarios),
          }),
        },
      )
      const d = await res.json()
      if (!res.ok) {
        setErro(d.error || 'Erro ao enviar.')
        return
      }
      setPreview(null)
    } catch (e: any) {
      setErro(e?.message || 'Erro ao enviar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Banner contextual: pedidos anteriores pendentes (15 dias) */}
      {alerta && (
        <div
          className="fixed bottom-4 right-4 z-40 max-w-md rounded-2xl shadow-lg"
          style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.50)' }}
        >
          <div className="px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <div className="flex-1 text-sm">
              <p className="font-bold mb-0.5" style={{ color: 'var(--text-1)' }}>
                {alerta.qtd} pedido(s) anterior(es) pendente(s)
              </p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-2)' }}>
                Detectamos pedidos aprovados antes deste sem NF lançada há mais de 15 dias.
                Pode notificar a FIP por email.
              </p>
              {erro && (
                <p className="text-xs mb-2 font-medium" style={{ color: '#EF4444' }}>{erro}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onDismiss}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  Dispensar
                </button>
                <button
                  onClick={abrirPreview}
                  disabled={saving}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white disabled:opacity-50"
                  style={{ background: '#F59E0B' }}
                >
                  {saving ? 'Carregando...' : 'Notificar FIP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: preview email pedidos atrasados */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.50)' }}
          onClick={() => !saving && setPreview(null)}
        >
          <div
            className="rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.06)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: '#F59E0B' }} />
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  Notificar FIP — pedidos anteriores pendentes
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {preview.pedidos_atrasados.length} pedido(s) sem NF há mais de {preview.dias_alerta} dias
                </p>
              </div>
              <button onClick={() => setPreview(null)} disabled={saving} className="rounded-lg p-1 hover:bg-[var(--surface-2)]">
                <span className="text-lg" style={{ color: 'var(--text-2)' }}>×</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Assunto</p>
                <p className="text-sm" style={{ color: 'var(--text-1)' }}>{preview.preview.subject}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>Corpo do email</p>
                <iframe
                  srcDoc={preview.preview.html}
                  className="w-full rounded-lg"
                  style={{ height: 380, border: '1px solid var(--border)', background: 'white' }}
                  sandbox=""
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Destinatários ({destinatarios.size}/{preview.envolvidos.length})
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                  {preview.envolvidos.length === 0
                    ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nenhum envolvido cadastrado neste contrato.</p>
                    : preview.envolvidos.map(u => (
                      <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-[var(--surface-2)] p-1 rounded">
                        <input
                          type="checkbox"
                          checked={destinatarios.has(u.id)}
                          onChange={e => {
                            const next = new Set(destinatarios)
                            if (e.target.checked) next.add(u.id); else next.delete(u.id)
                            setDestinatarios(next)
                          }}
                        />
                        <span style={{ color: 'var(--text-1)' }}>{u.nome}</span>
                        <span style={{ color: 'var(--text-3)' }}>· {u.email}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <button onClick={() => setPreview(null)} disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={confirmarEnviar} disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60" style={{ background: '#F59E0B' }}>
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Enviando...</> : <>Enviar email</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
