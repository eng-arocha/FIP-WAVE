'use client'

/**
 * Modal pra enviar notificação de autorização fat-direto pros envolvidos do projeto.
 *
 * Fluxo:
 *   1. Carrega o preview do email (via /email-preview) + lista de envolvidos
 *   2. Usuário marca/desmarca quem vai receber
 *   3. Visualiza o HTML do email num iframe (preview fiel)
 *   4. Confirma envio → POST no endpoint apropriado (aprovar OU reenviar-email)
 *
 * NÃO manda email pro fornecedor — só pros usuários atrelados ao contrato.
 */

import { useState, useEffect } from 'react'
import { X, Send, Loader2, Users, Mail } from 'lucide-react'

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
  solicitacaoId: string
  /** Se true, é reenvio (adiciona badge [REENVIO] no template) */
  reenvio: boolean
  /**
   * Callback chamado após envio bem-sucedido.
   * Recebe a quantidade de emails enviados.
   */
  onSent?: (qtd: number) => void
  /**
   * Modo de envio:
   *   - 'aprovar': envia junto com a aprovação (POST /aprovar com destinatarios_ids)
   *   - 'reenviar': só envia notificação (POST /reenviar-email)
   */
  modo: 'aprovar' | 'reenviar'
  /** Só usado quando modo='aprovar' — motivo da rejeição se for rejeitar (não vai ser usado aqui, mas API expects) */
  motivoRejeicao?: string
}

export function EmailEnvolvidosModal({
  open, onClose, contratoId, solicitacaoId, reenvio, onSent, modo,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [envolvidos, setEnvolvidos] = useState<Envolvido[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [erro, setErro] = useState('')

  // Carrega preview + envolvidos
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setErro('')
    fetch(`/api/contratos/${contratoId}/fat-direto/solicitacoes/${solicitacaoId}/email-preview?reenvio=${reenvio}`)
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
        // Por default, todos selecionados
        setSelecionados(new Set((data.envolvidos || []).map((u: Envolvido) => u.id)))
      })
      .catch(e => setErro(e?.message || 'Erro de rede ao carregar preview.'))
      .finally(() => setLoading(false))
  }, [open, contratoId, solicitacaoId, reenvio])

  if (!open) return null

  function toggle(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleTodos() {
    if (selecionados.size === envolvidos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(envolvidos.map(u => u.id)))
    }
  }

  async function enviar() {
    if (selecionados.size === 0) {
      setErro('Selecione ao menos 1 envolvido.')
      return
    }
    setSending(true)
    setErro('')
    try {
      const destinatarios_ids = Array.from(selecionados)
      const url = modo === 'aprovar'
        ? `/api/contratos/${contratoId}/fat-direto/solicitacoes/${solicitacaoId}/aprovar`
        : `/api/contratos/${contratoId}/fat-direto/solicitacoes/${solicitacaoId}/reenviar-email`
      const body = modo === 'aprovar'
        ? { acao: 'aprovado', destinatarios_ids }
        : { destinatarios_ids }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao enviar.'); return }
      onSent?.(selecionados.size)
      onClose()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={() => !sending && onClose()}
    >
      <div
        className="w-full max-w-5xl rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', height: '90vh', maxHeight: 800 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
              {modo === 'aprovar' ? 'Aprovar e notificar envolvidos' : 'Reenviar notificação aos envolvidos'}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 rounded hover:bg-black/5 text-[var(--text-3)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Assunto */}
        {!loading && subject && (
          <div className="px-5 py-2 border-b text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
            <span className="font-semibold mr-2" style={{ color: 'var(--text-2)' }}>Assunto:</span>
            <span style={{ color: 'var(--text-1)' }}>{subject}</span>
          </div>
        )}

        {/* Body: split envolvidos | preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr] overflow-hidden">
          {/* Coluna envolvidos */}
          <div className="border-r flex flex-col overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                <Users className="w-3.5 h-3.5" />
                Envolvidos ({selecionados.size}/{envolvidos.length})
              </div>
              {envolvidos.length > 0 && (
                <button
                  onClick={toggleTodos}
                  className="text-[10px] underline"
                  style={{ color: 'var(--text-3)' }}
                >
                  {selecionados.size === envolvidos.length ? 'Nenhum' : 'Todos'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-4 text-xs text-center" style={{ color: 'var(--text-3)' }}>
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
                  Carregando envolvidos...
                </div>
              ) : envolvidos.length === 0 ? (
                <div className="p-4 text-xs text-center" style={{ color: 'var(--text-3)' }}>
                  Nenhum usuário atrelado a este contrato.
                  <br />
                  <span className="text-[10px] opacity-70">Vá em Supabase → usuarios_contratos pra atrelar.</span>
                </div>
              ) : (
                envolvidos.map(u => (
                  <label
                    key={u.id}
                    className="flex items-start gap-2 px-3 py-2 border-b cursor-pointer hover:bg-black/5 text-xs transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                        {u.nome || '(sem nome)'}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                        {u.email}
                      </div>
                      {u.perfil && (
                        <div className="text-[10px] mt-0.5 inline-block px-1.5 py-0.5 rounded"
                             style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>
                          {u.perfil}
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Coluna preview */}
          <div className="flex flex-col overflow-hidden" style={{ minHeight: 400 }}>
            <div className="px-4 py-2 border-b text-xs font-semibold flex items-center justify-between" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
              <span>Preview do email</span>
              {html && (
                <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
                  HTML carregado ({(html.length / 1024).toFixed(1)} KB)
                </span>
              )}
            </div>
            <div className="flex-1 overflow-hidden bg-white" style={{ minHeight: 350 }}>
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Gerando preview...
                </div>
              ) : html ? (
                <iframe
                  title="Preview do email"
                  srcDoc={html}
                  className="w-full border-0 bg-white"
                  style={{ height: '100%', minHeight: 350 }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">
                  {erro || 'Preview não disponível. Verifique se a solicitação tem dados completos.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
          {erro ? (
            <p className="text-xs text-red-400 flex-1 truncate">{erro}</p>
          ) : (
            <p className="text-xs flex-1" style={{ color: 'var(--text-3)' }}>
              {selecionados.size > 0
                ? `${selecionados.size} envolvido${selecionados.size > 1 ? 's' : ''} vai receber`
                : 'Selecione quem vai receber'}
            </p>
          )}
          <button
            onClick={onClose}
            disabled={sending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-3)] hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={sending || loading || selecionados.size === 0}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sending ? 'Enviando...' : (modo === 'aprovar' ? `Aprovar e enviar (${selecionados.size})` : `Enviar (${selecionados.size})`)}
          </button>
        </div>
      </div>
    </div>
  )
}
