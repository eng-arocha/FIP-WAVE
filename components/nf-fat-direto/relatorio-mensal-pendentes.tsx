'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Receipt, Loader2, AlertTriangle } from 'lucide-react'
import type { Envolvido } from './shared'

interface RelatorioPendente {
  id: string
  contrato_id: string
  ano: number
  mes: number
  qtd_pedidos: number
  valor_total_atrasado: number
  sequencia_cobranca: number
  contrato: { numero: string; descricao: string }
}

interface PreviewRelatorio {
  relatorio_id: string
  contrato_numero: string
  ano: number
  mes: number
  sequencia: number
  qtd_pedidos: number
  valor_total: number
  preview: { subject: string; html: string }
  envolvidos: Envolvido[]
}

/**
 * Banner + modal de revisão dos relatórios mensais de pedidos fat-direto
 * pendentes (PR 3). Autocontido: busca os pendentes ao montar, mostra o
 * preview do email e envia/descarta.
 */
export function RelatorioMensalPendentes() {
  const [pendentes, setPendentes] = useState<RelatorioPendente[]>([])
  const [preview, setPreview] = useState<PreviewRelatorio | null>(null)
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // Fetch relatórios pendentes quando monta
  useEffect(() => {
    fetch('/api/relatorios-mensais?status=pendente')
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => setPendentes(data || []))
      .catch(() => { /* silencioso */ })
  }, [])

  async function abrirRevisar(relatorioId: string) {
    setSaving(true)
    setErro('')
    try {
      const res = await fetch(`/api/relatorios-mensais/${relatorioId}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErro(d.error || 'Erro ao carregar relatório.')
        return
      }
      const d = await res.json()
      setPreview({
        relatorio_id: relatorioId,
        contrato_numero: d.relatorio.contrato.numero,
        ano: d.relatorio.ano,
        mes: d.relatorio.mes,
        sequencia: d.relatorio.sequencia_cobranca,
        qtd_pedidos: d.relatorio.qtd_pedidos,
        valor_total: Number(d.relatorio.valor_total_atrasado),
        preview: d.preview,
        envolvidos: d.envolvidos || [],
      })
      setDestinatarios(new Set((d.envolvidos || []).map((u: any) => u.id)))
    } finally {
      setSaving(false)
    }
  }

  async function executarAcao(acao: 'enviar' | 'descartar') {
    if (!preview) return
    if (acao === 'enviar' && destinatarios.size === 0) {
      if (!confirm('Nenhum destinatário selecionado — descartar este relatório?')) return
    }
    setSaving(true)
    setErro('')
    try {
      const payload = acao === 'enviar'
        ? { acao, destinatarios_ids: Array.from(destinatarios) }
        : { acao }
      const res = await fetch(`/api/relatorios-mensais/${preview.relatorio_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) {
        setErro(d.error || 'Erro ao executar ação.')
        return
      }
      // Remove da lista de pendentes
      setPendentes(prev => prev.filter(r => r.id !== preview.relatorio_id))
      setPreview(null)
    } catch (e: any) {
      setErro(e?.message || 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  if (pendentes.length === 0) return null

  return (
    <>
      {/* Banner: relatórios mensais pendentes de revisão */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.30)' }}>
        <div className="flex items-start gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
            <Receipt className="w-4 h-4" style={{ color: '#3B82F6' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
              📋 {pendentes.length} relatório(s) mensal(is) aguardando revisão
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>
              Relatórios de pedidos fat-direto com saldo pendente há &gt; 30 dias. Revise e envie pra FIP.
            </p>
          </div>
        </div>
        {erro && (
          <div
            className="mt-2 rounded-lg px-3 py-2 text-xs flex items-start gap-2"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="font-medium break-words">{erro}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {pendentes.map(r => (
            <button
              key={r.id}
              onClick={() => abrirRevisar(r.id)}
              className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-2"
              style={{ background: 'var(--surface-1)', border: '1px solid rgba(59,130,246,0.40)', color: 'var(--text-1)' }}
              title={`${r.qtd_pedidos} pedido(s) — ${r.sequencia_cobranca}ª cobrança`}
            >
              <strong>{r.contrato.numero}</strong>
              <span style={{ color: 'var(--text-3)' }}>· {r.qtd_pedidos} ped.</span>
              <span style={{ color: '#3B82F6' }}>{formatCurrency(r.valor_total_atrasado)}</span>
              {r.sequencia_cobranca > 1 && (
                <span className="text-[10px] px-1.5 rounded" style={{ background: r.sequencia_cobranca >= 3 ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)', color: r.sequencia_cobranca >= 3 ? '#EF4444' : '#F59E0B' }}>
                  {r.sequencia_cobranca}ª cobrança
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Modal: revisar relatório mensal */}
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
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: preview.sequencia >= 3 ? 'rgba(239,68,68,0.06)' : preview.sequencia === 2 ? 'rgba(245,158,11,0.06)' : 'rgba(59,130,246,0.06)' }}>
              <div className="flex-1">
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                  📋 Relatório mensal · Contrato {preview.contrato_numero}
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {String(preview.mes).padStart(2, '0')}/{preview.ano} ·
                  {preview.qtd_pedidos} pedido(s) ·
                  Total {formatCurrency(preview.valor_total)} ·
                  <strong style={{ color: preview.sequencia >= 3 ? '#EF4444' : preview.sequencia === 2 ? '#F59E0B' : '#3B82F6' }}>
                    {' '}{preview.sequencia}ª cobrança
                  </strong>
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
                  style={{ height: 420, border: '1px solid var(--border)', background: 'white' }}
                  sandbox=""
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Destinatários ({destinatarios.size}/{preview.envolvidos.length})
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
                  {preview.envolvidos.length === 0
                    ? <p className="text-xs" style={{ color: 'var(--text-3)' }}>Nenhum envolvido neste contrato.</p>
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
              <button
                onClick={() => executarAcao('descartar')}
                disabled={saving}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                Descartar
              </button>
              <button
                onClick={() => executarAcao('enviar')}
                disabled={saving || destinatarios.size === 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: '#3B82F6' }}
              >
                {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Enviando...</> : <>Revisar e enviar email</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
