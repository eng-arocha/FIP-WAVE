import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { recalcularValorTotalMedicao } from '@/lib/db/medicoes'
import { isSchemaMissingError } from '@/lib/db/resilient'
import {
  calcularTetoMedicao,
  excedeTeto,
  mensagemExcedeTeto,
} from '@/lib/medicao-teto'
import {
  detectarBreakdown,
  normalizarBreakdown,
  calcularDeltaBreakdown,
  arredondarQtde,
  somarPavimentos,
  type BreakdownModo,
} from '@/lib/medicao-breakdown'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * /api/contratos/[id]/medicoes/[medicaoId]/detalhamentos/[detalhamentoId]/ajustar
 *
 * PATCH — admin (aprovador) ajusta a medição de um detalhamento numa medição
 * pendente. Faz upsert: se já existe `medicao_item` para (medicao_id,
 * detalhamento_id), atualiza; senão, cria.
 *
 * DOIS MODOS:
 *
 *  1) AGREGADO — body { quantidade_nova, motivo }
 *     Grava direto `quantidade_medida`. Modo histórico, usado por itens
 *     comuns (input numérico ou % do item inteiro).
 *
 *  2) BREAKDOWN — body { pavimentos_pct, motivo }
 *     Para itens medidos célula a célula: "PAV TIPO ( X AO Y PAV )"
 *     (0/25/50/75/100 por pavimento) e grades binárias de vãos/meses
 *     (0 ou 100 por célula). O client manda o pct ACUMULADO desejado por
 *     célula ao fim desta medição; o servidor recalcula `quantidade_medida`
 *     (o DELTA do período) a partir dele.
 *
 *     É o único caminho capaz de BAIXAR o % de uma célula — ex.: 12º pav
 *     medido a 90% nesta medição corrigido para 50%. Editar a quantidade
 *     agregada não expressa isso e deixaria o `pavimentos_pct` gravado
 *     inconsistente com `quantidade_medida`.
 *
 *     Piso por célula: o pct não pode cair abaixo do maior pct que a mesma
 *     célula já atingiu em medições APROVADAS anteriores — isso desmediria
 *     trabalho já aprovado. Valores abaixo do piso sobem até ele e voltam
 *     listados em `elevadas_ao_piso`.
 *
 * GET (mesma rota) devolve o estado de breakdown do item pra UI montar a
 * grade sem reimplementar a apuração do acumulado anterior.
 *
 * Permissão: `medicoes.aprovar` nos dois verbos.
 */

const Body = z
  .object({
    quantidade_nova: z.number().min(0, 'Quantidade não pode ser negativa.').finite().optional(),
    // Chave = número 1-based da célula; valor = pct acumulado ao fim desta medição.
    pavimentos_pct: z
      .record(z.string().regex(/^\d+$/, 'Chave de breakdown inválida.'), z.number().min(0).max(100).finite())
      .optional(),
    motivo: z.string().trim().min(10, 'Motivo precisa ter pelo menos 10 caracteres.').max(2000),
    /**
     * Modo agregado num item que HOJE tem breakdown gravado: confirma que o
     * breakdown deve ser descartado. Sem isso a rota recusa, pra não deixar
     * `pavimentos_pct` mentindo sobre `quantidade_medida`.
     */
    descartar_breakdown: z.boolean().optional(),
  })
  .refine(b => b.quantidade_nova !== undefined || b.pavimentos_pct !== undefined, {
    message: 'Informe quantidade_nova ou pavimentos_pct.',
  })

const ParamsSchema = z.object({
  id: uuid(),
  medicaoId: uuid(),
  detalhamentoId: uuid(),
})

const STATUS_PERMITIDOS = new Set(['submetido', 'em_analise', 'rascunho'])

// ───────────────────────────────────────────────────────────────────────────
// Contexto comum (GET + PATCH)
// ───────────────────────────────────────────────────────────────────────────

interface Contexto {
  admin: SupabaseClient
  medicao: { id: string; status: string; numero: number }
  det: {
    id: string
    codigo: string
    descricao: string
    valor_unitario: number
    quantidade_contratada: number
  }
}

