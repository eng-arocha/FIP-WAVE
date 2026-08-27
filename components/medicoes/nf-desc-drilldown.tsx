'use client'

/**
 * Drill-down da coluna "NF Desc." do boletim Informakon.
 *
 * POR QUE ISTO NÃO É "a lista de notas que somam R$ X":
 *
 * O desconto não sai mais da soma das notas que temos cadastradas. Ele é
 * `p × M` — o material medido no período (camada ①) — cortado pelo que o
 * Informakon tem lançado no macro grupo (camada ②, lib/informakon/
 * aplicar-retrato.ts). Quem manda no abatimento é o ERP, porque é ele que o
 * executa; nota nossa que ainda não chegou lá não desconta nada.
 *
 * As notas listadas abaixo são, então, CONTEXTO e não a origem do número:
 * mostram o que o fornecedor já faturou neste item — a mesma cobertura que a
 * camada ③ usa para decidir se a FIP precisa emitir. A conta da célula, essa,
 * vem inteira do painel "A conta desta linha".
 *
 * As notas seguem ligadas ao PEDIDO, não ao item (`notas_fiscais_fat_direto`
 * não tem `detalhamento_id`): o valor de cada uma é rateado pro-rata entre os
 * itens do pedido, e a coluna "Alocado aqui" é a parcela deste detalhamento.
 */

import { useEffect, useState } from 'react'
import { Loader2, FileText, ExternalLink } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

/**
 * Qual célula foi clicada. Todas olham o mesmo escopo — o DETALHAMENTO —,
 * porque nenhuma parcela da regra nova compensa entre itens: o desconto é
 * `p × M` do próprio item e a cobertura da camada ③ é apurada item a item.
 *
 *  - `nf-desc`      "de onde vem este desconto?" → a conta da linha, mais as
 *                   notas do item como contexto. A soma das notas NÃO bate com
 *                   a célula, e não deve: o desconto é o material medido
 *                   cortado pelo lastro do ERP, não a soma das nossas notas.
 *  - `nf-terceiro`  "quais notas estão alocadas a este item?" Aqui a soma BATE
 *                   com a célula: os dois lados usam o mesmo rateio pro-rata
 *                   (allocateNfToScope em lib/db/origem.ts e nfAlocadaPorDet
 *                   em informacon-data.ts).
 *  - `saldo-aprov`  "que pedidos aprovados ainda não viraram nota?" Modo saldo.
 *                   A soma bate com a célula quando ela é > 0 (a célula é
 *                   max(0, aprovado − nf alocada)).
 *  - `nota-a-caminho` "o que ainda está por vir do fornecedor?" Modo saldo,
 *                   mesmos pedidos do item — a coluna é informação, não retém
 *                   mais nada do percentual.
 */
export type ColunaDrilldown = 'nf-desc' | 'nf-terceiro' | 'saldo-aprov' | 'nota-a-caminho'

export interface NfDescLinha {
  codigo: string
  descricao: string
  detalhamento_id: string
  material_medido: number
  nf_terceiro: number
  nf_descontavel: number
  /** Material medido que ficou sem desconto por falta de lastro no ERP. */
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

