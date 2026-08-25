'use client'

/**
 * Editor de breakdown para o AJUSTE DO ADMIN numa medição pendente.
 *
 * Diferença essencial pra grade da tela de Nova Medição: lá o % de uma célula
 * só CRESCE (é um lançamento novo). Aqui o admin está CORRIGINDO o que já foi
 * lançado nesta medição, então precisa poder descer também — o caso do
 * usuário: item "16.1.11 INFRA SDAI - PAV TIPO ( 1° AO 36° PAV )" com um
 * pavimento medido a 90% que deveria estar a 50%.
 *
 * Qualquer inteiro de 0 a 100 vale em QUALQUER célula — vãos e parcelas
 * mensais inclusive, que no lançamento são binários (0/100). Correção de campo
 * não cabe numa escala de quartos: se o executado é 83%, o campo aceita 83%.
 * Os botões são só atalhos; o input logo abaixo aceita o resto.
 *
 * O único limite é o piso por célula: o pct acumulado não pode ficar abaixo
 * do que medições APROVADAS anteriores já registraram naquela mesma célula —
 * isso desmediria trabalho aprovado. As células no piso aparecem travadas com
 * o rótulo "aprovado".
 *
 * As regras de piso/escala vêm de `lib/medicao-breakdown`, as mesmas que a
 * rota PATCH aplica no servidor — a UI nunca é a autoridade, só o espelho.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import {
  clampPctCelula,
  lerPct,
  arredondarQtde,
  somarPavimentos,
  type BreakdownModo,
} from '@/lib/medicao-breakdown'

/** Resposta do GET .../detalhamentos/[detalhamentoId]/ajustar */
export interface BreakdownEstado {
  suporta_breakdown: boolean
  /** Mesmo shape de `BreakdownModo` (o servidor serializa em camelCase). */
  modo: BreakdownModo | null
  editavel: boolean
  medicao_status: string
  detalhamento: {
    id: string
    codigo: string
    descricao: string
    quantidade_contratada: number
    valor_unitario: number
  }
  medicao_item_id: string | null
  /** `quantidade_medida` desta medição (o delta do período). */
  quantidade_atual: number
  /** `pavimentos_pct` gravado nesta medição (acumulado ao fim dela). */
  pavimentos_pct: Record<string, number> | null
  /** MAX por célula entre as medições aprovadas anteriores — o piso. */
  pavimentos_pct_anterior: Record<string, number>
  /** Soma real de `quantidade_medida` das medições aprovadas anteriores. */
  qtd_anterior: number
  /** Histórico aprovado sem breakdown gravado — precisa de backfill antes. */
  historico_sem_breakdown: boolean
}

export interface BreakdownResumo {
  /** Mapa a enviar no PATCH (`pavimentos_pct`). */
  mapa: Record<string, number>
  /** Soma dos pcts / 100 = acumulado ao fim desta medição. */
  somaAcumulada: number
  /** `quantidade_medida` resultante (delta do período). */
  delta: number
  /** Quantas células mudaram em relação ao que está gravado. */
  totalAlteradas: number
}

// ───────────────────────────────────────────────────────────────────────────
// Hook: carrega o estado e mantém o mapa em edição
// ───────────────────────────────────────────────────────────────────────────