async function carregarContexto(
  contratoId: string,
  medicaoId: string,
  detalhamentoId: string,
  exigirStatusPendente: boolean,
): Promise<{ ok: true; ctx: Contexto } | { ok: false; res: NextResponse }> {
  const admin = createAdminClient()

  const { data: medicao, error: medErr } = await admin
    .from('medicoes')
    .select('id, contrato_id, status, numero')
    .eq('id', medicaoId)
    .single()
  if (medErr || !medicao) return { ok: false, res: apiError('Medição não encontrada.', { status: 404 }) }

  const med = medicao as any
  if (med.contrato_id !== contratoId) {
    return { ok: false, res: apiError('Medição não pertence ao contrato informado.', { status: 400 }) }
  }
  if (exigirStatusPendente && !STATUS_PERMITIDOS.has(med.status)) {
    return {
      ok: false,
      res: NextResponse.json(
        {
          error: med.status === 'aprovado'
            ? 'Medição já aprovada. Para ajustar, primeiro desfaça a aprovação.'
            : `Não é possível ajustar quantidade em medição com status "${med.status}".`,
          code: 'STATUS_INVALIDO',
        },
        { status: 409 },
      ),
    }
  }

  // Hierarquia: contratos -> grupos_macro -> tarefas -> detalhamentos.
  // Em 3 passos pra evitar joins frágeis no PostgREST.
  const { data: det, error: detErr } = await admin
    .from('detalhamentos')
    .select('id, codigo, descricao, valor_unitario, quantidade_contratada, tarefa_id')
    .eq('id', detalhamentoId)
    .single()
  if (detErr || !det) return { ok: false, res: apiError('Detalhamento não encontrado.', { status: 404 }) }

  const { data: tarefa, error: tarefaErr } = await admin
    .from('tarefas')
    .select('id, grupo_macro_id')
    .eq('id', (det as any).tarefa_id)
    .single()
  if (tarefaErr || !tarefa) {
    return { ok: false, res: apiError('Tarefa do detalhamento não encontrada.', { status: 400 }) }
  }

  const { data: grupo, error: grupoErr } = await admin
    .from('grupos_macro')
    .select('id, contrato_id')
    .eq('id', (tarefa as any).grupo_macro_id)
    .single()
  if (grupoErr || !grupo) {
    return { ok: false, res: apiError('Grupo macro do detalhamento não encontrado.', { status: 400 }) }
  }
  if ((grupo as any).contrato_id !== contratoId) {
    return { ok: false, res: apiError('Detalhamento não pertence ao contrato informado.', { status: 400 }) }
  }

  return {
    ok: true,
    ctx: {
      admin,
      medicao: { id: med.id, status: med.status, numero: Number(med.numero ?? 0) },
      det: {
        id: (det as any).id,
        codigo: (det as any).codigo,
        descricao: (det as any).descricao ?? '',
        valor_unitario: Number((det as any).valor_unitario ?? 0),
        quantidade_contratada: Number((det as any).quantidade_contratada ?? 0),
      },
    },
  }
}

/**
 * Acumulado das medições APROVADAS cronologicamente anteriores a esta:
 *   - `qtdAnterior`: soma real de `quantidade_medida` — a mesma base que
 *     /medicoes/acumulado e a tela de Nova Medição usam pra calcular o delta.
 *     Usar a soma real (e não a soma do breakdown anterior) cobre medições
 *     antigas submetidas sem breakdown.
 *   - `pavAnterior`: MAX por célula de `pavimentos_pct` — o piso do breakdown.
 *
 * Mesmo critério de "anterior" da rota /planilha: aprovadas com `numero`
 * menor que o desta medição, pra não contar medições futuras ao reabrir uma
 * medição histórica.
 */
