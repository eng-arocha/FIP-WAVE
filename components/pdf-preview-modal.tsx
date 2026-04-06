'use client'

import { X, ExternalLink, Download } from 'lucide-react'

interface PdfPreviewModalProps {
  url: string
  nome: string
  onClose: () => void
}

export function PdfPreviewModal({ url, nome, onClose }: PdfPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-4xl flex flex-col rounded-2xl overflow-hidden"
        style={{
          height: '88vh',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.48)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #EF4444, #F97316)' }}
            >
              PDF
            </span>
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>
              {nome}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir em nova aba"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
            >
              <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
            </a>
            <a
              href={url}
              download={nome}
              title="Baixar PDF"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
            </a>
            <button
              onClick={onClose}
              title="Fechar"
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-3)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* PDF iframe */}
        <iframe
          src={`${url}#toolbar=1&view=FitH`}
          className="flex-1 w-full border-0"
          title={nome}
        />
      </div>
    </div>
  )
}
