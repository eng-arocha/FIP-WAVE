'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import {
  Upload, File, FileText, Trash2, Download, Loader2,
  FolderOpen, CloudUpload, CheckCircle2, AlertCircle,
  Receipt, FileArchive, Presentation, ClipboardList,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

const TIPOS = [
  { value: 'contrato_assinado', label: 'Contrato Assinado', icon: FileText, color: '#8B5CF6' },
  { value: 'aditivo',          label: 'Aditivo',            icon: FileText, color: '#6366F1' },
  { value: 'nota_fiscal',      label: 'Nota Fiscal',        icon: Receipt,  color: '#F59E0B' },
  { value: 'boleto',           label: 'Boleto',             icon: Receipt,  color: '#EF4444' },
  { value: 'relatorio',        label: 'Relatório',          icon: ClipboardList, color: '#10B981' },
  { value: 'projeto',          label: 'Projeto/Planta',     icon: Presentation, color: '#3B82F6' },
  { value: 'ata',              label: 'Ata de Reunião',     icon: FileArchive, color: '#06B6D4' },
  { value: 'outro',            label: 'Outro',              icon: File,     color: '#64748B' },
]

function formatBytes(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getTipoConfig(tipo: string) {
  return TIPOS.find(t => t.value === tipo) ?? TIPOS[TIPOS.length - 1]
}

export default function DocumentosPage() {
  const { id } = useParams<{ id: string }>()
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [selectedTipo, setSelectedTipo] = useState('outro')
  const [descricao, setDescricao] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocs = useCallback(async () => {
    const res = await fetch(`/api/contratos/${id}/documentos`)
    if (res.ok) setDocs(await res.json())
    setLoading(false)
  }, [id])

  useEffect(() => { loadDocs() }, [loadDocs])

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadError('')
    setUploadSuccess(false)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tipo', selectedTipo)
    fd.append('descricao', descricao)
    try {
      const res = await fetch(`/api/contratos/${id}/documentos`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json()
        setUploadError(d.error ?? 'Erro ao enviar')
      } else {
        setUploadSuccess(true)
        setDescricao('')
        setTimeout(() => setUploadSuccess(false), 3000)
        await loadDocs()
      }
    } catch {
      setUploadError('Erro de rede')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deleteDoc(docId: string) {
    setDeletingId(docId)
    await fetch(`/api/contratos/${id}/documentos?docId=${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
    setDeletingId(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [selectedTipo, descricao]) // eslint-disable-line

  const docsFiltrados = filtroTipo === 'todos' ? docs : docs.filter(d => d.tipo === filtroTipo)

  const totalSize = docs.reduce((s, d) => s + (d.tamanho_bytes ?? 0), 0)

  return (
    <div className="flex-1 overflow-auto theme-page">
      <Topbar
        title={
          <span className="flex items-center gap-2">
            <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
            </span>
            Documentos
          </span>
        }
        subtitle={`${docs.length} arquivo(s) · ${formatBytes(totalSize)}`}
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* Upload area */}
        <div
          className="rounded-2xl p-1 transition-all duration-200"
          style={{
            background: dragOver
              ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(6,182,212,0.1))'
              : 'var(--surface-2)',
            border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: dragOver ? 'var(--accent)' : 'var(--surface-3)' }}
            >
              <CloudUpload
                className={`w-8 h-8 transition-colors ${dragOver ? 'text-white' : ''}`}
                strokeWidth={1.5}
                style={{ color: dragOver ? 'white' : 'var(--text-3)' }}
              />
            </div>
            <p className="font-semibold text-base mb-1" style={{ color: 'var(--text-1)' }}>
              {dragOver ? 'Solte para enviar' : 'Arraste um arquivo ou clique para selecionar'}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>
              PDF, Word, Excel, Imagens — até 50 MB
            </p>

            {/* Options row */}
            <div className="flex flex-wrap gap-3 justify-center mb-4">
              {/* Tipo selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Tipo:</span>
                <div className="flex flex-wrap gap-1">
                  {TIPOS.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTipo(t.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                      style={selectedTipo === t.value
                        ? { background: t.color, color: 'white' }
                        : { background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Descrição */}
            <input
              type="text"
              placeholder="Descrição opcional (ex: Medição 02, NF 1234...)"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              className="theme-input w-full max-w-sm px-3 py-2 text-sm text-center mx-auto block mb-4"
              style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: uploading ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> Enviando...</>
              ) : uploadSuccess ? (
                <><CheckCircle2 className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--green)' }} /> Enviado!</>
              ) : (
                <><Upload className="w-4 h-4" strokeWidth={1.5} /> Selecionar Arquivo</>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
            />

            {uploadError && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm" style={{ color: 'var(--red)' }}>
                <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
                {uploadError}
              </div>
            )}
          </div>
        </div>

        {/* Filter + list */}
        <div>
          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>Filtrar:</span>
            <button
              onClick={() => setFiltroTipo('todos')}
              className="px-3 py-1 rounded-full text-xs font-medium transition-all"
              style={filtroTipo === 'todos'
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              Todos ({docs.length})
            </button>
            {TIPOS.filter(t => docs.some(d => d.tipo === t.value)).map(t => (
              <button
                key={t.value}
                onClick={() => setFiltroTipo(t.value)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={filtroTipo === t.value
                  ? { background: t.color, color: 'white' }
                  : { background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              >
                {t.label} ({docs.filter(d => d.tipo === t.value).length})
              </button>
            ))}
          </div>

          {/* Document list */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin mr-2" style={{ color: 'var(--accent)' }} />
              <span style={{ color: 'var(--text-2)' }}>Carregando documentos...</span>
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <FolderOpen className="w-12 h-12 mx-auto mb-3" strokeWidth={1} style={{ color: 'var(--border)' }} />
              <p className="font-medium" style={{ color: 'var(--text-2)' }}>Nenhum documento</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Faça upload do primeiro arquivo acima</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docsFiltrados.map(doc => {
                const tipoConfig = getTipoConfig(doc.tipo)
                const TipoIcon = tipoConfig.icon
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl transition-all group"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    {/* Icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${tipoConfig.color}18` }}
                    >
                      <TipoIcon className="w-5 h-5" strokeWidth={1.5} style={{ color: tipoConfig.color }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{doc.nome_original}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: `${tipoConfig.color}18`, color: tipoConfig.color }}
                        >
                          {tipoConfig.label}
                        </span>
                        {doc.descricao && (
                          <span className="text-xs truncate max-w-[200px]" style={{ color: 'var(--text-3)' }}>{doc.descricao}</span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {formatBytes(doc.tamanho_bytes)} · {formatDate(doc.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg transition-colors"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
                          title="Baixar / Visualizar"
                        >
                          <Download className="w-4 h-4" strokeWidth={1.5} />
                        </a>
                      )}
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        disabled={deletingId === doc.id}
                        className="p-2 rounded-lg transition-colors"
                        style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
                        title="Excluir"
                      >
                        {deletingId === doc.id
                          ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                          : <Trash2 className="w-4 h-4" strokeWidth={1.5} />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
