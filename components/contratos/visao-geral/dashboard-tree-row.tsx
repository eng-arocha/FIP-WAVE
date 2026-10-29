// components/contratos/visao-geral/dashboard-tree-row.tsx
'use client'

import { ChevronDown, ChevronRight, Clock, Loader2 } from 'lucide-react'
import { memo } from 'react'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { valoresPorModo, percentuais, fmtPct, type Percentuais } from '@/lib/export/visao-geral'
import { NumeroClicavel } from './numero-clicavel'
import { colunasDoModo, COR_EM_APROVACAO, COR_FIP_ATRASADA, COR_SEM_LASTRO, COR_MAT_ADIANTADO, COR_ESTOURO } from './colunas'

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * "% Medido" do serviço. Quando parte do % vem de medição ainda em
 * aprovação, o número fica azul com relógio e o tooltip abre a conta.
 */
export function PctMedido({ p }: { p: Percentuais }) {
  if (p.servMedido === null) return <span className="text-[var(--text-3)]">—</span>
  const temPendente = p.servEmAprovacao > 0.0001
  if (!temPendente) return <span className="text-[var(--text-2)]">{fmtPct(p.servMedido)}</span>
  return (
    <span
      className="inline-flex items-center justify-end gap-1"
      style={{ color: COR_EM_APROVACAO }}
      title={`${fmtPct(p.servMedido - p.servEmAprovacao)} aprovado + ${fmtPct(p.servEmAprovacao)} de medição em aprovação`}
    >
      <Clock className="w-3 h-3" aria-hidden />
      {fmtPct(p.servMedido)}
    </span>
  )
}

/**
 * "(40,0%)" ao lado do realizado de material. Laranja quando o faturamento
 * de material está atrás do serviço medido — a FIP precisa faturar.
 */
export function PctRealizadoMaterial({ p }: { p: Percentuais }) {
  if (p.matRealizado === null) return null
  const [cor, dica] = p.matAcimaContrato
    ? [COR_ESTOURO, `NF de material (${fmtPct(p.matRealizado)}) acima do contratado do item — conferir o rateio da NF.`]
    : p.fipAtrasada
      ? [COR_FIP_ATRASADA, `Material faturado (${fmtPct(p.matRealizado)}) atrás do serviço medido (${fmtPct(p.servMedido)}). A FIP precisa faturar ~R$ ${fmt(p.aFaturar)}.`]
      : p.matAdiantado
        ? [COR_MAT_ADIANTADO, `Material faturado (${fmtPct(p.matRealizado)}) à frente do serviço medido (${fmtPct(p.servMedido)}). Se o físico já andou, há serviço a medir.`]
        : [null, undefined]
  return (
    <span
      className="ml-1 text-[11px]"
      style={cor ? { color: cor, fontWeight: 600 } : { color: 'var(--text-3)' }}
      title={dica}
    >
      ({fmtPct(p.matRealizado)})
    </span>
  )
}

/**
 * "% Mat. desc." — material já descontado da Wave. Roxo quando parte do
 * material medido ainda não foi descontado (falta lastro no ERP); o
 * desconto entra sozinho na medição em que a nota for lançada.
 */
export function PctDescontado({ p }: { p: Percentuais }) {
  if (p.matDescontado === null) return <span className="text-[var(--text-3)]">—</span>
  if (!(p.pendenteSemLastro > 0.005)) return <span className="text-[var(--text-2)]">{fmtPct(p.matDescontado)}</span>
  return (
    <span
      style={{ color: COR_SEM_LASTRO, fontWeight: 600 }}
      title={`R$ ${fmt(p.pendenteSemLastro)} de material medido ainda não descontado da Wave — falta lastro (nota no ERP). Desconta sozinho na medição em que a nota entrar.`}
    >
      {fmtPct(p.matDescontado)}
    </span>
  )
}

