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
  ShieldCheck, Undo2, ListChecks,
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
import {
  conferirNotas,
  type NotaDoErp,
  type SituacaoNota,
} from '@/lib/informakon/conferir-notas'

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
  snapshot_id?: string
  /** 'detalhado' = veio nota a nota; 'agregado' = só o somatório por grupo. */
  formato?: 'detalhado' | 'agregado'
  referencia?: string
  informado_em?: string
  total?: number
  total_informado?: number | null
  total_descontado?: number
  linhas?: SaldoInformakonComparavel[]
  /** Uma entrada por nota × macro item. Vazio no retrato agregado. */
  notas?: NotaDoErp[]
  /**
   * Σ reendereçado: valor que o ERP arquivou num macro item e que o boletim
   * pede em outro. O total do retrato não muda — só o endereço. Sem isso, uma
   * nota LANÇADA apareceria como "falta lançar", e não haveria ação possível
   * (lançamento feito no Informakon não se corrige).
   */
  total_realocado?: number
  realocadas?: Array<{ numero: string; documento: string; deChave: string; paraChaves: string[]; valor: number }>
  /** Notas nossas ausentes de TODO o retrato — a lista acionável. */
  notas_ausentes?: Array<{ numero: string; pedido: string | null; valor: number }>
  total_ausente?: number
  qtd_ausentes?: number
  /** O inverso: o ERP tem e o nosso cadastro não conhece. */
  notas_so_no_erp?: Array<{ numero: string; documento: string; macroItem: string; valor: number }>
  total_so_no_erp?: number
  qtd_so_no_erp?: number
}

const EXEMPLO = `Documento\tInsumo\tEspecificação\tUnidade\tQtd.a Desc\tVlr. a Desc\tQtd.Desc\tVlr.Desc
NF-e 534\t71635\tFaturamento direto  - QUADROS ELÉTRICOS\tR$\t253.444,08\t253.444,08\t0,0000\t0,00
NF-e 198\t71635\tFaturamento direto  - ELÉTRICA SUBESTAÇÃO\tR$\t0,0000\t0,00\t5.261,84\t5.261,84`

/** Rótulo e cor de cada situação da conferência nota a nota. */
const SITUACAO: Record<SituacaoNota, { texto: string; cor: string; fundo?: string }> = {
  nao_lancada:      { texto: 'não está no Informakon', cor: '#EF4444', fundo: 'rgba(239,68,68,0.07)' },
  outro_macro_item: { texto: 'lançada em outro macro item', cor: '#F59E0B', fundo: 'rgba(245,158,11,0.07)' },
  disponivel:       { texto: 'lançada, a descontar', cor: '#10B981' },
  parcial:          { texto: 'parcialmente descontada', cor: '#10B981' },
  ja_descontada:    { texto: 'já descontada', cor: 'var(--text-3)' },
  sem_saldo:        { texto: 'lançada, sem saldo', cor: 'var(--text-3)' },
}

/**
 * Lista as notas do macro item para achar QUAL não foi lançada no ERP.
 *
 * Há dois modos, e o que manda é o retrato que foi colado.
 *
 * CONFERÊNCIA NOTA A NOTA (retrato detalhado) — o número da nota está dos dois
 * lados, então a resposta é determinística: nota que existe aqui e não existe
 * no retrato do macro item NÃO FOI LANÇADA. Sem aposta, sem ordenar por data.
 * O casamento é pelo número e nunca pelo valor: os dois lados rateiam a nota
 * de formas diferentes, então divergir em valor é normal — faltar é que não.
 *
 * BUSCA POR RECÊNCIA (retrato agregado) — sem o número da nota só resta a
 * heurística antiga: da mais recente para a mais antiga, com soma corrida,
 * marcando as que somam a diferença. Continua aqui para quem já tem retrato
 * antigo, mas é a segunda melhor resposta.
 */
