'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Filter, FilterX, Search, X } from 'lucide-react'
import {
  OPS_NUMERO, OPS_TEXTO, filtroAtivo, normalizarTexto,
  type CondicaoFiltro, type FiltroColuna, type TipoColunaFiltro,
} from '@/lib/filtro-excel'

/**
 * Filtro de coluna no estilo do AutoFiltro do Excel.
 *
 * Clicar no cabeçalho abre: condição ("é maior que", "contém", "está entre"…),
 * busca e a lista de valores da coluna com "(Selecionar tudo)". Nada muda na
 * tabela até o OK — como no Excel. Com busca ativa, o OK mantém só os
 * resultados marcados da busca.
 *
 * O painel vai num portal com posição fixa: dentro do cabeçalho ele seria
 * cortado pelo overflow da tabela.
 *
 * Lógica (sem React) em lib/filtro-excel.ts.
 */
export function FiltroExcel({
  label, tipo, valores, filtro, onAplicar, alinhar = 'left', children,
}: {
  label: string
  tipo: TipoColunaFiltro
  /** Textos exibidos distintos da coluna, já ordenados. */
  valores: string[]
  filtro: FiltroColuna | undefined
  onAplicar: (f: FiltroColuna | null) => void
  alinhar?: 'left' | 'right'
  /** Conteúdo do cabeçalho (o rótulo da coluna). Clicar nele abre o filtro. */
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ativo = filtroAtivo(filtro)
  const LARGURA = 300

  const posicionar = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const left = alinhar === 'right' ? r.right - LARGURA : r.left
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(left, window.innerWidth - LARGURA - 8)),
    })
  }

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const t = e.target as Node
      if (painelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!aberto) posicionar(); setAberto(a => !a) }}
        className={`inline-flex items-center gap-1 max-w-full uppercase hover:text-[var(--text-1)] ${alinhar === 'right' ? 'flex-row-reverse' : ''}`}
        style={ativo ? { color: 'var(--accent)', fontWeight: 700 } : undefined}
        title={`Filtrar ${label}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
      >
        <Filter className="w-3 h-3 shrink-0" strokeWidth={ativo ? 2.75 : 1.75} style={{ opacity: ativo ? 1 : 0.55 }} />
        <span className="truncate">{children}</span>
      </button>
      {aberto && pos && createPortal(
        <div
          ref={painelRef}
          role="dialog"
          aria-label={`Filtro de ${label}`}
          className="fixed z-[100] rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-1)] shadow-2xl normal-case text-xs"
          style={{ top: pos.top, left: pos.left, width: LARGURA }}
        >
          <PainelFiltro
            label={label}
            tipo={tipo}
            valores={valores}
            filtro={filtro}
            onCancelar={() => setAberto(false)}
            onAplicar={f => { onAplicar(f); setAberto(false) }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

const MAX_LISTA = 1500

function PainelFiltro({
  label, tipo, valores, filtro, onAplicar, onCancelar,
}: {
  label: string
  tipo: TipoColunaFiltro
  valores: string[]
  filtro: FiltroColuna | undefined
  onAplicar: (f: FiltroColuna | null) => void
  onCancelar: () => void
}) {
  const ops = tipo === 'numero' ? OPS_NUMERO : OPS_TEXTO
  const [cond, setCond] = useState<CondicaoFiltro>(
    filtro?.condicao ?? { op: tipo === 'numero' ? 'gt' : 'contains', valor: '' },
  )
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(filtro?.selecionados ?? valores),
  )
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => {
    const b = normalizarTexto(busca)
    return b ? valores.filter(v => normalizarTexto(v).includes(b)) : valores
  }, [valores, busca])

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every(v => marcados.has(v))
  const algumVisivelMarcado = visiveis.some(v => marcados.has(v))

  function alternarTodos() {
    const next = new Set(marcados)
    for (const v of visiveis) {
      if (todosVisiveisMarcados) next.delete(v)
      else next.add(v)
    }
    setMarcados(next)
  }

  function alternar(v: string) {
    const next = new Set(marcados)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setMarcados(next)
  }

  function ok() {
    // Com busca, o Excel mantém só os resultados marcados da busca.
    const escolhidos = busca.trim() ? visiveis.filter(v => marcados.has(v)) : valores.filter(v => marcados.has(v))
    const selecionados = !busca.trim() && escolhidos.length === valores.length ? null : escolhidos
    const condicao = cond.valor.trim() !== '' ? cond : null
    onAplicar(selecionados === null && condicao === null ? null : { selecionados, condicao })
  }

  const inputCls = 'w-full px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)] outline-none focus:border-[var(--accent)]'

  return (
    <div onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') ok() }}>
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">{label}</span>
        <button type="button" onClick={onCancelar} className="p-0.5 rounded hover:bg-[var(--surface-2)] text-[var(--text-3)]" aria-label="Fechar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        type="button"
        disabled={!filtroAtivo(filtro)}
        onClick={() => onAplicar(null)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <FilterX className="w-3.5 h-3.5 text-[var(--text-3)]" />
        Limpar filtro de “{label}”
      </button>

      <div className="px-3 py-2 border-y border-[var(--border)] space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide text-[var(--text-3)]">
          {tipo === 'numero' ? 'Filtros de número' : 'Filtros de texto'}
        </div>
        <select
          value={cond.op}
          onChange={e => setCond({ ...cond, op: e.target.value as CondicaoFiltro['op'] })}
          className={inputCls}
        >
          {ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            value={cond.valor}
            onChange={e => setCond({ ...cond, valor: e.target.value })}
            placeholder={tipo === 'numero' ? 'Ex.: 0 ou 1.234,56' : 'Texto'}
            inputMode={tipo === 'numero' ? 'decimal' : undefined}
            className={inputCls}
          />
          {cond.op === 'between' && (
            <>
              <span className="text-[var(--text-3)]">e</span>
              <input
                value={cond.valor2 ?? ''}
                onChange={e => setCond({ ...cond, valor2: e.target.value })}
                inputMode="decimal"
                className={inputCls}
              />
            </>
          )}
        </div>
      </div>

      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            autoFocus
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar"
            className={`${inputCls} pl-6`}
          />
        </div>
      </div>

      <div className="mx-3 my-2 max-h-56 overflow-y-auto rounded border border-[var(--border)] py-1">
        <label className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-[var(--surface-2)]">
          <input
            type="checkbox"
            checked={todosVisiveisMarcados}
            ref={el => { if (el) el.indeterminate = algumVisivelMarcado && !todosVisiveisMarcados }}
            onChange={alternarTodos}
          />
          <span className="font-medium">
            {busca.trim() ? '(Selecionar todos os resultados)' : '(Selecionar tudo)'}
          </span>
        </label>
        {visiveis.slice(0, MAX_LISTA).map(v => (
          <label key={v} className="flex items-center gap-2 px-2 py-0.5 cursor-pointer hover:bg-[var(--surface-2)]">
            <input type="checkbox" checked={marcados.has(v)} onChange={() => alternar(v)} />
            <span className={`truncate ${tipo === 'numero' ? 'tabular-nums' : ''}`} title={v}>{v}</span>
          </label>
        ))}
        {visiveis.length > MAX_LISTA && (
          <p className="px-2 py-1 text-[10px] text-[var(--text-3)]">
            Mostrando {MAX_LISTA} de {visiveis.length} — use a pesquisa.
          </p>
        )}
        {visiveis.length === 0 && <p className="px-2 py-2 text-center text-[var(--text-3)]">Nenhum valor</p>}
      </div>

      <div className="flex justify-end gap-2 px-3 pb-2.5">
        <button type="button" onClick={onCancelar} className="px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]">
          Cancelar
        </button>
        <button
          type="button"
          onClick={ok}
          className="px-4 py-1 rounded font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          OK
        </button>
      </div>
    </div>
  )
}
