import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUsuarioLogado, requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { calcularInformaconData } from '@/lib/db/informacon-data'
import { saldoMaterialDoMacroItem, TABELAS_085 } from '@/lib/db/compensacao-lastro'
import { distribuirNosItens } from '@/lib/informakon/compensacao-lastro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /api/contratos/[id]/medicoes/[medicaoId]/compensacao-lastro
 *
 * POST   — registra uma compensação de lastro nesta medição (migration 085).
 * DELETE — `?compensacao_id=` desfaz uma compensação desta medição.
 *
 * A regra está em lib/informakon/compensacao-lastro.ts: a FIP fatura a falta
 * do macro item sem lastro, e o saldo a gastar do macro item onde a nota foi
 * lançada no ERP cai no mesmo valor, pelos primeiros itens.
 *
 * O valor é conferido contra a sugestão RECALCULADA no servidor — a tela pode
 * estar velha (outro retrato colado, outra compensação gravada). E a redução
 * tem de caber no saldo dos itens: o que não coube recusa a gravação inteira,
 * em vez de deixar saldo negativo.
 *
 * Só em medição aberta, pelo mesmo motivo do retrato adotado: depois da
 * aprovação, o boletim assinado não pode mudar.
 */

const Body = z.object({
  chave_falta: z.string().min(1).max(20),
  chave_nota: z.string().min(1).max(20),
  valor: z.number().positive().finite(),
  motivo: z.string().max(2000).optional(),
})

function migrationPendente() {
  return NextResponse.json(
    { error: 'Funcionalidade pendente: rode a migration 085 no Supabase.', code: 'MIGRATION_PENDENTE' },
    { status: 503 },
  )
}

async function medicaoAberta(admin: ReturnType<typeof createAdminClient>, medicaoId: string, contratoId: string) {
  const { data, error } = await admin
    .from('medicoes')
    .select('id, status, contrato_id')
    .eq('id', medicaoId)
    .maybeSingle()
  if (error) throw error
  const med = data as { status: string; contrato_id: string } | null
  if (!med || med.contrato_id !== contratoId) {
    return NextResponse.json({ error: 'Medição não encontrada neste contrato.' }, { status: 404 })
  }
  if (med.status === 'aprovado') {
    return NextResponse.json(
      { error: 'Medição já aprovada. Desfaça a aprovação antes de mexer na compensação.', code: 'MEDICAO_APROVADA' },
      { status: 409 },
    )
  }
  return null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId, medicaoId } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { chave_falta, chave_nota, valor, motivo } = parsed.data

    const admin = createAdminClient()
    const guarda = await medicaoAberta(admin, medicaoId, contratoId)
    if (guarda) return guarda

    const boletim = await calcularInformaconData(admin, contratoId, medicaoId)
    const comp = boletim?.compensacao_lastro
    if (!comp?.disponivel) return migrationPendente()

    const sugestao = comp.sugestoes.find(s => s.chaveFalta === chave_falta && s.chaveNota === chave_nota)
    if (!sugestao) {
      return NextResponse.json(
        { error: 'Não há mais lastro a compensar entre esses macro itens. Atualize a tela.', code: 'SEM_SUGESTAO' },
        { status: 409 },
      )
    }
    if (valor > sugestao.valor + 0.01) {
      return NextResponse.json(
        { error: `O máximo compensável agora é ${sugestao.valor.toFixed(2)}. Atualize a tela.`, code: 'ACIMA_DO_TETO' },
        { status: 409 },
      )
    }

    const itens = await saldoMaterialDoMacroItem(admin, contratoId, chave_nota)
    const { distribuicao, semEspaco } = distribuirNosItens(valor, itens)
    if (semEspaco > 0.01) {
      return NextResponse.json(
        {
          error: `O macro item ${chave_nota} só tem ${(valor - semEspaco).toFixed(2)} de saldo a gastar; faltam ${semEspaco.toFixed(2)}. Nada foi gravado. Compense até o saldo, ou encerre o pedido que não vai mais receber nota para liberar saldo.`,
          code: 'SEM_SALDO_NO_DESTINO',
        },
        { status: 409 },
      )
    }

    const user = await getUsuarioLogado()
    const ins = await admin
      .from('compensacoes_lastro')
      .insert({
        contrato_id: contratoId,
        medicao_id: medicaoId,
        chave_falta,
        chave_nota,
        valor: Math.round(valor * 100) / 100,
        notas: sugestao.notas,
        motivo: motivo ?? null,
        criado_por_id: user?.id ?? null,
      })
      .select('id')
      .single()
    if (ins.error) {
      if (isSchemaMissingError(ins.error, TABELAS_085)) return migrationPendente()
      throw ins.error
    }
    const compensacaoId = (ins.data as any).id as string

    const insItens = await admin
      .from('compensacoes_lastro_itens')
      .insert(distribuicao.map(d => ({ compensacao_id: compensacaoId, detalhamento_id: d.detalhamentoId, valor: d.valor })))
    if (insItens.error) {
      // Sem os itens, a compensação pagaria a FIP sem reduzir saldo nenhum.
      await admin.from('compensacoes_lastro').delete().eq('id', compensacaoId)
      throw insItens.error
    }

    const codigoPorDet = new Map(itens.map(i => [i.detalhamentoId, i.codigo]))
    return NextResponse.json({
      ok: true,
      compensacao_id: compensacaoId,
      itens: distribuicao.map(d => ({ codigo: codigoPorDet.get(d.detalhamentoId), valor: d.valor })),
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId, medicaoId } = await params
    const compensacaoId = new URL(req.url).searchParams.get('compensacao_id')
    if (!compensacaoId || !z.string().uuid().safeParse(compensacaoId).success) {
      return NextResponse.json({ error: 'compensacao_id inválido.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const guarda = await medicaoAberta(admin, medicaoId, contratoId)
    if (guarda) return guarda

    const del = await admin
      .from('compensacoes_lastro')
      .delete()
      .eq('id', compensacaoId)
      .eq('medicao_id', medicaoId)
      .select('id')
    if (del.error) {
      if (isSchemaMissingError(del.error, TABELAS_085)) return migrationPendente()
      throw del.error
    }
    if (!del.data || del.data.length === 0) {
      return NextResponse.json({ error: 'Compensação não encontrada nesta medição.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
