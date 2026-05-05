import { Topbar } from '@/components/layout/topbar'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarMovimentosRetencao, getSaldoRetencao } from '@/lib/db/retencao'
import { formatCurrency, formatDatetime } from '@/lib/utils'
import { ArrowLeft, ArrowUp, ArrowDown, RotateCcw, Lock } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function RetencaoPage({ params }: Props) {
  const { id: contratoId } = await params
  const admin = createAdminClient()

  const { data: contrato } = await admin
    .from('contratos')
    .select('id, numero, valor_total, valor_servicos, valor_material_direto, percentual_retencao')
    .eq('id', contratoId)
    .single()

  // Pode falhar se a migration 062 ainda não rodou — UI fica resiliente
  let saldo = 0
  let movimentos: Awaited<ReturnType<typeof listarMovimentosRetencao>> = []
  let migrationPendente = false
  try {
    saldo = await getSaldoRetencao(admin, contratoId)
    movimentos = await listarMovimentosRetencao(admin, contratoId, 500)
  } catch (e: any) {
    if (e?.message?.includes('retencao_movimentos') && e?.message?.toLowerCase().includes('does not exist')) {
      migrationPendente = true
    } else {
      throw e
    }
  }

  const pctRetencao = Number((contrato as any)?.percentual_retencao ?? 5)
  const valorTotal = Number((contrato as any)?.valor_total ?? 0)
  const previsto = (valorTotal * pctRetencao) / 100

  const totais = movimentos.reduce(
    (acc, m) => {
      const v = Number(m.valor)
      if (m.tipo === 'credito' || m.tipo === 'reversao_debito') acc.creditos += v
      else if (m.tipo === 'debito' || m.tipo === 'reversao_credito') acc.debitos += v
      return acc
    },
    { creditos: 0, debitos: 0 },
  )

  // ── Tabela "Por medição" ──────────────────────────────────────────
  // Agrupa créditos do livro-razão por medicao_id (origem_tipo='medicao_aprovada')
  // e enriquece com numero/data/valor da própria medicao.
  type LinhaMedicao = {
    medicao_id: string
    numero: number
    data_aprovacao: string | null
    periodo: string | null
    valor_medido: number
    retencao: number
    pct: number
  }
  const linhasPorMedicao: LinhaMedicao[] = []
  const medicoesAprovadas = await admin
    .from('medicoes')
    .select('id, numero, periodo_referencia, valor_total, data_aprovacao, status')
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
    .order('numero', { ascending: false })
  for (const m of (medicoesAprovadas.data || []) as any[]) {
    // Soma créditos do livro-razão originados nesta medição
    const creditoLivroRazao = movimentos
      .filter(mv => mv.origem_tipo === 'medicao_aprovada' && mv.origem_id === m.id && mv.tipo === 'credito')
      .reduce((s, mv) => s + Number(mv.valor || 0), 0)
    // Fallback: se não há entrada no livro-razão (medições aprovadas antes da
    // 062), calcula 5% × valor_total da medição como estimativa informativa.
    const valorMedido = Number(m.valor_total || 0)
    const retencao = creditoLivroRazao > 0
      ? creditoLivroRazao
      : Math.round(valorMedido * (pctRetencao / 100) * 100) / 100
    linhasPorMedicao.push({
      medicao_id: m.id,
      numero: m.numero,
      data_aprovacao: m.data_aprovacao,
      periodo: m.periodo_referencia,
      valor_medido: valorMedido,
      retencao,
      pct: pctRetencao,
    })
  }

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar
        title="Retenção contratual"
        subtitle={contrato ? `Contrato ${(contrato as any).numero}` : ''}
      />
      <div className="p-4 sm:p-6 space-y-4">
        <Link href={`/contratos/${contratoId}`}>
          <button className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao contrato
          </button>
        </Link>

        {migrationPendente && (
          <div className="rounded-lg p-4 text-sm" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.40)', color: '#F59E0B' }}>
            <strong>Migration 062 pendente.</strong> Aplique a migration <code className="font-mono">062_retencao_movimentos.sql</code> no Supabase pra ativar o livro-razão.
          </div>
        )}

        {/* Card grande do saldo */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Saldo atual
              </p>
              <p className="text-4xl font-bold mt-1" style={{ color: '#F59E0B' }}>
                {formatCurrency(saldo)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                A ser pago via NF de retenção da Wave SPE no encerramento ou abatido em próximas medições
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                Previsto (5% × valor total contrato)
              </p>
              <p className="text-xl font-semibold tabular-nums" style={{ color: 'var(--text-2)' }}>
                {formatCurrency(previsto)}
              </p>
            </div>
          </div>

          {/* Barra de progresso (saldo / previsto) */}
          <div className="mt-4">
            <div className="h-2 rounded-full" style={{ background: 'var(--surface-3)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${previsto > 0 ? Math.min(100, (saldo / previsto) * 100) : 0}%`,
                  background: '#F59E0B',
                }}
              />
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
              {previsto > 0 ? ((saldo / previsto) * 100).toFixed(1) : '0,0'}% do total contratual
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>↑ Créditos acumulados</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: '#10B981' }}>
                {formatCurrency(totais.creditos)}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>↓ Débitos acumulados</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: '#EF4444' }}>
                {formatCurrency(totais.debitos)}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>= Saldo (cred − deb)</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: '#F59E0B' }}>
                {formatCurrency(saldo)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabela "Por Medição" — quanto cada medição reteu (5% × base) */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                Retenções por Medição ({linhasPorMedicao.length})
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                Cada medição aprovada gera retenção de {pctRetencao}% sobre a base medida (Wave + Material − Material Retido).
              </p>
            </div>
            <Link href="/documentos/retencoes" className="text-xs font-medium hover:underline" style={{ color: '#F59E0B' }}>
              Relatório completo →
            </Link>
          </div>
          {linhasPorMedicao.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              Nenhuma medição aprovada ainda neste contrato.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Medição</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Período</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Data aprovação</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor medido</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>% Ret.</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Retenção</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPorMedicao.map(l => (
                    <tr key={l.medicao_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 10 }}>
                        <Link href={`/contratos/${contratoId}/medicoes/${l.medicao_id}`} className="font-semibold hover:underline" style={{ color: 'var(--text-1)' }}>
                          MED-{String(l.numero).padStart(3, '0')}
                        </Link>
                      </td>
                      <td style={{ padding: 10, color: 'var(--text-2)' }}>{l.periodo || '—'}</td>
                      <td style={{ padding: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {l.data_aprovacao ? formatDatetime(l.data_aprovacao) : '—'}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                        {formatCurrency(l.valor_medido)}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-3)' }}>
                        {l.pct.toFixed(2).replace('.', ',')}%
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#F59E0B' }}>
                        {formatCurrency(l.retencao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                    <td colSpan={3} style={{ padding: 10, fontWeight: 700, color: 'var(--text-1)' }}>Total ({linhasPorMedicao.length} medições)</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                      {formatCurrency(linhasPorMedicao.reduce((s, l) => s + l.valor_medido, 0))}
                    </td>
                    <td />
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 800, color: '#F59E0B' }}>
                      {formatCurrency(linhasPorMedicao.reduce((s, l) => s + l.retencao, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Tabela de movimentos (livro-razão completo) */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Movimentações ({movimentos.length})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Cada linha é imutável. Saldo após = soma sinalizada até este movimento.
            </p>
          </div>
          {movimentos.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              <Lock className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Nenhuma movimentação. Aprove uma medição pra começar a acumular retenção.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Data</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Origem</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Descrição</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Saldo após</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map(m => {
                    const isCredito = m.tipo === 'credito' || m.tipo === 'reversao_debito'
                    const isReversao = m.tipo.startsWith('reversao_')
                    const Icon = isReversao ? RotateCcw : isCredito ? ArrowUp : ArrowDown
                    const color = isReversao ? '#A855F7' : isCredito ? '#10B981' : '#EF4444'
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {formatDatetime(m.created_at)}
                        </td>
                        <td style={{ padding: 10 }}>
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
                            <Icon className="w-3 h-3" />
                            {m.tipo}
                          </span>
                        </td>
                        <td style={{ padding: 10, color: 'var(--text-2)', fontSize: 11 }}>
                          {m.origem_tipo}
                        </td>
                        <td style={{ padding: 10, color: 'var(--text-2)', fontSize: 11, maxWidth: 380 }}>
                          {m.descricao || '—'}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 600, color }}>
                          {isCredito ? '+' : '−'} {formatCurrency(m.valor)}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                          {formatCurrency(m.saldo_apos)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          📒 Movimentações são geradas automaticamente: <strong>crédito</strong> a cada medição aprovada
          (5% × material+serviço medido), <strong>débito</strong> ao emitir a NF Wave (até zerar o saldo).
          O saldo residual é pago no encerramento via NF de retenção da Wave SPE.
        </p>
      </div>
    </div>
  )
}
