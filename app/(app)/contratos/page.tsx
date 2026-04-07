'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText, Plus, Search, ArrowRight, Calendar, Building2,
  DollarSign, ClipboardList, AlertCircle, Loader2
} from 'lucide-react'
import {
  formatCurrency, formatPercent, formatDate,
  getContratoStatusColor
} from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, CONTRATO_TIPO_LABELS } from '@/types'

export default function ContratosPage() {
  const router = useRouter()
  const [contratos, setContratos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  useEffect(() => {
    fetch('/api/contratos')
      .then(r => r.json())
      .then(async (lista) => {
        if (!Array.isArray(lista)) { setLoading(false); return }

        // Se há exatamente 1 contrato, abre diretamente sem mostrar a lista
        if (lista.length === 1) {
          router.replace(`/contratos/${lista[0].id}`)
          return
        }

        const withResumo = await Promise.all(lista.map(async (c: any) => {
          try {
            const res = await fetch(`/api/contratos/${c.id}`)
            const d = await res.json()
            return { ...c, ...d }
          } catch {
            return c
          }
        }))
        setContratos(withResumo)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  const filtrados = contratos.filter(c => {
    const matchBusca = c.numero?.toLowerCase().includes(busca.toLowerCase()) ||
      c.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
      c.contratado?.nome?.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  const statusOptions = [
    { value: 'todos', label: 'Todos' },
    { value: 'ativo', label: CONTRATO_STATUS_LABELS['ativo' as keyof typeof CONTRATO_STATUS_LABELS] },
    { value: 'suspenso', label: CONTRATO_STATUS_LABELS['suspenso' as keyof typeof CONTRATO_STATUS_LABELS] },
    { value: 'encerrado', label: CONTRATO_STATUS_LABELS['encerrado' as keyof typeof CONTRATO_STATUS_LABELS] },
  ]

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
      <Topbar
        title="Contratos"
        subtitle={`${contratos.length} contrato(s) cadastrado(s)`}
        actions={
          <Link href="/contratos/novo">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              Novo Contrato
            </Button>
          </Link>
        }
      />

      <div className="p-3 sm:p-6">
        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="relative flex-1 sm:flex-none">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-3)' }}
            />
            <input
              placeholder="Buscar contrato..."
              className="pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all w-full sm:w-64"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {statusOptions.map(s => (
              <button
                key={s.value}
                onClick={() => setFiltroStatus(s.value)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-150"
                style={
                  filtroStatus === s.value
                    ? {
                        background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                        color: '#fff',
                        border: '1px solid transparent',
                        boxShadow: '0 0 12px rgba(59,130,246,0.30)',
                      }
                    : {
                        background: 'var(--surface-2)',
                        color: 'var(--text-2)',
                        border: '1px solid var(--border)',
                      }
                }
                onMouseEnter={e => {
                  if (filtroStatus !== s.value) {
                    e.currentTarget.style.borderColor = 'var(--border-hover)'
                    e.currentTarget.style.color = 'var(--text-1)'
                  }
                }}
                onMouseLeave={e => {
                  if (filtroStatus !== s.value) {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-2)'
                  }
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" style={{ color: '#3B82F6' }} />
            <span>Carregando contratos...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {filtrados.map(contrato => (
              <Link
                key={contrato.id}
                href={`/contratos/${contrato.id}`}
                className="block rounded-xl transition-all duration-200 cursor-pointer"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(59,130,246,0.35)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px rgba(59,130,246,0.08), 0 8px 30px rgba(0,0,0,0.35)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#1E293B'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div className="p-3 sm:p-5">
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Donut ring progress — hidden on mobile */}
                    <div className="w-12 h-12 flex-shrink-0 relative hidden sm:block">
                      <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                        <circle cx="22" cy="22" r="17" fill="none" stroke="#1E293B" strokeWidth="4" />
                        <circle
                          cx="22" cy="22" r="17" fill="none"
                          stroke="#3B82F6"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${(Math.min(contrato.percentual_medido || 0, 100) / 100) * 106.8} 106.8`}
                          style={{ transition: 'stroke-dasharray 0.8s ease' }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: 'var(--text-2)' }}>
                        {Math.round(contrato.percentual_medido || 0)}%
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="font-bold text-base"
                              style={{
                                background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                              }}
                            >
                              {contrato.numero}
                            </span>
                            <Badge className={getContratoStatusColor(contrato.status)}>
                              {CONTRATO_STATUS_LABELS[contrato.status as keyof typeof CONTRATO_STATUS_LABELS]}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{contrato.descricao}</p>
                          {contrato.escopo && (
                            <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-3)' }}>
                              {contrato.escopo}
                            </p>
                          )}
                        </div>
                        <span
                          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium flex-shrink-0"
                          style={{ color: 'var(--text-3)' }}
                        >
                          Abrir <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-3 mb-3 sm:mb-4">
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          <span className="truncate">{contrato.contratado?.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <ClipboardList className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          <span>{CONTRATO_TIPO_LABELS[contrato.tipo as keyof typeof CONTRATO_TIPO_LABELS]}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          <span>{formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <DollarSign className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                            {formatCurrency(contrato.valor_total || contrato.valor_contratado)}
                          </span>
                        </div>
                      </div>

                      {/* Progresso financeiro */}
                      <div
                        className="rounded-xl p-3"
                        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                            Avanço Financeiro
                          </span>
                          <span
                            className="text-xs font-bold"
                            style={{
                              background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                            }}
                          >
                            {formatPercent(contrato.percentual_medido || 0)}
                          </span>
                        </div>
                        {/* Custom progress bar */}
                        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: '#1E293B' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(contrato.percentual_medido || 0, 100)}%`,
                              background: 'linear-gradient(90deg, #2563EB, #06B6D4)',
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span style={{ color: 'var(--text-3)' }}>Medido</span>
                            <p className="font-semibold" style={{ color: 'var(--green)' }}>
                              {formatCurrency(contrato.valor_medido || 0)}
                            </p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-3)' }}>Saldo</span>
                            <p className="font-semibold" style={{ color: 'var(--text-2)' }}>
                              {formatCurrency(
                                contrato.saldo ||
                                (contrato.valor_total - (contrato.valor_medido || 0))
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            {(contrato.qtd_medicoes_pendentes || 0) > 0 && (
                              <div
                                className="flex items-center justify-end gap-1 text-xs"
                                style={{ color: 'var(--amber)' }}
                              >
                                <AlertCircle className="w-3 h-3" />
                                <span>{contrato.qtd_medicoes_pendentes} pend.</span>
                              </div>
                            )}
                            <p style={{ color: 'var(--text-3)' }}>
                              {contrato.qtd_medicoes_aprovadas || 0} aprovadas
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {filtrados.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#1E293B' }} />
                <p className="font-medium" style={{ color: 'var(--text-2)' }}>Nenhum contrato encontrado</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
                  Tente ajustar os filtros ou cadastre um novo contrato
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
