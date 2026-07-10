import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/auto-aprovar-rascunhos-medicao
 *
 * One-shot: encontra todas as solicitacoes_fat_direto em status='rascunho'
 * cuja observacao indica que foram auto-criadas pela aprovacao de uma
 * medicao ('Aprovacao da medicao MED-...'), e atualiza-as pra
 * status='aprovado' herdando aprovador da medicao correspondente.
 *
 * Usado pra retroativamente aplicar a nova politica (aprovacao da medicao
 * = aprovacao implicita dos pedidos NF FIP material + NF Wave servico).
 */

async function executar(): Promise<Response> {
  try {
    const admin = createAdminClient()

    const { data: rascunhos, error } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, numero, contrato_id, observacoes, valor_total, fornecedor_razao_social')
      .eq('status', 'rascunho')
    if (error) throw error

    const candidatos = (rascunhos || []).filter((s: any) =>
      /Aprova[çc][aã]o da medi[çc][aã]o MED-/i.test(s.observacoes || ''),
    )

    const acoes: any[] = []
    for (const r of candidatos as any[]) {
      // Tenta encontrar a medicao correspondente pra herdar aprovador
      const tagMatch = String(r.observacoes || '').match(/MED-(\d+)/i)
      const numMed = tagMatch ? parseInt(tagMatch[1], 10) : null

      let aprovadorId: string | null = null
      let dataAprov: string | null = null
      if (numMed != null) {
        const { data: med } = await admin
          .from('medicoes')
          .select('id, aprovador_id, data_aprovacao')
          .eq('contrato_id', r.contrato_id)
          .eq('numero', numMed)
          .eq('status', 'aprovado')
          .single()
        if (med) {
          aprovadorId = (med as any).aprovador_id
          dataAprov = (med as any).data_aprovacao
        }
      }

      const updates: Record<string, unknown> = {
        status: 'aprovado',
        data_aprovacao: dataAprov ?? new Date().toISOString(),
      }
      if (aprovadorId) updates.aprovador_id = aprovadorId

      const { error: errUpd } = await admin
        .from('solicitacoes_fat_direto')
        .update(updates)
        .eq('id', r.id)
      if (errUpd) {
        acoes.push({ id: r.id, numero: r.numero, erro: errUpd.message })
        continue
      }

      acoes.push({
        id: r.id,
        numero: r.numero,
        fornecedor: r.fornecedor_razao_social,
        valor: r.valor_total,
        medicao_num: numMed,
        aprovador_herdado: aprovadorId ? 'sim' : 'nao',
        ok: true,
      })
    }

    return NextResponse.json({ ok: true, total_atualizados: acoes.filter(a => a.ok).length, acoes })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET() {
  const negado = await requireAdmin()
  if (negado) return negado
  return executar()
}

export async function POST() {
  const negado = await requireAdmin()
  if (negado) return negado
  return executar()
}
