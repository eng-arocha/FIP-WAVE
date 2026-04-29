import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { templateLiberacaoMedicaoFornecedor } from '@/lib/email/templates-medicoes'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'
import { calcularResumoFinanceiroObra } from '@/lib/db/resumo-financeiro-obra'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/email-preview?reenvio=true
 *
 * Retorna { subject, html, envolvidos } pro modal mostrar preview + lista
 * de destinatários antes de enviar.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão pra ver preview.' }, { status: check.status })
    }

    const { id: contratoId, medicaoId } = await params
    const url = new URL(req.url)
    const reenvio = url.searchParams.get('reenvio') === 'true'

    const admin = createAdminClient()

    // Medição + itens + contrato
    const { data: medicao } = await admin
      .from('medicoes')
      .select(`
        id, numero, periodo_referencia, valor_total, observacoes, data_aprovacao, data_submissao,
        contrato:contrato_id ( id, numero ),
        medicao_itens (
          quantidade_medida, valor_medido,
          detalhamento:detalhamentos ( codigo, descricao )
        )
      `)
      .eq('id', medicaoId)
      .single()

    if (!medicao) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })

    // Aprovador (preferência: usuário autenticado)
    const { data: perfilAprov } = await admin
      .from('perfis').select('nome').eq('id', check.userId).single()

    // Resumo financeiro consolidado
    const resumo = await calcularResumoFinanceiroObra({
      contrato_id: contratoId,
      medicao_id: medicaoId,
    })

    const tpl = templateLiberacaoMedicaoFornecedor({
      numero_medicao: (medicao as any).numero,
      periodo_referencia: (medicao as any).periodo_referencia ?? '—',
      data_aprovacao: (medicao as any).data_aprovacao ?? new Date().toISOString(),
      contrato_numero: (medicao as any).contrato?.numero ?? null,
      itens: ((medicao as any).medicao_itens || []).map((it: any) => ({
        codigo: it.detalhamento?.codigo ?? null,
        descricao: it.detalhamento?.descricao ?? '',
        qtde: it.quantidade_medida ?? null,
        valor_total: Number(it.valor_medido || 0),
      })),
      observacoes: (medicao as any).observacoes,
      resumo,
      aprovador_nome: (perfilAprov as any)?.nome ?? null,
      reenvio,
    })

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