async function carregarAcumuladoAnterior(
  admin: SupabaseClient,
  contratoId: string,
  medicaoId: string,
  medicaoNumero: number,
  detalhamentoId: string,
): Promise<{ qtdAnterior: number; pavAnterior: Record<string, number> }> {
  const { data: meds } = await admin
    .from('medicoes')
    .select('id, status, numero')
    .eq('contrato_id', contratoId)

  const ids = (meds || [])
    .filter((m: any) => {
      if (m.status !== 'aprovado' || m.id === medicaoId) return false
      if (medicaoNumero > 0) return Number(m.numero) < medicaoNumero
      return true
    })
    .map((m: any) => m.id as string)

  if (ids.length === 0) return { qtdAnterior: 0, pavAnterior: {} }

  // `pavimentos_pct` só existe após a migration 066 — fallback sem a coluna.
  let rows: any[] = []
  const primary = await admin
    .from('medicao_itens')
    .select('quantidade_medida, pavimentos_pct')
    .in('medicao_id', ids)
    .eq('detalhamento_id', detalhamentoId)
  if (!primary.error) {
    rows = primary.data || []
  } else if (isSchemaMissingError(primary.error, ['pavimentos_pct'])) {
    const fb = await admin
      .from('medicao_itens')
      .select('quantidade_medida')
      .in('medicao_id', ids)
      .eq('detalhamento_id', detalhamentoId)
    if (fb.error) throw fb.error
    rows = fb.data || []
  } else {
    throw primary.error
  }

  let qtdAnterior = 0
  const pavAnterior: Record<string, number> = {}
  for (const r of rows) {
    qtdAnterior += Number(r.quantidade_medida || 0)
    if (r.pavimentos_pct && typeof r.pavimentos_pct === 'object') {
      for (const [k, v] of Object.entries(r.pavimentos_pct as Record<string, number>)) {
        const cur = Number(v)
        if (!Number.isFinite(cur)) continue
        if (cur > Number(pavAnterior[k] || 0)) pavAnterior[k] = cur
      }
    }
  }
  return { qtdAnterior: arredondarQtde(qtdAnterior), pavAnterior }
}

/** Lê o medicao_item desta medição (com fallback pra schema sem breakdown). */
async function carregarItemAtual(
  admin: SupabaseClient,
  medicaoId: string,
  detalhamentoId: string,
): Promise<{ id: string; quantidade_medida: number; pavimentos_pct: Record<string, number> | null } | null> {
  const primary = await admin
    .from('medicao_itens')
    .select('id, quantidade_medida, pavimentos_pct')
    .eq('medicao_id', medicaoId)
    .eq('detalhamento_id', detalhamentoId)
    .maybeSingle()

  let row: any = null
  if (!primary.error) {
    row = primary.data
  } else if (isSchemaMissingError(primary.error, ['pavimentos_pct'])) {
    const fb = await admin
      .from('medicao_itens')
      .select('id, quantidade_medida')
      .eq('medicao_id', medicaoId)
      .eq('detalhamento_id', detalhamentoId)
      .maybeSingle()
    if (fb.error) throw fb.error
    row = fb.data
  } else {
    throw primary.error
  }

  if (!row) return null
  return {
    id: row.id,
    quantidade_medida: Number(row.quantidade_medida ?? 0),
    pavimentos_pct: (row.pavimentos_pct as Record<string, number> | null) ?? null,
  }
}

/**
 * Serializa o modo de breakdown pra UI. Mantém deliberadamente os nomes de
 * campo de `BreakdownModo` (camelCase) em vez de snake_case: o client faz
 * cast direto pro mesmo tipo e reaproveita `clampPctCelula` /
 * `normalizarBreakdown` de `lib/medicao-breakdown` — as regras de piso e de
 * escala ficam escritas uma vez só, no lugar mais fácil de errar.
 */
