'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, ChevronRight, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate, getMedicaoStatusColor } from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, TIPO_MEDICAO_LABELS, MedicaoStatus } from '@/types'

const TIPO_MEDICAO_COLORS: Record<string, string> = {
  servico: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
  faturamento_direto: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  misto: 'bg-teal-900/30 text-teal-400 border-teal-800/50',
}

export default function MedicoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [medicoes, setMedicoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/contratos/${id}/medicoes`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setMedicoes(data))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Medições de Serviço"
        subtitle="Histórico e andamento"
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/contratos/${id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Contrato
              </Button>
            </Link>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" />
                Nova Medição
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-3 sm:p-6 max-w-4xl space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--text-3)]">
            <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-400" />
            <span>Carregando medições...</span>
          </div>
        ) : medicoes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text-3)] text-sm mb-4">Nenhuma medição registrada</p>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Criar primeira medição
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-2)]">{medicoes.length} medição(ões) registrada(s)</p>
            {medicoes.map(m => (
              <Link key={m.id} href={`/contratos/${id}/medicoes/${m.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-blue-400/60 font-medium">FIP</span>
                        <span className="text-base font-bold text-blue-400 leading-tight">{String(m.numero).padStart(4, '0')}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-[var(--text-1)]">Medição {m.periodo_referencia}</span>
                          <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                            {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                          </Badge>
                          <Badge className={TIPO_MEDICAO_COLORS[m.tipo] ?? ''}>
                            {TIPO_MEDICAO_LABELS[m.tipo as keyof typeof TIPO_MEDICAO_LABELS] ?? m.tipo}
                          </Badge>
                        </div>
                        <p className="text-xs text-[var(--text-3)]">Solicitante: {m.solicitante_nome}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[var(--text-1)]">{formatCurrency(m.valor_total)}</p>
                        <p className="text-xs text-[var(--text-3)] mt-0.5">
                          {m.status === 'aprovado' && m.data_aprovacao
                            ? `Aprovado em ${formatDate(m.data_aprovacao)}`
                            : m.data_submissao
                            ? `Submetido em ${formatDate(m.data_submissao)}`
                            : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
