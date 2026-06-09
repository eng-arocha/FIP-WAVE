'use client'

import { use, useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ArrowLeft, Upload, FileText, X, CheckCircle2, AlertTriangle, Package
} from 'lucide-react'
import { uploadAnexosPedido } from '@/lib/fat-direto-upload'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Solicitacao {
  id: string
  numero: number
  status: string
  fornecedor_razao_social?: string
  pedido_pdf_url?: string | null
  pedido_pdf_nome?: string | null
  pedido_anexos?: Array<{ nome: string; url: string }> | null
}

interface FileEntry {
  file: File
  fipNumero: number | null   // parsed from filename: FIP-XXXX-*
  solId: string | null       // resolved from fipNumero
  status: 'pending' | 'uploading' | 'done' | 'error'
  erro?: string
}

/**
 * Extrai o número FIP do nome do arquivo.
 * Formatos suportados:
 *   FIP-0042-proposta.pdf          → 42
 *   FIP-42-cotacao.pdf             → 42
 *   FIP0042-qualquercoisa.pdf      → 42
 *   fip-0042_v2.jpg                → 42  (case-insensitive)
 * Retorna null se não encontrar.
 */
function parseFipNumero(nome: string): number | null {
  const m = nome.match(/^fip[-_]?0*(\d+)/i)
  return m ? parseInt(m[1], 10) : null
}

