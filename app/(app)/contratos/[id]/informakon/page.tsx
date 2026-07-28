import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatDate, formatDatetime } from '@/lib/utils'
import { isSchemaMissingError } from '@/lib/db/resilient'
import {
  calcularConciliacaoPorGrupo,
  calcularNotasDivergentes,
  LIMIAR_DIVERGENCIA_GRUPO,
} from '@/lib/db/informakon-conciliacao'
import { UploadForm } from './upload-form'
import { ArrowLeft, FileSpreadsheet, User, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

const SITUACAO_NF_LABEL: Record<string, string> = {
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada',
  em_correcao: 'Em correção',
  cancelada: 'Cancelada',
  'não encontrada no FIP-WAVE': 'Não encontrada no FIP-WAVE',
}

function corSituacao(situacao: string): 'default' | 'outline' | 'success' | 'warning' | 'destructive' {
  if (situacao === 'aprovada') return 'success'
  if (situacao === 'aguardando_aprovacao' || situacao === 'em_correcao') return 'warning'
  if (situacao === 'cancelada') return 'outline'
  if (situacao === 'não encontrada no FIP-WAVE') return 'destructive'
  return 'default'
}

export default async function InformakonPage({ params }: Props) {
  const { id: contratoId } = await params
  const admin = createAdminClient()

  const { data: contrato } = await admin
    .from('contratos')
    .select('id, numero')
    .eq('id', contratoId)
    .single()

  let migrationPendente = false
  let importacao: any = null
  try {
    const { data, error } = await admin
      .from('informakon_importacoes')
      .select('id, arquivo_nome, referencia, importado_por_id, importado_em, qtd_linhas, total_nf, total_descontado, total_a_descontar')
      .eq('contrato_id', contratoId)
      .order('referencia', { ascending: false })
      .order('importado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    importacao = data
  } catch (e: any) {
    if (isSchemaMissingError(e, ['informakon_importacoes'])) {
      migrationPendente = true
    } else {
      throw e
    }
  }

  const voltar = (
    <Link href={`/contratos/${contratoId}`}>
      <button className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao contrato
      </button>
    </Link>
  )

  if (migrationPendente) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Conciliação Informakon" subtitle={contrato ? `Contrato ${(contrato as any).numero}` : ''} />
        <div className="p-4 sm:p-6 space-y-4">
          {voltar}
          <div className="rounded-lg p-4 text-sm" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.40)', color: '#F59E0B' }}>
            <strong>Migration 075 pendente.</strong> Aplique a migration <code className="font-mono">075_informakon_conciliacao.sql</code> no Supabase pra ativar esta tela.
          </div>
        </div>
      </div>
    )
  }

  if (!importacao) {
    return (
      <div className="flex-1" style={{ background: 'var(--background)' }}>
        <Topbar title="Conciliação Informakon" subtitle={contrato ? `Contrato ${(contrato as any).numero}` : ''} />
        <div className="p-4 sm:p-6 space-y-4">
          {voltar}
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--text-3)' }} />
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
              Nenhuma importação do Informakon ainda
            </h2>
            <p className="text-xs max-w-lg mx-auto mb-6" style={{ color: 'var(--text-3)' }}>
              Suba o relatório "Controle FIP INFORMAKON" (.xlsx) exportado do ERP da FIP pra comparar o desconto de
              material lançado lá contra o que o FIP-WAVE está registrando neste contrato.
            </p>
          </div>
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-1)' }}>Importar relatório</h3>
            <UploadForm contratoId={contratoId} />
          </div>
        </div>
      </div>
    )
  }

  // Nome de quem importou (query separada — mais simples que embutir o join
  // pelo FK e resiliente se importado_por_id vier nulo).
  let importadoPorNome: string | null = null
  if (importacao.importado_por_id) {
    const { data: perfil } = await admin
      .from('perfis')
      .select('nome')
      .eq('id', importacao.importado_por_id)
      .maybeSingle()
    importadoPorNome = (perfil as any)?.nome ?? null
  }

  const [conciliacao, notasDivergentes] = await Promise.all([
    calcularConciliacaoPorGrupo(admin, contratoId, importacao.id),
    calcularNotasDivergentes(admin, contratoId, importacao.id, 50),
  ])

  const { data: medicoesServicoInformakon } = await admin
    .from('informakon_medicoes_servico')
    .select('id, numero_informakon, rotulo, medicao_numero, data_medicao, valor_contratual, valor_material, valor_liquido, retencao, valor_a_pagar')
    .eq('importacao_id', importacao.id)
    .order('medicao_numero', { ascending: true })

  const { data: medicoesFipwave } = await admin
    .from('medicoes')
    .select('id, numero, status, valor_total, periodo_referencia')
    .eq('contrato_id', contratoId)

  const medicaoFipwavePorNumero = new Map(
    (medicoesFipwave || []).map((m: any) => [m.numero, m]),
  )

  const totalNf = Number(importacao.total_nf || 0)
  const totalDescontado = Number(importacao.total_descontado || 0)
  const totalADescontar = Number(importacao.total_a_descontar || 0)

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar title="Conciliação Informakon" subtitle={contrato ? `Contrato ${(contrato as any).numero}` : ''} />
      <div className="p-4 sm:p-6 space-y-4">
        {voltar}

        {/* A. Cabeçalho */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                Última importação
              </p>
              <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-1)' }}>
                <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                {importacao.arquivo_nome}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Referência: {formatDate(importacao.referencia)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Importado por: {importadoPorNome || '—'}
                </span>
                <span>em {formatDatetime(importacao.importado_em)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Total de NF lançada</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalNf)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Já descontado</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: '#10B981' }}>{formatCurrency(totalDescontado)}</p>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Saldo a descontar</p>
              <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: '#F59E0B' }}>{formatCurrency(totalADescontar)}</p>
            </div>
          </div>
        </div>

        {/* Reimportar */}
        <details className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <summary className="px-5 py-3 text-sm font-semibold cursor-pointer select-none" style={{ color: 'var(--text-1)' }}>
            Importar nova versão do relatório
          </summary>
          <div className="px-5 pb-5">
            <UploadForm contratoId={contratoId} />
          </div>
        </details>

        {/* B. Conciliação por grupo macro */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Conciliação por grupo macro
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              NF no Informakon (aba "faturamento direto global") vs. NF que o FIP-WAVE enxerga (solicitações de
              faturamento direto aprovadas, rateadas pelos itens). Diferença acima de {formatCurrency(LIMIAR_DIVERGENCIA_GRUPO)} em destaque.
            </p>
          </div>
          {conciliacao.linhas.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              Nenhuma linha de NF nesta importação.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Grupo</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>NF no Informakon</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>NF no FIP-WAVE</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliacao.linhas.map(l => (
                    <tr key={l.chave} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 10 }}>{l.nome}</td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                        {formatCurrency(l.informakon)}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                        {formatCurrency(l.fipwave)}
                      </td>
                      <td
                        style={{
                          padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                          color: l.divergente ? '#EF4444' : 'var(--text-2)',
                        }}
                      >
                        {formatCurrency(l.diferenca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 10, fontWeight: 700, color: 'var(--text-1)' }}>Total</td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                      {formatCurrency(conciliacao.totalInformakon)}
                    </td>
                    <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                      {formatCurrency(conciliacao.totalFipwave)}
                    </td>
                    <td
                      style={{
                        padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 800,
                        color: Math.abs(conciliacao.totalDiferenca) > LIMIAR_DIVERGENCIA_GRUPO ? '#EF4444' : 'var(--text-1)',
                      }}
                    >
                      {formatCurrency(conciliacao.totalDiferenca)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* C. Notas divergentes */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Notas divergentes ({notasDivergentes.totalDivergentes})
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Notas do Informakon que não aparecem no FIP-WAVE, ou aparecem com valor diferente. De-para pelos
              dígitos do número da NF.
            </p>
          </div>
          {notasDivergentes.linhas.length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              Nenhuma divergência encontrada — todas as notas do Informakon batem com o FIP-WAVE.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Nº NF</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Tipo</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Fornecedor</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Macro item</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor Informakon</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor sistema</th>
                    <th style={{ padding: 10, textAlign: 'left' }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {notasDivergentes.linhas.map(n => (
                    <tr key={n.numeroNf} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: 10, fontFamily: 'ui-monospace, monospace' }}>{n.numeroNf}</td>
                      <td style={{ padding: 10, color: 'var(--text-2)' }}>{n.tipo || '—'}</td>
                      <td style={{ padding: 10, color: 'var(--text-2)', maxWidth: 220 }}>{n.fornecedor || '—'}</td>
                      <td style={{ padding: 10, color: 'var(--text-2)', maxWidth: 260 }}>{n.macroItem || '—'}</td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                        {formatCurrency(n.valorInformakon)}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                        {formatCurrency(n.valorSistema)}
                      </td>
                      <td style={{ padding: 10 }}>
                        <Badge variant={corSituacao(n.situacao)}>{SITUACAO_NF_LABEL[n.situacao] || n.situacao}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {notasDivergentes.ocultas > 0 && (
            <div className="px-5 py-3 text-[11px]" style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
              Mostrando as 50 maiores diferenças — {notasDivergentes.ocultas} nota(s) divergente(s) a mais ficaram de fora.
            </div>
          )}
        </div>

        {/* D. Medições */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Medições de serviço
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
              Como o Informakon fechou cada medição vs. o valor da medição correspondente no FIP-WAVE.
            </p>
          </div>
          {(medicoesServicoInformakon || []).length === 0 ? (
            <div className="p-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
              Nenhuma medição de serviço nesta importação.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-1)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-3)', color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: 10, textAlign: 'left' }}>Medição</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor contratual</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Material descontado</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Retenção</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor a pagar (Informakon)</th>
                    <th style={{ padding: 10, textAlign: 'right' }}>Valor no FIP-WAVE</th>
                  </tr>
                </thead>
                <tbody>
                  {(medicoesServicoInformakon || []).map((m: any) => {
                    const fip = m.medicao_numero != null ? medicaoFipwavePorNumero.get(m.medicao_numero) : null
                    const valorFip = fip ? Number(fip.valor_total || 0) : null
                    const divergente = valorFip != null && Math.abs(valorFip - Number(m.valor_a_pagar || 0)) > 1
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: 10 }}>
                          {fip ? (
                            <Link href={`/contratos/${contratoId}/medicoes/${fip.id}`} className="font-semibold hover:underline" style={{ color: 'var(--text-1)' }}>
                              {m.rotulo || `MED ${m.medicao_numero}`}
                            </Link>
                          ) : (
                            <span className="font-semibold">{m.rotulo || `MED ${m.medicao_numero ?? '—'}`}</span>
                          )}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                          {formatCurrency(Number(m.valor_contratual || 0))}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                          {formatCurrency(Number(m.valor_material || 0))}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>
                          {formatCurrency(Number(m.retencao || 0))}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: 'var(--text-1)' }}>
                          {formatCurrency(Number(m.valor_a_pagar || 0))}
                        </td>
                        <td
                          style={{
                            padding: 10, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700,
                            color: divergente ? '#EF4444' : valorFip != null ? 'var(--text-1)' : 'var(--text-3)',
                          }}
                        >
                          {valorFip != null ? formatCurrency(valorFip) : 'Não encontrada'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
