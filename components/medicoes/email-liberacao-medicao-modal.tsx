'use client'

/**
 * Modal de aprovação de medição com envio de "Liberação para NF" pros envolvidos.
 *
 * Fluxo:
 *  1. Carrega preview (/api/contratos/[id]/medicoes/[medId]/email-preview) +
 *     lista de envolvidos.
 *  2. Usuário marca/desmarca destinatários.
 *  3. Confirma → POST /aprovar com { comentario, notificar_envolvidos: true,
 *     destinatarios_ids } → backend aprova + dispara email novo.
 */

import { useState, useEffect } from 'react'
import { Send, Loader2, Mail, CheckCircle2 } from 'lucide-react'

interface Envolvido {
  id: string
  nome: string | null
  email: string
  perfil: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  contratoId: string
  medicaoId: string
  /** Modo do fluxo:
   *   - 'aprovar': aprova e dispara email novo
   *   - 'reenviar': não aprova, só re-dispara o email (TODO)
   */
  modo: 'aprovar' | 'reenviar'
  onSent?: (qtd: number) => void
}

export function EmailLiberacaoMedicaoModal({
  open, onClose, contratoId, medicaoId, modo, onSent,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [envolvidos, setEnvolvidos] = useState<Envolvido[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setErro('')
    const reenvioFlag = modo === 'reenviar' ? '?reenvio=true' : ''
    fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/email-preview${reenvioFlag}`)
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text()
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`)
        }
        return r.json()
      })
      .then(data => {
        if (data.error) { setErro(data.error); return }
        setSubject(data.subject || '')
        setHtml(data.html || '')
        setEnvolvidos(data.envolvidos || [])
        setSelecionados(new Set((data.envolvidos || []).map((u: Envolvido) => u.id)))
      })
      .catch(e => setErro(e?.message || 'Erro ao carregar preview.'))
      .finally(() => setLoading(false))
  }, [open, contratoId, medicaoId, modo])

  if (!open) return null

  function toggle(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }
  function toggleTodos() {
    if (selecionados.size === envolvidos.length) setSelecionados(new Set())
    else setSelecionados(new Set(envolvidos.map(u => u.id)))
  }

  async function enviar() {
    if (selecionados.size === 0) {
      setErro('Selecione pelo menos 1 envolvido.')
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const url = `/api/contratos/${contratoId}/medicoes/${medicaoId}/aprovar`
      const body = {
        comentario,
        notificar_envolvidos: true,
        destinatarios_ids: Array.from(selecionados),
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(data.error || 'Erro ao aprovar/enviar.'); return }
      onSent?.(selecionados.size)
      onClose()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={() => !enviando && onClose()}
    >
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          width: 'min(1100px, 100%)',
          height: 'min(720px, 92vh)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.40)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #0F766E, #10B981)' }}>
              <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>
                {modo === 'aprovar' ? 'Aprovar medição e liberar emissão de NF' : 'Reenviar email de liberação'}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                {subject || (loading ? 'Carregando...' : '—')}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={enviando} className="text-xs font-medium px-3 py-1 rounded-lg disabled:opacity-50" style={{ color: 'var(--text-3)' }}>
            Fechar
          </button>
        </div>

        <div className="grid grid-cols-2 flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Coluna esquerda: envolvidos */}
          <div className="flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
            <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-2)' }}>
                <Mail className="w-3.5 h-3.5" /> Destinatários
              </span>
              {envolvidos.length > 0 && (
                <button onClick={toggleTodos} className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
                  {selecionados.size === envolvidos.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="p-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                  Carregando envolvidos...
                </div>
              ) : envolvidos.length === 0 ? (
                <div className="p-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>
                  Nenhum envolvido cadastrado pra este contrato.
                </div>
              ) : envolvidos.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--surface-2)]">
                  <input type="checkbox" checked={selecionados.has(u.id)} onChange={() => toggle(u.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{u.nome || u.email.split('@')[0]}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>{u.email}</p>
                  </div>
                  {u.perfil && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>
                      {u.perfil}
                    </span>
                  )}
                </label>
              ))}
            </div>
            {/* Comentário do aprovador (vai pro audit log) */}
            {modo === 'aprovar' && (
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1" style={{ color: 'var(--text-3)' }}>
                  Comentário (opcional)
                </label>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Observações da aprovação..."
                  rows={2}
                  className="w-full text-xs rounded-lg px-2 py-1.5 outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
              </div>
            )}
          </div>

          {/* Coluna direita: preview */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-2 text-xs font-semibold flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <span>Preview do email</span>
              {html && (
                <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
                  ({(html.length / 1024).toFixed(1)} KB)
                </span>
              )}
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Gerando preview...
                </div>
              ) : html ? (
                <iframe
                  title="Preview"
                  srcDoc={html}
                  className="w-full border-0 bg-white"
                  style={{ height: '100%' }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  {erro || 'Preview indisponível.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          {erro ? (
            <p className="text-xs text-red-400 flex-1 truncate">{erro}</p>
          ) : (
            <p className="text-xs flex-1" style={{ color: 'var(--text-3)' }}>
              {selecionados.size > 0
                ? `${selecionados.size} envolvido${selecionados.size > 1 ? 's' : ''} vai receber`
                : 'Selecione pelo menos 1 envolvido'}
            </p>
          )}
          <button onClick={onClose} disabled={enviando} className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50" style={{ color: 'var(--text-3)' }}>
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || loading || selecionados.size === 0}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0F766E, #10B981)' }}
          >
            {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {enviando
              ? 'Enviando...'
              : modo === 'aprovar'
                ? `Aprovar e enviar (${selecionados.size})`
                : `Reenviar (${selecionados.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
