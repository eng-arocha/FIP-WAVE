import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { uuid } from '@/lib/api/schema'
import { withSchemaFallback } from '@/lib/db/resilient'
import { compareCodigo } from '@/lib/db/wbs-utils'
import {
  basesDoDetalhamento,
  baseParaNatureza,
  naturezaDoPedido,
  nivelAlerta,
  piorAlerta,
  type NaturezaPedido,
} from '@/lib/db/saldo-detalhamento'

/**
 * GET /api/contratos/[id]/saldo-por-item?codigo=8.1.1
 *
 * Retorna, para cada detalhamento (ou só o filtrado), o estado de consumo
 * SEPARADO POR NATUREZA — material e serviço (mão de obra):
 *   - contratado_material / contratado_mo:  subtotal_material / subtotal_mo
 *   - solicitado_*_material / *_servico:    aprovado e pendente por natureza
 *   - saldo_material / saldo_servico:       base − (aprovado + pendente)
 *   - pedidos[]: { numero_pedido_fip, solicitacao_id, status, natureza, valor }
 *
 * A natureza vem de `solicitacoes_fat_direto.tipo` (migration 074): pedidos
 * `wave_servico` consomem a base de MÃO DE OBRA; `material_fornecedor` e
 * `fip_material` consomem a base de MATERIAL. Antes desta separação, um
 * pedido de serviço era debitado do material e fazia o item aparecer como
 * "esgotado" com saldo negativo.
 *
 * Consumo é líquido de `valor_devolvido` (migration 050) e considera apenas
 * pedidos `aprovado` / `aguardando_aprovacao` não deletados.
 *
 * Se `?codigo=X.Y.Z` for passado, retorna só esse item (com lista detalhada
 * de pedidos). Sem filtro, retorna todos os detalhamentos (resumo, sem
 * lista detalhada de pedidos — pra listagem rápida).
 *
 * Itens saem em ordem hierárquica de código (1.1.1 → 1.2.1 → … → 1.10.1),
 * via `compareCodigo`. `ORDER BY codigo` no Postgres é ordenação de texto e
 * intercalava 1.10.1 entre 1.1.1 e 1.2.1.
 */

const ParamsSchema = z.object({ id: uuid() })

