'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, FileText, Building2, CheckSquare, LogOut, X, Users,
  Pin, PinOff, ChevronDown, FolderOpen, TrendingUp, Receipt, ClipboardList, FileArchive, Shield, Wrench, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { useTheme } from '@/components/ui/theme-provider'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador: 'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin: 'Administrador',
}

// Apple-style icon configs: each nav item has its own gradient color
const ICON_COLORS: Record<string, { from: string; to: string }> = {
  '/dashboard':    { from: '#3B82F6', to: '#06B6D4' },  // blue → cyan
  '/contratos':    { from: '#8B5CF6', to: '#A855F7' },  // purple
  '/aprovacoes':   { from: '#F59E0B', to: '#EF4444' },  // amber → red
  '/empresas':     { from: '#10B981', to: '#059669' },  // green
  '/usuarios':     { from: '#6366F1', to: '#8B5CF6' },  // indigo → purple
  '/perfis':       { from: '#F59E0B', to: '#EF4444' },  // amber → red
  '/admin':        { from: '#6B7280', to: '#4B5563' },  // gray
  '/documentos/faturamento-direto': { from: '#EF4444', to: '#F97316' },  // red → orange
  'cadastro':      { from: '#64748B', to: '#475569' },  // slate (group)
  'docs-group':    { from: '#EF4444', to: '#F97316' },  // red → orange (group)
  'cronograma':    { from: '#059669', to: '#10B981' },  // green
  'fat-direto':    { from: '#F59E0B', to: '#FB923C' },  // amber → orange
  'medicoes':      { from: '#6366F1', to: '#3B82F6' },  // indigo → blue
  'documentos':    { from: '#EC4899', to: '#F43F5E' },  // pink → rose
}

