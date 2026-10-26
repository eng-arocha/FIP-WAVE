'use client'

import { useState } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowRightLeft, Loader2, Undo2 } from 'lucide-react'

/**
 * Painel da compensação de lastro entre macro itens (migration 085).
 *
 * O Informakon só abate nota lançada no MESMO macro item. Quando a nota do
 * material de um macro item foi lançada em outro, a FIP fatura a falta e o
 * saldo a gastar do macro item onde a nota está cai no mesmo valor, pelos
 * primeiros itens. Regra completa em lib/informakon/compensacao-lastro.ts.
 */

export interface CompensacaoLastroDados {
  disponivel: boolean
  registradas: Array<{
    id: string
    chave_falta: string
    chave_nota: string
    valor: number
    notas: string[]
    motivo: string | null
    created_at: string
    itens: Array<{ detalhamento_id: string; valor: number }>
  }>
  sugestoes: Array<{ chaveFalta: string; chaveNota: string; valor: number; notas: string[] }>
  rotulos: Record<string, string>
}

export function CompensacaoLastroPainel({
  contratoId,
  medicaoId,
  dados,
  medicaoAberta,
  podeEditar,
  onMudou,
}: {
  contratoId: string
  medicaoId: string
  dados: CompensacaoLastroDados | null | undefined
  medicaoAberta: boolean
  podeEditar: boolean
  onMudou?: () => void
}) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')

  if (!dados) return null
  if (!dados.disponivel) {
    return podeEditar ? (
      <div className="rounded-lg border p-3 text-[11px] print:hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)' }}>
        Compensação de lastro indisponível: rode a migration 085 no Supabase.
      </div>
    ) : null
  }
  if (dados.sugestoes.length === 0 && dados.registradas.length === 0) return null

  const nome = (chave: string) => {
    const r = dados.rotulos[chave]
    return r ? `${chave} · ${r}` : `Macro item ${chave}`
  }
  const podeMexer = medicaoAberta && podeEditar

  async function registrar(s: CompensacaoLastroDados['sugestoes'][number]) {
    const k = `${s.chaveFalta}|${s.chaveNota}`
    const texto = valores[k]
    const valor = texto === undefined || texto.trim() === ''
      ? s.valor
      : Number(texto.replace(/\./g, '').replace(',', '.'))
    if (!(valor > 0) || valor > s.valor + 0.01) {
      setErro(`Informe um valor entre 0 e ${formatCurrency(s.valor)}.`)
      return
    }
    setOcupado(k)
    setErro('')
    setConfirmacao('')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/compensacao-lastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chave_falta: s.chaveFalta,
          chave_nota: s.chaveNota,
          valor: Math.round(valor * 100) / 100,
          motivo: motivos[k]?.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(body?.error || `Falha (HTTP ${res.status}).`); return }
      const itens = (body.itens || []) as Array<{ codigo: string; valor: number }>
      setConfirmacao(
        `Compensação registrada: a FIP fatura ${formatCurrency(valor)} em ${nome(s.chaveFalta)}. Saldo a gastar reduzido em ${itens.map(i => `${i.codigo} ${formatCurrency(i.valor)}`).join(' · ')}.`,
      )
      onMudou?.()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setOcupado(null)
    }
  }

  async function desfazer(id: string) {
    if (!window.confirm('Desfazer esta compensação? O saldo a gastar dos itens volta e o "FIP a criar" cai no mesmo valor.')) return
    setOcupado(id)
    setErro('')
    setConfirmacao('')
    try {
      const res = await fetch(
        `/api/contratos/${contratoId}/medicoes/${medicaoId}/compensacao-lastro?compensacao_id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(body?.error || `Falha (HTTP ${res.status}).`); return }
      setConfirmacao('Compensação desfeita.')
      onMudou?.()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden print:hidden" style={{ borderColor: 'rgba(59,130,246,0.40)', background: 'var(--surface-2)' }}>
      <div className="flex items-start gap-2 p-3">
        <ArrowRightLeft className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#3B82F6' }} />
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>Compensação de lastro entre macro itens</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
            O Informakon só abate nota lançada no mesmo macro item. Quando a nota foi lançada em outro, a FIP fatura a falta
            e o saldo a gastar do macro item onde a nota está cai no mesmo valor, começando pelos primeiros itens. Não muda o percentual.
          </p>
        </div>
      </div>

      <div className="px-3 pb-3 space-y-2">
        {dados.sugestoes.map(s => {
          const k = `${s.chaveFalta}|${s.chaveNota}`
          return (
            <div key={k} className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <p>
                <strong style={{ color: 'var(--text-1)' }}>{nome(s.chaveFalta)}</strong> está sem lastro, e notas dele estão lançadas em{' '}
                <strong style={{ color: 'var(--text-1)' }}>{nome(s.chaveNota)}</strong>. Compensável agora:{' '}
                <strong style={{ color: '#3B82F6' }}>{formatCurrency(s.valor)}</strong>.
              </p>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                Notas: {s.notas.map(n => `NF ${n}`).join(' · ')}
              </p>
              {podeMexer && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={s.valor.toFixed(2).replace('.', ',')}
                    value={valores[k] ?? ''}
                    onChange={e => setValores(v => ({ ...v, [k]: e.target.value }))}
                    className="w-36 px-2 py-1 rounded border text-xs tabular-nums"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
                    aria-label="Valor a compensar"
                  />
                  <input
                    type="text"
                    placeholder="Motivo (opcional)"
                    value={motivos[k] ?? ''}
                    onChange={e => setMotivos(v => ({ ...v, [k]: e.target.value }))}
                    className="flex-1 min-w-[160px] px-2 py-1 rounded border text-xs"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }}
                    aria-label="Motivo"
                  />
                  <button
                    type="button"
                    onClick={() => registrar(s)}
                    disabled={ocupado !== null}
                    className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                    style={{ background: '#3B82F6', color: '#fff' }}
                  >
                    {ocupado === k && <Loader2 className="w-3 h-3 animate-spin" />}
                    Registrar compensação
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {dados.registradas.length > 0 && (
          <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
            <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Registradas nesta medição</p>
            <ul className="space-y-1">
              {dados.registradas.map(c => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    FIP fatura <strong style={{ color: '#3B82F6' }}>{formatCurrency(c.valor)}</strong> em {nome(c.chave_falta)} ·
                    saldo reduzido em {nome(c.chave_nota)} ({c.itens.length} {c.itens.length === 1 ? 'item' : 'itens'}) ·{' '}
                    {formatDate(c.created_at)}{c.motivo ? ` · ${c.motivo}` : ''}
                  </span>
                  {podeMexer && (
                    <button
                      type="button"
                      onClick={() => desfazer(c.id)}
                      disabled={ocupado !== null}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
                    >
                      {ocupado === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                      Desfazer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {erro && <p className="text-[11px]" style={{ color: '#EF4444' }}>{erro}</p>}
        {confirmacao && <p className="text-[11px]" style={{ color: '#10B981' }}>{confirmacao}</p>}
      </div>
    </div>
  )
}
