import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin, getUsuarioLogado } from '@/lib/api/auth'
import { encerrarSolicitacao, EncerramentoError } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'
import { sendEmail } from '@/lib/email/send'
import { templatePedidoEncerrado } from '@/lib/email/templates-fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

const Body = z.object({
  motivo: z.string().trim().min(3, 'Motivo é obrigatório (mín. 3 caracteres).').max(2000),
  devolucoes: z.array(z.object({
    item_id: z.string().uuid(),
    valor: z.number().min(0).finite(),
  })).optional(),
  /** Se true e destinatarios_ids preenchido, dispara notificação interna por e-mail. */
  notificar_envolvidos: z.boolean().optional(),
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { id: contratoId, solId } = await params

    // Apenas admin pode encerrar (decisão de design)
    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    const isAdmin = await assertAdmin()
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Apenas administradores podem encerrar pedidos.', code: 'NAO_PERMITIDO' },
        { status: 403 },
      )
    }

    const json = await req.json()
    const parsed = Body.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: parsed.error.issues },
        { status: 400 },
      )
    }
    const body = parsed.data

    // Encerra (lança EncerramentoError em caso de violação de regra)
    const resultado = await encerrarSolicitacao({
      solicitacao_id: solId,
      encerrado_por_id: user.id,
      motivo: body.motivo,
      devolucoes: body.devolucoes,
    })

    // Notificação interna (opcional)
    let email: { ok: boolean; qtd?: number; erro?: string } = { ok: false }
    const TOLERANCE = 100 // R$100: tolerância para "saldo zerado" — sob esse valor, não pergunta sobre email
    const querNotificar = body.notificar_envolvidos === true
                       && resultado.saldo_devolvido > TOLERANCE
                       && (body.destinatarios_ids?.length ?? 0) > 0
    if (querNotificar) {
      try {
        email = await dispararEmailEncerramento({
          contratoId,
          solId,
          encerradoPorId: user.id,
          encerradoPorNome: await getNomeUsuario(user.id),
          destinatariosIds: body.destinatarios_ids!,
          resultado,
        })
      } catch (e: any) {
        log.warn('email_encerramento_falhou', { solId, error: e?.message })
        email = { ok: false, erro: e?.message || 'falha ao enviar email' }
      }
    }

    return NextResponse.json({
      ok: true,
      saldo_devolvido: resultado.saldo_devolvido,
      total_nfs: resultado.total_nfs,
      valor_original: resultado.valor_original,
      qtd_itens_devolvidos: resultado.devolucoes_aplicadas.length,
      email,
    })
  } catch (e: any) {
    if (e instanceof EncerramentoError) {
      return NextResponse.json(
        { error: e.message, code: e.code, detail: e.detail },
        { status: e.code === 'NAO_PERMITIDO' ? 403 : 422 },
      )
    }
    return apiError(e)
  }
}

async function getNomeUsuario(id: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('perfis').select('nome').eq('id', id).single()
    return (data as any)?.nome ?? null
  } catch {
    return null
  }
}

async function dispararEmailEncerramento(args: {
  contratoId: string
  solId: string
  encerradoPorId: string
  encerradoPorNome: string | null
  destinatariosIds: string[]
  resultado: Awaited<ReturnType<typeof encerrarSolicitacao>>
}): Promise<{ ok: boolean; qtd?: number; erro?: string }> {
  const admin = createAdminClient()

  // Carrega dados do pedido pra preencher o template
  const { data: sol } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id, numero, numero_pedido_fip, fornecedor_razao_social, fornecedor_cnpj, data_encerramento,
      itens:itens_solicitacao_fat_direto(
        id, descricao,
        tarefa:tarefa_id(codigo)
      )
    `)
    .eq('id', args.solId)
    .single()

  if (!sol) return { ok: false, erro: 'solicitação não encontrada' }

  // Resolve emails dos destinatários (valida vínculo com o contrato)
  const { data: vinculos } = await admin
    .from('usuarios_contratos')
    .select('usuario_id, perfis:usuario_id(id, email, nome)')
    .eq('contrato_id', args.contratoId)
    .in('usuario_id', args.destinatariosIds)

  const emails: string[] = []
  for (const v of (vinculos || []) as any[]) {
    const e = v.perfis?.email
    if (e) emails.push(e)
  }
  if (emails.length === 0) return { ok: false, erro: 'nenhum destinatário válido' }

  // Mapa: item_id → descricao + codigo
  const itemMap = new Map<string, { descricao: string; codigo?: string | null }>()
  for (const it of (sol as any).itens || []) {
    itemMap.set(it.id, { descricao: it.descricao, codigo: it.tarefa?.codigo ?? null })
  }

  const tpl = templatePedidoEncerrado({
    numero_fip: (sol as any).numero_pedido_fip ?? (sol as any).numero,
    fornecedor_razao_social: (sol as any).fornecedor_razao_social,
    fornecedor_cnpj: (sol as any).fornecedor_cnpj,
    valor_original: args.resultado.valor_original,
    total_nfs: args.resultado.total_nfs,
    saldo_devolvido: args.resultado.saldo_devolvido,
    motivo: null, // o motivo foi gravado no pedido; pode ser incluído via consulta extra se desejado
    encerrado_por_nome: args.encerradoPorNome,
    data_encerramento: (sol as any).data_encerramento || new Date().toISOString(),
    devolucoes: args.resultado.devolucoes_aplicadas.map(d => ({
      descricao: itemMap.get(d.item_id)?.descricao ?? d.descricao ?? 'Item',
      valor: d.valor,
      codigo_detalhamento: itemMap.get(d.item_id)?.codigo ?? null,
    })),
  })

  const envio = await sendEmail({
    to: emails,
    subject: tpl.subject,
    html: tpl.html,
    tipo: 'encerrado',
  })
  if (!envio.success) {
    return { ok: false, qtd: emails.length, erro: envio.error || 'Falha ao enviar' }
  }
  return { ok: true, qtd: emails.length }
}
