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
 *   C) Estrutura ja correta (1 tarefa 17.1 + 1 tarefa 17.2) - no-op.
 *
 *   D) [REBUILD CANONICO] - 1 tarefa com codigo='17.1' contendo qualquer
 *      coisa diferente do esperado (sintoma: detalhamentos com descricao
 *      "EQUIPAMENTOS X" em codigo 17.1.X, qtde/valor_unit misturados, ou
 *      faltando 5 dos 12 itens canonicos). Reescreve cada det existente
 *      via match (TUBOS/EQUIPAMENTOS + local) com a planilha canonica e
 *      INSERE os faltantes. Cria a tarefa 17.2 e move os 5 EQUIPAMENTOS
 *      pra ela. Preserva IDs dos detalhamentos existentes pra nao quebrar
 *      FKs (medicao_itens, planejamento_detalhamento).
 */

// Planilha canonica do grupo 17 GAS (extraida do contrato WAVE-2025-001).
// Cada entry tem o codigo final (17.1.X ou 17.2.X), descricao, qtde,
// valor_material_unit, valor_servico_unit, local. valor_total e calculado.
const PLANILHA_17 = [
  { codigo: '17.1.1', desc: 'TUBOS E CONEXÕES - GÁS - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )', qtde: 48, mat: 822.80, mo: 338.09, local: 'PAVIMENTOS' },
  { codigo: '17.1.2', desc: 'TUBOS E CONEXÕES - GÁS - TERREO',                                                qtde: 1,  mat: 16850.84, mo: 15116.18, local: 'TÉRREO' },
  { codigo: '17.1.3', desc: 'TUBOS E CONEXÕES - GÁS - LAZER',                                                 qtde: 1,  mat: 3686.12, mo: 3306.66, local: 'LAZER' },
  { codigo: '17.1.4', desc: 'TUBOS E CONEXÕES - GÁS - PANORAMICO',                                            qtde: 1,  mat: 2106.36, mo: 1889.52, local: 'PANORÂMICO' },
  { codigo: '17.1.5', desc: 'TUBOS E CONEXÕES - GÁS - PAV TIPO ( 1° AO 36 )',                                 qtde: 36, mat: 1053.18, mo: 444.76, local: 'TIPO' },
  { codigo: '17.1.6', desc: 'TUBOS E CONEXÕES  - GÁS - PAV COBERTURA',                                        qtde: 1,  mat: 4212.71, mo: 2279.04, local: 'COBERTURA' },
  { codigo: '17.1.7', desc: 'TUBOS E CONEXÕES - GÁS - PAV ROOFTOP + MEZANINO ROOFTOP',                        qtde: 1,  mat: 1053.18, mo: 944.76, local: 'ROOFTOP' },
  { codigo: '17.2.1', desc: 'EQUIPAMENTOS GÁS - LAZER',                                                       qtde: 1,  mat: 2256.18, mo: 637.28, local: 'LAZER' },
  { codigo: '17.2.2', desc: 'EQUIPAMENTOS GÁS - PANORAMICO',                                                  qtde: 1,  mat: 2256.18, mo: 637.28, local: 'PANORÂMICO' },
  { codigo: '17.2.3', desc: 'EQUIPAMENTOS GÁS - PAV TIPO ( 1° AO 36 )',                                       qtde: 36, mat: 1920.22, mo: 346.60, local: 'TIPO' },
  { codigo: '17.2.4', desc: 'EQUIPAMENTOS  GÁS - PAV COBERTURA',                                              qtde: 1,  mat: 3512.35, mo: 674.56, local: 'COBERTURA' },
  { codigo: '17.2.5', desc: 'EQUIPAMENTOS GÁS - PAV ROOFTOP + MEZANINO ROOFTOP',                              qtde: 1,  mat: 2256.18, mo: 637.28, local: 'ROOFTOP' },
] as const

/**
 * Match um detalhamento existente com a planilha canonica via combinacao
 * (tipo, local). Tipo = "TUBOS" ou "EQUIPAMENTOS". Local = palavra-chave
 * de localizacao extraida da descricao (LAZER, PANORAMICO, TIPO, COBERTURA,
 * ROOFTOP, INFRA, TERREO). Aceita variacoes de acento, "1o" vs "1°", etc.
 */
