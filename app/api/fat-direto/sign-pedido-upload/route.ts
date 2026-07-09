import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const BUCKET = 'faturamento-direto'

/**
 * Gera signed upload URL pra cliente subir um ANEXO DO PEDIDO direto ao
 * Supabase Storage, sem passar pelo Vercel (que tem limite de ~4.5MB no
 * body — varios arquivos juntos estouravam e o upload falhava em silencio).
 *
 * Fluxo:
 *   1. Cliente chama este endpoint com solId + nome do arquivo
 *   2. Servidor (admin) cria signed upload URL apontando pro path correto
 *   3. Cliente faz upload direto no Supabase com o token (uploadToSignedUrl)
 *   4. Cliente registra a lista de anexos via POST /api/fat-direto/upload (JSON)
 *
 * Espelha sign-nf-upload — mesma estrategia, path de pedido.
 */
const Body = z.object({
  solId: z.string().uuid(),
  nome: z.string().min(1).max(200),
})

/** Sanitiza nome de arquivo: remove acentos e caracteres problematicos. */
function sanitizeName(nome: string): string {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .slice(-120) || 'arquivo'
}

export async function POST(req: Request) {
  const negado = await requirePermissao('documentos', 'criar')
  if (negado) return negado
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.issues }, { status: 400 })
    }
    const { solId, nome } = parsed.data

    const path = `pedidos/${solId}/${Date.now()}-${sanitizeName(nome)}`

    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (error) throw error

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)

    return NextResponse.json({
      bucket: BUCKET,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: pub.publicUrl,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
