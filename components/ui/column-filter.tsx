'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Filter, Check, X, Search } from 'lucide-react'

/**
 * Filtro suspenso estilo Excel para colunas de tabela.
 *
 * Uso:
 *   <ColumnFilter
 *     label="Fornecedor"
 *     values={['Fornecedor A', 'Fornecedor B', 'Fornecedor C']}
 *     selected={filtroFornecedor}
 *     onChange={setFiltroFornecedor}
 *   />
 *
 * - Multi-select com busca
 * - Selecionar tudo / Limpar
 * - Ícone no cabeçalho fica azul quando há filtro ativo
 * - Fecha ao clicar fora ou ESC
 */
export function ColumnFilter({
  label,
  values,
  selected,
  onChange,
}: {
  label: string
  values: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Fecha ao clicar fora ou ESC
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const valoresOrdenados = useMemo(
    () => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [values]
  )

  const filtrados = useMemo(() => {
    if (!busca.trim()) return valoresOrdenados
    const b = busca.toLowerCase()
    return valoresOrdenados.filter(v => v.toLowerCase().includes(b))
  }, [valoresOrdenados, busca])

  const temFiltroAtivo = selected.size > 0 && selected.size < valoresOrdenados.length
  const todosMarcados = selected.size === 0 || selected.size === valoresOrdenados.length

  function toggleValor(v: string) {
    // Se o estado "selected" está vazio significa "tudo selecionado" (padrão).
    // Na primeira desmarcação, populamos com todos e removemos o valor.
    const base = selected.size === 0 ? new Set(valoresOrdenados) : new Set(selected)
    if (base.has(v)) base.delete(v)
    else base.add(v)
    onChange(base)
  }

  function selecionarTudo() {
    onChange(new Set()) // vazio = tudo selecionado (padrão)
  }

  function limparTudo() {
    onChange(new Set(['__NENHUM__'])) // placeholder para "nenhum selecionado"
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center w-5 h-5 rounded transition-colors"
        title={`Filtrar ${label}`}
        style={{
          color: temFiltroAtivo ? '#0071E3' : '#86868B',
          background: temFiltroAtivo ? 'rgba(0,113,227,0.12)' : 'transparent',
        }}
      >
        <Filter className="w-3 h-3" strokeWidth={temFiltroAtivo ? 2.5 : 2} />
      </button>

      {open && (
        <div
          className="absolute left-0 mt-1 z-50 rounded-xl overflow-hidden"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E5EA',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            minWidth: 240,
            maxWidth: 320,
          }}
        >
          {/* Header com busca */}
          <div className="p-2.5 border-b" style={{ borderColor: '#E5E5EA' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#86868B' }}>
                {label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#F5F5F7]"
                style={{ color: '#86868B' }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: '#86868B' }} />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                className="w-full pl-7 pr-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: '#F5F5F7', border: '1px solid #E5E5EA', color: '#1D1D1F' }}
              />
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b" style={{ borderColor: '#E5E5EA' }}>
            <button
              type="button"
              onClick={selecionarTudo}
              className="text-[11px] font-medium px-2 py-0.5 rounded hover:bg-[#F5F5F7]"
              style={{ color: '#0071E3' }}
            >
              Selecionar tudo
            </button>
            <span style={{ color: '#C7C7CC' }}>·</span>
            <button
              type="button"
              onClick={limparTudo}
              className="text-[11px] font-medium px-2 py-0.5 rounded hover:bg-[#F5F5F7]"
              style={{ color: '#86868B' }}
            >
              Limpar
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtrados.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-center" style={{ color: '#86868B' }}>
                Nenhum valor encontrado
              </div>
            ) : (
              filtrados.map(v => {
                // Estado "vazio" = tudo selecionado (padrão)
                const marcado = selected.size === 0
                  ? true
                  : (selected.has('__NENHUM__') ? false : selected.has(v))
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleValor(v)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#F5F5F7] transition-colors"
                    style={{ color: '#1D1D1F' }}
                  >
                    <span
                      className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: marcado ? '#0071E3' : '#FFFFFF',
                        border: `1px solid ${marcado ? '#0071E3' : '#C7C7CC'}`,
                      }}
                    >
                      {marcado && <Check className="w-3 h-3" strokeWidth={3} style={{ color: '#FFFFFF' }} />}
                    </span>
                    <span className="truncate">{v}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Helper: verifica se um valor passa pelo filtro de coluna.
 * - selected vazio = tudo passa
 * - selected com '__NENHUM__' = nada passa
 * - caso contrário, só passa quem está no set
 */
export function passaFiltro(selected: Set<string>, valor: string | null | undefined): boolean {
  if (selected.size === 0) return true
  if (selected.has('__NENHUM__')) return false
  return selected.has(valor ?? '')
}
