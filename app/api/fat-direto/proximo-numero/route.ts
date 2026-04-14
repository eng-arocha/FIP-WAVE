import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/fat-direto/proximo-numero
 *
 * Retorna o próximo número PEDIDO-FIP que será atribuído.
 * NÃO consome a sequence (usa pg_sequence info), apenas espia.
 *
 * Usado pela UI pra mostrar "PEDIDO-FIP-0042" antes do submit,
 * confirmando ao usuário qual número será gerado.
 *
 * Uso opcional: se a UI mandar `numero_pedido_fip` no body do POST,
 * o trigger respeita; se não mandar, atribui o próximo da sequence.
 */
export async function GET() {
  try {
    const admin = createAdminClient()
    // pg_sequences é uma view que mostra last_value sem consumir
    const { data, error } = await admin.rpc('next_pedido_fip_preview' as any)
    if (error) {
      // Fallback: lê o MAX atual + 1 (menos preciso mas funciona sem migration)
      const { data: max } = await admin
        .from('solicitacoes_fat_direto')
        .select('numero_pedido_fip')
        .order('numero_pedido_fip', { ascending: false, nullsFirst: false })
        .limit(1)
        .single()
      const proximo = ((max as any)?.numero_pedido_fip ?? 0) + 1
      return NextResponse.json({
        proximo,
        formatado: `FIP-${String(proximo).padStart(4, '0')}`,
        source: 'fallback',
      })
    }
    return NextResponse.json({
      proximo: data,
      formatado: `FIP-${String(data).padStart(4, '0')}`,
      source: 'sequence',
    })
  } catch (e: any) {
    return apiError(e)
  }
}
