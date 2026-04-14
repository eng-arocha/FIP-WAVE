'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { AlertTriangle, CheckCircle2, Database, Loader2, Play } from 'lucide-react'

interface Contrato { id: string; numero: string; descricao: string }
interface Report {
  dry_run: boolean
  grupos: { inseridos: number; atualizados: number; inalterados: number }
  tarefas: { inseridos: number; atualizados: number; inalterados: number }
  detalhamentos: { inseridos: number; atualizados: number; inalterados: number }
  divergencias_antes: Array<{ codigo: string; antes: number; depois: number }>
  total_material: number
  total_mo: number
}

/**
 * Página admin pra re-seedar orçamento a partir da planilha oficial.
 * Fluxo: Simular → conferir → Aplicar.
 */
export default function ReseedOrcamentoPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratoId, setContratoId] = useState('')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [erro, setErro] = useState('')
  const [ultimaAcao, setUltimaAcao] = useState<'dry' | 'apply' | null>(null)

  useEffect(() => {
    fetch('/api/contratos').then(r => r.json()).then(data => {
      const arr = Array.isArray(data) ? data : (data.rows || [])
      setContratos(arr.map((c: any) => ({ id: c.id, numero: c.numero, descricao: c.descricao })))
      if (arr.length === 1) setContratoId(arr[0].id)
    }).catch(() => setContratos([]))
  }, [])

  async function executar(dryRun: boolean) {
    if (!contratoId) { setErro('Selecione um contrato.'); return }
    setLoading(true); setErro(''); setReport(null)
    setUltimaAcao(dryRun ? 'dry' : 'apply')
    try {
      const res = await fetch('/api/admin/reseed-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contrato_id: contratoId, dry_run: dryRun }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro no reseed'); return }
      setReport(data)
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
      <Topbar title="Re-seed do Orçamento" subtitle="Sincroniza estrutura do contrato com a planilha oficial FIP-WAVE rev 07" />

      <div className="p-6 max-w-4xl mx-auto space-y-5">

        {/* Aviso */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)' }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#F59E0B' }} />
          <div className="text-sm" style={{ color: 'var(--text-2)' }}>
            <p className="font-semibold mb-1" style={{ color: '#F59E0B' }}>Como usar</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Selecione o contrato</li>
              <li>Clique em <strong>Simular</strong> — mostra o que vai mudar sem gravar</li>
              <li>Confira o relatório (quantos itens serão alterados, divergências detectadas)</li>
              <li>Clique em <strong>Aplicar</strong> — executa as mudanças de fato. Preserva IDs existentes, só corrige valores.</li>
            </ol>
          </div>
        </div>

        {/* Seleção de contrato */}
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
            Contrato
          </label>
          <select
            value={contratoId}
            onChange={e => { setContratoId(e.target.value); setReport(null); setErro('') }}
            className="w-full text-sm px-3 py-2.5 rounded-lg"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            <option value="">Selecione...</option>
            {contratos.map(c => (
              <option key={c.id} value={c.id}>
                {c.numero}{c.descricao ? ` — ${c.descricao}` : ''}
              </option>
            ))}
          </select>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => executar(true)}
              disabled={!contratoId || loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              {loading && ultimaAcao === 'dry' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Simular (dry-run)
            </button>
            <button
              onClick={() => {
                if (!confirm('Aplicar mudanças no banco? Isso vai alterar valores de grupos, tarefas e detalhamentos pra bater com a planilha oficial. IDs existentes são preservados (solicitações e medições continuam válidas).')) return
                executar(false)
              }}
              disabled={!contratoId || loading || !report || report.dry_run === false}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
              style={{ background: '#3B82F6', color: 'white' }}
            >
              {loading && ultimaAcao === 'apply' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Aplicar no banco
            </button>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}>
            {erro}
          </div>
        )}

        {/* Relatório */}
        {report && (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: report.dry_run ? '#F59E0B' : '#10B981' }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                {report.dry_run ? 'Simulação (nada foi gravado)' : 'Aplicado com sucesso'}
              </h3>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {(['grupos', 'tarefas', 'detalhamentos'] as const).map(tipo => {
                  const r = report[tipo]
                  return (
                    <div key={tipo} className="rounded-lg p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-3)' }}>{tipo}</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Inseridos</span><span className="font-semibold tabular-nums" style={{ color: '#10B981' }}>{r.inseridos}</span></div>
                        <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Atualizados</span><span className="font-semibold tabular-nums" style={{ color: '#F59E0B' }}>{r.atualizados}</span></div>
                        <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Inalterados</span><span className="font-semibold tabular-nums" style={{ color: 'var(--text-2)' }}>{r.inalterados}</span></div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Total material</p>
                  <p className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{fmt(report.total_material)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Total M.O.</p>
                  <p className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{fmt(report.total_mo)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Total contrato</p>
                  <p className="text-base font-bold" style={{ color: '#3B82F6' }}>{fmt(report.total_material + report.total_mo)}</p>
                </div>
              </div>

              {report.divergencias_antes.length > 0 && (
                <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                    Divergências detectadas nos grupos ({report.divergencias_antes.length}):
                  </p>
                  <div className="max-h-48 overflow-auto rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                    {report.divergencias_antes.map(d => (
                      <div key={d.codigo} className="px-3 py-2 border-b last:border-b-0 grid grid-cols-[50px_1fr_1fr_1fr] gap-2 text-xs" style={{ borderColor: 'var(--border)' }}>
                        <span className="font-mono font-semibold" style={{ color: 'var(--text-1)' }}>{d.codigo}</span>
                        <span className="tabular-nums text-right" style={{ color: '#EF4444' }}>Antes: {fmt(d.antes)}</span>
                        <span className="tabular-nums text-right" style={{ color: '#10B981' }}>Depois: {fmt(d.depois)}</span>
                        <span className="tabular-nums text-right font-semibold" style={{ color: d.depois > d.antes ? '#10B981' : '#EF4444' }}>
                          Δ {fmt(d.depois - d.antes)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.dry_run && (
                <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.30)', color: 'var(--text-2)' }}>
                  Simulação concluída. Se o resultado faz sentido, clique em <strong>Aplicar no banco</strong> pra executar de verdade.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
