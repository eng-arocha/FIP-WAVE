import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/relatorios/retencoes
 *
 * Lista todas as medições aprovadas com retenção contratual, com filtros
 * opcionais por contrato e período. Acompanha agregados por contrato e
 * total geral pra alimentar cards de resumo.
 *
 * Query params:
 *   - contrato_id: UUID (opcional)
 *   - de:  YYYY-MM-DD (opcional, filtra data_aprovacao >= de)
 *   - ate: YYYY-MM-DD (opcional, filtra data_aprovacao <= ate)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const contratoId = url.searchParams.get('contrato_id') || undefined
    const dataDe  = url.searchParams.get('de') || undefined
    const dataAte = url.searchParams.get('ate') || undefined

    const admin = createAdminClient()

    let query = admin
      .from('medicoes')
      .select(`
        id, numero, periodo_referencia, data_aprovacao, valor_total,
        andamento_fisico_pct, valor_material_correspondente, valor_retencao_garantia,
        contrato:contratos(id, numero, descricao, valor_total, valor_servicos, percentual_retencao),
        aprovacoes:aprovacoes(aprovador_nome, acao)
      `)
      .eq('status', 'aprovado')
      .order('data_aprovacao', { ascending: false })

    if (contratoId) query = query.eq('contrato_id', contratoId)
    if (dataDe)     query = query.gte('data_aprovacao', dataDe)
    if (dataAte)    query = query.lte('data_aprovacao', dataAte + 'T23:59:59.999Z')

    const { data, error } = await query
    if (error) throw error

    const linhas = (data || [])
      .map((m: any) => {
        // Aprovador: pega 1ª aprovação registrada (acao='aprovado')
        const ap = (m.aprovacoes || []).find((a: any) => a.acao === 'aprovado')
        const valorTotalMedido = Number(m.valor_total || 0)             // mat + serv
        const matCorrespondente = Number(m.valor_material_correspondente || 0)
        const servicoMedido = Math.max(0, valorTotalMedido - matCorrespondente)
        // Fonte primária: coluna valor_retencao_garantia (migration 051).
        // Fallback: pct do contrato × valor medido — medições aprovadas
        // antes da migration ficam com a coluna NULL e sumiam do relatório
        // (mesma estimativa usada pelo card do dashboard).
        const pctContrato = Number(m.contrato?.percentual_retencao ?? 5)
        const retencaoColuna = Number(m.valor_retencao_garantia || 0)
        const retencao = retencaoColuna > 0
          ? retencaoColuna
          : Math.round(valorTotalMedido * (pctContrato / 100) * 100) / 100
        return {
          medicao_id: m.id,
          numero: m.numero,
          periodo_referencia: m.periodo_referencia,
          data_aprovacao: m.data_aprovacao,
          contrato: {
            id: m.contrato?.id ?? null,
            numero: m.contrato?.numero ?? '—',
            valor_total: Number(m.contrato?.valor_total || 0),
            valor_servicos: Number(m.contrato?.valor_servicos || 0),
            percentual_retencao: Number(m.contrato?.percentual_retencao ?? 5),
          },
          valor_medido: valorTotalMedido,
          material_correspondente: matCorrespondente,
          servico_medido: servicoMedido,
          andamento_fisico_pct: Number(m.andamento_fisico_pct || 0),
          valor_retencao: retencao,
          // Líquido NF = serviço medido − retenção (a NF é só do serviço)
          liquido_a_pagar: servicoMedido - retencao,
          aprovador_nome: ap?.aprovador_nome ?? null,
        }
      })
      .filter((l: any) => l.valor_retencao > 0)

    // Agrupa por contrato pra cards de resumo
    const porContrato = new Map<string, {
      contrato_id: string | null
      contrato_numero: string
      total_retencao: number
      total_medido: number
      qtd_medicoes: number
    }>()
    for (const l of linhas) {
      const key = l.contrato.id ?? '__sem__'
      const cur = porContrato.get(key) ?? {
        contrato_id: l.contrato.id,
        contrato_numero: l.contrato.numero,
        total_retencao: 0,
        total_medido: 0,
        qtd_medicoes: 0,
      }
      cur.total_retencao += l.valor_retencao
      cur.total_medido += l.valor_medido
      cur.qtd_medicoes += 1
      porContrato.set(key, cur)
    }

    return NextResponse.json({
      linhas,
      por_contrato: Array.from(porContrato.values()).sort((a, b) => b.total_retencao - a.total_retencao),
      total_geral: {
        retencao: linhas.reduce((s, l) => s + l.valor_retencao, 0),
        medido:   linhas.reduce((s, l) => s + l.valor_medido, 0),
        qtd_medicoes: linhas.length,
        qtd_contratos: porContrato.size,
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
