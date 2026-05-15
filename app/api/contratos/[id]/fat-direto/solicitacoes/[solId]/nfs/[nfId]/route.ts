import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarNotaFiscal3Way, NFMatchError } from '@/lib/db/fat-direto'
import { podeTransicionar, type NfStatus } from '@/lib/db/nf-status'
import { audit } from '@/lib/api/audit'
import { sendEmail } from '@/lib/email/send'
import { templateNfAguardandoAprovacao } from '@/lib/email/templates-nf-workflow'
import { cnpj, dataIso } from '@/lib/api/schema'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

/** Campos editáveis no reenvio de uma NF em correção. */
const Body = z.object({
  numero_nf: z.string().trim().min(1).max(50),
  emitente: z.string().max(500).optional(),
  cnpj_emitente: cnpj().optional(),
  valor: z.number().positive().finite(),
  data_emissao: dataIso(),
  data_recebimento: dataIso().optional(),
  data_vencimento: dataIso().optional(),
  descricao: z.string().max(2000).optional(),
  arquivo_url: z.string().url().optional(),
})

/** PATCH — contratada corrige e reenvia uma NF que estava em em_correcao. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string; nfId: string }> },
) {
  try {
    const { solId, nfId } = await params
    const auth = await assertPermissao('nf_fat_direto', 'lancar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const raw = await req.json()
    // Strings vazias em opcionais viram undefined (mesmo padrão do POST de NF).
    for (const k of ['cnpj_emitente', 'data_recebimento', 'data_vencimento', 'emitente', 'descricao', 'arquivo_url']) {
      if (typeof raw[k] === 'string' && raw[k].trim() === '') raw[k] = undefined
    }
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos.', details: parsed.error.issues }, { status: 400 })
    }
    const b = parsed.data

    const admin = createAdminClient()
    const { data: nf, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id, status, lancado_por_id')
      .eq('id', nfId)
      .single()
    if (error || !nf) return NextResponse.json({ error: 'NF não encontrada.' }, { status: 404 })
    if (!podeTransicionar(nf.status as NfStatus, 'aguardando_aprovacao')) {
      return NextResponse.json(
        { error: `NF no status "${nf.status}" não pode ser reenviada.` }, { status: 409 })
    }

    // Revalida o 3-way match com os dados corrigidos.
    await validarNotaFiscal3Way({
      solicitacao_id: solId,
      numero_nf: b.numero_nf,
      cnpj_emitente: b.cnpj_emitente,
      valor: b.valor,
      data_emissao: b.data_emissao,
    })

    const { error: upErr } = await admin
      .from('notas_fiscais_fat_direto')
      .update({
        numero_nf: b.numero_nf, emitente: b.emitente ?? null, cnpj_emitente: b.cnpj_emitente ?? null,
        valor: b.valor, data_emissao: b.data_emissao,
        data_recebimento: b.data_recebimento ?? null, data_vencimento: b.data_vencimento ?? null,
        descricao: b.descricao ?? null,
        ...(b.arquivo_url ? { arquivo_url: b.arquivo_url } : {}),
        status: 'aguardando_aprovacao', motivo_rejeicao: null,
      })
      .eq('id', nfId)
    if (upErr) throw upErr

    await audit({
      event: 'nf.reenviada', entity_type: 'nota_fiscal_fat_direto', entity_id: nfId,
      actor_id: auth.userId, actor_email: auth.userEmail,
      metadata: { numero_nf: b.numero_nf, solicitacao_id: solId },
    })

    // Notifica aprovadores (mesmo padrão do lançamento).
    try {
      const { data: sol } = await admin
        .from('solicitacoes_fat_direto').select('numero, numero_pedido_fip').eq('id', solId).single()
      const { data: aprovadores } = await admin
        .from('perfis').select('email').eq('perfil', 'admin').eq('ativo', true)
      const emails = (aprovadores || []).map((a: any) => a.email).filter(Boolean)
      if (emails.length > 0) {
        const pedidoCodigo = String((sol as any)?.numero_pedido_fip || (sol as any)?.numero || solId)
        const tpl = templateNfAguardandoAprovacao({
          numero_nf: b.numero_nf, pedido_codigo: pedidoCodigo,
          valor: b.valor, lancado_por: auth.userEmail ?? 'Contratada',
        })
        await sendEmail({ to: emails, subject: tpl.subject, html: tpl.html, tipo: 'nova_medicao' })
      }
    } catch (mailErr) {
      log.warn('nf_email_reenvio_falhou', { nfId, erro: String(mailErr) })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof NFMatchError) {
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail }, { status: 422 })
    }
    return apiError(e)
  }
}
