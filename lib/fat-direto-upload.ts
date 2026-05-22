import { createClient } from '@/lib/supabase/client'

const BUCKET = 'faturamento-direto'

export interface AnexoPedido {
  nome: string
  url: string
  tamanho: number
  tipo: string
}

/**
 * Faz upload dos anexos do pedido DIRETO ao Supabase Storage via signed URL
 * e depois registra a lista em pedido_anexos.
 *
 * Por que direto: o endpoint multipart /api/fat-direto/upload passa pelo
 * Vercel, que tem limite de ~4.5MB no body. Varios arquivos juntos (pedido
 * + docs do fornecedor) estouravam o limite e o upload falhava em silencio.
 * Subindo direto pro Storage o limite passa a ser o do bucket (50MB/arquivo).
 *
 * Lanca Error com mensagem amigavel em qualquer falha — o chamador deve
 * capturar e exibir pro usuario (NAO engolir).
 */
export async function uploadAnexosPedido(solId: string, files: File[]): Promise<AnexoPedido[]> {
  if (files.length === 0) return []

  const supabase = createClient()
  const uploaded: AnexoPedido[] = []

  for (const file of files) {
    // 1. Pede signed upload URL ao servidor
    const signRes = await fetch('/api/fat-direto/sign-pedido-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solId, nome: file.name }),
    })
    if (!signRes.ok) {
      const e = await signRes.json().catch(() => ({}))
      throw new Error(e.error || `Falha ao preparar upload de "${file.name}".`)
    }
    const { path, token, publicUrl } = await signRes.json()

    // 2. Sobe o arquivo DIRETO pro Supabase Storage (bypassa o Vercel)
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(path, token, file)
    if (upErr) {
      throw new Error(`Falha no upload de "${file.name}": ${upErr.message}`)
    }

    uploaded.push({
      nome: file.name,
      url: publicUrl,
      tamanho: file.size,
      tipo: file.type || 'application/octet-stream',
    })
  }

  // 3. Registra a lista de anexos no banco (merge com os existentes)
  const regRes = await fetch('/api/fat-direto/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solicitacao_id: solId, tipo: 'pedido', anexos: uploaded }),
  })
  if (!regRes.ok) {
    const e = await regRes.json().catch(() => ({}))
    throw new Error(e.error || 'Falha ao registrar os anexos no pedido.')
  }

  return uploaded
}
