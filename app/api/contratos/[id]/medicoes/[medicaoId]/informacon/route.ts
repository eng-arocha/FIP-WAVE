import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/informacon
 *
 * Retorna o "boletim INFORMACON" — uma planilha-resumo da medição com,
 * por subitem (detalhamento):
 *   - código, descrição, local, unidade
 *   - quantidade contratada, quantidade medida nesta, % desta medição
 *   - acumulado de quantidade/percentual (medições aprovadas anteriores + esta)
 *   - valor unitário material / serviço
 *   - material medido / serviço medido (desta medição)
 *   - material acumulado / serviço acumulado (todas medições)
 *   - retenção por item (5% × (mat + serv) desta medição)
 *
 * Usado pela página /informacon pra lançamento manual no sistema interno.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()

    // Carrega medição + itens + contrato
    const { data: medicao, error: medErr } = await admin
      .from('medicoes')
      .select(`
        id, numero, periodo_referencia, status, data_aprovacao, data_submissao, valor_total,
        contrato:contratos(id, numero, descricao, valor_total, valor_servicos, percentual_retencao),
        medicao_itens (
          id, quantidade_medida, valor_unitario,
          detalhamento:detalhamentos (
            id, codigo, descricao, unidade, quantidade_contratada,
            valor_unitario, valor_material_unit, valor_servico_unit
          )
        )
      `)
      .eq('id', medicaoId)
      .single()
    if (medErr) throw medErr
    if (!medicao) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })

    // Acumulado de quantidade por detalhamento (todas medições aprovadas + esta)
    // Útil pra lançar "% acumulado" no Informacon.
    const { data: acumRows } = await admin
      .from('medicao_itens')
      .select(`
        detalhamento_id, quantidade_medida,
        medicao:medicoes!inner(id, status, contrato_id)
      `)
      .eq('medicao.contrato_id', contratoId)

    // Soma quantidade acumulada por detalhamento (medições aprovadas OU a atual)
    const acumulado: Record<string, number> = {}
    for (const r of (acumRows || []) as any[]) {
      const isAprovada = r.medicao?.status === 'aprovado'
      const isEsta = r.medicao?.id === medicaoId
      if (!isAprovada && !isEsta) continue
      const detId = r.detalhamento_id
      if (!detId) continue
      acumulado[detId] = (acumulado[detId] || 0) + Number(r.quantidade_medida || 0)
    }

    const pctRetencao = Number((medicao as any).contrato?.percentual_retencao ?? 5)

    // Monta linhas
    const linhas = ((medicao as any).medicao_itens || [])
      .map((it: any) => {
        const det = it.detalhamento
        if (!det) return null
        const qtdContr = Number(det.quantidade_contratada || 0)
        const qtdMed = Number(it.quantidade_medida || 0)
        const matUnit = Number(det.valor_material_unit || 0)
        const servUnit = Number(det.valor_servico_unit || 0)
        const valorUnit = Number(det.valor_unitario || (matUnit + servUnit))
        const matMedido = qtdMed * matUnit
        const servMedido = qtdMed * servUnit
        const baseRet = matMedido + servMedido
        const retencao = baseRet * (pctRetencao / 100)
        const qtdAcum = acumulado[det.id] || 0

        return {
          medicao_item_id: it.id,
          detalhamento_id: det.id,
          codigo: det.codigo,
          descricao: det.descricao,
          unidade: det.unidade,
          quantidade_contratada: qtdContr,
          quantidade_medida: qtdMed,
          quantidade_acumulada: qtdAcum,
          pct_medido: qtdContr > 0 ? (qtdMed / qtdContr) * 100 : 0,
          pct_acumulado: qtdContr > 0 ? (qtdAcum / qtdContr) * 100 : 0,
          valor_unitario: valorUnit,
          valor_material_unit: matUnit,
          valor_servico_unit: servUnit,
          // valores totais do item (referência contratual)
          valor_total_item: qtdContr * valorUnit,
          valor_material_total_item: qtdContr * matUnit,
          valor_servico_total_item: qtdContr * servUnit,
          // medido nesta medição
          material_medido: matMedido,
          servico_medido: servMedido,
          base_retencao: baseRet,
          retencao,
          // acumulado (todas medições aprovadas + esta) em R$
          material_acumulado: qtdAcum * matUnit,
          servico_acumulado: qtdAcum * servUnit,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

    // Totais
    const totais = linhas.reduce((acc: any, l: any) => ({
      material_medido: acc.material_medido + l.material_medido,
      servico_medido:  acc.servico_medido  + l.servico_medido,
      base_retencao:   acc.base_retencao   + l.base_retencao,
      retencao:        acc.retencao        + l.retencao,
      material_acumulado: acc.material_acumulado + l.material_acumulado,
      servico_acumulado:  acc.servico_acumulado  + l.servico_acumulado,
    }), {
      material_medido: 0, servico_medido: 0, base_retencao: 0, retencao: 0,
      material_acumulado: 0, servico_acumulado: 0,
    })

    return NextResponse.json({
      medicao: {
        id: (medicao as any).id,
        numero: (medicao as any).numero,
        periodo_referencia: (medicao as any).periodo_referencia,
        status: (medicao as any).status,
        data_aprovacao: (medicao as any).data_aprovacao,
        data_submissao: (medicao as any).data_submissao,
        contrato: {
          id: (medicao as any).contrato?.id,
          numero: (medicao as any).contrato?.numero,
          valor_total: Number((medicao as any).contrato?.valor_total || 0),
          percentual_retencao: pctRetencao,
        },
      },
      linhas,
      totais,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