export function useBreakdownAjuste(
  contratoId: string,
  medicaoId: string,
  detalhamentoId: string | null,
) {
  const [estado, setEstado] = useState<BreakdownEstado | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erroCarga, setErroCarga] = useState('')
  const [mapa, setMapa] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!detalhamentoId) {
      setEstado(null)
      setMapa({})
      setErroCarga('')
      return
    }
    let cancelado = false
    setCarregando(true)
    setErroCarga('')
    fetch(`/api/contratos/${contratoId}/medicoes/${medicaoId}/detalhamentos/${detalhamentoId}/ajustar`)
      .then(async res => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error || `Falha ao carregar breakdown (HTTP ${res.status}).`)
        return body as BreakdownEstado
      })
      .then(data => {
        if (cancelado) return
        setEstado(data)
        setMapa(montarMapaInicial(data))
      })
      .catch(e => {
        if (cancelado) return
        setEstado(null)
        setErroCarga(e?.message || 'Erro de rede ao carregar o breakdown.')
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => { cancelado = true }
  }, [contratoId, medicaoId, detalhamentoId])

  const setCelula = useCallback((chave: string, pctRaw: number) => {
    if (!estado?.modo) return
    const piso = lerPct(estado.pavimentos_pct_anterior, chave)
    const pct = clampPctCelula(estado.modo, pctRaw, piso)
    setMapa(prev => ({ ...prev, [chave]: pct }))
  }, [estado])

  const resetar = useCallback(() => {
    if (estado) setMapa(montarMapaInicial(estado))
  }, [estado])

  const resumo = useMemo<BreakdownResumo>(() => {
    const limpo: Record<string, number> = {}
    for (const [k, v] of Object.entries(mapa)) if (v > 0) limpo[k] = v
    const somaAcumulada = arredondarQtde(somarPavimentos(limpo))
    const delta = arredondarQtde(somaAcumulada - (estado?.qtd_anterior ?? 0))
    let totalAlteradas = 0
    if (estado?.modo) {
      for (const c of estado.modo.celulas) {
        const piso = lerPct(estado.pavimentos_pct_anterior, c.chave)
        const gravado = Math.max(lerPct(estado.pavimentos_pct, c.chave), piso)
        if (lerPct(limpo, c.chave) !== gravado) totalAlteradas++
      }
    }
    return { mapa: limpo, somaAcumulada, delta, totalAlteradas }
  }, [mapa, estado])

  return { estado, carregando, erroCarga, mapa, setCelula, resetar, resumo }
}

/** Estado inicial da grade: max(gravado nesta medição, piso aprovado). */
function montarMapaInicial(estado: BreakdownEstado): Record<string, number> {
  const out: Record<string, number> = {}
  if (!estado.modo) return out
  for (const c of estado.modo.celulas) {
    const piso = lerPct(estado.pavimentos_pct_anterior, c.chave)
    const atual = lerPct(estado.pavimentos_pct, c.chave)
    const v = Math.max(piso, atual)
    if (v > 0) out[c.chave] = v
  }
  return out
}

// ───────────────────────────────────────────────────────────────────────────
// Grade
// ───────────────────────────────────────────────────────────────────────────