function ModalNotasDoMacroItem({
  contratoId,
  linha,
  notasErp,
  onClose,
}: {
  contratoId: string
  linha: LinhaComparacao | null
  /** Retrato do ERP nota a nota. Vazio = cai na busca por recência. */
  notasErp: NotaDoErp[]
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

  const temDetalhe = notasErp.length > 0

  /** Modo determinístico: casa nota a nota contra o retrato do ERP. */
  const conferencia = useMemo(() => {
    if (!notas || !linha || !temDetalhe) return null
    return conferirNotas({
      nossas: notas,
      erp: notasErp,
      chave: linha.chave,
      falta: Math.max(0, linha.diferenca),
    })
  }, [notas, linha, notasErp, temDetalhe])

  /** Modo heurístico: sem número de nota, aposta nas mais recentes. */
  const analise = useMemo(() => {
    if (!notas || !linha || temDetalhe) return null
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
  }, [notas, linha, temDetalhe])

  if (!linha) return null

  const falta = Math.max(0, linha.diferenca)
  const vazio = (conferencia && conferencia.linhas.length === 0)
    || (analise && analise.ordenadas.length === 0)

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
          {/* ── Veredito: conferência nota a nota ─────────────────────── */}
          {conferencia && conferencia.naoLancadas.length > 0 && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF4444' }}>
              <strong>
                {conferencia.naoLancadas.length === 1
                  ? `A nota ${conferencia.naoLancadas[0].notas[0]?.numero ?? conferencia.naoLancadas[0].numero} não está lançada no Informakon.`
                  : `${conferencia.naoLancadas.length} notas não estão lançadas no Informakon.`}
              </strong>{' '}
              Somam {formatCurrency(conferencia.totalNaoLancado)}
              {conferencia.explicaFalta
                ? <> — exatamente a falta de {formatCurrency(falta)}. Lance essas e a medição fecha.</>
                : <> e a falta é de {formatCurrency(falta)}; o resto vem de valor, não de nota ausente.</>}
            </div>
          )}

          {conferencia && conferencia.naoLancadas.length === 0 && falta > 0.01 && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}>
              <strong>Todas as nossas notas deste macro item estão no Informakon.</strong>{' '}
              A falta de {formatCurrency(falta)} não é nota ausente: o saldo lançado lá
              ({formatCurrency(conferencia.totalDisponivel)}) é menor do que o boletim pede.
              {conferencia.foraDoMacroItem.length > 0
                ? ' Comece pelas notas marcadas como lançadas em outro macro item.'
                : ' Confira o valor da nota no ERP ou a quantidade medida.'}
            </div>
          )}

          {conferencia && conferencia.foraDoMacroItem.length > 0 && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}>
              {conferencia.foraDoMacroItem.length === 1 ? 'Uma nota está' : `${conferencia.foraDoMacroItem.length} notas estão`} no
              Informakon, mas em outro macro item — é correção de lançamento lá, não nota nova aqui.
            </div>
          )}

          {/* ── Veredito: busca por recência (retrato agregado) ───────── */}
          {analise && falta > 0.01 && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF4444' }}>
              Falta lançar <strong>{formatCurrency(falta)}</strong>.
              {analise.exata
                ? <> A nota <strong>{analise.exata.numero}</strong> tem exatamente esse valor — é quase certo que seja ela.</>
                : analise.suspeitas.size > 0
                ? <> As <strong>{analise.suspeitas.size}</strong> notas mais recentes somam {formatCurrency(analise.somaSuspeitas)} e estão marcadas abaixo — comece por elas.</>
                : null}
            </div>
          )}

          {analise && (
            <div className="p-2 rounded-lg text-[10px]" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Este retrato veio somado por macro item, então a resposta abaixo é por probabilidade.
              Cole a grade do ERP <strong>nota a nota</strong> (com a coluna Documento) e ela vira
              certeza — o site passa a dizer qual nota não está lá.
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

          {vazio && !carregando && (
            <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              Nenhuma nota de terceiro neste macro item. Se o boletim manda descontar,
              o valor veio de outro caminho — confira o drill-down de NF Desc. na linha.
            </div>
          )}

          {/* ── Tabela determinística ─────────────────────────────────── */}
          {conferencia && conferencia.linhas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-[11px]">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>NF</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emitente</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emissão</th>
                    <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Alocado aqui</th>
                    <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>No ERP a descontar</th>
                    <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>No ERP já descontado</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Situação</th>
                    <th className="py-1.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {conferencia.linhas.map(l => {
                    const cfg = SITUACAO[l.situacao]
                    const primeira = l.notas[0]
                    return (
                      <tr key={l.numero} className="border-b" style={{ borderColor: 'var(--border)', background: cfg.fundo }}>
                        <td className="py-1.5 px-2 font-mono" style={{ color: cfg.cor, fontWeight: cfg.fundo ? 700 : 400 }}>
                          {cfg.fundo && '▸ '}{primeira?.numero || l.numero}
                        </td>
                        <td className="py-1.5 px-2" style={{ color: 'var(--text-2)' }}>{primeira?.emitente || '—'}</td>
                        <td className="py-1.5 px-2 tabular-nums" style={{ color: 'var(--text-3)' }}>{primeira?.data ? formatDate(primeira.data) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: cfg.fundo ? cfg.cor : 'var(--text-2)' }}>
                          {formatCurrency(l.nosso)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>
                          {l.situacao === 'nao_lancada' ? '—' : formatCurrency(l.erpADescontar)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>
                          {l.situacao === 'nao_lancada' ? '—' : formatCurrency(l.erpDescontado)}
                        </td>
                        <td className="py-1.5 px-2" style={{ color: cfg.cor }}>
                          {cfg.texto}
                          {l.macroItemNoErp ? <span style={{ color: 'var(--text-3)' }}> ({l.macroItemNoErp})</span> : null}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {primeira?.arquivoUrl
                            ? <a href={primeira.arquivoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline" style={{ color: '#60A5FA' }}>abrir <ExternalLink className="w-3 h-3" /></a>
                            : <span style={{ color: 'var(--text-3)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {conferencia && conferencia.soNoErp.length > 0 && (
            <div className="p-3 rounded-lg text-[11px]" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
              <p className="mb-1" style={{ color: 'var(--text-2)' }}>
                No Informakon e não aqui — {conferencia.soNoErp.length} nota(s):
              </p>
              <p className="font-mono">
                {conferencia.soNoErp.slice(0, 12).map(n => `${n.documento} (${formatCurrency(n.erpADescontar + n.erpDescontado)})`).join(' · ')}
                {conferencia.soNoErp.length > 12 ? ` · +${conferencia.soNoErp.length - 12}` : ''}
              </p>
              <p className="mt-1">
                O ERP tem essas notas neste macro item e o FIP-WAVE não. Ou faltou cadastrar aqui,
                ou o ERP as colocou no macro item errado.
              </p>
            </div>
          )}

          {/* ── Tabela heurística ─────────────────────────────────────── */}
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
            {conferencia
              ? <>
                  Cada linha é uma nota, casada pelo <strong>número</strong> contra o retrato do
                  Informakon. Valor divergente entre os dois lados é normal — nós rateamos a nota
                  pelos itens do pedido dentro deste macro item e o ERP amarra a nota ao item do
                  pedido dele. O que não é normal é a nota <strong>não estar lá</strong>.
                  &quot;Alocado aqui&quot; é a parcela da nota que cabe neste macro item.
                </>
              : <>
                  Notas da mais recente para a mais antiga — a que acabou de chegar é a que tem mais
                  chance de ainda não ter sido lançada. A <strong>soma corrida</strong> ajuda a achar o
                  ponto de corte: onde ela alcança o valor do Informakon, o que está acima ainda não
                  entrou lá. &quot;Alocado aqui&quot; é a parcela da nota que cabe neste macro item —
                  uma nota que atende mais de um item aparece rateada.
                </>}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** O retrato em vigor nesta medição, como vem do boletim (migration 082). */
export interface RetratoAdotadoUI {
  snapshot_id: string
  /** false = a medição aponta para um retrato que o boletim não conseguiu aplicar. */
  aplicado?: boolean
  motivo?: string
  referencia: string | null
  informado_em: string | null
  total_reclassificado: number
  por_macro_item: Array<{ chave: string; pedido: number; disponivel: number; falta: number }>
}

export function SaldoInformakonPainel({
  contratoId,
  medicaoId,
  linhasBoletim,
  retratoAdotado,
  medicaoAberta,
  podeEditar,
  onMudou,
}: {
  contratoId: string
  medicaoId: string
  linhasBoletim: LinhaBoletimComparavel[]
  /** Retrato que ESTA medição adotou. null = boletim sem ajuste. */
  retratoAdotado?: RetratoAdotadoUI | null
  /** Medição aprovada não troca de retrato — o saldo de NF já foi gravado. */
  medicaoAberta: boolean
  podeEditar: boolean
  /** Recarrega o boletim depois de adotar ou desfazer. */
  onMudou?: () => void
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
  const [adotando, setAdotando] = useState(false)
  /**
   * Confirmação da última adoção. Sem isso o clique não devolvia sinal
   * nenhum: `erro` só era renderizado DENTRO do modal de colagem, que está
   * fechado na hora de adotar — qualquer falha era invisível.
   */
  const [confirmacao, setConfirmacao] = useState<string | null>(null)

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
    setConfirmacao(null)
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
      if (body.detalhe_descartado) {
        problemas.push('você colou nota a nota mas a migration 081 ainda não rodou no Supabase — guardei só o somatório por macro item')
      }
      if (body.formato === 'agregado') {
        problemas.push('o retrato veio somado por macro item; colando a grade do ERP com a coluna Documento eu digo QUAL nota falta lançar')
      }
      const salvo = body.formato === 'detalhado' && body.qtd_notas > 0
        ? `Salvei ${body.qtd_notas} notas em ${body.qtd_linhas} macro itens`
        : `Salvei ${body.qtd_linhas} linhas`
      setAviso(problemas.length > 0 ? `${salvo}, mas confira: ${problemas.join(' · ')}.` : null)

      setModalAberto(false)
      setTexto('')
      await carregar()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setSalvando(false)
    }
  }

  /**
   * Adota o retrato NESTA medição (ou desfaz).
   *
   * Adotar não é um filtro visual: o boletim passa a reclassificar de "NF
   * Desc." para "não lançada no ERP" o que o ERP não tem, o "% a lançar" cai
   * na diferença exata, e a aprovação deixa de marcar essa nota como abatida
   * — ela volta na medição seguinte. Por isso é explícito e reversível.
   */
  async function alternarAdocao(adotar: boolean) {
    setAdotando(true)
    setErro('')
    setAviso(null)
    try {
      const url = `/api/contratos/${contratoId}/medicoes/${medicaoId}/informakon-retrato`
      const res = adotar
        ? await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot_id: retrato?.snapshot_id }),
          })
        : await fetch(url, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(body?.error || `Falha (HTTP ${res.status}).`); return }
      setConfirmacao(adotar
        ? `Retrato adotado: ${formatCurrency(body.total_reclassificado || 0)} reclassificados em ${body.macro_itens ?? 0} macro item(ns). O "% a lançar" já caiu nesse valor.`
        : 'Retrato desfeito nesta medição. O "% a lançar" voltou ao valor cheio.')
      onMudou?.()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setAdotando(false)
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
                  ? `Retrato de ${retrato.referencia ? formatDate(retrato.referencia) : '—'} · total a descontar ${formatCurrency(retrato.total || 0)}${
                      retrato.formato === 'detalhado'
                        ? ` · ${retrato.notas?.length ?? 0} notas rastreadas`
                        : ' · somado por macro item'
                    }${
                      (retrato.total_realocado ?? 0) > 0.01
                        ? ` · ${formatCurrency(retrato.total_realocado!)} lidos no macro item em que o boletim pede`
                        : ''
                    }`
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
          <a
            href="/ajuda/conferencia-informakon"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-colors hover:bg-[var(--surface-3)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
            title="Passo a passo da conferência — o mesmo em toda medição"
          >
            <ListChecks className="w-3 h-3" /> Passo a passo
          </a>
        </div>

        {aviso && (
          <div className="px-3 pb-3">
            <div className="p-2 rounded-lg text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-300">
              {aviso}
            </div>
          </div>
        )}

        {/* Erro e confirmação das ações do painel. Antes o `erro` só era
            renderizado dentro do modal de colagem — fechado na hora de
            adotar —, então uma falha ao adotar não aparecia em lugar nenhum. */}
        {erro && !modalAberto && (
          <div className="px-3 pb-3">
            <div className="p-2 rounded-lg text-[11px] bg-red-900/20 border border-red-800/40 text-red-400 flex items-start justify-between gap-2">
              <span>{erro}</span>
              <button type="button" onClick={() => setErro('')} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
            </div>
          </div>
        )}

        {confirmacao && (
          <div className="px-3 pb-3">
            <div
              className="p-2 rounded-lg text-[11px] flex items-start justify-between gap-2"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)', color: '#10B981' }}
            >
              <span>{confirmacao}</span>
              <button type="button" onClick={() => setConfirmacao(null)} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
            </div>
          </div>
        )}

        {/* ── Leitura NOTA A NOTA, sem macro item ──────────────────────
            O macro item do ERP é decisão do pedido da FIP, não da nota — a
            mesma nota aparece em vários lá. Comparar por macro item vira
            whack-a-mole: credita um grupo e descobre falta em outro, com o
            total parado. A pergunta com resposta acionável é outra: a nota
            está lançada no Informakon ou não está? */}
        {retrato?.formato === 'detalhado' && (
          <div className="px-3 pb-3">
            <div
              className="p-2.5 rounded-lg text-[11px]"
              style={{
                background: (retrato.qtd_ausentes ?? 0) > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${(retrato.qtd_ausentes ?? 0) > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`,
                color: (retrato.qtd_ausentes ?? 0) > 0 ? '#EF4444' : '#10B981',
              }}
            >
              {(retrato.qtd_ausentes ?? 0) > 0 ? (
                <>
                  <strong>
                    {retrato.qtd_ausentes} nota(s) nossa(s) não estão no Informakon — em macro item
                    nenhum. Somam {formatCurrency(retrato.total_ausente || 0)}.
                  </strong>
                  <span className="block mt-1 font-mono" style={{ color: 'var(--text-2)' }}>
                    {(retrato.notas_ausentes ?? []).slice(0, 15).map(n => (
                      `${n.pedido ? `${n.pedido} · ` : ''}NF ${n.numero} (${formatCurrency(n.valor)})`
                    )).join('  ·  ')}
                    {(retrato.qtd_ausentes ?? 0) > 15 ? `  ·  +${(retrato.qtd_ausentes ?? 0) - 15}` : ''}
                  </span>
                  <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                    Essa é a lista que dá para resolver — lançando. A tabela por macro item abaixo
                    mistura isso com diferença de classificação: o Informakon amarra a nota ao item
                    do pedido da FIP e nós a rateamos pelos nossos detalhamentos, então os dois lados
                    nunca vão bater grupo a grupo.
                  </span>
                </>
              ) : (
                <>
                  <strong>Todas as nossas notas estão lançadas no Informakon.</strong>
                  <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                    O que a tabela por macro item mostra abaixo é diferença de classificação, não
                    nota faltando — o ERP amarra a nota ao item do pedido da FIP e nós a rateamos
                    pelos nossos detalhamentos. Não há lançamento a fazer.
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── O INVERSO: o ERP tem nota que o nosso cadastro não conhece ─
            Este é o erro mais caro dos dois, porque nada no boletim o
            denuncia: `NF Terceiro` fica baixo, `NF Desc.` fica baixo, e todos
            os números fecham entre si — só estão todos errados para menos. */}
        {(retrato?.qtd_so_no_erp ?? 0) > 0 && (
          <div className="px-3 pb-3">
            <div
              className="p-2.5 rounded-lg text-[11px]"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}
            >
              <strong>
                {retrato!.qtd_so_no_erp} nota(s) estão no Informakon e não existem no site.
                Somam {formatCurrency(retrato!.total_so_no_erp || 0)}.
              </strong>
              <span className="block mt-1 font-mono" style={{ color: 'var(--text-2)' }}>
                {(retrato!.notas_so_no_erp ?? []).slice(0, 12).map(n => (
                  `${n.documento || `NF ${n.numero}`} (${formatCurrency(n.valor)})`
                )).join('  ·  ')}
                {(retrato!.qtd_so_no_erp ?? 0) > 12 ? `  ·  +${(retrato!.qtd_so_no_erp ?? 0) - 12}` : ''}
              </span>
              <span className="block mt-1" style={{ color: 'var(--text-3)' }}>
                Se for material desta obra, o pedido de fat-direto está faltando aqui — e aí o boletim
                manda descontar <strong>menos</strong> do que deveria, e a Wave recebe material sem
                abatimento. Confira uma a uma: ou cadastre o pedido, ou confirme que a nota é de outra
                obra. Este alarme não some sozinho e nenhum outro número do boletim o denuncia.
              </span>
            </div>
          </div>
        )}

        {/* ── Adotar o retrato nesta medição ───────────────────────────
            Adotar reclassifica o desconto que o ERP não tem: o "% a lançar"
            cai na diferença exata e a nota continua na fila para o mês que
            vem, em vez de ser marcada como abatida na aprovação. */}
        {retratoAdotado && retratoAdotado.aplicado === false ? (
          <div className="px-3 pb-3">
            <div
              className="p-2.5 rounded-lg text-[11px] flex items-start justify-between gap-3 flex-wrap"
              style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.40)', color: '#F59E0B' }}
            >
              <div className="min-w-0">
                <strong>Esta medição aponta para um retrato, mas o boletim não conseguiu aplicá-lo</strong>
                {retratoAdotado.motivo ? ` — ${retratoAdotado.motivo}.` : '.'}{' '}
                O &quot;% a lançar&quot; está sem correção. Desfaça, cole o retrato de novo e adote outra vez.
              </div>
              {podeEditar && medicaoAberta && (
                <button
                  type="button"
                  onClick={() => alternarAdocao(false)}
                  disabled={adotando}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  {adotando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                  Desfazer
                </button>
              )}
            </div>
          </div>
        ) : retratoAdotado ? (
          <div className="px-3 pb-3">
            <div
              className="p-2.5 rounded-lg text-[11px] flex items-start justify-between gap-3 flex-wrap"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.35)' }}
            >
              <div className="min-w-0" style={{ color: '#10B981' }}>
                <strong>
                  Retrato de {retratoAdotado.referencia ? formatDate(retratoAdotado.referencia) : '—'} adotado nesta medição.
                </strong>{' '}
                {formatCurrency(retratoAdotado.total_reclassificado)} saíram de &quot;NF Desc.&quot; e viraram
                &quot;não lançada no ERP&quot;: o <strong>% a lançar</strong> já está corrigido, e essa nota
                volta na próxima medição em vez de ser dada como abatida.
              </div>
              {podeEditar && medicaoAberta && (
                <button
                  type="button"
                  onClick={() => alternarAdocao(false)}
                  disabled={adotando}
                  className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                >
                  {adotando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                  Desfazer
                </button>
              )}
            </div>
          </div>
        ) : temFalta && podeEditar && medicaoAberta && retrato?.snapshot_id ? (
          <div className="px-3 pb-3">
            <div
              className="p-2.5 rounded-lg text-[11px] flex items-start justify-between gap-3 flex-wrap"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              <div className="min-w-0" style={{ color: 'var(--text-2)' }}>
                Lançar o <strong>% a lançar</strong> como está hoje libera{' '}
                <strong style={{ color: '#EF4444' }}>{formatCurrency(comparacao!.totalFaltante)}</strong> que o
                Informakon não tem como descontar — e a aprovação ainda daria essa nota por abatida,
                tirando ela da fila. O melhor caminho é lançar a nota lá. Se não der agora,
                adote o retrato: o % cai nesse valor exato e a nota volta no mês que vem.
              </div>
              <button
                type="button"
                onClick={() => alternarAdocao(true)}
                disabled={adotando}
                className="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border transition-colors hover:bg-red-500/10 disabled:opacity-50"
                style={{ borderColor: 'rgba(239,68,68,0.45)', color: '#EF4444' }}
              >
                {adotando ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                Adotar nesta medição
              </button>
            </div>
          </div>
        ) : null}

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
        notasErp={retrato?.notas ?? []}
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
              Cole a grade do Informakon <strong>nota a nota</strong> — a mesma tela, com as colunas
              Documento / Especificação / Vlr. a Desc / Vlr.Desc, selecionada e copiada inteira.
              Sem somar nada por grupo: eu somo. E com o número da nota eu consigo dizer
              <strong> qual</strong> nota falta lançar, não só quanto falta.
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
                Copie a grade inteira, com ou sem o cabeçalho e com ou sem a linha de totais —
                tudo é reconhecido sozinho. A tabela dinâmica antiga (rótulo do macro item, TAB,
                valor) continua funcionando, só não diz qual nota falta.
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
