import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { aprovarNotaFiscal, rejeitarNotaFiscal } from '@/lib/db/nf-workflow'
import { NFMatchError } from '@/lib/db/fat-direto'
import { sendEmail } from '@/lib/email/send'
import { templateNfAprovada, templateNfEmCorrecao } from '@/lib/email/templates-nf-workflow'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

const Body = z.object({
  acao: z.enum(['aprovar', 'rejeitar']),
  motivo: z.string().trim().max(1000).optional(),
})

/**
 * POST — o contratante aprova ou rejeita o lançamento de uma NF.
 * Aprovar revalida o 3-way match (saldo pode ter mudado); rejeitar exige motivo.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string; nfId: string }> },
) {
  try {
    const { solId, nfId } = await params
    const auth = await assertPermissao('nf_fat_direto', 'aprovar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.issues }, { status: 400 })
    }
    const { acao, motivo } = parsed.data
    const ator = { actor_id: auth.userId, actor_email: auth.userEmail }

    if (acao === 'rejeitar' && !(motivo ?? '').trim()) {
      return NextResponse.json({ error: 'Motivo é obrigatório para rejeitar.' }, { status: 400 })
    }

    if (acao === 'aprovar') await aprovarNotaFiscal(nfId, ator)
    else await rejeitarNotaFiscal(nfId, motivo as string, ator)

    // Notifica a contratada (quem lançou). Falha de e-mail não derruba a ação.
    try {
      const admin = createAdminClient()
      const { data: nf } = await admin
        .from('notas_fiscais_fat_direto')
        .select('numero_nf, valor, lancado_por_id')
        .eq('id', nfId)
        .single()
      const { data: sol } = await admin
        .from('solicitacoes_fat_direto')
        .select('numero, numero_pedido_fip')
        .eq('id', solId)
        .single()
      let emailContratada: string | null = null
      if ((nf as any)?.lancado_por_id) {
        const { data: perfil } = await admin
          .from('perfis').select('email').eq('id', (nf as any).lancado_por_id).single()
        emailContratada = (perfil as any)?.email ?? null
      }
      if (emailContratada && nf) {
        const pedidoCodigo = String((sol as any)?.numero_pedido_fip || (sol as any)?.numero || solId)
        const tpl = acao === 'aprovar'
          ? templateNfAprovada({ numero_nf: (nf as any).numero_nf, pedido_codigo: pedidoCodigo, valor: Number((nf as any).valor) })
          : templateNfEmCorrecao({ numero_nf: (nf as any).numero_nf, pedido_codigo: pedidoCodigo, motivo: (motivo ?? '').trim() })
        await sendEmail({
          to: emailContratada, subject: tpl.subject, html: tpl.html,
          tipo: acao === 'aprovar' ? 'aprovado' : 'ajuste_solicitado',
        })
      }
    } catch (mailErr) {
      log.warn('nf_email_decisao_falhou', { nfId, acao, erro: String(mailErr) })
    }

    return NextResponse.json({ ok: true, acao })
  } catch (e: any) {
    if (e instanceof NFMatchError) {
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail }, { status: 422 })
    }
    return apiError(e)
  }
}
