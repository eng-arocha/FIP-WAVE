'use client'

import { useMemo, useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { usePermissoes } from '@/lib/context/permissoes-context'
import {
  Clock, Loader2, FileText, AlertTriangle, CheckCircle, XCircle,
} from 'lucide-react'
import type { Solicitacao } from './shared'

/**
 * Fila de NFs aguardando aprovação (workflow 065).
 *
 * Visível só pra quem tem nf_fat_direto.aprovar. Aprovação direta;
 * rejeição exige motivo (vai por email pra contratada corrigir).
 */
export function FilaAprovacaoNf({
  solicitacoes,
  reload,
}: {
  solicitacoes: Solicitacao[]
  reload: () => void
}) {
  const { temPermissao } = usePermissoes()
  const podeAprovar = temPermissao('nf_fat_direto', 'aprovar')

  // NF sendo aprovada/rejeitada (id) + estado da rejeição (motivo).
  const [nfAcaoId, setNfAcaoId] = useState<string | null>(null)
  const [rejeitandoNfId, setRejeitandoNfId] = useState<string | null>(null)
  const [motivoRejeicao, setMotivoRejeicao] = useState('')
  const [filaErro, setFilaErro] = useState('')
  // Aprovação em lote: confirmação, progresso e relatório do que falhou.
  const [confirmandoLote, setConfirmandoLote] = useState(false)
  const [loteProgresso, setLoteProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [loteFalhas, setLoteFalhas] = useState<Array<{ numero_nf: string; erro: string }>>([])

  // NFs aguardando aprovação, achatadas com o pedido de origem.
  const nfsAguardando = useMemo(() => {
    const out: Array<{
      nf: Solicitacao['notas_fiscais'][number]
      sol: Solicitacao
    }> = []
    for (const sol of solicitacoes) {
      for (const nf of sol.notas_fiscais || []) {
        if (nf.status === 'aguardando_aprovacao') out.push({ nf, sol })
      }
    }
    return out
  }, [solicitacoes])

  /** Aprova ou rejeita uma NF da fila. */
  async function decidirNf(
    sol: Solicitacao,
    nfId: string,
    acao: 'aprovar' | 'rejeitar',
    motivo?: string,
  ) {
    if (nfAcaoId) return
    setFilaErro('')
    setNfAcaoId(nfId)
    try {
      const res = await fetch(
        `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/nfs/${nfId}/aprovar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(acao === 'rejeitar' ? { acao, motivo } : { acao }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // 422 = saldo mudou desde o lançamento (revalidação do 3-way match).
        setFilaErro(data.error || 'Erro ao processar a NF.')
        return
      }
      setRejeitandoNfId(null)
      setMotivoRejeicao('')
      reload()
    } catch (e: any) {
      setFilaErro(e?.message || 'Erro ao processar a NF.')
    } finally {
      setNfAcaoId(null)
    }
  }

  /**
   * Aprova todas as NFs da fila, UMA POR VEZ.
   *
   * Sequencial de propósito: cada aprovação revalida o 3-way match contra o
   * saldo do pedido, e o saldo muda a cada NF aprovada. Em paralelo, duas NFs
   * do mesmo pedido validariam contra o mesmo saldo e poderiam estourá-lo
   * juntas. Uma falha não aborta o lote — a NF é reportada no fim e as
   * demais seguem.
   */
  async function aprovarTodas() {
    if (nfAcaoId || loteProgresso) return
    setFilaErro('')
    setLoteFalhas([])
    setConfirmandoLote(false)

    const alvos = [...nfsAguardando]
    setLoteProgresso({ feitas: 0, total: alvos.length })
    const falhas: Array<{ numero_nf: string; erro: string }> = []

    for (let i = 0; i < alvos.length; i++) {
      const { nf, sol } = alvos[i]
      try {
        const res = await fetch(
          `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/nfs/${nf.id}/aprovar`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'aprovar' }),
          },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          falhas.push({ numero_nf: nf.numero_nf, erro: data.error || `HTTP ${res.status}` })
        }
      } catch (e: any) {
        falhas.push({ numero_nf: nf.numero_nf, erro: e?.message || 'Erro de rede.' })
      }
      setLoteProgresso({ feitas: i + 1, total: alvos.length })
    }

    setLoteFalhas(falhas)
    setLoteProgresso(null)
    reload()
  }

  function confirmarRejeicao(sol: Solicitacao, nfId: string) {
    if (!motivoRejeicao.trim()) {
      setFilaErro('Informe o motivo da rejeição (obrigatório).')
      return
    }
    decidirNf(sol, nfId, 'rejeitar', motivoRejeicao.trim())
  }

  if (!podeAprovar || nfsAguardando.length === 0) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.35)' }}>
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.18)' }}>
          <Clock className="w-4 h-4" style={{ color: '#F59E0B' }} />
        </div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>NFs aguardando aprovação</h3>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: '#F59E0B', color: '#fff' }}
        >
          {nfsAguardando.length}
        </span>

        {/* Aprovar todas — some quando há só uma NF (o botão da linha basta) */}
        {nfsAguardando.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            {loteProgresso ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Aprovando {loteProgresso.feitas}/{loteProgresso.total}...
              </span>
            ) : confirmandoLote ? (
              <>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                  Aprovar as {nfsAguardando.length} NFs?
                </span>
                <button
                  onClick={aprovarTodas}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ background: '#10B981' }}
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                </button>
                <button
                  onClick={() => setConfirmandoLote(false)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => { setConfirmandoLote(true); setFilaErro(''); setLoteFalhas([]) }}
                disabled={!!nfAcaoId}
                className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                style={{ background: '#10B981' }}
              >
                <CheckCircle className="w-3.5 h-3.5" /> Aprovar todas ({nfsAguardando.length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Relatório do lote: só o que NÃO passou (o resto some da fila sozinho) */}
      {loteFalhas.length > 0 && (
        <div
          className="mx-5 mt-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}
        >
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {loteFalhas.length} NF(s) não puderam ser aprovadas — as demais foram:
          </p>
          <ul className="mt-1 space-y-0.5 pl-5 list-disc">
            {loteFalhas.map(f => (
              <li key={f.numero_nf}><span className="font-semibold">NF {f.numero_nf}</span>: {f.erro}</li>
            ))}
          </ul>
        </div>
      )}

      {filaErro && (
        <div
          className="mx-5 mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="font-medium break-words">{filaErro}</span>
        </div>
      )}

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {nfsAguardando.map(({ nf, sol }) => {
          const rejeitando = rejeitandoNfId === nf.id
          const processando = nfAcaoId === nf.id
          return (
            <div key={nf.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                    NF {nf.numero_nf}
                    <span className="ml-2 font-mono text-xs" style={{ color: 'var(--accent)' }}>
                      FIP-{String(sol.numero).padStart(4, '0')}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    {sol.contrato?.numero || '—'} · {nf.emitente || sol.fornecedor_razao_social || '—'}
                    {nf.data_emissao && <> · emissão {formatDate(nf.data_emissao)}</>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                    Lançada por {nf.lancado_por?.nome || '—'}
                    {nf.lancado_em && <> em {formatDate(nf.lancado_em)}</>}
                    {nf.arquivo_url && (
                      <>
                        {' · '}
                        <a
                          href={nf.arquivo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400"
                        >
                          <FileText className="w-3 h-3" /> arquivo
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {formatCurrency(nf.valor)}
                  </span>
                  {!rejeitando && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => decidirNf(sol, nf.id, 'aprovar')}
                        disabled={processando}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                        style={{ background: '#10B981' }}
                      >
                        {processando
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircle className="w-3.5 h-3.5" />}
                        Aprovar
                      </button>
                      <button
                        onClick={() => { setRejeitandoNfId(nf.id); setMotivoRejeicao(''); setFilaErro('') }}
                        disabled={processando}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                        style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.35)' }}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Campo de motivo da rejeição */}
              {rejeitando && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
                    Motivo da rejeição <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    value={motivoRejeicao}
                    onChange={e => setMotivoRejeicao(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="Descreva o que a contratada precisa corrigir nesta NF."
                    className="w-full rounded-lg px-3 py-2 text-sm border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmarRejeicao(sol, nf.id)}
                      disabled={processando || !motivoRejeicao.trim()}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: '#EF4444' }}
                    >
                      {processando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <XCircle className="w-3.5 h-3.5" />}
                      Confirmar rejeição
                    </button>
                    <button
                      onClick={() => { setRejeitandoNfId(null); setMotivoRejeicao(''); setFilaErro('') }}
                      disabled={processando}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
