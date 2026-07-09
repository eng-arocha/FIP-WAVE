import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/ajustar-pedido-wave-liquido?solicitacao_id=...&liquido=122377.44
 *
 * One-shot: rateia o valor LIQUIDO informado entre os itens da
 * solicitacao_fat_direto, proporcionalmente ao valor_total atual de
 * cada item. Ajusta o residuo no ultimo item pra fechar no centavo.
 * Atualiza tambem solicitacoes_fat_direto.valor_total.
 *
 * Usado pra retroativamente corrigir o pedido #7 (Wave servico) que foi
 * criado com o BRUTO (R$ 139.264,86) antes da nova logica entrar.
 */
async function executar(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const solId = url.searchParams.get('solicitacao_id')
    const liquidoStr = url.searchParams.get('liquido')
    if (!solId || !liquidoStr) {
      return NextResponse.json(
        { ok: false, erro: 'parametros obrigatorios: solicitacao_id, liquido' },
        { status: 400 },
      )
    }
    const liquido = Number(liquidoStr)
    if (!Number.isFinite(liquido) || liquido <= 0) {
      return NextResponse.json({ ok: false, erro: 'liquido invalido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Carrega itens
    const { data: itens, error: errIt } = await admin
      .from('itens_solicitacao_fat_direto')
      .select('id, descricao, valor_unitario, valor_total')
      .eq('solicitacao_id', solId)
      .order('id')
    if (errIt) throw errIt
    if (!itens || itens.length === 0) {
      return NextResponse.json({ ok: false, erro: 'nenhum item encontrado' }, { status: 404 })
    }

    const bruto = itens.reduce((s, it: any) => s + Number(it.valor_total || 0), 0)
    if (bruto <= 0) {
      return NextResponse.json({ ok: false, erro: 'soma bruta invalida' }, { status: 400 })
    }

    const fator = liquido / bruto

    // Atualiza cada item proporcionalmente, residuo no ultimo
    const updatesPlanned: Array<{ id: string; novo_valor: number; descricao: string }> = []
    let somaParcial = 0
    for (let i = 0; i < itens.length; i++) {
      const it: any = itens[i]
      const valorAtual = Number(it.valor_total || 0)
      let novo = Math.round(valorAtual * fator * 100) / 100
      if (i === itens.length - 1) {
        // ultimo item recebe o residuo pra fechar
        novo = Math.round((liquido - somaParcial) * 100) / 100
      }
      somaParcial += novo
      updatesPlanned.push({ id: it.id, novo_valor: novo, descricao: it.descricao })
    }

    // Aplica os updates. Os itens guardam qtde=1 e valor_unitario=valor_total
    // (convencao do sistema), entao atualizar valor_unitario tambem mantem
    // a coerencia.
    for (const u of updatesPlanned) {
      const { error } = await admin
        .from('itens_solicitacao_fat_direto')
        .update({ valor_unitario: u.novo_valor, valor_total: u.novo_valor })
        .eq('id', u.id)
      if (error) throw error
    }

    // Atualiza valor_total da solicitacao
    const novoTotal = updatesPlanned.reduce((s, u) => s + u.novo_valor, 0)
    const { error: errSol } = await admin
      .from('solicitacoes_fat_direto')
      .update({ valor_total: novoTotal })
      .eq('id', solId)
    if (errSol) throw errSol

    return NextResponse.json({
      ok: true,
      solicitacao_id: solId,
      bruto_original: Math.round(bruto * 100) / 100,
      liquido_aplicado: Math.round(novoTotal * 100) / 100,
      retencao_descontada: Math.round((bruto - novoTotal) * 100) / 100,
      itens_atualizados: updatesPlanned.length,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET(req: Request) {
  const negado = await requireAdmin()
  if (negado) return negado
  return executar(req)
}

export async function POST(req: Request) {
  const negado = await requireAdmin()
  if (negado) return negado
  return executar(req)
}
