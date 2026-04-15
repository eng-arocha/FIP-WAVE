import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { templateSolicitacaoAprovadaFornecedor } from '@/lib/email/templates-fat-direto'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'

/**
 * GET /api/contratos/[id]/fat-direto/solicitacoes/[solId]/email-preview?reenvio=true
 *
 * Retorna:
 *   - subject: assunto do email
 *   - html: HTML renderizado (pra mostrar num iframe de preview)
 *   - envolvidos: lista de usuários atrelados ao contrato (pro checkbox)
 *
 * Usado pelo modal de envio de notificação: mostra preview + permite
 * escolher quais envolvidos recebem o email antes de disparar.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão pra ver preview.' }, { status: check.status })
    }

    const { id: contratoId, solId } = await params
    const url = new URL(req.url)
    const reenvio = url.searchParams.get('reenvio') === 'true'

    const admin = createAdminClient()

    // Solicitação com itens
    const { data: sol } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        numero_pedido_fip, numero, valor_total, observacoes,
        fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
        aprovador_id,
        itens:itens_solicitacao_fat_direto (
          descricao, qtde_solicitada, valor_total
        )
      `)
      .eq('id', solId)
      .single()

    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

    // Nome do aprovador (se houver) — senão usa o próprio autenticado
    const aprovadorId = (sol as any).aprovador_id || check.userId
    const { data: perfilAprov } = await admin
      .from('perfis').select('nome').eq('id', aprovadorId).single()

    // Renderiza o template
    const tpl = templateSolicitacaoAprovadaFornecedor({
      numero_fip: (sol as any).numero_pedido_fip ?? (sol as any).numero,
      fornecedor_razao_social: (sol as any).fornecedor_razao_social,
      fornecedor_cnpj: (sol as any).fornecedor_cnpj,
      fornecedor_contato: (sol as any).fornecedor_contato,
      valor_total: Number((sol as any).valor_total || 0),
      itens: ((sol as any).itens || []).map((it: any) => ({
        descricao: it.descricao,
        qtde: it.qtde_solicitada,
        valor_total: it.valor_total,
      })),
      observacoes: (sol as any).observacoes,
      aprovador_nome: (perfilAprov as any)?.nome ?? null,
      reenvio,
    })

    // Lista de envolvidos (usuários atrelados ao contrato)
    const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)

    return NextResponse.json({
      subject: tpl.subject,
      html: tpl.html,
      envolvidos: envolvidos.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        perfil: u.perfil,
      })),
    })
  } catch (e: any) {
    return apiError(e)
  }
}
