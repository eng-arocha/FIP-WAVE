import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { templateLiberacaoMedicaoFornecedor } from '@/lib/email/templates-medicoes'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'
import { calcularResumoFinanceiroObra } from '@/lib/db/resumo-financeiro-obra'
import { calcularInformaconData } from '@/lib/db/informacon-data'
import { agruparPorMacro } from '@/lib/data/grupos-macro'

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

    // Calcula NFs a emitir (FIP material + Wave serviço) e somatório FIP
    // por grupo macro a partir das linhas do informacon — chamada direta.
    let fipMaterial = 0
    let waveServico = 0
    let fipPorGrupoMacro: Array<{ grupo: number; nome: string; valor: number }> = []
    let ajustesAdmin: Array<{
      codigo: string
      descricao: string
      quantidade_anterior: number
      quantidade_nova: number
      motivo: string
      ajustado_por_nome: string | null
      ajustado_em: string
    }> = []
    const informaconData = await calcularInformaconData(admin, contratoId, medicaoId)
    if (informaconData) {
      const linhas = informaconData.linhas
      fipMaterial = linhas.reduce((s, l) => s + l.fip_faturar, 0)
      waveServico = linhas.reduce((s, l) => s + l.wave_servico, 0)
      fipPorGrupoMacro = agruparPorMacro(
        linhas
          .filter(l => l.fip_faturar > 0)
          .map(l => ({ codigo: l.codigo, valor: l.fip_faturar })),
      )

      // Convergência (A): retenção exibida no email vem do informacon-data
      resumo.retencao.valor = informaconData.totais.retencao
      resumo.retencao.base_retencao = informaconData.totais.base_retencao
      resumo.retencao.liquido_a_pagar = waveServico - informaconData.totais.retencao

      // Ajustes do admin (migration 061) — pega o último ajuste de cada item
      for (const l of linhas) {
        if (l.foi_ajustado_pelo_admin && l.ajustes_admin.length > 0) {
          const ultimo = l.ajustes_admin[l.ajustes_admin.length - 1]
          ajustesAdmin.push({
            codigo: l.codigo,
            descricao: l.descricao,
            quantidade_anterior: ultimo.quantidade_anterior,
            quantidade_nova: ultimo.quantidade_nova,
            motivo: ultimo.motivo,
            ajustado_por_nome: ultimo.ajustado_por_nome,
            ajustado_em: ultimo.ajustado_em,
          })
        }
      }
    }

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
      nfs_a_emitir: {
        fip_material: { valor: fipMaterial },
        wave_servico: { valor: waveServico },
      },
      fip_por_grupo_macro: fipPorGrupoMacro,
      ajustes_admin: ajustesAdmin.length > 0 ? ajustesAdmin : undefined,
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
