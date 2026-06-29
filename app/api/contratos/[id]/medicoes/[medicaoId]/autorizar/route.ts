import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { autorizarMedicao } from '@/lib/db/medicoes'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { assertMfaForRole } from '@/lib/api/mfa'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/contratos/[id]/medicoes/[medicaoId]/autorizar
 *
 * PORTÃO 1 do fluxo de medição. A equipe avaliou a execução física e
 * LIBERA a emissão da NF de MATERIAL FIP (faturamento direto). Não libera
 * ainda a NF de serviço da Wave — isso é o portão 2 (`/aprovar`), que só
 * abre depois que a NF de material for lançada no sistema.
 *
 * Efeitos:
 *   1) status submetido/em_analise → autorizado (+ data/autor da autorização)
 *   2) Gera (ou vincula) o pedido FIP de MATERIAL:
 *        - Por padrão, cria 1 rascunho fip_material com os itens fip_faturar>0
 *        - Se `vincular_pedido_fip_id` vier no body, vincula esse pedido
 *          EXISTENTE à medição (caso FIP-0017: faturamento direto avulso)
 *          e NÃO cria rascunho novo.
 *
 * Permissão: `medicoes.aprovar`. Exige MFA (quando MFA_ENFORCED).
 */

const Body = z.object({
  comentario: z.string().max(2000).optional().default(''),
  /** Caso FIP-0017: vincular um pedido fat-direto AVULSO já existente como
   *  cobertura do material desta medição, em vez de criar rascunho novo. */
  vincular_pedido_fip_id: z.string().uuid().optional(),
})

const STATUS_PERMITIDOS = new Set(['submetido', 'em_analise'])

export async function POST(req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem autorizar medições.' },
        { status: check.status },
      )
    }

    const mfa = await assertMfaForRole('aprovador')
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.reason, code: 'MFA_REQUIRED' }, { status: 403 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { comentario, vincular_pedido_fip_id } = parsed.data
    const { id: contratoId, medicaoId } = await params

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    // Valida status atual da medição
    const { data: med, error: medErr } = await admin
      .from('medicoes')
      .select('id, status, numero, contrato_id')
      .eq('id', medicaoId)
      .single()
    if (medErr || !med) return apiError('Medição não encontrada.', { status: 404 })
    if ((med as any).contrato_id !== contratoId) {
      return apiError('Medição não pertence ao contrato informado.', { status: 400 })
    }
    if (!STATUS_PERMITIDOS.has((med as any).status)) {
      return NextResponse.json(
        {
          error: (med as any).status === 'autorizado'
            ? 'Medição já autorizada. Use "Aprovar emissão NF serviço" (portão 2).'
            : `Não é possível autorizar medição com status "${(med as any).status}".`,
          code: 'STATUS_INVALIDO',
        },
        { status: 409 },
      )
    }

    const { data: perfil } = await admin
      .from('perfis')
      .select('nome, email')
      .eq('id', check.userId)
      .single()
    const autorizadorNome = perfil?.nome ?? check.userEmail ?? 'Autorizador'
    const autorizadorEmail = perfil?.email ?? check.userEmail ?? ''

    // === Transição de status (portão 1) ===
    await autorizarMedicao(medicaoId, autorizadorNome, autorizadorEmail, check.userId, comentario)

    await audit({
      event: 'medicao.autorizada',
      entity_type: 'medicao',
      entity_id: medicaoId,
      actor_id: check.userId,
      actor_nome: autorizadorNome,
      actor_email: autorizadorEmail,
      metadata: { comentario: comentario || null, vincular_pedido_fip_id: vincular_pedido_fip_id || null },
      request: req,
    })

    // === Pedido FIP de material: vincular existente OU criar rascunho ===
    let pedidoFipId: string | null = null
    let pedidoFipValor: number | null = null
    let viaAvulso = false

    try {
      if (vincular_pedido_fip_id) {
        // Caso FIP-0017: vincula pedido fat-direto avulso existente
        const { data: ped } = await admin
          .from('solicitacoes_fat_direto')
          .select('id, valor_total, status, contrato_id')
          .eq('id', vincular_pedido_fip_id)
          .single()
        if (!ped || (ped as any).contrato_id !== contratoId) {
          return apiError('Pedido FIP para vínculo não encontrado neste contrato.', { status: 400 })
        }
        pedidoFipId = (ped as any).id
        pedidoFipValor = Number((ped as any).valor_total ?? 0)
        viaAvulso = true
      } else {
        // Caminho padrão: cria rascunho fip_material a partir do Informakon
        const { calcularInformaconData } = await import('@/lib/db/informacon-data')
        const { criarSolicitacaoRascunhoDeMedicao } = await import('@/lib/db/fat-direto')
        const informacon = await calcularInformaconData(admin, contratoId, medicaoId)
        const itensFip = (informacon?.linhas ?? [])
          .filter(l => l.fip_faturar > 0)
          .map(l => ({
            detalhamento_id: l.detalhamento_id,
            descricao: l.descricao,
            valor_total: l.fip_faturar,
          }))
        if (itensFip.length > 0) {
          const sol = await criarSolicitacaoRascunhoDeMedicao({
            contrato_id: contratoId,
            solicitante_id: check.userId,
            medicao_id: medicaoId,
            medicao_numero: (med as any).numero,
            data_aprovacao: new Date().toISOString(),
            tipo: 'fip_material',
            aprovador_id: check.userId,
            itens: itensFip,
          })
          pedidoFipId = sol.id
          pedidoFipValor = Number(sol.valor_total ?? 0)
        }
      }

      // Vincula o pedido (criado ou avulso) à medição — resiliente à 073 ausente
      if (pedidoFipId) {
        const upd = await admin
          .from('medicoes')
          .update({ material_fat_direto_id: pedidoFipId, material_via_pedido_avulso: viaAvulso })
          .eq('id', medicaoId)
        if (upd.error) {
          const msg = (upd.error as any).message || ''
          if (!(msg.includes('material_fat_direto_id') || msg.includes('material_via_pedido_avulso') || (upd.error as any).code === 'PGRST204')) {
            throw upd.error
          }
          log.warn('migration_073_pendente_vinculo_material', { medicaoId, error: msg })
        }
        await audit({
          event: viaAvulso
            ? 'medicao.material_vinculado_pedido_avulso'
            : 'solicitacao_fat_direto.rascunho_material_criado_no_portao1',
          entity_type: 'solicitacao_fat_direto',
          entity_id: pedidoFipId,
          actor_id: check.userId,
          actor_nome: autorizadorNome,
          actor_email: autorizadorEmail,
          metadata: { medicao_id: medicaoId, valor_total: pedidoFipValor, via_avulso: viaAvulso },
          request: req,
        })
      }
    } catch (e: any) {
      log.warn('portao1_material_falhou', { medicaoId, error: e?.message })
    }

    return NextResponse.json({
      ok: true,
      status: 'autorizado',
      pedido_fip_material: pedidoFipId
        ? { id: pedidoFipId, valor_total: pedidoFipValor, via_avulso: viaAvulso }
        : null,
      proximo_passo: pedidoFipId
        ? 'Lance a NF de material no sistema; depois use "Aprovar emissão NF serviço".'
        : 'Sem material a faturar — pode aprovar a emissão da NF de serviço.',
    })
  } catch (e: any) {
    return apiError(e)
  }
}
