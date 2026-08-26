'use client'

/**
 * Drill-down da coluna "NF Desc." do boletim Informakon.
 *
 * POR QUE ISTO NÃO É "a lista de notas que somam R$ X":
 *
 * O valor da célula passa por três rateios em série e perde a identidade da
 * nota em cada um deles:
 *
 *   1. lib/db/informacon-data.ts — todas as NFs de um pedido viram um total
 *      único. `notas_fiscais_fat_direto` sequer tem `detalhamento_id`: a nota
 *      se liga ao PEDIDO, não ao item do contrato.
 *   2. o total do pedido é rateado pro-rata entre os itens do pedido, pelo
 *      `valor_total` de cada um.
 *   3. lib/db/desconto-transbordo.ts — todos os detalhamentos da mesma TAREFA
 *      caem num balde comum, a régua acumulada
 *      `min(material acumulado, NF alocada) − já abatido` é aplicada ao balde
 *      inteiro, e o resultado volta pra cada item por proporção de material
 *      medido.
 *
 * Logo o NF Desc. de uma linha é uma FATIA do balde da tarefa. Prometer
 * "estas são as notas dessa célula" seria mentira. O que este painel entrega
 * é a versão honesta e auditável: a conta da linha passo a passo, e as notas
 * que estão no balde de onde a fatia saiu.
 */