function serializarModo(modo: BreakdownModo) {
  return {
    tipo: modo.tipo,
    binaria: modo.binaria,
    termo: modo.termo,
    termoPlural: modo.termoPlural,
    pctsPermitidos: modo.pctsPermitidos,
    celulas: modo.celulas,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// GET — estado do breakdown pra montar a grade na UI
// ───────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string; detalhamentoId: string }> },
) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem ver o breakdown de ajuste.' },
        { status: check.status },
      )
    }

    const paramsCheck = ParamsSchema.safeParse(await params)
    if (!paramsCheck.success) return apiError('IDs inválidos.', { status: 400 })
    const { id: contratoId, medicaoId, detalhamentoId } = paramsCheck.data

    // GET não exige status pendente — a UI também usa isso pra pré-visualizar.
    const ctxRes = await carregarContexto(contratoId, medicaoId, detalhamentoId, false)
    if (!ctxRes.ok) return ctxRes.res
    const { admin, medicao, det } = ctxRes.ctx

    const modo = detectarBreakdown(det.descricao, det.quantidade_contratada)
    const { qtdAnterior, pavAnterior } = await carregarAcumuladoAnterior(
      admin, contratoId, medicaoId, medicao.numero, detalhamentoId,
    )
    const item = await carregarItemAtual(admin, medicaoId, detalhamentoId)

    return NextResponse.json({
      suporta_breakdown: !!modo,
      modo: modo ? serializarModo(modo) : null,
      editavel: STATUS_PERMITIDOS.has(medicao.status),
      medicao_status: medicao.status,
      detalhamento: {
        id: det.id,
        codigo: det.codigo,
        descricao: det.descricao,
        quantidade_contratada: det.quantidade_contratada,
        valor_unitario: det.valor_unitario,
      },
      medicao_item_id: item?.id ?? null,
      quantidade_atual: item?.quantidade_medida ?? 0,
      pavimentos_pct: item?.pavimentos_pct ?? null,
      pavimentos_pct_anterior: pavAnterior,
      qtd_anterior: qtdAnterior,
      /** Máximo que ESTA medição pode registrar: contratado − acumulado aprovado. */
      teto: calcularTetoMedicao(det.quantidade_contratada, qtdAnterior),
      /**
       * true quando o item tem histórico aprovado mas nenhum breakdown gravado
       * nele — a grade não consegue representar o acumulado anterior e o
       * delta calculado ficaria maior que o real. Exige backfill antes.
       */
      historico_sem_breakdown:
        !!modo && qtdAnterior > 0 && arredondarQtde(somarPavimentos(pavAnterior)) + 1e-6 < qtdAnterior,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// PATCH — ajuste (agregado ou por breakdown)
// ───────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string; detalhamentoId: string }> },
) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem ajustar quantidade.' },
        { status: check.status },
      )
    }

    const paramsCheck = ParamsSchema.safeParse(await params)
    if (!paramsCheck.success) return apiError('IDs inválidos.', { status: 400 })
    const { id: contratoId, medicaoId, detalhamentoId } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { quantidade_nova, pavimentos_pct, motivo, descartar_breakdown } = parsed.data

    const ctxRes = await carregarContexto(contratoId, medicaoId, detalhamentoId, true)
    if (!ctxRes.ok) return ctxRes.res
    const { admin, medicao, det } = ctxRes.ctx

    // User session pra ajustado_por_id
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('Não autenticado.', { status: 401 })

    const itemAtual = await carregarItemAtual(admin, medicaoId, detalhamentoId)
    const quantidadeAnterior = arredondarQtde(itemAtual?.quantidade_medida ?? 0)
    const pavAtualGravado = itemAtual?.pavimentos_pct ?? null
    const temBreakdownGravado = !!pavAtualGravado && Object.keys(pavAtualGravado).length > 0

    // Payload a gravar em medicao_itens + metadados do ajuste.
    let quantidadeNovaFinal: number
    let novoPavPct: Record<string, number> | null | undefined // undefined = não mexer
    let detalheBreakdown: any = null

    if (pavimentos_pct !== undefined) {
      // ── MODO BREAKDOWN ───────────────────────────────────────────────────
      const modo = detectarBreakdown(det.descricao, det.quantidade_contratada)
      if (!modo) {
        return NextResponse.json(
          {
            error: `O item ${det.codigo} não é medido por pavimento/vão/mês — ajuste a quantidade total.`,
            code: 'SEM_BREAKDOWN',
          },
          { status: 400 },
        )
      }

      const { qtdAnterior, pavAnterior } = await carregarAcumuladoAnterior(
        admin, contratoId, medicaoId, medicao.numero, detalhamentoId,
      )

      const norm = normalizarBreakdown({
        modo,
        pedido: pavimentos_pct,
        atual: pavAtualGravado,
        anterior: pavAnterior,
      })

      if (norm.chavesIgnoradas.length > 0) {
        return NextResponse.json(
          {
            error: `Breakdown fora do intervalo do item ${det.codigo}: ${norm.chavesIgnoradas.slice(0, 8).join(', ')}.`,
            code: 'BREAKDOWN_INVALIDO',
          },
          { status: 400 },
        )
      }

      const delta = calcularDeltaBreakdown(norm.somaAcumulada, qtdAnterior)
      if (delta < -1e-6) {
        return NextResponse.json(
          {
            error:
              `O breakdown soma ${norm.somaAcumulada.toLocaleString('pt-BR')} un. acumuladas, abaixo do ` +
              `acumulado já aprovado (${qtdAnterior.toLocaleString('pt-BR')} un.). ` +
              `Medições anteriores deste item foram lançadas sem breakdown — faça o backfill do histórico antes de ajustar por ${modo.termo}.`,
            code: 'ABAIXO_DO_ACUMULADO',
            soma_breakdown: norm.somaAcumulada,
            qtd_anterior: qtdAnterior,
          },
          { status: 409 },
        )
      }

      if (norm.alteradas.length === 0) {
        return apiError('Nenhuma célula do breakdown mudou — nada a ajustar.', { status: 400 })
      }

      quantidadeNovaFinal = Math.max(0, delta)
      novoPavPct = norm.mapa
      detalheBreakdown = {
        modo: modo.tipo,
        termo: modo.termo,
        alteradas: norm.alteradas,
        elevadas_ao_piso: norm.elevadasAoPiso,
        soma_acumulada: norm.somaAcumulada,
        qtd_anterior: qtdAnterior,
      }
    } else {
      // ── MODO AGREGADO ────────────────────────────────────────────────────
      quantidadeNovaFinal = arredondarQtde(quantidade_nova as number)

      // Teto do contrato. `quantidade_medida` é o DELTA do período, então o
      // limite não é `quantidade_contratada` e sim o que sobra dela depois do
      // acumulado já aprovado. Sem esta guarda o admin gravava mais de 100%
      // do contratado — o zod só exigia >= 0 e nada mais no caminho comparava
      // com o contrato (nem o client, nem um CHECK no banco).
      //
      // O ramo de breakdown acima não precisa disto: cada célula vale no
      // máximo 100% e o número de células é a própria quantidade contratada.
      {
        const { qtdAnterior } = await carregarAcumuladoAnterior(
          admin, contratoId, medicaoId, medicao.numero, detalhamentoId,
        )
        const teto = calcularTetoMedicao(det.quantidade_contratada, qtdAnterior)
        if (excedeTeto(quantidadeNovaFinal, teto)) {
          return NextResponse.json(
            {
              error: mensagemExcedeTeto({
                codigo: det.codigo,
                quantidadeContratada: det.quantidade_contratada,
                qtdAnterior,
                qtdNova: quantidadeNovaFinal,
                teto: teto as number,
              }),
              code: 'ACIMA_DO_CONTRATADO',
              teto,
              qtd_anterior: qtdAnterior,
              quantidade_contratada: det.quantidade_contratada,
            },
            { status: 409 },
          )
        }
      }

      if (temBreakdownGravado && !descartar_breakdown) {
        return NextResponse.json(
          {
            error:
              `O item ${det.codigo} é medido por pavimento/vão/mês e já tem breakdown gravado nesta medição. ` +
              `Edite o % das células (assim dá pra corrigir um pavimento de 90% para 50%) ou confirme o descarte do breakdown.`,
            code: 'BREAKDOWN_OBRIGATORIO',
          },
          { status: 409 },
        )
      }
      // Descarte explícito: zera o breakdown pra ele não mentir sobre a qtd.
      if (temBreakdownGravado && descartar_breakdown) novoPavPct = null

      if (Math.abs(quantidadeAnterior - quantidadeNovaFinal) < 1e-6) {
        return apiError('Quantidade nova é igual à atual — nada a ajustar.', { status: 400 })
      }
    }

    // ── Persistência ───────────────────────────────────────────────────────
    let medicaoItemId: string

    const payloadItem: Record<string, any> = { quantidade_medida: quantidadeNovaFinal }
    if (novoPavPct !== undefined) payloadItem.pavimentos_pct = novoPavPct

    if (itemAtual) {
      const upd = await admin.from('medicao_itens').update(payloadItem).eq('id', itemAtual.id)
      if (upd.error) {
        if (novoPavPct !== undefined && isSchemaMissingError(upd.error, ['pavimentos_pct'])) {
          return NextResponse.json(
            { error: 'Funcionalidade pendente: rode a migration 066 no Supabase.', code: 'MIGRATION_PENDENTE' },
            { status: 503 },
          )
        }
        throw upd.error
      }
      medicaoItemId = itemAtual.id
    } else {
      const ins = await admin
        .from('medicao_itens')
        .insert({
          medicao_id: medicaoId,
          detalhamento_id: detalhamentoId,
          valor_unitario: det.valor_unitario,
          ...payloadItem,
        })
        .select('id')
        .single()
      if (ins.error) {
        if (novoPavPct !== undefined && isSchemaMissingError(ins.error, ['pavimentos_pct'])) {
          return NextResponse.json(
            { error: 'Funcionalidade pendente: rode a migration 066 no Supabase.', code: 'MIGRATION_PENDENTE' },
            { status: 503 },
          )
        }
        throw ins.error
      }
      medicaoItemId = (ins.data as any).id
    }

    // Snapshot medicoes.valor_total precisa acompanhar a quantidade — o card
    // "Total da Medição (mat + serv)" da tela lê essa coluna.
    await recalcularValorTotalMedicao(admin, medicaoId)

    // Linha de auditoria em medicao_item_ajustes (migrations 061 + 077)
    await registrarAjuste(admin, {
      medicaoItemId,
      quantidadeAnterior,
      quantidadeNova: quantidadeNovaFinal,
      motivo: motivo.trim(),
      ajustadoPorId: user.id,
      pavAnterior: detalheBreakdown ? (pavAtualGravado ?? {}) : null,
      pavNova: detalheBreakdown ? (novoPavPct as Record<string, number>) : null,
    })

    await audit({
      event: detalheBreakdown
        ? 'medicao_item.breakdown_ajustado_pelo_admin'
        : itemAtual
        ? 'medicao_item.quantidade_ajustada_pelo_admin'
        : 'medicao_item.criado_pelo_admin_via_ajuste',
      entity_type: 'medicao_item',
      entity_id: medicaoItemId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before: { quantidade_medida: quantidadeAnterior, pavimentos_pct: pavAtualGravado },
      after: { quantidade_medida: quantidadeNovaFinal, pavimentos_pct: novoPavPct ?? pavAtualGravado },
      metadata: {
        medicao_id: medicaoId,
        contrato_id: contratoId,
        detalhamento_id: detalhamentoId,
        codigo: det.codigo,
        motivo: motivo.trim(),
        breakdown: detalheBreakdown,
      },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      medicao_item_id: medicaoItemId,
      criado: !itemAtual,
      ajuste: {
        quantidade_anterior: quantidadeAnterior,
        quantidade_nova: quantidadeNovaFinal,
        motivo: motivo.trim(),
      },
      breakdown: detalheBreakdown,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

/**
 * Grava a linha de histórico em `medicao_item_ajustes`, degradando com
 * elegância quando o schema está atrás do código:
 *
 *  - migration 061 ausente  -> tabela não existe: loga e segue (a quantidade
 *    já foi gravada; `audit()` mantém o rastro)
 *  - migration 077 ausente  -> sem as colunas de breakdown: repete o insert
 *    sem elas. Se a CHECK antiga (`qty_distintas`) barrar um ajuste que
 *    manteve a quantidade total, desiste da linha e loga — o `audit()` já
 *    registrou o antes/depois célula a célula.
 */
async function registrarAjuste(
  admin: SupabaseClient,
  args: {
    medicaoItemId: string
    quantidadeAnterior: number
    quantidadeNova: number
    motivo: string
    ajustadoPorId: string
    pavAnterior: Record<string, number> | null
    pavNova: Record<string, number> | null
  },
): Promise<void> {
  const base = {
    medicao_item_id: args.medicaoItemId,
    quantidade_anterior: args.quantidadeAnterior,
    quantidade_nova: args.quantidadeNova,
    motivo: args.motivo,
    ajustado_por_id: args.ajustadoPorId,
  }
  const comBreakdown = args.pavNova
    ? { ...base, pavimentos_pct_anterior: args.pavAnterior ?? {}, pavimentos_pct_nova: args.pavNova }
    : base

  const first = await admin.from('medicao_item_ajustes').insert(comBreakdown)
  if (!first.error) return

  if (isSchemaMissingError(first.error, ['medicao_item_ajustes'])) {
    console.warn('[ajustar] migration 061 pendente — histórico não gravado')
    return
  }

  if (
    comBreakdown !== base &&
    isSchemaMissingError(first.error, ['pavimentos_pct_anterior', 'pavimentos_pct_nova'])
  ) {
    // Migration 077 pendente: tenta sem as colunas novas.
    const retry = await admin.from('medicao_item_ajustes').insert(base)
    if (!retry.error) return
    console.warn('[ajustar] histórico não gravado (migration 077 pendente):', retry.error.message)
    return
  }

  // Sobra o caso da CHECK antiga barrando quantidade igual (ajuste de
  // breakdown que não moveu o total). Não-fatal: audit() já tem tudo.
  console.warn('[ajustar] falha ao gravar auditoria:', first.error.message)
}