  const scope = linha?.detalhamento_id || null
  const modoOrigem = (coluna === 'saldo-aprov' || coluna === 'nota-a-caminho') ? 'saldo' : 'realizado'

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
    'nota-a-caminho': { titulo: 'O que segura este valor',     valor: linha.faturamento_direto_em_aberto },
  }[coluna]

  // `gap_material` é, por construção, o desconto ideal que sobrou sem lastro:
  // o servidor grava material medido − desconto aplicado.
  const semLastro = Number(linha.gap_material || 0)
  // A linha guarda o saldo JÁ líquido da nota (max(0, aprovado − nf)), então a
  // cobertura da camada ③ — max(NF, aprovado) — é a soma das duas colunas.
  const cobertura = Number(linha.nf_terceiro || 0) + Number(linha.saldo_aprovado || 0)
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
              <Passo rotulo="Material medido no período (p × M) — o desconto ideal" valor={linha.material_medido} tom="neutro" />
              {semLastro > 0.005 && (
                <Passo
                  rotulo="− sem lastro no Informakon (o ERP não tem esse valor lançado)"
                  valor={-semLastro}
                  tom="ambar"
                />
              )}
              <Passo rotulo="= NF Desc. — o desconto que entra no % a lançar" valor={linha.nf_descontavel} tom="verde" destaque />
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>
              O desconto ideal é o material medido no período, e nada mais. Quem o limita é o
              <strong> lastro do Informakon</strong>, apurado por macro grupo: o ERP só abate nota que
              está lançada lá, então liberar percentual acima disso entregaria material à Wave sem
              contrapartida. Lance a nota no Informakon e o corte desaparece na medição seguinte.
            </p>

            <h4 className="text-[11px] font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--text-3)' }}>
              Quem compra este material
            </h4>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <Passo rotulo="Cobertura no site — NF de terceiro ou pedido aprovado" valor={cobertura} tom="neutro" />
              <Passo rotulo="↳ Nota a caminho — pedido aprovado, nota do fornecedor ainda não chegou" valor={linha.faturamento_direto_em_aberto} tom="sub" />
              <Passo rotulo="= FIP precisa emitir — material medido além da cobertura" valor={linha.fip_faturar} tom="ambar" destaque />
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>
              Esta conta é independente da de cima e <strong>não entra no % a lançar</strong>. Ela responde
              outra pergunta: alguém precisa emitir nota, ou é só atraso de lançamento? &quot;FIP precisa
              emitir&quot; é <strong>tarefa</strong>, não receita; &quot;Nota a caminho&quot; é
              <strong> informação</strong> — não retém mais nada do percentual. A nota que a FIP emitir
              vira lastro quando for lançada no ERP, e aí sobe o percentual da medição seguinte.
            </p>
          </section>
          )}

          {/* ── Notas / pedidos do escopo ────────────────────────────── */}
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
              {coluna === 'nota-a-caminho' || coluna === 'saldo-aprov'
                ? 'Pedidos aprovados com saldo neste item'
                : 'Notas de terceiro alocadas a este item'}
            </h4>
            {coluna === 'nf-desc' ? (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Estas notas <strong>não somam</strong> o NF Desc. acima, e não deveriam: o desconto é o
                material medido no período cortado pelo lastro do ERP, não a soma do que temos
                cadastrado aqui. Elas servem à outra conta — mostram quanto deste material o
                fornecedor já faturou, que é o que decide se a FIP precisa emitir nota.
              </p>
            ) : coluna === 'nf-terceiro' ? (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Aqui o total <strong>bate</strong> com a célula ({formatCurrency(CFG.valor)}): é a
                mesma conta dos dois lados. A nota se liga ao <em>pedido</em>, não ao item — o valor
                dela é rateado entre os itens do pedido na proporção do valor de cada um, e a coluna
                &quot;Alocado aqui&quot; é a parcela que coube a este detalhamento.
              </p>
            ) : coluna === 'nota-a-caminho' ? (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Pedidos aprovados deste item cuja nota do fornecedor ainda não chegou — é o que
                sustenta os <strong>{formatCurrency(CFG.valor)}</strong> da coluna. Vale como
                informação: enquanto houver saldo aqui, o sistema não pede nota nova à FIP pelo
                mesmo material, mas o percentual a lançar não muda por causa disso.
              </p>
            ) : (
              <p className="text-[10px] mb-2" style={{ color: 'var(--text-3)' }}>
                Material já <strong>aprovado</strong> em pedido de faturamento direto cuja nota do
                fornecedor ainda não chegou — total {formatCurrency(CFG.valor)}. É o que sustenta a
                coluna &quot;Nota a caminho&quot;: enquanto houver saldo aqui, o sistema não pede nota nova
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
                Nenhuma nota de terceiro lançada neste item. Sem cobertura, o material medido
                inteiro vira tarefa de nota nova em nome da FIP.
              </div>
            )}

            {pedidos && pedidos.length === 0 && !carregando && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                Nenhum pedido de faturamento direto aprovado com saldo neste item. Por isso a
                coluna Saldo Aprov. está zerada — o material sem nota vai inteiro para
                &quot;FIP precisa emitir&quot;.
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
