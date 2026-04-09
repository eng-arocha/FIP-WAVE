'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, Loader2, ClipboardList, Plus, Building2, X } from 'lucide-react'
import { formatCurrency, formatDate, getMedicaoStatusColor } from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, MedicaoStatus } from '@/types'

const STATUS_FILTER = ['todos', 'submetido', 'em_analise', 'aprovado', 'rejeitado']

interface MeuContrato {
  id: string
  numero: string
  descricao: string
}

export default function MedicoesServicoPage() {
  const router = useRouter()
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  // Contratos vinculados ao usuário (para o botão "Nova medição")
  const [meusContratos, setMeusContratos] = useState<MeuContrato[]>([])
  const [modalContrato, setModalContrato] = useState(false)

  useEffect(() => {
    fetch('/api/medicoes/servico')
      .then(r => r.ok ? r.json() : [])
      .then(setMedicoes)
      .finally(() => setLoading(false))
    fetch('/api/auth/meus-contratos')
      .then(r => r.ok ? r.json() : [])
      .then(setMeusContratos)
      .catch(() => setMeusContratos([]))
  }, [])

  function iniciarNovaMedicao() {
    if (meusContratos.length === 0) return
    if (meusContratos.length === 1) {
      router.push(`/contratos/${meusContratos[0].id}/medicoes/nova`)
    } else {
      setModalContrato(true)
    }
  }

  const lista = filtro === 'todos' ? medicoes : medicoes.filter(m => m.status === filtro)

  const kpis = [
    { label: 'Total', value: medicoes.length, color: 'text-[var(--text-1)]' },
    { label: 'Pendentes', value: medicoes.filter(m => ['submetido','em_analise'].includes(m.status)).length, color: 'text-amber-400' },
    { label: 'Aprovadas', value: medicoes.filter(m => m.status === 'aprovado').length, color: 'text-emerald-400' },
    { label: 'Valor Total', value: formatCurrency(medicoes.filter(m => m.status === 'aprovado').reduce((s, m) => s + (m.valor_total || 0), 0)), color: 'text-blue-400' },
  ]

  const podeCriarMedicao = meusContratos.length > 0

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Controle de Medições de Serviço"
        subtitle="Todas as medições"
        actions={podeCriarMedicao ? (
          <Button size="sm" onClick={iniciarNovaMedicao}>
            <Plus className="w-4 h-4" />
            Nova medição
          </Button>
        ) : undefined}
      />

      {/* Modal de seleção de contrato (quando usuário tem mais de 1) */}
      {modalContrato && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setModalContrato(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1D1D1F' }}>Nova medição</h2>
                <p className="text-xs mt-1" style={{ color: '#86868B' }}>Para qual contrato você quer criar a medição?</p>
              </div>
              <button
                onClick={() => setModalContrato(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F5F5F7]"
                style={{ color: '#86868B' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 pb-6 space-y-2 max-h-96 overflow-y-auto">
              {meusContratos.map(c => (
                <Link key={c.id} href={`/contratos/${c.id}/medicoes/nova`} onClick={() => setModalContrato(false)}>
                  <div
                    className="flex items-start gap-3 px-4 py-3 rounded-xl border border-[#E5E5EA] hover:border-[#0071E3] hover:bg-[#F5F5F7] transition-colors cursor-pointer"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: '#EFF6FF' }}
                    >
                      <Building2 className="w-4 h-4" style={{ color: '#0071E3' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate" style={{ color: '#1D1D1F' }}>{c.numero}</p>
                      <p className="text-xs truncate" style={{ color: '#86868B' }}>{c.descricao}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 mt-2.5" style={{ color: '#86868B' }} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6 max-w-5xl">
        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-[var(--text-3)] mb-1">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtro de status */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER.map(s => (
            <button
              key={s}
              onClick={() => setFiltro(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filtro === s ? 'bg-blue-500 text-white' : 'bg-[var(--surface-2)] text-[var(--text-3)] hover:text-[var(--text-1)] border border-[var(--border)]'}`}
            >
              {s === 'todos' ? 'Todos' : MEDICAO_STATUS_LABELS[s as MedicaoStatus] ?? s}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
            <span className="text-[var(--text-3)]">Carregando...</span>
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-10 h-10 text-[var(--text-3)] mx-auto mb-3" />
            <p className="text-[var(--text-3)] text-sm">Nenhuma medição encontrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lista.map(m => (
              <Link key={m.id} href={`/contratos/${m.contrato?.id}/medicoes/${m.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-purple-400/60 font-medium">MED</span>
                        <span className="text-base font-bold text-purple-400 leading-tight">#{String(m.numero).padStart(2, '0')}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-semibold text-sm text-[var(--text-1)]">{m.contrato?.numero ?? '—'}</span>
                          <span className="text-xs text-[var(--text-3)]">·</span>
                          <span className="text-xs text-[var(--text-2)]">{m.periodo_referencia}</span>
                          <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                            {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--text-3)]">{m.contrato?.descricao ?? ''} · {m.solicitante_nome}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[var(--text-1)]">{formatCurrency(m.valor_total)}</p>
                        <p className="text-xs text-[var(--text-3)] mt-0.5">
                          {m.status === 'aprovado' && m.data_aprovacao ? `Aprovado ${formatDate(m.data_aprovacao)}` : m.data_submissao ? `Submetido ${formatDate(m.data_submissao)}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-3)]" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
