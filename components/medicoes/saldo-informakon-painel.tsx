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
import {
  Loader2, ClipboardPaste, AlertTriangle, CheckCircle2, RefreshCw, ExternalLink, Search,
} from 'lucide-react'
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
  type LinhaComparacao,
  type SaldoInformakonComparavel,
} from '@/lib/informakon/comparar-saldo'

interface NotaDoGrupo {
  tipo: string
  id: string
  numero: string
  data: string
  valorAlocado: number
  valorTotalNf: number
  status: string
  pedidoNumero: string
  emitente: string | null
  arquivoUrl: string | null
}

const ROTULO_STATUS: Record<string, string> = {
  aprovada: 'aprovada',
  aguardando_aprovacao: 'aguardando aprovação',
  em_correcao: 'em correção',
  cancelada: 'cancelada',
}

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

/**
 * Lista as notas do macro item para achar QUAL não foi lançada no ERP.
 *
 * Listar por listar não resolve: um grupo tem dezenas de notas e a diferença
 * é de poucos milhares. O que fecha a conta é a ordem cronológica — nota que
 * acabou de chegar é a que ainda não foi lançada. Então as notas vêm da mais
 * recente para a mais antiga, com soma corrida, e ficam marcadas as primeiras
 * que somam a diferença: são as candidatas, em ordem de probabilidade.
 *
 * Quando uma nota sozinha bate com a diferença, ela é apontada direto — é o
 * caso mais comum e o mais fácil de confirmar.
 */
