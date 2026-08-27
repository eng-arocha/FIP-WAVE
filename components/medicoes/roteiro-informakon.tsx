'use client'

/**
 * Roteiro de lançamento no Informakon.
 *
 * O boletim é analítico — pensa por item, em colunas. O lançamento é
 * operacional: por MACRO GRUPO, com dois números digitados à mão (o percentual
 * de cada item e o valor do desconto de material) e um limite de lastro nota a
 * nota. Esta tela devolve exatamente o que se digita, na ordem de digitar.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Loader2, Copy, Check, AlertTriangle, CheckCircle2, Printer } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface NotaDist {
  numero: string
  documento: string
  data: string | null
  saldo: number
  usar: number
}
interface ItemRot {
  codigo: string
  codigoInformakon: string | null
  descricao: string
  pct: number
  liberacao: number
  pctFisicoAcumulado: number
  pctLancadoAcumulado: number
}
interface GrupoRot {
  chave: string
  rotulo: string
  itens: ItemRot[]
  liberacao: number
  desconto: number
  servico: number
  fipPrecisaEmitir: number
  distribuicao: { linhas: NotaDist[]; distribuido: number; faltaLastro: number; saldoRemanescente: number }
  fecha: boolean
}
interface Roteiro {
  medicao: { id: string; numero: number; status: string }
  grupos: GrupoRot[]
  liberacao: number
  desconto: number
  servico: number
  fipPrecisaEmitir: number
  faltaLastro: number
  retrato: { snapshot_id: string; referencia: string | null; adotado: boolean } | null
}

const pct = (n: number) => `${(Number(n) || 0).toFixed(4).replace('.', ',')}%`

/** Número clicável: copia para a área de transferência, que é onde ele vai. */
function Copiavel({ texto, children, cor }: { texto: string; children: React.ReactNode; cor?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true)
          setTimeout(() => setCopiado(false), 1200)
        }).catch(() => {})
      }}
      className="inline-flex items-center gap-1 tabular-nums hover:underline decoration-dotted underline-offset-2 print:no-underline"
      style={{ color: cor ?? 'inherit', font: 'inherit' }}
      title="Copiar"
    >
      {children}
      {copiado
        ? <Check className="w-3 h-3 print:hidden" style={{ color: '#10B981' }} />
        : <Copy className="w-3 h-3 opacity-30 print:hidden" />}
    </button>
  )
}