function matchPlanilha(descricao: string): number {
  const norm = (s: string) =>
    (s || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // remove acentos
      .replace(/[^A-Z0-9 ]+/g, ' ')      // collapse simbolos pra espaco
      .replace(/\s+/g, ' ')
      .trim()

  const d = norm(descricao)
  if (!d) return -1

  const isTubos = /\bTUBOS\b/.test(d)
  const isEquip = /\bEQUIPAMENTOS\b/.test(d)
  if (!isTubos && !isEquip) return -1

  // Palavras-chave de local em ordem de prioridade (matching mais especifico
  // primeiro, ex.: "PAV TIPO" antes de "TIPO" que e ambiguo)
  const locais: Array<{ key: RegExp; codigoSuffix: string }> = isTubos
    ? [
        { key: /\bINFRA\b|\bVERTICAL\b|\bPAVIMENTOS\b/, codigoSuffix: '17.1.1' },
        { key: /\bTERREO\b/, codigoSuffix: '17.1.2' },
        { key: /\bLAZER\b/, codigoSuffix: '17.1.3' },
        { key: /\bPANORAMICO\b/, codigoSuffix: '17.1.4' },
        { key: /\bPAV TIPO\b|\bAO 36\b/, codigoSuffix: '17.1.5' },
        { key: /\bCOBERTURA\b/, codigoSuffix: '17.1.6' },
        { key: /\bROOFTOP\b/, codigoSuffix: '17.1.7' },
      ]
    : [
        { key: /\bLAZER\b/, codigoSuffix: '17.2.1' },
        { key: /\bPANORAMICO\b/, codigoSuffix: '17.2.2' },
        { key: /\bPAV TIPO\b|\bAO 36\b/, codigoSuffix: '17.2.3' },
        { key: /\bCOBERTURA\b/, codigoSuffix: '17.2.4' },
        { key: /\bROOFTOP\b/, codigoSuffix: '17.2.5' },
      ]

  for (const l of locais) {
    if (l.key.test(d)) {
      return PLANILHA_17.findIndex(e => e.codigo === l.codigoSuffix)
    }
  }
  return -1
}

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

      // Caso D: rebuild canonico - 1 tarefa 17.1 com detalhamentos
      // bagunçados (campos misturados de itens diferentes). Reescreve
      // os existentes via match por descricao e insere os faltantes.
      if (tarefas171.length === 1 && tarefas172.length === 0) {
        const tubos = tarefas171[0]
        const dets = tubos.detalhamentos as any[]

        // Mapa "indice canonico" -> det existente
        const matched = new Map<number, any>()
        const orfaos: any[] = []
        for (const d of dets) {
          const idx = matchPlanilha(d.descricao || '')
          if (idx >= 0 && !matched.has(idx)) {
            matched.set(idx, d)
          } else {
            orfaos.push(d)
          }
        }

        // 1) Cria tarefa 17.2 CAIXAS, REGULADORES E VALVULAS
        const valorCaixas = PLANILHA_17.filter(e => e.codigo.startsWith('17.2.'))
          .reduce((s, e) => s + e.qtde * (e.mat + e.mo), 0)
        const valorTubos = PLANILHA_17.filter(e => e.codigo.startsWith('17.1.'))
          .reduce((s, e) => s + e.qtde * (e.mat + e.mo), 0)

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

        // 2) Update da tarefa TUBOS (corrige nome e valor_total)
        const { error: errUpdT1 } = await admin
          .from('tarefas')
          .update({
            codigo: '17.1',
            nome: 'TUBOS E CONEXÕES',
            unidade: 'UN',
            quantidade_contratada: 1,
            valor_unitario: valorTubos,
            valor_total: valorTubos,
            ordem: 1,
          })
          .eq('id', tubos.id)
        if (errUpdT1) throw errUpdT1

        // 3) Atualiza/insere cada uma das 12 entradas canonicas
        let updates = 0
        let inserts = 0
        for (let i = 0; i < PLANILHA_17.length; i++) {
          const e = PLANILHA_17[i]
          const tarefaIdAlvo = e.codigo.startsWith('17.1.') ? tubos.id : novaTarefaId
          const valorUnit = Number((e.mat + e.mo).toFixed(4))
          const ordem = parseInt(e.codigo.split('.')[2] || '0', 10)
          const existing = matched.get(i)
          if (existing) {
            const { error } = await admin
              .from('detalhamentos')
              .update({
                tarefa_id: tarefaIdAlvo,
                codigo: e.codigo,
                descricao: e.desc,
                unidade: 'UN',
                quantidade_contratada: e.qtde,
                valor_unitario: valorUnit,
                ordem,
              })
              .eq('id', existing.id)
            if (error) throw error
            updates++
          } else {
            const { error } = await admin.from('detalhamentos').insert({
              tarefa_id: tarefaIdAlvo,
              codigo: e.codigo,
              descricao: e.desc,
              unidade: 'UN',
              quantidade_contratada: e.qtde,
              valor_unitario: valorUnit,
              ordem,
            })
            if (error) throw error
            inserts++
          }
        }

        acoes.push(
          `contrato ${g.contrato_id}: caso D - rebuild canonico. Tarefa 17.2 criada (${novaTarefaId}). ${updates} det atualizados, ${inserts} det inseridos. Orfaos sem match: ${orfaos.length}. Valores: TUBOS=${valorTubos.toFixed(2)}, CAIXAS=${valorCaixas.toFixed(2)}`,
        )
        continue
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
