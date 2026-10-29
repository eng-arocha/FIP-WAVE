// app/(app)/contratos/[id]/material-sem-nf/page.tsx
// Relatório: material medido sem NF nem pedido — candidato a NF da FIP.
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getRelatorioMaterialSemNf } from '@/lib/db/material-sem-nf'
import type { RelatorioMaterialSemNf } from '@/lib/relatorios/material-sem-nf'
import { ExcelMaterialSemNf } from './excel-button'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—'

const COR_SEM_NF = '#F59E0B'
const COR_SOBRA = '#0D9488'

export default async function MaterialSemNfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const voltar = `/contratos/${id}?modo=material`

  let data: RelatorioMaterialSemNf | null = null
  let erro: string | null = null
  try {
    data = await getRelatorioMaterialSemNf(id)
  } catch (e) {
    erro = String((e as { message?: string })?.message ?? 'erro desconhecido')
    console.error('[material-sem-nf/page]', e)
  }

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-4 text-sm">
        <Link href={voltar} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
          <ChevronLeft className="w-4 h-4" /> Voltar à Visão Geral
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-1)]">Material medido sem NF</h1>
          <p className="text-xs text-[var(--text-3)] mt-1 max-w-3xl">
            Material instalado (medições aprovadas) sem NF lançada nem pedido aprovado no próprio item —
            candidato a NF de material da FIP. O boletim não pega esses casos: ele só pergunta pela FIP sobre
            material ainda não descontado da Wave.
          </p>
        </div>
        {data && data.grupos.length > 0 && <ExcelMaterialSemNf data={data} />}
      </div>

      {erro && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-6 text-sm text-[var(--text-2)]">
          Não foi possível carregar o relatório. <span className="text-xs text-[var(--text-3)]">({erro})</span>
        </div>
      )}

      {data && data.grupos.length === 0 && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-6 text-sm text-[var(--text-2)]">
          Todo o material medido tem NF ou pedido aprovado no próprio item.
        </div>
      )}

      {data && data.grupos.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card titulo="Medido sem NF nem pedido" valor={`R$ ${fmt(data.totalSemNf)}`} cor={COR_SEM_NF}
              nota={`${data.qtdItens} item(ns) em ${data.grupos.length} macro item(ns)`} />
            <Card titulo="Sem sobra de NF no macro item" valor={`R$ ${fmt(data.totalDescoberto)}`} cor={COR_SEM_NF}
              nota="Nenhum vizinho tem NF além do medido — candidato mais forte a NF da FIP" />
            <Card titulo="Coberto por sobra de vizinho" valor={`R$ ${fmt(data.totalSemNf - data.totalDescoberto)}`} cor={COR_SOBRA}
              nota="Só é do vizinho se o material faturado lá foi instalado aqui (rateio) — conferir na obra" />
          </div>

          <div className="flex flex-col gap-3">
            {data.grupos.map(g => (
              <div key={g.balde} className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface-1)]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)]">
                  <div className="text-sm font-semibold text-[var(--text-1)]">
                    <span className="font-mono text-[var(--text-3)] mr-2">{g.balde}</span>{g.nome}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs tabular-nums">
                    <span>Sem NF: <b style={{ color: COR_SEM_NF }}>R$ {fmt(g.semNf)}</b></span>
                    <span>Sobra de NF no macro item: <b style={{ color: COR_SOBRA }}>R$ {fmt(g.sobra)}</b></span>
                    <span>Descoberto: <b className="text-[var(--text-1)]">R$ {fmt(g.descoberto)}</b></span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase text-[var(--text-3)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left py-1.5 px-2">Item</th>
                        <th className="text-right py-1.5 px-2">Mat. contratado</th>
                        <th className="text-right py-1.5 px-2">Mat. medido</th>
                        <th className="text-right py-1.5 px-2">Descontado Wave</th>
                        <th className="text-right py-1.5 px-2">NF lançada</th>
                        <th className="text-right py-1.5 px-2">Pedido aprovado</th>
                        <th className="text-left py-1.5 px-2">Fornecedores (pedido / NF)</th>
                        <th className="text-right py-1.5 px-2">Sem NF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.itens.map(l => (
                        <tr key={l.id} className="border-b border-[var(--border)]/40 align-top">
                          <td className="py-1.5 px-2">
                            <span className="font-mono text-[var(--text-3)] mr-1.5">{l.codigo}</span>
                            <span className="text-[var(--text-2)]">{l.nome}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(l.materialContratado)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-1)] whitespace-nowrap">
                            {fmt(l.materialMedido)} <span className="text-[var(--text-3)]">({pct(l.materialMedido, l.materialContratado)})</span>
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(l.materialDescontado)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(l.nf)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-2)]">{fmt(l.pedido)}</td>
                          <td className="py-1.5 px-2 text-[var(--text-2)]">
                            {l.fornecedores.length === 0
                              ? <span className="text-[var(--text-3)]">nenhum pedido</span>
                              : l.fornecedores.map(f => (
                                  <div key={f.fornecedor} className="whitespace-nowrap">
                                    {f.fornecedor}: <span className="tabular-nums">{fmt(f.pedido)} / {fmt(f.nf)}</span>
                                  </div>
                                ))}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: COR_SEM_NF }}>{fmt(l.semNf)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.itensComSobra.length > 0 && (
                  <div className="px-3 py-2 text-[11px] text-[var(--text-3)] border-t border-[var(--border)]">
                    <span style={{ color: COR_SOBRA, fontWeight: 600 }}>NF além do medido no macro item: </span>
                    {g.itensComSobra.map((l, i) => (
                      <span key={l.id}>
                        {i > 0 && ' · '}
                        <span className="font-mono">{l.codigo}</span> R$ {fmt(l.sobra)}
                      </span>
                    ))}
                    . É material entregue e não instalado, ou NF rateada no item errado — se for rateio, corrigir o
                    pedido em vez de pedir NF à FIP.
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Card({ titulo, valor, nota, cor }: { titulo: string; valor: string; nota: string; cor: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div className="text-[10px] uppercase text-[var(--text-3)]">{titulo}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: cor }}>{valor}</div>
      <div className="text-[11px] text-[var(--text-3)] mt-0.5">{nota}</div>
    </div>
  )
}