function ModalNotasDoMacroItem({
  contratoId,
  linha,
  onClose,
}: {
  contratoId: string
  linha: LinhaComparacao | null
  onClose: () => void
}) {
  const [notas, setNotas] = useState<NotaDoGrupo[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!linha?.scopeId) { setNotas(null); return }
    let cancelado = false
    setCarregando(true)
    setErro('')
    setNotas(null)
    fetch(`/api/contratos/${contratoId}/origem?modo=material&origem=realizado&scope=${linha.scopeId}`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
        return body
      })
      .then(data => {
        if (cancelado) return
        setNotas(((data?.itens || []) as NotaDoGrupo[]).filter(i => i.tipo === 'nf-fat-direto'))
      })
      .catch(e => { if (!cancelado) setErro(e?.message || 'Falha ao carregar as notas.') })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [contratoId, linha])

  const analise = useMemo(() => {
    if (!notas || !linha) return null
    const falta = Math.max(0, linha.diferenca)
    // Mais recente primeiro: é a que tem mais chance de ainda não ter sido
    // lançada no ERP.
    const ordenadas = [...notas].sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')))

    // Nota única que bate com a diferença — o achado mais forte.
    const exata = ordenadas.find(n => Math.abs(n.valorAlocado - falta) < 0.01) ?? null

    const suspeitas = new Set<string>()
    if (exata) {
      suspeitas.add(exata.id)
    } else {
      let acumulado = 0
      for (const n of ordenadas) {
        if (acumulado >= falta - 0.01) break
        suspeitas.add(n.id)
        acumulado += Number(n.valorAlocado || 0)
      }
    }
    const somaSuspeitas = ordenadas
      .filter(n => suspeitas.has(n.id))
      .reduce((s, n) => s + Number(n.valorAlocado || 0), 0)

    return { ordenadas, suspeitas, exata, somaSuspeitas, falta }
  }, [notas, linha])

  if (!linha) return null

  return (
    <Dialog open={!!linha} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Qual nota falta lançar
          </DialogTitle>
          <DialogDescription className="text-[var(--text-2)]">
            {linha.rotulo} · o boletim manda descontar{' '}
            <strong>{formatCurrency(linha.boletim)}</strong> e o Informakon tem{' '}
            <strong>{formatCurrency(linha.informakon ?? 0)}</strong> lançados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {linha.diferenca > 0.01 && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF4444' }}>
              Falta lançar <strong>{formatCurrency(linha.diferenca)}</strong>.
              {analise?.exata
                ? <> A nota <strong>{analise.exata.numero}</strong> tem exatamente esse valor — é quase certo que seja ela.</>
                : analise && analise.suspeitas.size > 0
                ? <> As <strong>{analise.suspeitas.size}</strong> notas mais recentes somam {formatCurrency(analise.somaSuspeitas)} e estão marcadas abaixo — comece por elas.</>
                : null}
            </div>
          )}

          {carregando && (
            <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--text-3)' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando notas do macro item…
            </div>
          )}

          {erro && (
            <div className="p-3 rounded-lg text-xs bg-red-900/20 border border-red-800/40 text-red-400">{erro}</div>
          )}

          {!linha.scopeId && !carregando && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Não foi possível identificar o escopo deste macro item nesta medição.
            </div>
          )}

          {analise && analise.ordenadas.length === 0 && !carregando && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Nenhuma nota de terceiro neste macro item. Se o boletim manda descontar,
              o valor veio de outro caminho — confira o drill-down de NF Desc. na linha.
            </div>
          )}

          {analise && analise.ordenadas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-[11px]">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>NF</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emitente</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emissão</th>
                    <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Alocado aqui</th>
                    <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Soma corrida</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Status</th>
                    <th className="py-1.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    let corrida = 0
                    return analise.ordenadas.map(nf => {
                      corrida += Number(nf.valorAlocado || 0)
                      const suspeita = analise.suspeitas.has(nf.id)
                      return (
                        <tr
                          key={nf.id}
                          className="border-b"
                          style={{
                            borderColor: 'var(--border)',
                            background: suspeita ? 'rgba(239,68,68,0.07)' : undefined,
                          }}
                        >
                          <td className="py-1.5 px-2 font-mono" style={{ color: suspeita ? '#EF4444' : 'var(--text-1)', fontWeight: suspeita ? 700 : 400 }}>
                            {suspeita && '▸ '}{nf.numero || '—'}
                          </td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--text-2)' }}>{nf.emitente || '—'}</td>
                          <td className="py-1.5 px-2 tabular-nums" style={{ color: 'var(--text-3)' }}>{nf.data ? formatDate(nf.data) : '—'}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: suspeita ? '#EF4444' : 'var(--text-2)' }}>
                            {formatCurrency(nf.valorAlocado)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>{formatCurrency(corrida)}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--text-3)' }}>{ROTULO_STATUS[nf.status] ?? nf.status}</td>
                          <td className="py-1.5 px-2 text-right">
                            {nf.arquivoUrl
                              ? <a href={nf.arquivoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: '#60A5FA' }}>abrir <ExternalLink className="w-3 h-3" /></a>
                              : <span style={{ color: 'var(--text-3)' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
            Notas da mais recente para a mais antiga — a que acabou de chegar é a que tem mais
            chance de ainda não ter sido lançada. A <strong>soma corrida</strong> ajuda a achar o
            ponto de corte: onde ela alcança o valor do Informakon, o que está acima ainda não
            entrou lá. &quot;Alocado aqui&quot; é a parcela da nota que cabe neste macro item —
            uma nota que atende mais de um item aparece rateada.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
  /** Macro item aberto na busca "qual nota falta lançar". */
  const [macroItemAberto, setMacroItemAberto] = useState<LinhaComparacao | null>(null)

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
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: 'var(--text-3)' }}>Boletim manda descontar <span style={{ opacity: 0.6, fontWeight: 400 }}>⧉</span></th>
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: 'var(--text-3)' }}>Lançado no Informakon</th>
                    <th className="text-right py-1.5 px-3 font-medium" style={{ color: '#EF4444' }}>Falta lançar</th>
                  </tr>
                </thead>
                <tbody>
                  {faltantes.map(l => (
                    <tr key={l.chave} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-1.5 px-3" style={{ color: 'var(--text-2)' }}>{l.rotulo}</td>
                      <td className="py-1.5 px-3 text-right" style={{ padding: 0 }}>
                        <button
                          type="button"
                          onClick={() => setMacroItemAberto(l)}
                          className="w-full text-right px-3 py-1.5 tabular-nums hover:bg-red-500/10 hover:underline decoration-dotted underline-offset-2 transition-colors"
                          style={{ color: 'var(--text-2)', font: 'inherit' }}
                          title="Ver as notas deste macro item e descobrir qual ainda não foi lançada"
                        >
                          {formatCurrency(l.boletim)}
                        </button>
                      </td>
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

      <ModalNotasDoMacroItem
        contratoId={contratoId}
        linha={macroItemAberto}
        onClose={() => setMacroItemAberto(null)}
      />

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