export default function BulkUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loadingSols, setLoadingSols] = useState(true)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  // Carrega todas as solicitações do contrato para mapear numero → id
  useEffect(() => {
    fetch(`/api/contratos/${id}/fat-direto/solicitacoes`)
      .then(r => r.json())
      .then(data => {
        setSolicitacoes(Array.isArray(data) ? data : [])
      })
      .finally(() => setLoadingSols(false))
  }, [id])

  const solByNumero = useMemo(() => {
    const map: Record<number, Solicitacao> = {}
    for (const s of solicitacoes) map[s.numero] = s
    return map
  }, [solicitacoes])

  function addFiles(files: File[]) {
    setDone(false)
    setEntries(prev => {
      const existingNames = new Set(prev.map(e => e.file.name))
      const novas: FileEntry[] = files
        .filter(f => !existingNames.has(f.name))
        .map(f => {
          const fipNumero = parseFipNumero(f.name)
          const sol = fipNumero != null ? solByNumero[fipNumero] : null
          return {
            file: f,
            fipNumero,
            solId: sol?.id ?? null,
            status: 'pending',
          }
        })
      return [...prev, ...novas]
    })
  }

  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  function changeSolId(idx: number, solId: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, solId: solId || null } : e))
  }

  const grouped = useMemo(() => {
    // Group entries by solId for upload batching
    const map: Record<string, FileEntry[]> = {}
    for (const e of entries) {
      const key = e.solId || '__unmapped__'
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [entries])

  const canUpload = entries.length > 0 && entries.some(e => e.solId != null && e.status === 'pending')
  const unmapped = entries.filter(e => e.solId == null)
  const mapped = entries.filter(e => e.solId != null)

  async function executarUpload() {
    setUploading(true)
    setDone(false)

    // Group by solId and upload per solicitation
    const bySol: Record<string, FileEntry[]> = {}
    for (const e of entries) {
      if (!e.solId || e.status !== 'pending') continue
      if (!bySol[e.solId]) bySol[e.solId] = []
      bySol[e.solId].push(e)
    }

    for (const [solId, solEntries] of Object.entries(bySol)) {
      // Mark all as uploading
      setEntries(prev => prev.map(e =>
        solEntries.some(se => se.file === e.file) ? { ...e, status: 'uploading' } : e
      ))

      try {
        await uploadAnexosPedido(solId, solEntries.map(e => e.file))
        setEntries(prev => prev.map(e =>
          solEntries.some(se => se.file === e.file) ? { ...e, status: 'done' } : e
        ))
      } catch (err: any) {
        const msg = err?.message || 'Erro desconhecido'
        setEntries(prev => prev.map(e =>
          solEntries.some(se => se.file === e.file) ? { ...e, status: 'error', erro: msg } : e
        ))
      }
    }

    setUploading(false)
    setDone(true)
  }

  const totalDone = entries.filter(e => e.status === 'done').length
  const totalError = entries.filter(e => e.status === 'error').length

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title="Upload em Lote — Anexos" />
      <div className="flex-1 p-4 sm:p-6 space-y-5 max-w-4xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" size="sm" className="gap-1 px-2" style={{ color: 'var(--text-3)' }}>
              <ArrowLeft className="w-4 h-4" /> Faturamento Direto
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Package className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
              Upload em Lote — Pedidos e Anexos
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Nomei os arquivos como <code className="px-1 rounded" style={{ background: 'var(--surface-3)' }}>FIP-0042-descricao.pdf</code> e solte aqui em lote.
            </p>
          </div>
        </div>

        {/* Instrução de nomeação */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Convenção de nomes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { ex: 'FIP-0042-proposta.pdf', desc: 'Proposta/cotação da solicitação 42' },
                { ex: 'FIP-0042-pedido-fip.pdf', desc: 'Pedido FIP da solicitação 42' },
                { ex: 'FIP-0042-foto1.jpg', desc: 'Imagem — pode ter vários arquivos por FIP' },
                { ex: 'FIP-0042-orcamento-2.pdf', desc: 'Segundo orçamento (mesmo FIP, nome diferente)' },
              ].map(({ ex, desc }) => (
                <div key={ex} className="flex flex-col gap-0.5">
                  <code className="font-mono text-[11px] px-2 py-1 rounded" style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}>{ex}</code>
                  <span style={{ color: 'var(--text-3)' }}>{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Arquivos sem prefixo <code>FIP-XXXX</code> ficam na lista como "sem correspondência" — você pode vincular manualmente.
            </p>
          </CardContent>
        </Card>

        {/* Drop zone */}
        <div
          className="flex flex-col items-center gap-3 rounded-2xl px-6 py-8 cursor-pointer transition-all text-center"
          style={{ background: 'var(--surface-2)', border: '2px dashed var(--border)' }}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
          onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.style.borderColor = 'var(--border)'
            addFiles(Array.from(e.dataTransfer.files))
          }}
        >
          <Upload className="w-8 h-8" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Clique ou arraste todos os arquivos aqui</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>PDF, JPG, PNG — múltiplos arquivos de vários FIPs de uma vez</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={e => {
            addFiles(Array.from(e.target.files ?? []))
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />

        {/* File table */}
        {entries.length > 0 && (
          <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between" style={{ color: 'var(--text-1)' }}>
                <span>{entries.length} arquivo{entries.length !== 1 ? 's' : ''} — {mapped.length} com correspondência, {unmapped.length} sem</span>
                <button onClick={() => setEntries([])} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}>Limpar tudo</button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 px-3 pb-3">
              {entries.map((entry, idx) => {
                const sol = entry.solId ? solicitacoes.find(s => s.id === entry.solId) : null
                const statusIcon = {
                  pending: null,
                  uploading: <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>,
                  done: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />,
                  error: <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--red)' }} />,
                }[entry.status]

                return (
                  <div
                    key={`${entry.file.name}-${idx}`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{
                      background: entry.status === 'done' ? 'rgba(16,185,129,0.06)' :
                                  entry.status === 'error' ? 'rgba(239,68,68,0.06)' :
                                  entry.solId ? 'var(--surface-3)' : 'rgba(245,158,11,0.06)',
                      border: `1px solid ${entry.status === 'done' ? 'rgba(16,185,129,0.20)' :
                                           entry.status === 'error' ? 'rgba(239,68,68,0.20)' :
                                           entry.solId ? 'var(--border)' : 'rgba(245,158,11,0.25)'}`,
                    }}
                  >
                    {statusIcon || (
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: entry.solId ? 'var(--text-3)' : '#FBBF24' }} />
                    )}
                    <span className="text-xs flex-shrink-0 font-mono w-32 truncate" style={{ color: 'var(--text-2)' }} title={entry.file.name}>
                      {entry.file.name}
                    </span>
                    <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                      {(entry.file.size / 1024).toFixed(0)}KB
                    </span>
                    <span className="text-[10px] flex-shrink-0 font-mono" style={{ color: entry.fipNumero != null ? 'var(--accent)' : '#FBBF24' }}>
                      {entry.fipNumero != null ? `FIP-${String(entry.fipNumero).padStart(4, '0')}` : '—'}
                    </span>
                    {/* Selector de solicitação */}
                    {entry.status === 'pending' ? (
                      <select
                        value={entry.solId ?? ''}
                        onChange={e => changeSolId(idx, e.target.value)}
                        className="flex-1 text-xs rounded px-1.5 py-0.5 outline-none min-w-0"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)', maxWidth: 240 }}
                      >
                        <option value="">— Selecione a solicitação —</option>
                        {solicitacoes.map(s => (
                          <option key={s.id} value={s.id}>
                            FIP-{String(s.numero).padStart(4, '0')} — {s.fornecedor_razao_social?.slice(0, 30) || 'sem fornecedor'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-2)' }}>
                        {sol ? `FIP-${String(sol.numero).padStart(4, '0')} — ${sol.fornecedor_razao_social?.slice(0, 30) || ''}` : '—'}
                      </span>
                    )}
                    {entry.status === 'error' && (
                      <span className="text-[10px] flex-shrink-0 max-w-[120px] truncate" style={{ color: 'var(--red)' }} title={entry.erro}>
                        {entry.erro}
                      </span>
                    )}
                    {entry.status === 'pending' && (
                      <button onClick={() => removeEntry(idx)} style={{ color: 'var(--text-3)' }}>
                        <X className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Result summary */}
        {done && (
          <div
            className="p-4 rounded-xl flex items-start gap-3"
            style={{
              background: totalError > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
              border: `1px solid ${totalError > 0 ? 'rgba(245,158,11,0.30)' : 'rgba(16,185,129,0.30)'}`,
            }}
          >
            {totalError > 0
              ? <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#FBBF24' }} />
              : <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--green)' }} />}
            <div>
              <p className="font-semibold" style={{ color: totalError > 0 ? '#FBBF24' : 'var(--green)' }}>
                {totalDone} arquivo{totalDone !== 1 ? 's' : ''} enviado{totalDone !== 1 ? 's' : ''} com sucesso
                {totalError > 0 ? ` · ${totalError} com erro` : ''}
              </p>
              {totalError > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  Corrija os erros acima e tente de novo, ou use a página de edição da solicitação.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action */}
        {entries.length > 0 && !done && (
          <div className="flex items-center gap-3">
            <Button
              onClick={executarUpload}
              disabled={uploading || !canUpload || loadingSols}
              className="gap-2 text-white"
              style={{ background: canUpload ? 'linear-gradient(135deg, var(--accent), var(--accent-glow))' : 'var(--surface-3)' }}
            >
              {uploading ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Enviando...</>
              ) : (
                <><Upload className="w-4 h-4" />Enviar {mapped.length} arquivo{mapped.length !== 1 ? 's' : ''} mapeados</>
              )}
            </Button>
            {unmapped.length > 0 && (
              <p className="text-xs" style={{ color: '#FBBF24' }}>
                {unmapped.length} arquivo{unmapped.length !== 1 ? 's' : ''} sem correspondência — vincule manualmente acima
              </p>
            )}
          </div>
        )}

        {/* NF naming tip */}
        <Card style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)' }}>
          <CardContent className="pt-4 pb-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Convenção para Notas Fiscais (NFs)</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              NFs têm campos obrigatórios (número, valor, data, emitente) e devem ser lançadas pela tela de detalhes da solicitação.
              Para múltiplas NFs de um mesmo pedido, cada NF tem número diferente — nomeie como:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {[
                { ex: 'FIP-0042-NF-12345.pdf', desc: 'NF 12345 da solicitação 42' },
                { ex: 'FIP-0042-NF-12346.xml', desc: 'NF 12346 da mesma solicitação (XML)' },
              ].map(({ ex, desc }) => (
                <div key={ex} className="flex flex-col gap-0.5">
                  <code className="font-mono px-2 py-1 rounded" style={{ background: 'var(--surface-3)', color: '#10B981' }}>{ex}</code>
                  <span style={{ color: 'var(--text-3)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