const STATUS_QUE_CONSOMEM = ['aprovado', 'aguardando_aprovacao']

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const url = new URL(req.url)
    const codigoFiltro = url.searchParams.get('codigo')

    const admin = createAdminClient()

    // 1) Carrega detalhamentos do contrato (filtra por código se houver).
    //    `range` explícito: sem ele o PostgREST corta em 1000 linhas por
    //    default, e um contrato grande perderia o final da lista em silêncio.
    let detQuery: any = admin
      .from('detalhamentos')
      .select(`
        id, codigo, descricao, local, disciplina, unidade,
        quantidade_contratada, valor_material_unit, valor_servico_unit, valor_unitario,
        subtotal_material, subtotal_mo, valor_total,
        tarefa:tarefas!inner (
          id, codigo, nome,
          grupo:grupos_macro!inner ( id, codigo, nome, contrato_id )
        )
      `)
      .eq('tarefa.grupo.contrato_id', id)
      .range(0, 9999)

    if (codigoFiltro) detQuery = detQuery.eq('codigo', codigoFiltro)

    const { data: detsRaw, error: detErr } = await detQuery
    if (detErr) throw detErr
    // Ordenação hierárquica no Node, não no Postgres: `codigo` é texto, então
    // `ORDER BY codigo` devolve 1.10.1 antes de 1.2.1 e 10.1.1 antes de 2.1.1.
    const dets = ((detsRaw || []) as any[]).sort((a, b) => compareCodigo(a.codigo, b.codigo))
    if (dets.length === 0) {
      return NextResponse.json({ itens: [], resumo: { total: 0 } })
    }

    // 2) Carrega solicitações deste contrato com seus itens.
    //    `tipo` (migration 074) define a natureza; `valor_devolvido`
    //    (migration 050) desconta devoluções. Ambos com fallback pra janela
    //    de schema cache stale do PostgREST.
    const ITENS_COM_DEVOLUCAO = 'itens:itens_solicitacao_fat_direto ( id, detalhamento_id, descricao, valor_total, valor_devolvido )'
    const ITENS_SEM_DEVOLUCAO = 'itens:itens_solicitacao_fat_direto ( id, detalhamento_id, descricao, valor_total )'
    const BASE_SOL = 'id, numero, numero_pedido_fip, status, data_solicitacao, data_aprovacao, fornecedor_razao_social, fornecedor_cnpj, valor_total, deletado_em'

    const solsRes = await withSchemaFallback({
      primary: () => admin
        .from('solicitacoes_fat_direto')
        .select(`${BASE_SOL}, tipo, ${ITENS_COM_DEVOLUCAO}`)
        .eq('contrato_id', id)
        .in('status', STATUS_QUE_CONSOMEM)
        .is('deletado_em', null),
      fallback: () => admin
        .from('solicitacoes_fat_direto')
        .select(`${BASE_SOL}, ${ITENS_SEM_DEVOLUCAO}`)
        .eq('contrato_id', id)
        .in('status', STATUS_QUE_CONSOMEM)
        .is('deletado_em', null),
      missingColumns: ['tipo', 'valor_devolvido'],
      context: 'saldoPorItem_solicitacoes',
    })

    const sols = (solsRes.data || []) as any[]

    // 3) Para cada detalhamento, calcula métricas por natureza
    const itens = dets.map(d => {
      const bases = basesDoDetalhamento(d)

      const pedidos: any[] = []
      const aprovado: Record<NaturezaPedido, number> = { material: 0, servico: 0 }
      const pendente: Record<NaturezaPedido, number> = { material: 0, servico: 0 }

      for (const sol of sols) {
        const itensDeste = (sol.itens || []).filter((it: any) => it.detalhamento_id === d.id)
        if (itensDeste.length === 0) continue

        // Saldo efetivo = valor_total − valor_devolvido (devoluções liberam saldo)
        const somaItens = itensDeste.reduce((s: number, it: any) => {
          const efetivo = Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)
          return s + Math.max(0, efetivo)
        }, 0)
        if (somaItens <= 0) continue

        const natureza = naturezaDoPedido(sol)
        if (sol.status === 'aprovado') aprovado[natureza] += somaItens
        else pendente[natureza] += somaItens

        pedidos.push({
          solicitacao_id: sol.id,
          numero_pedido_fip: sol.numero_pedido_fip,
          numero: sol.numero,
          status: sol.status,
          tipo: sol.tipo ?? null,
          natureza,
          fornecedor: sol.fornecedor_razao_social,
          valor_no_item: somaItens,
          data_solicitacao: sol.data_solicitacao,
          data_aprovacao: sol.data_aprovacao,
        })
      }

      // Base efetiva por natureza (cai pro total quando não há quebra mat/MO)
      const baseMaterial = baseParaNatureza(bases, 'material')
      const baseServico = baseParaNatureza(bases, 'servico')

      const consumidoMaterial = aprovado.material + pendente.material
      const consumidoServico = aprovado.servico + pendente.servico

      const saldoMaterial = baseMaterial - consumidoMaterial
      const saldoServico = baseServico - consumidoServico

      const alertaMaterial = nivelAlerta(consumidoMaterial, baseMaterial)
      const alertaServico = nivelAlerta(consumidoServico, baseServico)

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

        // Bases contratuais
        contratado_material: bases.material,
        contratado_mo: bases.servico,
        contratado_total: bases.total,
        /** true = contrato sem quebra material/MO; as duas naturezas dividem `contratado_total` */
        base_unica: bases.semQuebra,

        // Consumo por natureza
        solicitado_aprovado_material: aprovado.material,
        solicitado_pendente_material: pendente.material,
        solicitado_aprovado_servico: aprovado.servico,
        solicitado_pendente_servico: pendente.servico,

        // Totais (todas as naturezas somadas)
        solicitado_aprovado: aprovado.material + aprovado.servico,
        solicitado_pendente: pendente.material + pendente.servico,

        // Saldos
        saldo_material: saldoMaterial,
        saldo_servico: saldoServico,
        saldo_total: saldoMaterial + saldoServico,

        pct_utilizado_material: baseMaterial > 0 ? (consumidoMaterial / baseMaterial) * 100 : 0,
        pct_utilizado_servico: baseServico > 0 ? (consumidoServico / baseServico) * 100 : 0,
        /** % sobre o contratado total — usado na listagem resumida */
        pct_utilizado: bases.total > 0 ? ((consumidoMaterial + consumidoServico) / bases.total) * 100 : 0,

        alerta_material: alertaMaterial,
        alerta_servico: alertaServico,
        alerta: piorAlerta(alertaMaterial, alertaServico),

        tarefa_codigo: d.tarefa?.codigo,
        grupo_codigo: d.tarefa?.grupo?.codigo,
        pedidos: codigoFiltro ? pedidos : undefined, // só no modo detalhado
      }
    })

    return NextResponse.json({
      itens,
      resumo: {
        total: itens.length,
        total_contratado: itens.reduce((s, i) => s + i.contratado_total, 0),
        total_contratado_material: itens.reduce((s, i) => s + i.contratado_material, 0),
        total_contratado_mo: itens.reduce((s, i) => s + i.contratado_mo, 0),
        total_solicitado: itens.reduce((s, i) => s + i.solicitado_aprovado + i.solicitado_pendente, 0),
        total_saldo: itens.reduce((s, i) => s + i.saldo_total, 0),
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
