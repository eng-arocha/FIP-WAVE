'use client'

/**
 * Painel "teto de realidade" do boletim.
 *
 * O Informakon só desconta nota que já está lançada lá. Se o boletim manda
 * descontar mais do que existe, o lançamento não fecha — e hoje isso só se
 * descobre na hora, com a medição pronta. Este painel compara os dois lados
 * por MACRO ITEM (a única granularidade em que ambos têm número) e avisa
 * antes, dizendo exatamente quanto falta lançar em cada um.
 *
 * O retrato é colado direto da tabela dinâmica do ERP — sem exportar arquivo,
 * sem formatar nada.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, ClipboardPaste, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  compararSaldoInformakon,
  type LinhaBoletimComparavel,
  type SaldoInformakonComparavel,
} from '@/lib/informakon/comparar-saldo'

interface RetratoSaldo {
  temDados: boolean
  motivo?: string
  referencia?: string
  informado_em?: string
  total?: number
  total_informado?: number | null
  linhas?: SaldoInformakonComparavel[]
}

const EXEMPLO = `Faturamento direto  - ÁGUA PLUVIAL\t375.254,16
Faturamento direto  - ESGOTO\t413.942,67
Total Geral\t789.196,83`

export function SaldoInformakonPainel({
  contratoId,
  linhasBoletim,
  podeEditar,
}: {
  contratoId: string
  linhasBoletim: LinhaBoletimComparavel[]
  podeEditar: boolean
}) {
  const [retrato, setRetrato] = useState<RetratoSaldo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await fetch(`/api/contratos/${contratoId}/informakon/saldo-a-descontar`, { cache: 'no-store' })
      setRetrato(res.ok ? await res.json() : { temDados: false })
    } catch {
      setRetrato({ temDados: false })
    } finally {
      setCarregando(false)
    }
  }, [contratoId])

  useEffect(() => { carregar() }, [carregar])

  const comparacao = useMemo(() => {
    if (!retrato?.temDados || !retrato.linhas) return null
    return compararSaldoInformakon(linhasBoletim, retrato.linhas)
  }, [retrato, linhasBoletim])

  async function salvar() {
    if (!texto.trim()) { setErro('Cole a tabela do Informakon.'); return }
    setSalvando(true)
    setErro('')
    setAviso(null)
    try {
      const res = await fetch(`/api/contratos/${contratoId}/informakon/saldo-a-descontar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(body?.error || `Falha (HTTP ${res.status}).`); return }

      const problemas: string[] = []
      if (body.soma_confere === false) {
        problemas.push(
          `a soma das linhas (${formatCurrency(body.total)}) não bate com o "Total Geral" colado (${formatCurrency(body.total_informado)}) — pode ter faltado linha`,
        )
      }
      if ((body.nao_reconhecidas?.length ?? 0) > 0) {
        problemas.push(`macro item não reconhecido: ${body.nao_reconhecidas.join('; ')}`)
      }
      setAviso(problemas.length > 0
        ? `Salvei ${body.qtd_linhas} linhas, mas confira: ${problemas.join(' · ')}.`
        : null)

      setModalAberto(false)
      setTexto('')
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setSalvando(false)
    }
  }

  const semRetrato = !carregando && !retrato?.temDados
  const faltantes = comparacao?.faltantes ?? []
  const temFalta = faltantes.length > 0

  return (
    <>
      <div
        className="rounded-lg border overflow-hidden print:hidden"
        style={{
          borderColor: temFalta ? 'rgba(239,68,68,0.45)' : 'var(--border)',
          background: 'var(--surface-2)',
        }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            {carregando
              ? <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0" style={{ color: 'var(--text-3)' }} />
              : temFalta
              ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#EF4444' }} />
              : retrato?.temDados
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
              : <ClipboardPaste className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--text-3)' }} />}

            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                {carregando
                  ? 'Conferindo contra o Informakon…'
                  : semRetrato
                  ? 'Confira contra o que está lançado no Informakon'
                  : temFalta
                  ? `Faltam ${formatCurrency(comparacao!.totalFaltante)} lançados no Informakon`
                  : 'O Informakon tem lançamento suficiente para esta medição'}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                {semRetrato
                  ? 'Cole o "Vlr. a Desc" por macro item e eu aviso se o boletim pedir mais desconto do que existe lá.'
                  : temFalta
                  ? 'O boletim manda descontar mais do que está lançado. Ou falta emitir/lançar nota, ou o site está pedindo demais.'
                  : retrato?.temDados
                  ? `Retrato de ${retrato.referencia ? formatDate(retrato.referencia) : '—'} · total a descontar ${formatCurrency(retrato.total || 0)}`
                  : ''}
              </p>
            </div>
          </div>

          {podeEditar && (
            <button
              type="button"
              onClick={() => { setModalAberto(true); setErro(''); }}
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-colors hover:bg-[var(--surface-3)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              {retrato?.temDados ? <RefreshCw className="w-3 h-3" /> : <ClipboardPaste className="w-3 h-3" />}
              {retrato?.temDados ? 'Atualizar retrato' : 'Colar do Informakon'}
            </button>
          )}
        </div>

        {aviso && (
          <div className="px-3 pb-3">
            <div className="p-2 rounded-lg text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300">
              {aviso}
            </div>
          </div>
        )}

        {/* O que falta — só aparece quando exige ação */}
        {temFalta && (
          <div className="border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: 'var(--surface-1)' }}>
                    <th className="text-left py-1.5 px-3 font-medium" style={{ color: 'var(--text-3)' }}>Macro item</th>
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: 'var(--text-3)' }}>Boletim manda descontar</th>
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: 'var(--text-3)' }}>Lançado no Informakon</th>
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: '#EF4444' }}>Falta lançar</th>
                  </tr>
                </thead>
                <tbody>
                  {faltantes.map(l => (
                    <tr key={l.chave} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5 px-3" style={{ color: 'var(--text-2)' }}>{l.rotulo}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(l.boletim)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>{formatCurrency(l.informakon ?? 0)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-bold" style={{ color: '#EF4444' }}>{formatCurrency(l.diferenca)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Macro itens sem retrato — não dá pra afirmar nada sobre eles */}
        {comparacao && comparacao.semRetrato.length > 0 && (
          <div className="px-3 pb-3 pt-0">
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              Sem retrato para {comparacao.semRetrato.length} macro item(ns) desta medição
              ({comparacao.semRetrato.map(l => l.chave).join(', ')}) — não dá para conferir esses.
              Se eles têm desconto no boletim, inclua-os na próxima colagem.
            </p>
          </div>
        )}
      </div>

      {/* Modal de colagem */}
      <Dialog open={modalAberto} onOpenChange={(o) => { if (!o && !salvando) { setModalAberto(false); setErro('') } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="w-5 h-5" />
              Saldo a descontar no Informakon
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Cole a tabela dinâmica do ERP com o <strong>Vlr. a Desc</strong> por macro item.
              Pode colar direto do Excel — o cabeçalho e o &quot;Total Geral&quot; são reconhecidos sozinhos.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Colagem
              </Label>
              <Textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder={EXEMPLO}
                className="bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] min-h-[220px] font-mono text-[11px]"
                autoFocus
              />
              <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                Cada linha: rótulo do macro item, TAB, valor. O prefixo
                &quot;Faturamento direto -&quot; é opcional.
              </p>
            </div>

            {erro && (
              <div className="p-3 rounded-lg text-xs bg-red-900/20 border border-red-800/40 text-red-400">
                {erro}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setModalAberto(false); setErro('') }} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando} disabled={salvando || !texto.trim()}>
              Salvar retrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
