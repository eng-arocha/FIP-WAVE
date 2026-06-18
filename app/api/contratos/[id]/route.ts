import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getContrato, getContratoResumo, updateContrato } from '@/lib/db/contratos'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [contrato, resumo] = await Promise.all([
      getContrato(id),
      getContratoResumo(id).catch(() => null),
    ])

    // Subtract approved fat-direto NFs from saldo (vw_resumo_contrato only counts medições de serviço)
    const admin = createAdminClient()
    const { data: solsAprov } = await admin
      .from('solicitacoes_fat_direto')
      .select('id')
      .eq('contrato_id', id)
      .eq('status', 'aprovado')
    const solIds = (solsAprov || []).map((s: any) => s.id)
    let fatDiretoAprovado = 0
    if (solIds.length > 0) {
      const { data: nfs } = await admin
        .from('notas_fiscais_fat_direto')
        .select('valor')
        .in('solicitacao_id', solIds)
        .neq('status', 'cancelada')
      fatDiretoAprovado = (nfs || []).reduce((acc: number, nf: any) => acc + (nf.valor || 0), 0)
    }

    const valorContratado: number = (resumo as any)?.valor_contratado ?? (contrato as any)?.valor_total ?? 0
    const valorMedido: number = (resumo as any)?.valor_medido ?? 0
    const saldo = valorContratado - valorMedido - fatDiretoAprovado

    return NextResponse.json({ ...contrato, ...resumo, saldo, fat_direto_aprovado: fatDiretoAprovado })
  } catch (e: any) {
    return apiError(e)
  }
}

/**
 * Body do PATCH. Todos os campos opcionais — só grava os que vierem.
 * valor_total NÃO é editável aqui (vem dos grupos).
 * Seção `contratante` / `contratado` são edições opcionais na tabela `empresas`
 * (os contratos apontam pra essas empresas via contratante_id/contratado_id).
 */
const PatchBody = z.object({
  numero: z.string().min(1).max(100).optional(),
  descricao: z.string().max(2000).optional(),
  escopo: z.string().max(5000).nullable().optional(),
  objeto: z.string().max(2000).nullable().optional(),
  local_obra: z.string().max(500).nullable().optional(),
  fiscal_obra: z.string().max(200).nullable().optional(),
  email_fiscal: z.string().email().max(200).nullable().optional(),
  data_inicio: z.string().nullable().optional(),
  data_fim: z.string().nullable().optional(),
  status: z.enum(['rascunho', 'ativo', 'suspenso', 'encerrado', 'cancelado']).optional(),
  observacoes: z.string().max(5000).nullable().optional(),
  // Tolerância (R$) para divergência de valor de NF de fat-direto
  tolerancia_nf_valor: z.number().min(0).max(100000).optional(),
  // Edições opcionais nas empresas vinculadas
  contratante: z.object({
    razao_social: z.string().min(1).max(300).optional(),
    cnpj: z.string().max(20).optional(),
    endereco: z.string().max(500).nullable().optional(),
    telefone: z.string().max(50).nullable().optional(),
    email: z.string().email().max(200).nullable().optional(),
  }).optional(),
  contratado: z.object({
    razao_social: z.string().min(1).max(300).optional(),
    cnpj: z.string().max(20).optional(),
    endereco: z.string().max(500).nullable().optional(),
    telefone: z.string().max(50).nullable().optional(),
    email: z.string().email().max(200).nullable().optional(),
  }).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('contratos', 'editar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Sem permissão pra editar contratos.' },
        { status: check.status }
      )
    }
    const { id } = await params
    const parsed = await parseBody(PatchBody, req)
    if (!parsed.ok) return parsed.res

    const { contratante, contratado, ...contratoFields } = parsed.data

    // 1) Atualiza contrato (se tem algum campo pra alterar)
    if (Object.keys(contratoFields).length > 0) {
      await updateContrato(id, contratoFields as any)
    }

    // 2) Atualiza contratante/contratado (tabela empresas) usando admin client
    if (contratante || contratado) {
      const admin = createAdminClient()
      const { data: contrato } = await admin
        .from('contratos')
        .select('contratante_id, contratado_id')
        .eq('id', id)
        .single()

      if (contratante && (contrato as any)?.contratante_id) {
        await admin
          .from('empresas')
          .update(contratante)
          .eq('id', (contrato as any).contratante_id)
      }
      if (contratado && (contrato as any)?.contratado_id) {
        await admin
          .from('empresas')
          .update(contratado)
          .eq('id', (contrato as any).contratado_id)
      }
    }

    await audit({
      event: 'contrato.atualizado',
      entity_type: 'contrato',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: { fields: Object.keys(parsed.data) },
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
