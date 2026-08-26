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

/**
 * Qual célula foi clicada. Cada uma tem uma pergunta e um escopo diferentes:
 *
 *  - `nf-desc`      "de onde vem este desconto?" → balde da TAREFA, porque é
 *                   nele que a régua acumulada é apurada. O valor da célula é
 *                   uma FATIA do balde, não a soma das notas listadas.
 *  - `nf-terceiro`  "quais notas estão alocadas a este item?" → escopo do
 *                   DETALHAMENTO. Aqui a soma BATE com a célula: os dois lados
 *                   usam o mesmo rateio pro-rata (allocateNfToScope em
 *                   lib/db/origem.ts e nfAlocadaPorDet em informacon-data.ts).
 *  - `saldo-aprov`  "que pedidos aprovados ainda não viraram nota?" → escopo do
 *                   DETALHAMENTO, modo saldo. A soma bate com a célula quando
 *                   ela é > 0 (a célula é max(0, aprovado − nf alocada)).
 */
export type ColunaDrilldown = 'nf-desc' | 'nf-terceiro' | 'saldo-aprov'

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

interface OrigemPedido {
  tipo: string
  id: string
  numero: string
  aprovadoEm: string | null
  aprovado: number
  emNf: number
  saldo: number
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
  coluna = 'nf-desc',
  onClose,
}: {
  contratoId: string
  linha: NfDescLinha | null
  coluna?: ColunaDrilldown
  onClose: () => void
}) {
  const [notas, setNotas] = useState<OrigemNota[] | null>(null)
  const [pedidos, setPedidos] = useState<OrigemPedido[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  // NF Desc. é apurado no balde da TAREFA; as outras duas colunas são do
  // próprio item. Sem `tarefa_id` (resposta antiga da API) o NF Desc. cai no
  // detalhamento — mais estreito, mas ainda verdadeiro sobre o próprio item.
  const escopoEhTarefa = coluna === 'nf-desc' && !!linha?.tarefa_id
  const scope = escopoEhTarefa ? linha!.tarefa_id! : (linha?.detalhamento_id || null)
  const modoOrigem = coluna === 'saldo-aprov' ? 'saldo' : 'realizado'

  useEffect(() => {
    if (!linha || !scope) { setNotas(null); setPedidos(null); return }
    let cancelado = false
    setCarregando(true)
    setErro('')
    setNotas(null)
    setPedidos(null)
    fetch(`/api/contratos/${contratoId}/origem?modo=material&origem=${modoOrigem}&scope=${scope}`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
        return body
      })
      .then(data => {
        if (cancelado) return
        const itens = (data?.itens || []) as any[]
        if (modoOrigem === 'saldo') {
          setPedidos(itens.filter(i => i.tipo === 'pedido-saldo') as OrigemPedido[])
        } else {
          setNotas(itens.filter(i => i.tipo === 'nf-fat-direto') as OrigemNota[])
        }
      })
      .catch(e => { if (!cancelado) setErro(e?.message || 'Falha ao carregar os dados.') })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [contratoId, scope, modoOrigem, linha])

  if (!linha) return null

  const CFG = {
    'nf-desc':     { titulo: 'De onde vem o NF Desc.',        valor: linha.nf_descontavel },
    'nf-terceiro': { titulo: 'Notas alocadas a este item',    valor: linha.nf_terceiro },
    'saldo-aprov': { titulo: 'Pedidos aprovados sem nota',    valor: linha.saldo_aprovado },
  }[coluna]

  const transbordo = Number(linha.nf_transbordo_grupo || 0)
  const recuperacao = Number(linha.nf_recuperacao_anterior || 0)
  const somaAlocada = (notas || []).reduce((s, n) => s + Number(n.valorAlocado || 0), 0)

  return (
    <Dialog open={!!linha} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: '#60A5FA' }}>
            <FileText className="w-5 h-5" />
            {CFG.titulo}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-2)]">
            Item <strong className="font-mono">{linha.codigo}</strong>
            {' — '}
            {linha.descricao.length > 90 ? linha.descricao.slice(0, 90) + '…' : linha.descricao}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── A conta da linha — só o NF Desc. tem cadeia de cálculo ── */}
          {coluna === 'nf-desc' && (
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
          )}

          {/* ── Notas / pedidos do escopo ────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
              {coluna === 'saldo-aprov'
                ? 'Pedidos aprovados com saldo neste item'
                : `Notas no balde ${escopoEhTarefa ? 'da tarefa' : 'deste item'}`}
            </h4>
            {coluna === 'nf-desc' ? (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                O NF Desc. acima é uma <strong>fatia</strong> deste conjunto, não a soma de notas
                específicas: a nota se liga ao <em>pedido</em>, o pedido é rateado entre seus itens,
                e o desconto é apurado no balde
                {escopoEhTarefa ? ' da tarefa inteira' : ' do item'} pela régua acumulada. Por isso os
                totais abaixo não batem com a célula — eles mostram o estoque de nota disponível,
                de onde a fatia saiu.
              </p>
            ) : coluna === 'nf-terceiro' ? (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Aqui o total <strong>bate</strong> com a célula ({formatCurrency(CFG.valor)}): é a
                mesma conta dos dois lados. A nota se liga ao <em>pedido</em>, não ao item — o valor
                dela é rateado entre os itens do pedido na proporção do valor de cada um, e a coluna
                &quot;Alocado aqui&quot; é a parcela que coube a este detalhamento.
              </p>
            ) : (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Material já <strong>aprovado</strong> em pedido de faturamento direto cuja nota do
                fornecedor ainda não chegou — total {formatCurrency(CFG.valor)}. É o que segura a
                coluna &quot;Retido&quot;: enquanto houver saldo aqui, o sistema não pede nota nova
                à FIP pelo mesmo material.
              </p>
            )}

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

            {pedidos && pedidos.length === 0 && !carregando && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                Nenhum pedido de faturamento direto aprovado com saldo neste item. Por isso a
                coluna Saldo Aprov. está zerada — o material sem nota vai inteiro para
                &quot;FIP Fat-Dir&quot;.
              </div>
            )}

            {pedidos && pedidos.length > 0 && (
              <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-[11px]">
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Pedido</th>
                      <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Aprovado em</th>
                      <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Aprovado aqui</th>
                      <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Já em NF</th>
                      <th className="text-right py-1.5 px-2 font-medium" style={{ color: 'var(--text-3)' }}>Saldo sem NF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map(pd => (
                      <tr key={pd.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-1)' }}>{pd.numero || '—'}</td>
                        <td className="py-1.5 px-2 tabular-nums" style={{ color: 'var(--text-3)' }}>{pd.aprovadoEm ? formatDate(pd.aprovadoEm) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>{formatCurrency(pd.aprovado)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>{formatCurrency(pd.emNf)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: '#F59E0B' }}>{formatCurrency(pd.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={4} className="py-1.5 px-2 text-right font-semibold" style={{ color: 'var(--text-2)' }}>
                        Saldo total aguardando nota
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-bold" style={{ color: '#F59E0B' }}>
                        {formatCurrency(pedidos.reduce((s, p) => s + Number(p.saldo || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
                      <td colSpan={2} className="py-1.5 px-2 text-[10px]">
                        {coluna === 'nf-terceiro' && (
                          Math.abs(somaAlocada - CFG.valor) < 0.01
                            ? <span style={{ color: '#10B981' }}>✓ bate com a célula</span>
                            : <span style={{ color: '#F59E0B' }}>≠ célula ({formatCurrency(CFG.valor)})</span>
                        )}
                      </td>
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