import { useEffect, useState } from 'react'
import { Loader2, FileText, ExternalLink, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

export interface NfDescLinha {
  codigo: string
  descricao: string
  detalhamento_id: string
  tarefa_id?: string | null
  material_medido: number
  nf_terceiro: number
  nf_descontavel: number
  nf_transbordo_grupo?: number
  nf_recuperacao_anterior?: number
  gap_material: number
  faturamento_direto_em_aberto: number
  fip_faturar: number
  saldo_aprovado: number
}

interface OrigemNota {
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

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  aprovada: { texto: 'aprovada', cor: '#10B981' },
  aguardando_aprovacao: { texto: 'aguardando aprovação', cor: '#F59E0B' },
  em_correcao: { texto: 'em correção', cor: '#F97316' },
  cancelada: { texto: 'cancelada', cor: '#EF4444' },
}

export function NfDescDrilldown({
  contratoId,
  linha,
  onClose,
}: {
  contratoId: string
  linha: NfDescLinha | null
  onClose: () => void
}) {
  const [notas, setNotas] = useState<OrigemNota[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  // Escopo do balde: a TAREFA, que é onde o desconto é apurado. Sem
  // tarefa_id (resposta antiga da API) cai no detalhamento — mais estreito,
  // mas ainda verdadeiro sobre o que está alocado ao próprio item.
  const scope = linha?.tarefa_id || linha?.detalhamento_id || null
  const escopoEhTarefa = !!linha?.tarefa_id

  useEffect(() => {
    if (!linha || !scope) { setNotas(null); return }
    let cancelado = false
    setCarregando(true)
    setErro('')
    setNotas(null)
    fetch(`/api/contratos/${contratoId}/origem?modo=material&origem=realizado&scope=${scope}`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
        return body
      })
      .then(data => {
        if (cancelado) return
        const itens = (data?.itens || []) as OrigemNota[]
        setNotas(itens.filter(i => i.tipo === 'nf-fat-direto'))
      })
      .catch(e => { if (!cancelado) setErro(e?.message || 'Falha ao carregar as notas.') })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [contratoId, scope, linha])

  if (!linha) return null

  const transbordo = Number(linha.nf_transbordo_grupo || 0)
  const recuperacao = Number(linha.nf_recuperacao_anterior || 0)
  const somaAlocada = (notas || []).reduce((s, n) => s + Number(n.valorAlocado || 0), 0)

  return (
    <Dialog open={!!linha} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#60A5FA' }}>
            <FileText className="w-5 h-5" />
            De onde vem o NF Desc.
          </DialogTitle>
          <DialogDescription className="text-[var(--text-2)]">
            Item <strong className="font-mono">{linha.codigo}</strong>
            {' — '}
            {linha.descricao.length > 90 ? linha.descricao.slice(0, 90) + '…' : linha.descricao}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── A conta da linha ──────────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
              A conta desta linha
            </h4>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <Passo rotulo="Material medido no período" valor={linha.material_medido} tom="neutro" />
              <Passo rotulo="− NF Desc. (nota de terceiro já descontada)" valor={-linha.nf_descontavel} tom="verde" />
              {transbordo > 0 && (
                <Passo
                  rotulo="↳ dos quais vieram de nota de OUTRO item da mesma tarefa"
                  valor={transbordo}
                  tom="sub"
                />
              )}
              {recuperacao > 0 && (
                <Passo
                  rotulo="↳ dos quais são nota de medições anteriores, recuperada agora"
                  valor={recuperacao}
                  tom="sub"
                />
              )}
              <Passo rotulo="= Gap (material sem nota)" valor={linha.gap_material} tom="ambar" destaque />
              <Passo rotulo="↳ Retido — já tem pedido aprovado, aguarda a nota chegar" valor={linha.faturamento_direto_em_aberto} tom="sub" />
              <Passo rotulo="↳ FIP Fat-Dir — a FIP precisa emitir nota nova" valor={linha.fip_faturar} tom="sub" />
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>
              O Gap se reparte inteiro entre as duas últimas linhas — vale sempre
              <strong> Gap = Retido + FIP Fat-Dir</strong>. Ele não é gravado em lugar nenhum
              e não move dinheiro sozinho: quem decide pagamento são as duas parcelas.
            </p>
            {linha.saldo_aprovado === 0 && linha.faturamento_direto_em_aberto > 0 && (
              <div className="mt-2 flex items-start gap-2 p-2 rounded-lg text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  A coluna <strong>Saldo Aprov.</strong> desta linha mostra 0, mas há valor Retido.
                  Não é erro: o saldo aprovado é apurado <strong>por tarefa</strong>, num pool
                  compartilhado — a FIP compra por lote e o pedido está lançado num item vizinho.
                  A coluna mostra só o número cru deste item.
                </span>
              </div>
            )}
          </section>

          {/* ── As notas do balde ────────────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
              Notas no balde {escopoEhTarefa ? 'da tarefa' : 'deste item'}
            </h4>
            <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
              O NF Desc. acima é uma <strong>fatia</strong> deste conjunto, não a soma de notas
              específicas: a nota se liga ao <em>pedido</em>, o pedido é rateado entre seus itens,
              e o desconto é apurado no balde
              {escopoEhTarefa ? ' da tarefa inteira' : ' do item'} pela régua acumulada. Por isso os
              totais abaixo não batem com a célula — eles mostram o estoque de nota disponível,
              de onde a fatia saiu.
            </p>

            {carregando && (
              <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--text-3)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando notas…
              </div>
            )}

            {erro && (
              <div className="p-3 rounded-lg text-xs bg-red-900/20 border border-red-800/40 text-red-400">
                {erro}
              </div>
            )}

            {notas && notas.length === 0 && !carregando && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                Nenhuma nota de terceiro lançada neste escopo. O material medido está
                inteiro no Gap — ou vira pedido em nome da FIP, ou aguarda nota do fornecedor.
              </div>
            )}

            {notas && notas.length > 0 && (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-[11px]">
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>NF</th>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emitente</th>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Pedido</th>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Emissão</th>
                      <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Valor da NF</th>
                      <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Alocado aqui</th>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Status</th>
                      <th className="py-1.5 px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {notas.map(nf => {
                      const st = ROTULO_STATUS[nf.status] ?? { texto: nf.status, cor: 'var(--text-3)' }
                      return (
                        <tr key={nf.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-1)' }}>{nf.numero || '—'}</td>
                          <td className="py-1.5 px-2" style={{ color: 'var(--text-2)' }}>{nf.emitente || '—'}</td>
                          <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-3)' }}>{nf.pedidoNumero || '—'}</td>
                          <td className="py-1.5 px-2 tabular-nums" style={{ color: 'var(--text-3)' }}>{nf.data ? formatDate(nf.data) : '—'}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(nf.valorTotalNf)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: '#10B981' }}>{formatCurrency(nf.valorAlocado)}</td>
                          <td className="py-1.5 px-2" style={{ color: st.cor }}>{st.texto}</td>
                          <td className="py-1.5 px-2 text-right">
                            {nf.arquivoUrl ? (
                              <a
                                href={nf.arquivoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                                style={{ color: '#60A5FA' }}
                                title="Abrir o arquivo da nota"
                              >
                                abrir <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>sem arquivo</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={5} className="py-1.5 px-2 text-right font-semibold" style={{ color: 'var(--text-2)' }}>
                        Total alocado ao escopo
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-bold" style={{ color: '#10B981' }}>
                        {formatCurrency(somaAlocada)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Passo({
  rotulo, valor, tom, destaque,
}: {
  rotulo: string
  valor: number
  tom: 'neutro' | 'verde' | 'ambar' | 'sub'
  destaque?: boolean
}) {
  const cor = tom === 'verde' ? '#10B981' : tom === 'ambar' ? '#F59E0B' : tom === 'sub' ? 'var(--text-3)' : 'var(--text-1)'
  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 ${tom === 'sub' ? 'py-1' : 'py-2'} border-b last:border-b-0`}
      style={{
        borderColor: 'var(--border)',
        background: destaque ? 'rgba(245,158,11,0.06)' : 'var(--surface-1)',
        paddingLeft: tom === 'sub' ? 28 : undefined,
      }}
    >
      <span className={tom === 'sub' ? 'text-[10px]' : 'text-xs'} style={{ color: tom === 'sub' ? 'var(--text-3)' : 'var(--text-2)' }}>
        {rotulo}
      </span>
      <span
        className={`tabular-nums ${destaque ? 'text-sm font-bold' : tom === 'sub' ? 'text-[10px] font-semibold' : 'text-xs font-semibold'}`}
        style={{ color: cor }}
      >
        {formatCurrency(Math.abs(valor))}
      </span>
    </div>
  )
}