type Props = {
  item: DashboardItem
  level: number
  expanded: boolean
  loading: boolean
  modo: DashboardModo
  /** Template do grid, vindo do useTableLayout. String pra preservar o memo. */
  gridTemplateColumns: string
  onToggle: () => void
  onZoom?: () => void
  onClickRealizado?: () => void
  /** Clique na coluna "s/ NF" (só Material/Serviço) → origem dos pendentes. */
  onClickPendente?: () => void
}

export const DashboardTreeRow = memo(function DashboardTreeRow({
  item, level, expanded, loading, modo, gridTemplateColumns,
  onToggle, onZoom, onClickRealizado, onClickPendente,
}: Props) {
  const v = valoresPorModo(item, modo)
  const p = percentuais(item)
  const podeExpandir = item.tem_filhos
  const indent = level * 16

  return (
    <div
      role="treeitem"
      aria-level={level + 1}
      aria-expanded={podeExpandir ? expanded : undefined}
      className="grid items-center gap-2 px-2 py-1.5 hover:bg-[var(--surface-2)] border-b border-[var(--border)]"
      style={{ gridTemplateColumns, minWidth: 'max-content' }}
    >
      {/* Coluna 1: chevron + código + nome.
          O recuo hierárquico vai DENTRO da célula — quando ficava como
          paddingLeft do container do grid, cada nível estreitava e deslocava
          a linha inteira, e as colunas numéricas paravam de bater com o
          cabeçalho. */}
      {/* 1x click = expand/collapse, 2x click = zoom */}
      <div
        className={`flex items-center gap-1.5 min-w-0 ${podeExpandir || onZoom ? 'cursor-pointer' : ''}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => { if (podeExpandir) onToggle() }}
        onDoubleClick={() => { if (onZoom) onZoom() }}
        title={podeExpandir ? '1× clique = expandir · 2× clique = zoom' : ''}
      >
        {podeExpandir ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
            className="p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : expanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-[11px] text-[var(--text-3)] tabular-nums">{item.codigo}</span>
        <span className="truncate text-sm text-[var(--text-1)]">{item.nome}</span>
      </div>
      {colunasDoModo(modo).slice(1).map(col => {
        switch (col.key) {
          case 'contratado':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm text-[var(--text-2)]">
                {fmt(v.contratado)}
              </div>
            )
          case 'realizado':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm text-[var(--text-1)] whitespace-nowrap">
                <span style={modo === 'material' && p.fipAtrasada ? { color: COR_FIP_ATRASADA } : undefined}>
                  <NumeroClicavel
                    value={v.realizado}
                    onClick={onClickRealizado}
                    ariaLabel={`Ver notas que compoem realizado de ${item.nome}`}
                  />
                </span>
                {modo === 'material' && <PctRealizadoMaterial p={p} />}
              </div>
            )
          case 'pctMedido':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm">
                <PctMedido p={p} />
              </div>
            )
          case 'pctDescontado':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm">
                <PctDescontado p={p} />
              </div>
            )
          case 'saldo':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm">
                {/* Saldo = Contratado − Realizado. Negativo = item estourado: vermelho, nunca escondido. */}
                <span
                  style={v.saldo < 0 ? { color: '#EF4444', fontWeight: 600 } : undefined}
                  className={v.saldo < 0 ? '' : 'text-[var(--text-1)]'}
                  title={v.saldo < 0 ? 'Realizado maior que o contratado' : undefined}
                >
                  {fmt(v.saldo)}
                </span>
              </div>
            )
          case 'pendente':
            return (
              <div key={col.key} className="text-right tabular-nums text-sm text-[var(--text-2)]">
                <NumeroClicavel
                  value={v.pendenteNf ?? 0}
                  onClick={onClickPendente}
                  ariaLabel={modo === 'servico' ? `Ver medições sem NF de ${item.nome}` : `Ver pedidos sem NF de ${item.nome}`}
                />
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
})
