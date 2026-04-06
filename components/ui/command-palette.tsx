'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  LayoutDashboard,
  CheckSquare,
  Building2,
  Search,
} from 'lucide-react'

interface Contrato {
  id: string | number
  numero?: string
  descricao?: string
  contratado?: { nome?: string }
  [key: string]: unknown
}

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Contratos', href: '/contratos', icon: FileText },
  { label: 'Aprovações', href: '/aprovacoes', icon: CheckSquare },
  { label: 'Empresas', href: '/empresas', icon: Building2 },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const openPalette = useCallback(() => {
    setOpen(true)
    setQuery('')
    setActiveIdx(0)
    fetch('/api/contratos')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setContratos(data)
        else if (Array.isArray(data?.data)) setContratos(data.data)
      })
      .catch(() => {})
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setContratos([])
    setActiveIdx(0)
  }, [])

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) {
          closePalette()
        } else {
          openPalette()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, openPalette, closePalette])

  // Custom event from topbar button
  useEffect(() => {
    const handleCustomEvent = () => openPalette()
    window.addEventListener('open-command-palette', handleCustomEvent)
    return () => window.removeEventListener('open-command-palette', handleCustomEvent)
  }, [openPalette])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  // Build filtered results
  const q = query.trim().toLowerCase()

  const filteredNav = NAV_ITEMS.filter(
    (item) => !q || item.label.toLowerCase().includes(q),
  )

  const filteredContratos = q
    ? contratos
        .filter((c) => {
          return (
            c.numero?.toLowerCase().includes(q) ||
            c.descricao?.toLowerCase().includes(q) ||
            c.contratado?.nome?.toLowerCase().includes(q)
          )
        })
        .slice(0, 5)
    : []

  // Flat list for keyboard navigation
  type ResultItem =
    | { kind: 'nav'; item: NavItem }
    | { kind: 'contrato'; item: Contrato }

  const results: ResultItem[] = [
    ...filteredNav.map((item) => ({ kind: 'nav' as const, item })),
    ...filteredContratos.map((item) => ({ kind: 'contrato' as const, item })),
  ]

  // Keyboard navigation inside the palette
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePalette()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (results.length ? (i + 1) % results.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) =>
          results.length ? (i - 1 + results.length) % results.length : 0,
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const current = results[activeIdx]
        if (!current) return
        if (current.kind === 'nav') {
          router.push(current.item.href)
        } else {
          router.push(`/contratos/${current.item.id}`)
        }
        closePalette()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, results, activeIdx, router, closePalette])

  // Reset activeIdx when results change
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  if (!open) return null

  const showNavSection = filteredNav.length > 0
  const showContratosSection = filteredContratos.length > 0

  // Global index counter for active highlight
  let globalIdx = 0

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={closePalette}
    >
      <div
        className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl bg-[var(--surface-2)] border border-[#2d3f5c] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-3)] shrink-0 ml-5" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contratos, páginas..."
            className="flex-1 bg-transparent border-0 px-3 py-4 text-[var(--text-1)] text-base placeholder:text-[var(--text-3)] focus:outline-none"
          />
          <kbd className="shrink-0 mr-4 px-1.5 py-0.5 text-[10px] text-[var(--text-3)] bg-[var(--surface-3)] rounded border border-[#2d3f5c]">
            ⌘K
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-3)]">
              Nenhum resultado encontrado.
            </p>
          )}

          {showNavSection && (
            <>
              <p className="px-4 py-1.5 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">
                Navegação
              </p>
              {filteredNav.map((item) => {
                const idx = globalIdx++
                const Icon = item.icon
                const isActive = idx === activeIdx
                return (
                  <button
                    key={item.href}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--surface-3)] text-left transition-colors ${
                      isActive ? 'bg-[var(--surface-3)] border-l-2 border-blue-500' : ''
                    }`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      router.push(item.href)
                      closePalette()
                    }}
                  >
                    <Icon className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                    <span className="text-sm text-[var(--text-1)]">{item.label}</span>
                  </button>
                )
              })}
            </>
          )}

          {showContratosSection && (
            <>
              <p className="px-4 py-1.5 text-[10px] font-semibold text-[var(--text-3)] uppercase tracking-wider">
                Contratos
              </p>
              {filteredContratos.map((contrato) => {
                const idx = globalIdx++
                const isActive = idx === activeIdx
                return (
                  <button
                    key={contrato.id}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--surface-3)] text-left transition-colors ${
                      isActive ? 'bg-[var(--surface-3)] border-l-2 border-blue-500' : ''
                    }`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => {
                      router.push(`/contratos/${contrato.id}`)
                      closePalette()
                    }}
                  >
                    <FileText className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-[var(--text-1)] truncate">
                        {contrato.numero
                          ? `#${contrato.numero} — `
                          : ''}
                        {contrato.descricao ?? 'Contrato sem descrição'}
                      </span>
                      {contrato.contratado?.nome && (
                        <span className="text-xs text-[var(--text-3)] truncate">
                          {contrato.contratado.nome}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-3)]">
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--surface-3)] rounded border border-[#2d3f5c]">↵</kbd>{' '}
            Abrir
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--surface-3)] rounded border border-[#2d3f5c]">↑↓</kbd>{' '}
            Navegar
          </span>
          <span>
            <kbd className="px-1 py-0.5 bg-[var(--surface-3)] rounded border border-[#2d3f5c]">Esc</kbd>{' '}
            Fechar
          </span>
        </div>
      </div>
    </div>
  )
}
