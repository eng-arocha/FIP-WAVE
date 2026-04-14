import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { uuid } from '@/lib/api/schema'

/**
 * GET /api/contratos/[id]/saldo-por-item?codigo=8.1.1
 *
 * Retorna, para cada detalhamento (ou só o filtrado), o estado de
 * consumo:
 *   - valor_contratado_material:  qtde × valor_unit_material
 *   - valor_solicitado_aprovado:  soma solicitações aprovadas
 *   - valor_solicitado_pendente:  soma solicitações aguardando
 *   - valor_medido_aprovado:      soma medições aprovadas
 *   - saldo_material:             contratado − (aprovado + pendente)
 *   - pedidos[]: { numero_pedido_fip, solicitacao_id, status, valor, data }
 *
 * Se `?codigo=X.Y.Z` for passado, retorna só esse item (com lista detalhada
 * de pedidos). Sem filtro, retorna todos os detalhamentos (resumo, sem
 * lista detalhada de pedidos — pra listagem rápida).
 */

const ParamsSchema = z.object({ id: uuid() })

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const url = new URL(req.url)
    const codigoFiltro = url.searchParams.get('codigo')

    const admin = createAdminClient()

    // 1) Carrega detalhamentos do contrato (filtra por código se houver)
    let detQuery: any = admin
      .from('detalhamentos')
      .select(`
        id, codigo, descricao, local, disciplina, unidade,
        quantidade_contratada, valor_material_unit, valor_servico_unit,
        subtotal_material, subtotal_mo, valor_total,
        tarefa:tarefas!inner (
          id, codigo, nome,
          grupo:grupos_macro!inner ( id, codigo, nome, contrato_id )
        )
      `)
      .eq('tarefa.grupo.contrato_id', id)
      .order('codigo', { ascending: true })

    if (codigoFiltro) detQuery = detQuery.eq('codigo', codigoFiltro)

    const { data: detsRaw, error: detErr } = await detQuery
    if (detErr) throw detErr
    const dets = (detsRaw || []) as any[]
    if (dets.length === 0) {
      return NextResponse.json({ itens: [], resumo: { total: 0 } })
    }

    // 2) Carrega solicitações deste contrato com seus itens
    //    (usado pra calcular quanto foi consumido de cada detalhamento)
    const { data: solsRaw } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, numero_pedido_fip, status, data_solicitacao, data_aprovacao,
        fornecedor_razao_social, valor_total, deletado_em,
        itens:itens_solicitacao_fat_direto (
          id, detalhamento_id, descricao, valor_total
        )
      `)
      .eq('contrato_id', id)
      .is('deletado_em', null)

    const sols = (solsRaw || []) as any[]

    // 3) Para cada detalhamento, calcula métricas
    const detIds = new Set(dets.map(d => d.id))
    const itens = dets.map(d => {
      // Pedidos que tocam este detalhamento
      const pedidosQuePasso: any[] = []
      let solApr = 0
      let solPen = 0
      for (const sol of sols) {
        const itensDeste = (sol.itens || []).filter((it: any) => it.detalhamento_id === d.id)
        if (itensDeste.length === 0) continue
        const somaItens = itensDeste.reduce((s: number, it: any) => s + Number(it.valor_total || 0), 0)
        if (sol.status === 'aprovado')              solApr += somaItens
        else if (sol.status === 'aguardando_aprovacao') solPen += somaItens
        if (sol.status === 'aprovado' || sol.status === 'aguardando_aprovacao') {
          pedidosQuePasso.push({
            solicitacao_id: sol.id,
            numero_pedido_fip: sol.numero_pedido_fip,
            numero: sol.numero,
            status: sol.status,
            fornecedor: sol.fornecedor_razao_social,
            valor_no_item: somaItens,
            data_solicitacao: sol.data_solicitacao,
            data_aprovacao: sol.data_aprovacao,
          })
        }
      }

      const vMat = Number(d.subtotal_material ?? (d.quantidade_contratada || 0) * (d.valor_unitario_material || 0))
      const saldo = vMat - solApr - solPen

      return {
        detalhamento_id: d.id,
        codigo: d.codigo,
        descricao: d.descricao,
        local: d.local,
        disciplina: d.disciplina,
        unidade: d.unidade,
        quantidade_contratada: Number(d.quantidade_contratada || 0),
        valor_unitario_material: Number(d.valor_material_unit || 0),
        valor_unitario_mo: Number(d.valor_servico_unit || 0),
        contratado_material: vMat,
        contratado_mo: Number(d.subtotal_mo ?? (d.quantidade_contratada || 0) * (d.valor_servico_unit || 0)),
        solicitado_aprovado: solApr,
        solicitado_pendente: solPen,
        saldo_material: saldo,
        pct_utilizado: vMat > 0 ? ((solApr + solPen) / vMat) * 100 : 0,
        alerta: saldo <= 0 ? 'esgotado'
              : saldo / Math.max(vMat, 1) < 0.05 ? 'critico'
              : saldo / Math.max(vMat, 1) < 0.20 ? 'atencao'
              : 'ok',
        tarefa_codigo: d.tarefa?.codigo,
        grupo_codigo: d.tarefa?.grupo?.codigo,
        pedidos: codigoFiltro ? pedidosQuePasso : undefined, // só no modo detalhado
      }
    })

    return NextResponse.json({
      itens,
      resumo: {
        total: itens.length,
        total_contratado: itens.reduce((s, i) => s + i.contratado_material, 0),
        total_solicitado: itens.reduce((s, i) => s + i.solicitado_aprovado + i.solicitado_pendente, 0),
        total_saldo: itens.reduce((s, i) => s + i.saldo_material, 0),
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
