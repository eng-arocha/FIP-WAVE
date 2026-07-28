import { describe, it, expect } from 'vitest'
import {
  templateLiberacaoMedicaoFornecedor,
  type LiberacaoMedicaoPayload,
} from './templates-medicoes'

/**
 * Regressão da medição 004/2026-07 do WAVE.
 *
 * O email instruía "emitir já descontando a retenção contratual, ou seja, pelo
 * valor de R$ 344.540,83" — serviço menos retenção. Mas a NF da medição é de
 * R$ 340.631,06: existe ainda o ajuste de rateio material/serviço de
 * R$ 3.909,77, que é a divergência entre o nosso orçamento e o do ERP da FIP
 * sobre o mesmo total medido. Emitir pelo valor do email teria gerado nota
 * R$ 3.909,77 acima do espelho enviado à FIP.
 *
 * O ajuste NÃO é retenção: não volta a ser pago depois. Por isso o texto
 * precisa distingui-lo, e não só somá-lo ao valor retido.
 */
function payload(over: {
  liquido: number
  ajuste?: number
  motivo?: string | null
}): LiberacaoMedicaoPayload {
  return {
    numero_medicao: 4,
    periodo_referencia: '2026-07',
    data_aprovacao: '2026-07-28T12:00:00.000Z',
    contrato_numero: 'WAVE-001',
    itens: [{ codigo: '19.1.1', descricao: 'ADMINISTRAÇÃO DE OBRA', qtde: 2, valor_total: 76000 }],
    resumo: {
      contrato: {
        valor_total: 10_000_000,
        valor_servicos: 4_000_000,
        valor_material_direto: 6_000_000,
        percentual_retencao: 5,
      },
      servicos: {
        esta_medicao: 384_816.84,
        acumulado: 1_200_000,
        pct_limite: 30,
        pct_contrato: 12,
        saldo: 2_800_000,
      },
      material: {
        nfs_recebidas_acumulado: 0, nfs_recebidas_periodo: 0,
        aprovado_acumulado: 0, aprovado_periodo: 0,
        pct_recebidas_limite: 0, pct_aprovado_limite: 0,
        saldo_aprovado: 0, saldo_recebido: 0,
      },
      periodo: { inicio: '2026-06-21', fim: '2026-07-20', eh_primeira_medicao: false },
      retencao: {
        valor: 40_276.01,
        percentual_aplicado: 5,
        material_correspondente: 420_703.43,
        servico_medido: 384_816.84,
        base_retencao: 805_520.27,
        andamento_fisico_pct: 8.05,
        liquido_a_pagar: over.liquido,
        ajuste_material_anterior: over.ajuste,
        ajuste_material_anterior_motivo: over.motivo,
      },
    },
    nfs_a_emitir: {
      fip_material: { valor: 0 },
      wave_servico: { valor: over.liquido, valor_bruto: 384_816.84, retencao: 40_276.01 },
    },
  }
}

describe('templateLiberacaoMedicaoFornecedor — valor da NF de serviço', () => {
  it('instrui a emitir pelo liquido_a_pagar, não por serviço − retenção', () => {
    const { html, text } = templateLiberacaoMedicaoFornecedor(
      payload({ liquido: 340_631.06, ajuste: 3_909.77 }),
    )

    for (const corpo of [html, text]) {
      expect(corpo).toContain('340.631,06')
      // 384.816,84 − 40.276,01 = 344.540,83: o valor errado do bug.
      expect(corpo).not.toContain('344.540,83')
    }
  })

  it('mostra o ajuste de rateio como linha própria do resumo', () => {
    const { html, text } = templateLiberacaoMedicaoFornecedor(
      payload({ liquido: 340_631.06, ajuste: 3_909.77 }),
    )
    expect(html).toContain('Ajuste de rateio material/serviço')
    expect(html).toContain('3.909,77')
    expect(text).toContain('Ajuste de rateio')
    expect(text).toContain('3.909,77')
  })

  it('deixa claro que o ajuste não é retenção e não será pago depois', () => {
    const { html, text } = templateLiberacaoMedicaoFornecedor(
      payload({ liquido: 340_631.06, ajuste: 3_909.77 }),
    )
    expect(html).toMatch(/não (é|e) retenção e não será pago depois/i)
    expect(text).toMatch(/NAO e retencao e nao sera pago depois/i)
  })

  it('inclui o motivo do ajuste quando há um cadastrado', () => {
    const { html } = templateLiberacaoMedicaoFornecedor(payload({
      liquido: 340_631.06,
      ajuste: 3_909.77,
      motivo: 'Conciliacao do relatorio Informakon de 28/07/2026.',
    }))
    expect(html).toContain('Conciliacao do relatorio Informakon de 28/07/2026.')
  })

  it('o assunto anuncia o valor líquido da NF', () => {
    const { subject } = templateLiberacaoMedicaoFornecedor(
      payload({ liquido: 340_631.06, ajuste: 3_909.77 }),
    )
    expect(subject).toContain('340.631,06')
  })

  it('sem ajuste, volta ao texto original de retenção', () => {
    const { html, text } = templateLiberacaoMedicaoFornecedor(
      payload({ liquido: 344_540.83, ajuste: 0 }),
    )
    expect(html).toContain('344.540,83')
    expect(html).not.toContain('Ajuste de rateio material/serviço')
    expect(html).toContain('já descontada a retenção contratual')
    expect(text).not.toContain('Ajuste de rateio')
  })

  it('ajuste ausente (migration 074 pendente) é tratado como zero', () => {
    const { html } = templateLiberacaoMedicaoFornecedor(payload({ liquido: 344_540.83 }))
    expect(html).toContain('344.540,83')
    expect(html).not.toContain('Ajuste de rateio material/serviço')
  })
})
