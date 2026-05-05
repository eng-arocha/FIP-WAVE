import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/fix-grupo-17
 *
 * Diagnostico: dump da estrutura atual do grupo macro com codigo='17' (GAS)
 * em todos os contratos. Mostra cada tarefa com seus detalhamentos pra
 * confirmar se o bug do seed (17.2 colado como 17.1) ja foi corrigido.
 *
 * POST /api/admin/fix-grupo-17
 *
 * Aplica a fix idempotente. Cobre 2 cenarios:
 *
 *   A) Existem 2 tarefas com codigo='17.1' (uma TUBOS, uma CAIXAS) -
 *      renomeia a CAIXAS para '17.2' e seus detalhamentos de 17.1.X para
 *      17.2.X. (Caso da migration 063 original.)
 *
 *   B) Existe APENAS 1 tarefa com codigo='17.1' contendo detalhamentos
 *      mistos (TUBOS + EQUIPAMENTOS). - cria nova tarefa
 *      "17.2 CAIXAS, REGULADORES E VALVULAS" no mesmo grupo, move os
 *      detalhamentos cuja descricao comeca com "EQUIPAMENTOS" pra ela
 *      e renumera codigo de 17.1.X para 17.2.X (1..N) na ordem original.
 *
 *   C) Estrutura ja correta (1 tarefa 17.1 + 1 tarefa 17.2) - no-op.
 */

async function dump(admin: ReturnType<typeof createAdminClient>) {
  const { data: grupos, error: errG } = await admin
    .from('grupos_macro')
    .select('id, contrato_id, codigo, nome')
    .eq('codigo', '17')
  if (errG) throw errG

  const result: any[] = []
  for (const g of grupos || []) {
    const { data: tarefas, error: errT } = await admin
      .from('tarefas')
      .select('id, codigo, nome, ordem, valor_total')
      .eq('grupo_macro_id', (g as any).id)
      .order('ordem')
    if (errT) throw errT

    const tarefasComDet: any[] = []
    for (const t of tarefas || []) {
      const { data: dets } = await admin
        .from('detalhamentos')
        .select('id, codigo, descricao, quantidade_contratada, valor_total, ordem')
        .eq('tarefa_id', (t as any).id)
        .order('codigo')
      tarefasComDet.push({
        ...(t as any),
        detalhamentos: dets || [],
      })
    }
    result.push({
      ...(g as any),
      tarefas: tarefasComDet,
    })
  }
  return result
}

export async function GET() {
  try {
    const admin = createAdminClient()
    const grupos = await dump(admin)
    return NextResponse.json({ grupos }, { status: 200 })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST() {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuarios com permissao de aprovacao podem disparar a fix.' },
        { status: check.status },
      )
    }
    const admin = createAdminClient()

    const acoes: string[] = []

    const antes = await dump(admin)

    for (const g of antes) {
      const tarefas = g.tarefas as any[]
      const tarefas171 = tarefas.filter(t => t.codigo === '17.1')
      const tarefas172 = tarefas.filter(t => t.codigo === '17.2')

      // Caso C: ja correto
      if (tarefas171.length === 1 && tarefas172.length === 1) {
        acoes.push(`contrato ${g.contrato_id}: ja correto (1x 17.1 + 1x 17.2) - skip`)
        continue
      }

      // Caso A: 2 tarefas com codigo='17.1', uma e CAIXAS
      if (tarefas171.length >= 2) {
        const caixas = tarefas171.find(t => /CAIXA/i.test(t.nome))
        if (caixas) {
          // detalhamentos: 17.1.X -> 17.2.X
          for (const d of caixas.detalhamentos as any[]) {
            if (d.codigo && d.codigo.startsWith('17.1.')) {
              const novoCod = '17.2.' + d.codigo.substring('17.1.'.length)
              const { error } = await admin
                .from('detalhamentos')
                .update({ codigo: novoCod })
                .eq('id', d.id)
              if (error) throw error
            }
          }
          // tarefa: 17.1 -> 17.2
          const { error } = await admin
            .from('tarefas')
            .update({ codigo: '17.2' })
            .eq('id', caixas.id)
          if (error) throw error
          acoes.push(
            `contrato ${g.contrato_id}: caso A - tarefa CAIXAS (${caixas.id}) renomeada 17.1 -> 17.2, ${caixas.detalhamentos.length} detalhamentos renumerados`,
          )
          continue
        }
      }

      // Caso B: 1 tarefa com codigo='17.1' contendo detalhamentos EQUIPAMENTOS
      if (tarefas171.length === 1 && tarefas172.length === 0) {
        const tubos = tarefas171[0]
        const equipamentos = (tubos.detalhamentos as any[]).filter(d =>
          /^\s*EQUIPAMENTOS/i.test(d.descricao || ''),
        )
        if (equipamentos.length > 0) {
          // Cria nova tarefa CAIXAS, REGULADORES E VALVULAS
          const valorCaixas = equipamentos.reduce(
            (s, d) => s + Number(d.valor_total || 0),
            0,
          )
          const { data: novaTarefa, error: errIns } = await admin
            .from('tarefas')
            .insert({
              grupo_macro_id: g.id,
              codigo: '17.2',
              nome: 'CAIXAS, REGULADORES E VALVULAS',
              unidade: 'UN',
              quantidade_contratada: 1,
              valor_unitario: valorCaixas,
              valor_total: valorCaixas,
              ordem: 2,
            })
            .select('id')
            .single()
          if (errIns) throw errIns
          const novaTarefaId = (novaTarefa as any).id

          // Move detalhamentos pra nova tarefa renumerando codigo 17.2.1..N
          // na ordem natural (codigo original 17.1.1 vira 17.2.1, etc.).
          // ATENCAO: nao mexe em medicao_itens nem planejamento_detalhamento
          // - eles referenciam por id e seguem apontando pros detalhamentos
          // movidos.
          equipamentos.sort((a, b) =>
            String(a.codigo || '').localeCompare(String(b.codigo || '')),
          )
          let i = 1
          for (const d of equipamentos) {
            const novoCod = '17.2.' + i
            const { error: errUpd } = await admin
              .from('detalhamentos')
              .update({ tarefa_id: novaTarefaId, codigo: novoCod, ordem: i })
              .eq('id', d.id)
            if (errUpd) throw errUpd
            i++
          }

          // Atualiza valor_total da tarefa TUBOS (= sem os EQUIPAMENTOS)
          const tubosRestantes = (tubos.detalhamentos as any[]).filter(
            d => !equipamentos.some(e => e.id === d.id),
          )
          const valorTubos = tubosRestantes.reduce(
            (s, d) => s + Number(d.valor_total || 0),
            0,
          )
          const { error: errUpdTubos } = await admin
            .from('tarefas')
            .update({ valor_total: valorTubos })
            .eq('id', tubos.id)
          if (errUpdTubos) throw errUpdTubos

          acoes.push(
            `contrato ${g.contrato_id}: caso B - criada tarefa 17.2 CAIXAS (${novaTarefaId}), movidos ${equipamentos.length} detalhamentos EQUIPAMENTOS pra ela. Valor TUBOS recalculado: ${valorTubos.toFixed(2)}, valor CAIXAS: ${valorCaixas.toFixed(2)}`,
          )
          continue
        }
      }

      acoes.push(
        `contrato ${g.contrato_id}: estado nao reconhecido (171=${tarefas171.length}, 172=${tarefas172.length}) - skip`,
      )
    }

    const depois = await dump(admin)

    return NextResponse.json({
      ok: true,
      acoes,
      antes,
      depois,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