export function BreakdownAjusteGrid({
  estado,
  mapa,
  setCelula,
  resetar,
  resumo,
  unidade,
  desabilitado,
}: {
  estado: BreakdownEstado
  mapa: Record<string, number>
  setCelula: (chave: string, pct: number) => void
  resetar: () => void
  resumo: BreakdownResumo
  unidade?: string | null
  desabilitado?: boolean
}) {
  const modo = estado.modo
  if (!modo) return null

  const un = unidade || 'un'
  const contratada = estado.detalhamento.quantidade_contratada
  // Uma coluna só: toda célula agora tem os 5 atalhos + o input de % livre,
  // então a grade binária precisa da mesma largura do PAV TIPO.
  const gridCols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-3)' }}>
          % <strong>acumulado</strong> de cada {modo.termo} ao fim desta medição —
          os botões são atalhos, o campo abaixo aceita <strong>qualquer valor de 0 a 100</strong> (83, 91…).
          Células em <span className="text-emerald-400">verde</span> já vieram aprovadas de
          medições anteriores e não descem daí; o resto pode subir <em>ou descer</em>.
        </p>
        <button
          type="button"
          onClick={resetar}
          disabled={desabilitado || resumo.totalAlteradas === 0}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--surface-3)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <RotateCcw className="w-3 h-3" />
          Desfazer
        </button>
      </div>

      {estado.historico_sem_breakdown && (
        <div className="flex items-start gap-2 p-2 rounded-lg text-[10px] bg-amber-500/10 border border-amber-500/30 text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Medições aprovadas deste item ({estado.qtd_anterior.toLocaleString('pt-BR')} {un}) foram lançadas
            sem breakdown, então a grade não conhece o piso real por {modo.termo}. Ajuste com atenção —
            o salvamento é recusado se o total ficar abaixo do já aprovado.
          </span>
        </div>
      )}

      <div className={`grid ${gridCols} gap-1.5 max-h-[46vh] overflow-y-auto pr-1`}>
        {modo.celulas.map(celula => {
          const piso = lerPct(estado.pavimentos_pct_anterior, celula.chave)
          const gravado = Math.max(lerPct(estado.pavimentos_pct, celula.chave), piso)
          const atual = lerPct(mapa, celula.chave)
          const travada = piso >= 100
          const alterada = atual !== gravado
          const cor = travada
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : alterada
            ? 'border-blue-500/50 bg-blue-500/10'
            : atual > piso
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-[var(--border)] bg-[var(--surface-2)]'

          return (
            <div key={celula.chave} className={`p-1.5 rounded-md border ${cor}`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-3)' }}>
                  {celula.label}
                </span>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    travada ? 'text-emerald-300' : alterada ? 'text-blue-300' : atual > piso ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  {atual}%
                </span>
              </div>

              {(piso > 0 || alterada) && (
                <div className="flex items-center justify-between gap-1 mb-1 text-[9px]" style={{ color: 'var(--text-3)' }}>
                  {piso > 0
                    ? <span className="text-emerald-500/80">aprovado: {piso}%</span>
                    : <span />}
                  {alterada && <span className="text-blue-400">era {gravado}%</span>}
                </div>
              )}

              <div className="flex gap-0.5">
                {modo.pctsPermitidos.map(p => {
                  const abaixoDoPiso = p < piso
                  const selecionado = p === atual
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={desabilitado || abaixoDoPiso}
                      onClick={() => setCelula(celula.chave, p)}
                      title={abaixoDoPiso ? `Bloqueado: ${piso}% já aprovado em medição anterior` : `Definir ${p}%`}
                      className={`flex-1 py-1 rounded text-[9px] font-bold transition-all ${
                        abaixoDoPiso
                          ? 'opacity-20 cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-3)]'
                          : selecionado && p === piso && piso > 0
                          ? 'bg-emerald-600 text-white'
                          : selecionado
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/40'
                          : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155] hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>

              {/* % livre — a via principal pra valores fora dos atalhos (83, 91...).
                  `key` inclui o valor atual pra o campo re-sincronizar quando o
                  pct muda por um botão. */}
              <div className="mt-0.5 relative">
                <input
                  key={`pct-${celula.chave}-${atual}`}
                  type="number"
                  defaultValue={atual}
                  min={piso}
                  max={100}
                  step={1}
                  disabled={desabilitado || travada}
                  title={travada ? `${piso}% já aprovado — sem margem para editar` : 'Digite qualquer % de 0 a 100'}
                  onFocus={e => e.currentTarget.select()}
                  onBlur={e => {
                    const v = parseFloat(e.currentTarget.value)
                    setCelula(celula.chave, Number.isFinite(v) ? v : atual)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
                  className="w-full py-0.5 pl-1 pr-3.5 rounded text-[10px] font-bold text-center tabular-nums bg-[#1e293b] text-slate-100 border border-[#334155] focus:border-blue-400 focus:ring-1 focus:ring-blue-400/40 outline-none disabled:opacity-30"
                />
                <span
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] pointer-events-none"
                  style={{ color: 'var(--text-3)' }}
                >
                  %
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 p-2 rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
        <Metrica
          rotulo="Acum. anterior"
          valor={`${fmtQtd(estado.qtd_anterior)} ${un}`}
          cor="var(--text-3)"
        />
        <Metrica
          rotulo="Desta medição"
          valor={`${fmtQtd(resumo.delta)} ${un}`}
          cor={resumo.delta > 0 ? '#0F766E' : 'var(--text-3)'}
          nota={resumo.delta !== estado.quantidade_atual ? `era ${fmtQtd(estado.quantidade_atual)}` : undefined}
        />
        <Metrica
          rotulo="Total acumulado"
          valor={`${fmtQtd(resumo.somaAcumulada)} / ${fmtQtd(contratada)} ${un}`}
          cor="#10B981"
        />
      </div>
    </div>
  )
}

function Metrica({ rotulo, valor, cor, nota }: { rotulo: string; valor: string; cor: string; nota?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{rotulo}</p>
      <p className="text-xs font-bold tabular-nums" style={{ color: cor }}>{valor}</p>
      {nota && <p className="text-[9px] tabular-nums" style={{ color: 'var(--text-3)' }}>{nota}</p>}
    </div>
  )
}

/** Formata quantidade sem zeros à direita inúteis (0,25 / 12 / 12,75). */
export function fmtQtd(n: number): string {
  const v = arredondarQtde(n)
  return Number.isInteger(v)
    ? String(v)
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function BreakdownCarregando() {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-xs" style={{ color: 'var(--text-3)' }}>
      <Loader2 className="w-4 h-4 animate-spin" />
      Carregando breakdown do item...
    </div>
  )
}