function Bloco({ n, titulo, children }: { n: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {n} {titulo}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function RoteiroInformakonModal({
  contratoId, medicaoId, aberto, onClose,
}: {
  contratoId: string
  medicaoId: string
  aberto: boolean
  onClose: () => void
}) {
  const [dados, setDados] = useState<Roteiro | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/roteiro-informakon`, { cache: 'no-store' })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
      setDados(body)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao montar o roteiro.')
    } finally {
      setCarregando(false)
    }
  }, [contratoId, medicaoId])

  useEffect(() => { if (aberto) carregar() }, [aberto, carregar])

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Roteiro de lançamento no Informakon</span>
            <button
              type="button"
              onClick={() => window.print()}
              className="print:hidden inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              <Printer className="w-3 h-3" /> Imprimir
            </button>
          </DialogTitle>
          <DialogDescription className="text-[var(--text-2)]">
            Por macro grupo, na ordem de digitar. O <strong>%</strong> e o <strong>desconto</strong> vão
            no <strong>pedido mãe</strong>, consumindo o saldo acumulado no pedido de faturamento
            direto. Nota de material nunca entra no pedido mãe. O desconto é repartido entre as
            notas em <strong>FIFO</strong> — a mais antiga primeiro —, sem passar do saldo de
            nenhuma. Clique em qualquer número para copiar.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="flex items-center gap-2 py-8 justify-center text-xs" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Montando o roteiro…
          </div>
        )}
        {erro && <div className="p-3 rounded-lg text-xs bg-red-900/20 border border-red-800/40 text-red-400">{erro}</div>}

        {dados && !carregando && (
          <div className="space-y-3 py-1">
            {/* Resumo e bloqueios */}
            <div
              className="p-3 rounded-lg text-[11px]"
              style={{
                background: dados.fipPrecisaEmitir > 0.01 || dados.faltaLastro > 0.01
                  ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                border: `1px solid ${dados.fipPrecisaEmitir > 0.01 || dados.faltaLastro > 0.01
                  ? 'rgba(239,68,68,0.35)' : 'rgba(16,185,129,0.35)'}`,
              }}
            >
              <div className="grid sm:grid-cols-3 gap-2" style={{ color: 'var(--text-2)' }}>
                <div>O ERP libera <strong>{formatCurrency(dados.liberacao)}</strong></div>
                <div>Você desconta <strong>{formatCurrency(dados.desconto)}</strong></div>
                <div>Sobra para a Wave <strong>{formatCurrency(dados.servico)}</strong></div>
              </div>
              {dados.fipPrecisaEmitir > 0.01 && (
                <p className="mt-1.5" style={{ color: '#EF4444' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  <strong>Antes de lançar:</strong> a FIP precisa emitir e lançar{' '}
                  {formatCurrency(dados.fipPrecisaEmitir)} de nota de material — sem lastro o desconto trava.
                </p>
              )}
              {dados.faltaLastro > 0.01 && (
                <p className="mt-1" style={{ color: '#EF4444' }}>
                  <strong>{formatCurrency(dados.faltaLastro)}</strong> de desconto sem lastro no Informakon.
                  Lance a nota lá, ou adote o retrato no painel para o percentual cair nesse valor.
                </p>
              )}
              {!dados.retrato && (
                <p className="mt-1" style={{ color: '#F59E0B' }}>
                  Nenhum retrato do Informakon colado — sem ele não dá para saber o saldo de cada nota,
                  e o bloco ② sai sem a repartição.
                </p>
              )}
              {dados.retrato && (
                <p className="mt-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
                  Lastro do retrato de {dados.retrato.referencia ? formatDate(dados.retrato.referencia) : '—'}
                  {dados.retrato.adotado ? ' (adotado nesta medição)' : ''}.
                </p>
              )}
            </div>

            {dados.grupos.map(g => (
              <div key={g.chave} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>
                  GRUPO {g.chave} — {g.rotulo}
                </p>

                <Bloco n="①" titulo="digite o % de cada item">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {g.itens.map(i => {
                        const adianta = i.pctLancadoAcumulado > i.pctFisicoAcumulado + 0.01
                        return (
                          <tr key={i.codigo} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-1 pr-2 font-mono" style={{ color: 'var(--text-3)' }}>
                              {i.codigoInformakon || i.codigo}
                            </td>
                            <td className="py-1 pr-2" style={{ color: 'var(--text-2)' }}>{i.descricao}</td>
                            <td className="py-1 pr-2 text-right" style={{ color: 'var(--text-3)' }}>
                              {formatCurrency(i.liberacao)}
                            </td>
                            <td className="py-1 text-right font-bold">
                              <Copiavel texto={i.pct.toFixed(4).replace('.', ',')} cor={adianta ? '#EF4444' : '#3B82F6'}>
                                {pct(i.pct)}
                              </Copiavel>
                              {adianta && (
                                <span className="block text-[9px] font-normal" style={{ color: '#EF4444' }}>
                                  ⚠ acum. {i.pctLancadoAcumulado.toFixed(2)}% &gt; físico {i.pctFisicoAcumulado.toFixed(2)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-3)' }}>
                    liberação do grupo: <strong>{formatCurrency(g.liberacao)}</strong>
                  </p>
                </Bloco>

                <Bloco n="②" titulo={`digite o desconto de material — ${formatCurrency(g.desconto)}`}>
                  {g.distribuicao.linhas.length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {g.desconto > 0.01
                        ? 'Sem saldo de nota no Informakon para este grupo — o desconto trava aqui.'
                        : 'Nada a descontar neste grupo.'}
                    </p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {g.distribuicao.linhas.map(n => (
                          <tr key={n.numero} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-1 pr-2 font-mono" style={{ color: 'var(--text-1)' }}>{n.documento}</td>
                            <td className="py-1 pr-2 tabular-nums" style={{ color: 'var(--text-3)' }}>
                              {n.data ? formatDate(n.data) : 'sem data'}
                            </td>
                            <td className="py-1 pr-2 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>
                              saldo {formatCurrency(n.saldo)}
                            </td>
                            <td className="py-1 text-right font-bold">
                              <Copiavel texto={n.usar.toFixed(2).replace('.', ',')} cor="#10B981">
                                {formatCurrency(n.usar)}
                              </Copiavel>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {g.distribuicao.faltaLastro > 0.01 && (
                    <p className="text-[11px] mt-1" style={{ color: '#EF4444' }}>
                      Faltam {formatCurrency(g.distribuicao.faltaLastro)} de lastro neste grupo.
                    </p>
                  )}
                </Bloco>

                <Bloco n="③" titulo="confere?">
                  <p className="text-[11px] tabular-nums" style={{ color: g.fecha ? '#10B981' : '#EF4444' }}>
                    {g.fecha ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <AlertTriangle className="w-3 h-3 inline mr-1" />}
                    {formatCurrency(g.liberacao)} − {formatCurrency(g.desconto)}
                    {g.fipPrecisaEmitir > 0.01 ? ` − ${formatCurrency(g.fipPrecisaEmitir)} (nota FIP)` : ''}
                    {' = '}<strong>{formatCurrency(g.servico)}</strong> — serviço medido do grupo
                    {g.fecha ? '' : ' — NÃO FECHA, não lance'}
                  </p>
                </Bloco>

                {g.fipPrecisaEmitir > 0.01 && (
                  <Bloco n="④" titulo="bloqueio">
                    <p className="text-[11px]" style={{ color: '#EF4444' }}>
                      A FIP precisa emitir e lançar <strong>{formatCurrency(g.fipPrecisaEmitir)}</strong> de
                      nota de material neste grupo antes de você conseguir digitar o desconto.
                      <span className="block mt-0.5" style={{ color: 'var(--text-3)' }}>
                        Lance no <strong>pedido de faturamento direto</strong> — nota complementar
                        no pedido mãe não vira base de desconto e o lançamento continua travado.
                      </span>
                    </p>
                  </Bloco>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
