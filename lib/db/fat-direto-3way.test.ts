import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do admin client: cada chamada .from(tabela) devolve um builder
// encadeável (.select/.eq) que é "thenable" e resolve pro resultado
// pré-configurado da tabela. .single() resolve o mesmo resultado.
const tableResults: Record<string, { data: any; error: any }> = {}

function makeBuilder(table: string) {
  const result = tableResults[table] ?? { data: null, error: null }
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    neq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  }
  return builder
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}))

import { validarNotaFiscal3Way } from './fat-direto'

const SOL_ID = 'sol-1'
const NF_ID = 'nf-1'

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k]
  // Pedido aprovado, R$ 1000, sem CNPJ (pula check de CNPJ)
  tableResults['solicitacoes_fat_direto'] = {
    data: {
      id: SOL_ID,
      status: 'aprovado',
      valor_total: 1000,
      fornecedor_cnpj: null,
      data_aprovacao: '2026-01-01T00:00:00Z',
      deletado_em: null,
      contrato_id: 'contrato-1',
    },
    error: null,
  }
  tableResults['contratos'] = { data: { tolerancia_nf_valor: 0 }, error: null }
})

describe('validarNotaFiscal3Way — exclude_nf_id (revalidação na aprovação)', () => {
  it('REGRESSÃO: revalidar uma NF pendente já gravada não dispara DUPLICATA contra si mesma', async () => {
    // A única NF ativa no pedido é a própria que está sendo aprovada.
    tableResults['notas_fiscais_fat_direto'] = {
      data: [
        { id: NF_ID, numero_nf: '2114', cnpj_emitente: null, valor: 500, status: 'aguardando_aprovacao' },
      ],
      error: null,
    }

    // Sem exclude_nf_id → encontraria a si mesma e lançaria DUPLICATA (bug)
    await expect(
      validarNotaFiscal3Way({
        solicitacao_id: SOL_ID,
        numero_nf: '2114',
        valor: 0,
        data_emissao: '2026-02-01',
        override_data_anterior: true,
      }),
    ).rejects.toThrow(/já foi lançada/)

    // Com exclude_nf_id → ignora a própria NF e aprova sem erro
    const r = await validarNotaFiscal3Way({
      solicitacao_id: SOL_ID,
      numero_nf: '2114',
      valor: 500,
      data_emissao: '2026-02-01',
      override_data_anterior: true,
      exclude_nf_id: NF_ID,
    })
    // Saldo: pedido 1000 − 500 (esta NF) = 500
    expect(r.saldo_depois).toBe(500)
  })

  it('ainda detecta DUPLICATA real: OUTRA NF com mesmo número não é excluída', async () => {
    tableResults['notas_fiscais_fat_direto'] = {
      data: [
        { id: NF_ID, numero_nf: '2114', cnpj_emitente: null, valor: 500, status: 'aprovada' },
        { id: 'nf-2', numero_nf: '2114', cnpj_emitente: null, valor: 200, status: 'aguardando_aprovacao' },
      ],
      error: null,
    }
    // Revalidando nf-2 (exclui só ela), nf-1 com mesmo número ainda é duplicata
    await expect(
      validarNotaFiscal3Way({
        solicitacao_id: SOL_ID,
        numero_nf: '2114',
        valor: 200,
        data_emissao: '2026-02-01',
        override_data_anterior: true,
        exclude_nf_id: 'nf-2',
      }),
    ).rejects.toThrow(/já foi lançada/)
  })
})
