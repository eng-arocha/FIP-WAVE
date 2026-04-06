'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Database, CheckCircle, AlertTriangle } from 'lucide-react'

interface SeedStatus {
  tarefas_no_banco: number
  detalhamentos_no_banco: number
  tarefas_esperadas: number
  detalhamentos_esperados: number
  precisa_seed: boolean
}

export default function AdminPage() {
  const [status, setStatus]     = useState<SeedStatus | null>(null)
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState<string>('')
  const [error, setError]       = useState<string>('')

  async function checkStatus() {
    setLoading(true)
    const res = await fetch('/api/admin/seed')
    if (res.ok) setStatus(await res.json())
    setLoading(false)
  }

  async function runSeed() {
    setRunning(true); setResult(''); setError('')
    const res = await fetch('/api/admin/seed', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setResult(`✅ ${data.message} — ${data.detalhamentos_processados} detalhamentos inseridos.`)
      await checkStatus()
    } else {
      setError(`❌ Erro: ${data.error}`)
    }
    setRunning(false)
  }

  useEffect(() => { checkStatus() }, [])

  return (
    <div className="flex-1 overflow-auto">
      <Topbar title="Administração" subtitle="Ferramentas de manutenção do sistema" />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Status do banco */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Database className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Status do Banco de Dados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-3)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
              </div>
            ) : status ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Tarefas no banco', val: status.tarefas_no_banco, exp: status.tarefas_esperadas },
                    { label: 'Detalhamentos no banco', val: status.detalhamentos_no_banco, exp: status.detalhamentos_esperados },
                  ].map(r => (
                    <div key={r.label} className="p-3 rounded-xl" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{r.label}</p>
                      <p className="text-lg font-bold" style={{ color: r.val >= r.exp ? 'var(--green)' : 'var(--red)' }}>
                        {r.val} <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>/ {r.exp} esperados</span>
                      </p>
                    </div>
                  ))}
                </div>

                {status.precisa_seed ? (
                  <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#F59E0B' }}>Seed incompleto</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                        Faltam {status.detalhamentos_esperados - status.detalhamentos_no_banco} detalhamentos. Clique em "Executar Seed" para corrigir.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <CheckCircle className="w-4 h-4" style={{ color: 'var(--green)' }} />
                    <p className="text-sm" style={{ color: 'var(--green)' }}>Banco de dados completo — todos os detalhamentos presentes.</p>
                  </div>
                )}

                {result && (
                  <p className="text-sm p-3 rounded-xl" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--green)' }}>
                    {result}
                  </p>
                )}
                {error && (
                  <p className="text-sm p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)' }}>
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <Button size="sm" onClick={runSeed} disabled={running || !status.precisa_seed}>
                    {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Executando...</> : 'Executar Seed'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={checkStatus}>Atualizar status</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Erro ao verificar status</p>
            )}
          </CardContent>
        </Card>

        {/* Migration 012 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Migration 012 — Template ID</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              Adiciona <code>template_id</code> à tabela <code>perfis</code> e permissão de gestão de perfis para Administradores.
              Esta migration requer execução no Supabase SQL Editor pois usa ALTER TABLE.
            </p>
            <div className="rounded-xl p-3 font-mono text-xs overflow-x-auto" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <pre>{`ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS template_id UUID
  REFERENCES templates_permissao(id) ON DELETE SET NULL;

UPDATE templates_permissao
SET permissoes = permissoes || '[
  {"modulo":"perfis","acao":"visualizar"},
  {"modulo":"perfis","acao":"criar"},
  {"modulo":"perfis","acao":"editar"},
  {"modulo":"perfis","acao":"excluir"}
]'::jsonb
WHERE nome = 'Administrador';`}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
