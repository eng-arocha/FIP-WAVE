'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Props {
  contratoId: string
}

interface ResultadoUpload {
  ok: true
  importacao_id: string
  totais: { qtd_linhas: number; total_nf: number; total_descontado: number; total_a_descontar: number }
  avisos: string[]
  macroItensDesconhecidos: string[]
  fornecedoresAmbiguos: number
}

export function UploadForm({ contratoId }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoUpload | null>(null)

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setErro(null)
    setResultado(null)
    if (f && !f.name.toLowerCase().endsWith('.xlsx')) {
      setErro('Só é aceito arquivo .xlsx (o relatório "Controle FIP INFORMAKON" exportado do ERP).')
      setArquivo(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setArquivo(f)
  }

  async function enviar() {
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    setResultado(null)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const res = await fetch(`/api/contratos/${contratoId}/informakon/upload`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || data?.error) {
        setErro(data?.error || `Falha ao importar (HTTP ${res.status}).`)
        return
      }
      setResultado(data as ResultadoUpload)
      setArquivo(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (e: any) {
      setErro(e?.message || 'Erro inesperado ao enviar o arquivo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={escolherArquivo}
          disabled={enviando}
          className="text-xs file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          style={{ color: 'var(--text-2)' }}
        />
        <Button onClick={enviar} disabled={!arquivo || enviando} loading={enviando} size="sm">
          <Upload className="w-3.5 h-3.5" />
          {enviando ? 'Importando…' : 'Importar relatório'}
        </Button>
      </div>

      {enviando && (
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          O relatório costuma ter ~10 mil linhas — a importação pode demorar um pouco. Não feche esta página.
        </p>
      )}

      {erro && (
        <div
          className="rounded-lg p-3 text-xs flex items-start gap-2"
          style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF4444' }}
        >
          <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{erro}</span>
        </div>
      )}

      {resultado && (
        <div className="space-y-3">
          <div
            className="rounded-lg p-3 text-xs flex items-start gap-2"
            style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)', color: '#10B981' }}
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Importação concluída: {resultado.totais.qtd_linhas} linha(s) de NF, total {formatCurrency(resultado.totais.total_nf)}
              {' '}({formatCurrency(resultado.totais.total_descontado)} já descontado, {formatCurrency(resultado.totais.total_a_descontar)} a descontar).
            </span>
          </div>

          {resultado.fornecedoresAmbiguos > 0 && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B' }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                {resultado.fornecedoresAmbiguos} nota(s) casaram com mais de um fornecedor e ficaram sem atribuição — confirme manualmente.
              </span>
            </div>
          )}

          {resultado.avisos.length > 0 && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>Avisos</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {resultado.macroItensDesconhecidos.length > 0 && (
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--text-1)' }}>
                Macro itens sem de-para ({resultado.macroItensDesconhecidos.length})
              </p>
              <p className="mb-1" style={{ color: 'var(--text-3)' }}>
                Essas linhas não foram associadas a nenhum grupo macro do contrato e por isso não entram na conciliação por grupo:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                {resultado.macroItensDesconhecidos.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
