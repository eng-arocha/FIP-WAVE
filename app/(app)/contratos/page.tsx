'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  const [contratos, setContratos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  useEffect(() => {
    // Fetch contratos with resumo from view
    fetch('/api/contratos')
      .then(r => r.json())
      .then(async (lista) => {
        if (!Array.isArray(lista)) { setLoading(false); return }
        // Fetch resumo for each contract
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
  }, [])

  const filtrados = contratos.filter(c => {
    const matchBusca = c.numero?.toLowerCase().includes(busca.toLowerCase()) ||
      c.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
      c.contratado?.nome?.toLowerCase().includes(busca.toLowerCase())
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchStatus
  })

  return (
    <div className="flex-1 overflow-auto">
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

      <div className="p-6">
        {/* Filtros */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar contrato..."
              className="pl-9 w-64"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5">
            {['todos', 'ativo', 'suspenso', 'encerrado'].map(s => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  filtroStatus === s
                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {s === 'todos' ? 'Todos' : CONTRATO_STATUS_LABELS[s as keyof typeof CONTRATO_STATUS_LABELS]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando contratos...
          </div>
        ) : (
          /* Lista */
          <div className="space-y-4">
            {filtrados.map(contrato => (
              <Card key={contrato.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-[#1e3a5f]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-[#1e3a5f] text-base">{contrato.numero}</span>
                            <Badge className={getContratoStatusColor(contrato.status)}>
                              {CONTRATO_STATUS_LABELS[contrato.status as keyof typeof CONTRATO_STATUS_LABELS]}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-gray-800">{contrato.descricao}</p>
                          {contrato.escopo && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{contrato.escopo}</p>}
                        </div>
                        <Link href={`/contratos/${contrato.id}`}>
                          <Button variant="outline" size="sm">
                            Abrir <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>

                      {/* Info grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{contrato.contratado?.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <ClipboardList className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span>{CONTRATO_TIPO_LABELS[contrato.tipo as keyof typeof CONTRATO_TIPO_LABELS]}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span>{formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <DollarSign className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-semibold text-gray-800">{formatCurrency(contrato.valor_total || contrato.valor_contratado)}</span>
                        </div>
                      </div>

                      {/* Progresso financeiro */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600">Avanço Financeiro</span>
                          <span className="text-xs font-bold text-[#1e3a5f]">{formatPercent(contrato.percentual_medido || 0)}</span>
                        </div>
                        <Progress value={contrato.percentual_medido || 0} className="h-2 mb-2" />
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">Medido</span>
                            <p className="font-semibold text-green-700">{formatCurrency(contrato.valor_medido || 0)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Saldo</span>
                            <p className="font-semibold text-gray-700">{formatCurrency(contrato.saldo || (contrato.valor_total - (contrato.valor_medido || 0)))}</p>
                          </div>
                          <div className="text-right">
                            {(contrato.qtd_medicoes_pendentes || 0) > 0 && (
                              <div className="flex items-center justify-end gap-1 text-yellow-600">
                                <AlertCircle className="w-3 h-3" />
                                <span>{contrato.qtd_medicoes_pendentes} pend.</span>
                              </div>
                            )}
                            <p className="text-gray-400">{contrato.qtd_medicoes_aprovadas || 0} aprovadas</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtrados.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum contrato encontrado</p>
                <p className="text-sm mt-1">Tente ajustar os filtros ou cadastre um novo contrato</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
