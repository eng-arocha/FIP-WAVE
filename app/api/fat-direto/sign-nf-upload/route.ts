import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const BUCKET = 'faturamento-direto'

/**
 * Gera signed upload URL pra cliente subir arquivo de NF DIRETO ao Supabase
 * Storage, sem passar pelo Vercel (que tem limite de ~4.5MB no body).
 *
 * Fluxo:
 *   1. Cliente chama este endpoint com solId + extensão
 *   2. Servidor (admin) cria signed upload URL apontando pro path correto
 *   3. Cliente faz PUT direto no Supabase com o token
 *   4. Cliente posta NF (JSON) com `arquivo_url` já preenchida
 *
 * Segurança:
 *   - Exige usuário autenticado (cookies da sessão Supabase)
 *   - Path canônico pro bucket; nome com timestamp evita collision
 *   - O token expira logo após criação; só serve pra UMA upload
 */
const Body = z.object({
  solId: z.string().uuid(),
  ext: z.string().regex(/^[a-zA-Z0-9]{1,5}$/, 'Extensão inválida'),
})

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.issues }, { status: 400 })
    }
    const { solId, ext } = parsed.data

    const path = `nfs-fat-direto/${solId}/${Date.now()}.${ext.toLowerCase()}`

    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path)
    if (error) throw error

    // URL pública final do arquivo (vai ser registrada no DB pela rota de NF)
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