interface SidebarProps {
  perfilAtual: Perfil
  nomeAtual: string
  expanded: boolean
  pinned: boolean
  onTogglePin: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function Sidebar({
  perfilAtual, nomeAtual, expanded, pinned, onTogglePin, onMouseEnter, onMouseLeave,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isDark } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [contratoOpen, setContratoOpen] = useState(true)
  const [docsOpen, setDocsOpen] = useState(false)

  // Detect if inside a specific contract (extract UUID from pathname)
  const contratoMatch = pathname.match(/^\/contratos\/([a-f0-9-]{36})/)
  const contratoId = contratoMatch?.[1] ?? null
  const isInContrato = !!contratoId
  const { temPermissao } = usePermissoes()

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('open-mobile-sidebar', handler)
    return () => window.removeEventListener('open-mobile-sidebar', handler)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/empresas') || pathname.startsWith('/usuarios') || pathname.startsWith('/perfis') || pathname.startsWith('/admin')) {
      setCadastroOpen(true)
    }
    if (pathname.startsWith('/documentos')) {
      setDocsOpen(true)
    }
  }, [pathname])

  const mainItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, modulo: 'dashboard' },
    { label: 'Contratos', href: '/contratos', icon: FileText, modulo: 'contratos' },
    { label: 'Aprovações', href: '/aprovacoes', icon: CheckSquare, modulo: 'aprovacoes', badge: true },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const cadastroItems = [
    { label: 'Empresas', href: '/empresas', icon: Building2, modulo: 'empresas' },
    { label: 'Usuários', href: '/usuarios', icon: Users, modulo: 'usuarios' },
    { label: 'Perfis', href: '/perfis', icon: Shield, modulo: 'perfis' },
    ...(perfilAtual === 'admin' ? [{ label: 'Sistema', href: '/admin', icon: Wrench, modulo: 'usuarios' }] : []),
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const documentosItems = [
    { label: 'Pedidos FD',    href: '/documentos/faturamento-direto', icon: FileArchive,   modulo: 'documentos' },
    { label: 'Med. Serviços', href: '/documentos/medicoes-servico',   icon: ClipboardList, modulo: 'documentos' },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const isCadastroActive = pathname.startsWith('/empresas') || pathname.startsWith('/usuarios') || pathname.startsWith('/perfis') || pathname.startsWith('/admin')
  const isDocsActive = pathname.startsWith('/documentos')

  // Contract contextual items (shown when inside /contratos/[id])
  const contratoSubItems = contratoId ? [
    { label: 'Documentos',    href: `/contratos/${contratoId}/documentos`, icon: FileArchive,  colorKey: 'documentos' },
  ] : []

  // Apple iOS icon container — active items get a colored gradient pill
  const AppleIconBg = ({ colorKey, children }: { colorKey: string; children: React.ReactNode }) => {
    const colors = ICON_COLORS[colorKey]
    if (!colors) return <>{children}</>
    return (
      <span className="apple-icon flex-shrink-0" style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}>
        {children}
      </span>
    )
  }

  const renderNavLink = (item: any, showText: boolean, indent = false) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const colorLookup = item.colorKey ?? item.href
    const colors = ICON_COLORS[colorLookup] ?? ICON_COLORS[item.href]

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={!showText ? item.label : undefined}
        className={cn(
          'flex items-center gap-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 group relative',
          showText ? (indent ? 'px-2 pl-3' : 'px-2') : 'px-0 justify-center',
        )}
        style={isActive && showText ? {
          background: isDark
            ? `linear-gradient(135deg, ${colors?.from}18, ${colors?.to}0c)`
            : `linear-gradient(135deg, ${colors?.from}14, ${colors?.to}08)`,
        } : {}}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = ''
        }}
      >
        {colors ? (
          <span
            className="apple-icon flex-shrink-0 transition-all duration-200"
            style={{
              background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
              opacity: isActive ? 1 : 0.55,
              boxShadow: isActive ? `0 2px 8px ${colors.from}40` : 'none',
            }}
          >
            <item.icon className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
          </span>
        ) : (
          <span className="apple-icon flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
            <item.icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
          </span>
        )}

        <span
          className={cn('whitespace-nowrap transition-all duration-200 flex-1', showText ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}
          style={{ color: isActive ? 'var(--text-1)' : 'var(--text-2)', fontWeight: isActive ? 600 : 400 }}
        >
          {item.label}
        </span>

        {'badge' in item && item.badge && showText && (
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        )}

        {isActive && showText && (
          <span className="absolute right-2 w-1.5 h-1.5 rounded-full" style={{ background: colors?.from ?? 'var(--accent)' }} />
        )}
      </Link>
    )
  }

  const renderContent = (showText: boolean) => (
    <>
      {/* Top gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-glow), transparent)' }} />

      {/* Header: logo + pin */}
      <div
        className={cn('border-b flex items-center transition-all duration-300', showText ? 'px-4 py-4 justify-between' : 'px-0 py-4 justify-center')}
        style={{ borderColor: 'var(--sidebar-border)' }}
      >
        {showText ? (
          <>
            <div
              className="rounded-xl px-3 py-2 flex items-center justify-center cursor-pointer select-none"
              style={{ background: 'white', border: '1px solid rgba(59,130,246,0.15)' }}
              onDoubleClick={() => window.open('https://www.wavebeiramar.com.br', '_blank')}
              title="Duplo clique para acessar wavebeiramar.com.br"
            >
              <Image src="/logos/Wave.png" alt="WAVE Beira-Mar" width={110} height={62} priority className="object-contain" style={{ width: 'auto', height: 'auto', maxWidth: 110, maxHeight: 48 }} />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin() }}
              title={pinned ? 'Desafixar sidebar' : 'Fixar sidebar'}
              className="p-1.5 rounded-lg transition-all hidden lg:flex items-center"
              style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
            >
              {pinned ? <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Pin className="w-3.5 h-3.5" strokeWidth={1.5} />}
            </button>
          </>
        ) : (
          <div className="apple-icon rounded-[10px]" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}>
            <span className="text-xs font-bold text-white">W</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-0.5">
        {mainItems.map(item => renderNavLink(item, showText))}

        {/* ── Contract contextual group ── */}
        {isInContrato && contratoSubItems.length > 0 && (
          <>
            {showText && (
              <div className="pt-3 pb-1 px-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Contrato</span>
              </div>
            )}
            {!showText && <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />}

            {showText ? (
              <div>
                <button
                  onClick={() => setContratoOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span className="apple-icon flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #A855F7)' }}>
                    <FileText className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                  </span>
                  <span className="flex-1 text-left">Módulos</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" strokeWidth={1.5} style={{ transform: contratoOpen ? '' : 'rotate(-90deg)', color: 'var(--text-3)' }} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', contratoOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0')}>
                  <div className="pt-0.5 ml-3 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                    {contratoSubItems.map(item => renderNavLink(item, showText, true))}
                  </div>
                </div>
              </div>
            ) : (
              contratoSubItems.map(item => renderNavLink(item, showText))
            )}
          </>
        )}

        {/* ── Cadastros section ── */}
        {cadastroItems.length > 0 && (
          <>
            <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />
            {!showText && <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />}

            {showText ? (
              <div>
                <button
                  onClick={() => setCadastroOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all duration-150 group"
                  style={{ color: isCadastroActive ? 'var(--text-1)' : 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span className="apple-icon flex-shrink-0" style={{ background: isCadastroActive ? 'linear-gradient(135deg, #64748B, #475569)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}>
                    <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: isCadastroActive ? 'white' : 'var(--text-3)' }} />
                  </span>
                  <span className="flex-1 text-left">Cadastro</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200')} strokeWidth={1.5} style={{ transform: cadastroOpen ? '' : 'rotate(-90deg)', color: 'var(--text-3)' }} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', cadastroOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0')}>
                  <div className="pt-0.5 ml-3 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                    {cadastroItems.map(item => renderNavLink(item, showText, true))}
                  </div>
                </div>
              </div>
            ) : (
              cadastroItems.map(item => renderNavLink(item, showText))
            )}
          </>
        )}

        {/* ── Documentos section ── */}
        {documentosItems.length > 0 && (
          <>
            <div className="my-1 mx-2 h-px" style={{ background: 'var(--border)' }} />
            {!showText && <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />}

            {showText ? (
              <div>
                <button
                  onClick={() => setDocsOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all duration-150"
                  style={{ color: isDocsActive ? 'var(--text-1)' : 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span className="apple-icon flex-shrink-0" style={{ background: isDocsActive ? 'linear-gradient(135deg, #EF4444, #F97316)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}>
                    <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: isDocsActive ? 'white' : 'var(--text-3)' }} />
                  </span>
                  <span className="flex-1 text-left">Documentos</span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200" strokeWidth={1.5} style={{ transform: docsOpen ? '' : 'rotate(-90deg)', color: 'var(--text-3)' }} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', docsOpen ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0')}>
                  <div className="pt-0.5 ml-3 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                    {documentosItems.map(item => renderNavLink(item, showText, true))}
                  </div>
                </div>
              </div>
            ) : (
              documentosItems.map(item => renderNavLink(item, showText))
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className={cn('border-t pt-3 pb-4 space-y-0.5', showText ? 'px-3' : 'px-2')} style={{ borderColor: 'var(--sidebar-border)' }}>
        {nomeAtual && (
          showText ? (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-xl" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[11px]" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))', color: 'white' }}>
                {nomeAtual.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{nomeAtual}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{PERFIL_LABELS[perfilAtual]}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-white" title={nomeAtual} style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}>
                {nomeAtual.charAt(0).toUpperCase()}
              </div>
            </div>
          )
        )}

        <div className={cn('flex items-center gap-2 px-3 py-1.5', !showText && 'justify-center px-0')}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--green)', animation: 'pulse-glow 2s ease-in-out infinite' }} title={!showText ? 'Sistema Online' : undefined} />
          {showText && <span className="text-xs" style={{ color: 'var(--text-3)' }}>Sistema Online</span>}
        </div>

        <Link
          href="/logout"
          onClick={() => setMobileOpen(false)}
          title={!showText ? 'Sair do Sistema' : undefined}
          className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 group', !showText && 'justify-center px-0')}
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.08)' : 'rgba(217,48,37,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
        >
          <span className="apple-icon flex-shrink-0" style={{ background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(217,48,37,0.08)' }}>
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--red)' }} />
          </span>
          {showText && <span>Sair do Sistema</span>}
        </Link>

        {showText && (
          <div className="px-3 pt-2 pb-1 flex items-center justify-between">
            <Image src="/logos/fip-logo.svg" alt="FIP Engenharia" width={110} height={32} className="object-contain opacity-80" style={{ width: 'auto', height: 28 }} />
            <span className="text-[10px]" style={{ color: 'var(--text-3)', opacity: 0.5 }}>v1.0.0</span>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn('fixed inset-y-0 left-0 z-50 w-64 flex flex-col lg:hidden overflow-hidden transition-transform duration-300 ease-in-out', mobileOpen ? 'translate-x-0' : '-translate-x-full')}
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-1 rounded-lg transition-colors" style={{ color: 'var(--text-3)' }}>
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
        {renderContent(true)}
      </aside>

      <aside
        className={cn('fixed inset-y-0 left-0 z-50 flex-col overflow-hidden hidden lg:flex', 'transition-all duration-300 ease-in-out', expanded ? 'w-64' : 'w-14', !pinned && expanded && 'shadow-2xl')}
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {renderContent(expanded)}
      </aside>
    </>
  )
}
